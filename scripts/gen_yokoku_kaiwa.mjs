// 基本背景 固有予告 3(会話予告)の静止画生成スクリプト(docs/YOKOKU_PRODUCTION_PLAN.md 12.7)
//
// 経緯(2026-07-17 = AGENT #087): AGENT #086 が内蔵 GenerateImage で生成した 12 枚は
// キャラクターデザインが設定資料からドリフトした(義経がポニーテール化 / 頼朝が
// 黒髪短髪 + 烏帽子の別人化)ため、ユーザー指示により GPT Image 2 (openai/gpt-image-2/edit)
// で全 12 枚を作り直す。枠単体(会話予告_枠.png)はユーザー承認済みのため再生成しない。
//
// デザイン維持の方針:
//   - 参照は必ず設定資料ペア(incoming/reference/設定資料/<キャラ>_顔.png / _全身.png)
//   - プロンプトに髪型・被り物などの要点を明文化し「変えてはいけない特徴」を明示する
//     (特に義経 = ポニーテール禁止 / 頼朝 = 白銀の長髪・黒髪短髪や烏帽子は禁止)
//   - 表情・ポーズのみ変更可。デザインは一切変更不可(2026-07-17 ユーザー指示)
//
// 使い方:
//   FAL_KEY2=<APIキー> node scripts/gen_yokoku_kaiwa.mjs <キャラ> <一言目|二言目|全画面> [一言目パス]
//     キャラ: 義経 | 頼朝 | 静 | 弁慶
//     二言目は「一言目パス」(生成済みの一言目画像)が必須(枠・背景の一貫性を参照連鎖で確保)
//   例:
//     node scripts/gen_yokoku_kaiwa.mjs 義経 一言目
//     node scripts/gen_yokoku_kaiwa.mjs 義経 二言目 /tmp/kaiwa_gen/義経_会話予告_一言目.png
//     node scripts/gen_yokoku_kaiwa.mjs 義経 全画面
//
// 出力: /tmp/kaiwa_gen/<キャラ>_会話予告_<バリエーション>.png(1536x1024 = 3:2)
// 採用分は incoming/yokoku/ へ同名コピーしてコミットする(自動コピーはしない)。

import { fal } from "@fal-ai/client";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = "/tmp/kaiwa_gen";
const SHEETS = "incoming/reference/設定資料";
const FRAME = "incoming/yokoku/会話予告_枠.png";

// 設定資料から書き起こしたデザイン要点(ドリフト防止のためプロンプトへ明示する)
const CHARACTERS = {
  義経: {
    desc: "茶髪ショートヘアの若い剣士(義経)",
    design:
      "髪は短く無造作な茶髪のショートヘアのままにする。ポニーテール・結んだ髪・長い後ろ髪の束は絶対に描かない。" +
      "茶色の目、袖なしの白い胴着(赤い縁取り・紫の破線ステッチ・胸元の紫の紐飾り)、" +
      "両肩の白い毛皮の飾り、赤い下衣の襟、銀の籠手(縁に白い毛皮)を維持する。",
    backdrop: "夜の山寺の石畳と朱色の鳥居",
    fullPose:
      "抜刀した太刀を構える格好良い決めポーズ(赤い柄の太刀。刀身は画面下方向へ)。",
    fullBg:
      "青と金の光が渦巻くエネルギーの背景に、ピンクの桜の花びらが舞い散る。",
  },
  頼朝: {
    desc: "白銀の長髪に額の紋様と黒い冠を持つ武将(頼朝)",
    design:
      "髪は胸まで届くまっすぐな白銀の長髪のままにする。額の赤い紋様(刺青)と、" +
      "左右に輪状の角飾りが付いた黒い装飾冠を必ず描く。切れ長の鋭い目元(赤みを帯びる)、色白の肌、" +
      "胸元の開いた黒い鎖帷子の襟、白い羽根と茶色の毛皮の肩飾りが付いた茶×金刺繍の長羽織、" +
      "胸元の赤い紐結びを維持する。黒髪・短髪・烏帽子・あご髭・口髭は絶対に描かない。",
    backdrop: "夜の豪奢な和風御殿の室内",
    fullPose:
      "軍配(扇)を片手に持ち、もう片方の手を前へ突き出す威圧的な決めポーズ。",
    fullBg: "赤と黒の炎のようなエネルギーが渦巻く背景。",
  },
  静: {
    desc: "紺色の髪に赤紫の立烏帽子をかぶった白拍子の舞姫(静)",
    design:
      "髪は肩までの紺色(暗い青)の内巻きボブのままにする(髪を腰まで長くしない)。" +
      "金の文様が入った赤紫の立烏帽子、金の髪飾りと水色の玉の耳飾り、青い瞳、" +
      "白地に金の文様の上衣(襟はピンク)、青緑の宝玉が付いた金の首飾り、" +
      "赤い帯と大きなリボン結び、白い広袖を維持する。",
    backdrop: "夜桜が舞う寺社の境内",
    fullPose: "金の扇を二枚広げて舞う優雅で格好良い決めポーズ。",
    fullBg:
      "ピンクと紫と金の光が渦巻くエネルギーの背景に、桜の花びらが舞い散る。",
  },
  弁慶: {
    desc: "白い頭巾と緑の大数珠を身につけた大柄な僧兵(弁慶)",
    design:
      "白い頭巾と金の額当て、首の緑の大きな数珠(玉が大きい)を必ず描く。" +
      "日焼けした肌、腕と胸の刺青、金の縁取りの紫の羽織、藍色の胴着、白い帯、" +
      "金の鋲付きの腕輪、屈強な大柄の体格を維持する。",
    backdrop: "夜の滝と深い森",
    fullPose: "長い薙刀を大きく薙ぎ払う迫力のある決めポーズ。",
    fullBg: "緑の水流のようなエネルギーが渦巻く背景に、水しぶきが飛び散る。",
  },
};

