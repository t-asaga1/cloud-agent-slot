// 後白河法皇(黒幕・ラスボス)顔アップ参考画像の生成スクリプト
//
// 背景: 全身デザインは案 A「若き覇王」で確定(2026-07-17 ユーザー決定)。
// 確定した全身画(後白河_案A_全身.png)を参照の 1 枚目に据えて、他キャラの
// 顔アップ参考画像(義経顔アップ.png 等)と同様の「参考用の顔アップ」を生成する。
// docs/CHARACTER_GOSHIRAKAWA_PLAN.md「6. 次ラン(採用案決定後)への申し送り」の 3 に相当。
//
// 使い方:
//   FAL_KEY2=<APIキー> node scripts/gen_goshirakawa_face.mjs
//
// 出力: /tmp/goshirakawa/後白河_顔アップ.png(2048x2048)
// 検品後に incoming/reference/キャラクター/黒幕/ へコピーしてコミットする(自動コピーはしない)。

import { fal } from "@fal-ai/client";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = "/tmp/goshirakawa";
const BODY_REF = "incoming/reference/キャラクター/黒幕/後白河_案A_全身.png";

// デザイン維持の指示は gen_character_sheets.mjs の KEEP_DESIGN と同方針
const PROMPT =
  "参考画像のキャラクター(パチスロ「義経物語」のラスボス・後白河法皇。" +
  "剃髪で額に赤い氷の結晶の紋様を持つ、白い法衣 + 柿渋色の斜め掛け袈裟の若き法皇)の" +
  "顔アップ参考画像を作成してください。" +
  "頭部から肩・胸元までのバストアップ、真正面、目線はまっすぐカメラ。" +
  "表情は参考画像と同じ、冷酷で禍々しい薄い微笑。剃髪の頭部が切れないように収めること。" +
  "キャラクターデザインは参考画像から一切変えないこと。" +
  "顔立ち・赤く光る鋭い瞳・眉・鼻・口・輪郭・血の気のない蒼白な肌・剃髪・" +
  "額の赤い氷の紋様・衣装(白い法衣 + 金の菊文様が入った柿渋色の袈裟)・" +
  "肩に張り付いた深紅の氷の結晶を正確に維持する。" +
  "3D レンダー調の質感・リアリティも参考画像のまま維持する。" +
  "背景は無地の明るいグレー、影のない均一なスタジオライティング。" +
  "文字・ロゴ・枠・透かしは入れない。";

// API キーは FAL_KEY2 を使用する(2026-07-16 ユーザー指示。旧 FAL_KEY は使わない)
if (!process.env.FAL_KEY2) {
  console.error("ERROR: 環境変数 FAL_KEY2 が設定されていません。");
  process.exit(1);
}
fal.config({ credentials: process.env.FAL_KEY2 });

await mkdir(OUT_DIR, { recursive: true });

const data = await readFile(BODY_REF);
const file = new File([data], path.basename(BODY_REF), { type: "image/png" });
const refUrl = await fal.storage.upload(file);
console.log(`uploaded reference: ${BODY_REF}`);

const started = Date.now();
const result = await fal.subscribe("openai/gpt-image-2/edit", {
  input: {
    prompt: PROMPT,
    image_urls: [refUrl],
    image_size: { width: 2048, height: 2048 },
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
const dest = path.join(OUT_DIR, "後白河_顔アップ.png");
await writeFile(dest, buf);
console.log(
  `${image.width}x${image.height} ${((Date.now() - started) / 1000).toFixed(0)}s → ${dest}`
);

console.log(
  "\n生成完了。検品後に incoming/reference/キャラクター/黒幕/ へコピーしてコミットする。"
);
