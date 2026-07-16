// キャラクター設定資料画像の生成スクリプト(Seedance 参照パック用)
//
// 目的: incoming/reference/ のキャラクター参考画像から、Seedance 2.0 へ渡すのに
// 最適な形式の設定資料画像(キャラごとに「顔ヘッドショット」+「全身」の 2 枚)を
// GPT Image 2 (openai/gpt-image-2/edit) で生成する。
//
// 形式の根拠(ByteDance 公式プロンプトガイド + 2026-07 時点の調査。docs/SEEDANCE_GUIDELINES.md 参照):
//   - キャラ 1 人 = 顔だけのヘッドショット(正面・無表情・無地背景)+ 全身 1 枚のペアが最強のアンカー
//   - 三面図(1 枚に複数アングル)は「別人が複数いる」と誤読されるため使わない
//   - 透過 PNG ではなく無地背景へフラット化し、均一ライティングにする
//
// 使い方:
//   FAL_KEY=<APIキー> node scripts/gen_character_sheets.mjs [キャラ名...]
//     キャラ名省略 = 全 4 キャラ(義経 静 弁慶 頼朝)
//     例: node scripts/gen_character_sheets.mjs 義経
//
// 出力: /tmp/charsheet/<キャラ名>_顔.png / <キャラ名>_全身.png
// 確認後に incoming/reference/設定資料/ へコピーしてコミットする(自動コピーはしない)。

import { fal } from "@fal-ai/client";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = "/tmp/charsheet";
const REF_ROOT = "incoming/reference/キャラクター";

// キャラごとの入力参考画像(1 枚目 = 顔の正、2 枚目 = 全身の正)
const CHARACTERS = {
  義経: {
    face: `${REF_ROOT}/義経/義経顔アップ.png`,
    body: `${REF_ROOT}/義経/義経正面エフェクト無し.png`,
    desc: "茶髪ショートヘアの若い剣士(義経)",
  },
  静: {
    face: `${REF_ROOT}/静/静_顔.png`,
    body: `${REF_ROOT}/静/静_正面.png`,
    desc: "紺色の髪に赤紫の立烏帽子をかぶった白拍子の女性(静)",
  },
  弁慶: {
    face: `${REF_ROOT}/弁慶/弁慶顔アップ.png`,
    body: `${REF_ROOT}/弁慶/弁慶正面.png`,
    desc: "白い頭巾と緑の大数珠を身につけた大柄な僧兵(弁慶)",
  },
  頼朝: {
    face: `${REF_ROOT}/頼朝/頼朝顔アップ.png`,
    body: `${REF_ROOT}/頼朝/頼朝全身.png`,
    desc: "白銀の長髪に額の紋様と黒い冠を持つ武将(頼朝)",
  },
};

// デザイン維持の共通指示(顔・全身の両プロンプトに含める)
const KEEP_DESIGN =
  "キャラクターデザインは参考画像から一切変えないこと。" +
  "顔立ち・目の形と色・眉・鼻・口・輪郭・肌の色・髪型・髪色・装飾品・衣装の形状と色・体型を正確に維持する。" +
  "3D レンダー調の質感・リアリティも参考画像のまま維持する。" +
  "背景は無地の明るいグレー(#d9d9d9 程度)、影のない均一なスタジオライティング。" +
  "文字・ロゴ・枠・透かしは入れない。";

const SHEETS = {
  顔: {
    size: { width: 2048, height: 2048 },
    prompt: (c) =>
      `参考画像のキャラクター(${c.desc})の顔設定資料を作成してください。` +
      `頭部から肩までのバストアップ、真正面、無表情(ニュートラル)、目線はまっすぐカメラ。` +
      `頭部や被り物が切れないように収めること。` +
      KEEP_DESIGN,
  },
  全身: {
    size: { width: 1792, height: 2896 },
    prompt: (c) =>
      `参考画像のキャラクター(${c.desc})の全身設定資料を作成してください。` +
      `自然な直立の立ちポーズ、真正面、頭(被り物含む)からつま先まで全身が完全に収まる構図。` +
      `腕は体の横に自然に下ろす。武器・装飾は参考画像どおりに身につけたままにする。` +
      KEEP_DESIGN,
  },
};

if (!process.env.FAL_KEY) {
  console.error("ERROR: 環境変数 FAL_KEY が設定されていません。");
  process.exit(1);
}

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(CHARACTERS);

for (const name of targets) {
  if (!CHARACTERS[name]) {
    console.error(`ERROR: 未知のキャラ名 "${name}"(候補: ${Object.keys(CHARACTERS).join(" ")})`);
    process.exit(1);
  }
}

await mkdir(OUT_DIR, { recursive: true });

async function uploadRef(filePath) {
  const data = await readFile(filePath);
  const file = new File([data], path.basename(filePath), { type: "image/png" });
  const url = await fal.storage.upload(file);
  console.log(`  uploaded: ${filePath}`);
  return url;
}

async function generate(name, sheetKey, imageUrls) {
  const sheet = SHEETS[sheetKey];
  const c = CHARACTERS[name];
  const started = Date.now();
  const result = await fal.subscribe("openai/gpt-image-2/edit", {
    input: {
      prompt: sheet.prompt(c),
      image_urls: imageUrls,
      image_size: sheet.size,
      quality: "high",
      num_images: 1,
      output_format: "png",
    },
    logs: false,
  });
  const image = result.data.images[0];
  const res = await fetch(image.url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const dest = path.join(OUT_DIR, `${name}_${sheetKey}.png`);
  await writeFile(dest, buf);
  console.log(
    `  ${sheetKey}: ${image.width}x${image.height} ` +
      `${((Date.now() - started) / 1000).toFixed(0)}s → ${dest}`
  );
}

for (const name of targets) {
  const c = CHARACTERS[name];
  console.log(`\n=== ${name} ===`);
  const faceUrl = await uploadRef(c.face);
  const bodyUrl = await uploadRef(c.body);
  // 顔設定資料: 顔アップを 1 枚目(主参照)に。全身も渡して襟元・装飾の整合を取る
  await generate(name, "顔", [faceUrl, bodyUrl]);
  // 全身設定資料: 全身を 1 枚目(主参照)に。顔アップも渡して顔のディテールを維持
  await generate(name, "全身", [bodyUrl, faceUrl]);
}

console.log("\n生成完了。/tmp/charsheet/ を確認し、良ければ incoming/reference/設定資料/ へコピーしてください。");