// デザイン固定の共通指示(全バリエーションに含める)
const KEEP_DESIGN =
  "キャラクターデザイン(顔立ち・目の形と色・眉・鼻・口・輪郭・肌の色・髪型・髪色・被り物・" +
  "装飾品・衣装の形状と色・体型・3D レンダー調の質感)は参考画像から一切変えないこと。" +
  "変えてよいのは表情とポーズだけ。" +
  "文字・ロゴ・字幕・透かし・セリフは一切描き込まない。横長の画像。";

const VARIANTS = {
  一言目: (c) =>
    `3 枚目の参考画像は会話ウィンドウの枠のデザイン。この枠(漆黒の下地・金の縁・桜と雲の飾り・` +
    `左上のネームプレート)を一切変えずそのまま使い、枠の内側の左 1/3 に、1〜2 枚目の参考画像の` +
    `キャラクター(${c.desc})のバストアップを配置した会話予告の画像を作成してください。` +
    `枠は 3 枚目の参考画像と同じく画像の四辺いっぱいまで広げて描き、` +
    `枠の外側に黒い帯や余白を一切残さない(画像全体が枠で満たされる)。` +
    `キャラクターは画面右側の空いた台詞スペースの方を向いて落ち着いて話しかけるポーズ` +
    `(視線と体はやや右向き)。枠の内側のキャラクターの背後には${c.backdrop}を暗めに描き、` +
    `右 2/3 は後から台詞テキストを重ねるための暗く無地に近い空間として空けておく。` +
    `ネームプレートの中は無地のまま。` +
    c.design +
    KEEP_DESIGN,
  二言目: (c) =>
    `3 枚目の参考画像は同じキャラクター(${c.desc})の会話予告「一言目」の画像。` +
    `会話ウィンドウの枠のデザインと枠の内側の背景(${c.backdrop})の雰囲気は 3 枚目から一切変えず、` +
    `キャラクターの配置だけ左右反転した「二言目」の画像を作成してください: ` +
    `キャラクターのバストアップを枠の内側の右 1/3 に配置し、画面左側の空いた台詞スペースの方を` +
    `向いて話しかける(視線と体はやや左向き)。表情は一言目より強い、力のこもった真剣な表情にする。` +
    `左 2/3 は後から台詞テキストを重ねるための暗く無地に近い空間として空けておく。` +
    `ネームプレートは左上のまま。キャラクターの顔・髪・衣装は 1〜2 枚目の参考画像に正確に合わせる。` +
    c.design +
    KEEP_DESIGN,
  全画面: (c) =>
    `1〜2 枚目の参考画像のキャラクター(${c.desc})が画面中央で決めポーズをとる、` +
    `パチスロの全画面カットイン予告の画像を作成してください。` +
    `ポーズ: ${c.fullPose} 背景: ${c.fullBg} ` +
    `画面の左上と右下は、後から大きな台詞テキストを重ねるためにエフェクトを控えめにして空間を残す。` +
    `会話ウィンドウの枠は描かない。迫力のあるダイナミックな構図。` +
    c.design +
    KEEP_DESIGN,
};

// API キーは FAL_KEY2 を使用する(2026-07-16 ユーザー指示。旧 FAL_KEY は使わない)
if (!process.env.FAL_KEY2) {
  console.error("ERROR: 環境変数 FAL_KEY2 が設定されていません。");
  process.exit(1);
}
fal.config({ credentials: process.env.FAL_KEY2 });

const [charName, variant, line1Path] = process.argv.slice(2);
const c = CHARACTERS[charName];
if (!c || !VARIANTS[variant]) {
  console.error(
    `使い方: node scripts/gen_yokoku_kaiwa.mjs <${Object.keys(CHARACTERS).join("|")}> <${Object.keys(VARIANTS).join("|")}> [一言目パス]`,
  );
  process.exit(1);
}
if (variant === "二言目" && !line1Path) {
  console.error("ERROR: 二言目には生成済みの一言目画像パスを渡してください。");
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

async function uploadRef(filePath) {
  const data = await readFile(filePath);
  const file = new File([data], path.basename(filePath), { type: "image/png" });
  const url = await fal.storage.upload(file);
  console.log(`uploaded: ${filePath}`);
  return url;
}

const faceUrl = await uploadRef(`${SHEETS}/${charName}_顔.png`);
const bodyUrl = await uploadRef(`${SHEETS}/${charName}_全身.png`);
const imageUrls = [faceUrl, bodyUrl];
if (variant === "一言目") imageUrls.push(await uploadRef(FRAME));
if (variant === "二言目") imageUrls.push(await uploadRef(line1Path));

const started = Date.now();
console.log(`=== ${charName} 会話予告 ${variant} ===`);
const result = await fal.subscribe("openai/gpt-image-2/edit", {
  input: {
    prompt: VARIANTS[variant](c),
    image_urls: imageUrls,
    image_size: { width: 1536, height: 1024 },
    quality: "high",
    num_images: 1,
    output_format: "png",
  },
  logs: false,
});
const image = result.data.images[0];
console.log(
  `done in ${((Date.now() - started) / 1000).toFixed(0)}s: ${image.width}x${image.height}`,
);
const dest = path.join(OUT_DIR, `${charName}_会話予告_${variant}.png`);
const res = await fetch(image.url);
if (!res.ok) throw new Error(`download failed: ${res.status}`);
await writeFile(dest, Buffer.from(await res.arrayBuffer()));
console.log(`saved: ${dest}`);
