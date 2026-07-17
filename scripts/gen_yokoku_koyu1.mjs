// 基本背景の固有予告 1 の実素材ムービー生成スクリプト(docs/YOKOKU_PRODUCTION_PLAN.md)
//
// 生成手法(プラン「4.」= SPEC 確定 43 で承認済み):
//   1. 起点静止画を GPT Image 2 (openai/gpt-image-2/edit) で 1 枚生成
//      (設定資料の顔 + 全身 + 背景参考から「キャラが定位置に立つ予告開始構図」)
//   2. Seedance 2.0 reference-to-video へ「@Image3 = 最初のフレーム」と明示して
//      弱・強を生成(プロンプトは方向の 1 語 + 強側のエフェクト 1 句のみ差し替え
//      = 2 本の出だしが一致し「途中から分岐する微妙な違い」になる)
//   - 弱 = 左へ / 強 = 右へ(4 背景統一 = Q21 承認)
//   - 尺 6 秒(2026-07-16 指示)・音声なし(SE 別管理)・図柄はアプリ側オーバーレイ(Q23)
//   - 顔維持ルールは docs/SEEDANCE_GUIDELINES.md に従う(@Image バインド・顔の再描写なし)
//
// 使い方:
//   FAL_KEY2=<APIキー> node scripts/gen_yokoku_koyu1.mjs <背景> <ステップ> [起点静止画パス]
//     背景   : 義経(静・弁慶・夕方は BACKGROUNDS へ追記して展開する)
//     ステップ: start = 起点静止画のみ / draft = 下書き動画(fast 480p) /
//               final = 本番動画(standard 720p)。draft / final は起点静止画パス必須
//   例:
//     node scripts/gen_yokoku_koyu1.mjs 義経 start
//     node scripts/gen_yokoku_koyu1.mjs 義経 draft /tmp/yokoku_gen/義経_koyu1_start.png
//     node scripts/gen_yokoku_koyu1.mjs 義経 final /tmp/yokoku_gen/義経_koyu1_start.png
//     node scripts/gen_yokoku_koyu1.mjs 義経 final /tmp/yokoku_gen/義経_koyu1_start.png strong
//       (第 4 引数 weak|strong で片方だけ再生成できる)
//
// 出力: /tmp/yokoku_gen/<背景>_koyu1_start.png / _weak_<draft|final>.mp4 / _strong_<draft|final>.mp4
// 採用する動画は incoming/ へ「<bg>_固有予告1_弱.mp4 / _強.mp4」の名前でコピーし、
// scripts/import_incoming_assets.py で WebM 変換・取り込みする(自動コピーはしない)。

import { fal } from "@fal-ai/client";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = "/tmp/yokoku_gen";
const SHEETS = "incoming/reference/設定資料";

// 背景ごとの設定(演出案は YOKOKU_PRODUCTION_PLAN「3.」の本命案 = Q24 承認)
const BACKGROUNDS = {
  義経: {
    face: `${SHEETS}/義経_顔.png`,
    body: `${SHEETS}/義経_全身.png`,
    desc: "茶髪ショートヘアの若い剣士(義経)",
    // 背景参考 = 実装済みステージ動画の代表フレーム(ffmpeg で抽出したもの)。
    // 無ければ incoming/reference/背景/義経背景/ の参考画像を指定する
    bgRef: `${OUT_DIR}/stage_yoshitsune_frame.png`,
    startPrompt:
      "参考画像を合成した予告演出の開始構図を作成してください。" +
      "3 枚目の背景画像(山寺の石畳の広場と朱色の門)の中に、" +
      "1〜2 枚目のキャラクター(義経)が立っている画を作る: " +
      "広場の中央手前に義経が真正面を向いて静かに立ち、腕は自然に下ろす。" +
      "膝から上が写るミディアムショット、義経は画面中央。" +
      "背景の建物・石畳・木々・昼の柔らかい光は 3 枚目の背景画像から変えない。" +
      "キャラクターデザイン(顔立ち・髪型・髪色・衣装・装飾・体型・3D レンダー調の質感)は" +
      "1〜2 枚目から一切変えない。文字・ロゴ・枠・透かしは入れない。横長 16:9。",
    scene:
      "山寺の石畳の広場、義経が真正面を向いて静かに立っている。" +
      "風で木の葉が数枚ゆっくり横切る。",
    weakAction:
      "義経が何かに気づいて、ゆっくりと左を向く。カメラは義経の視線を追って左へゆっくりパンし、" +
      "義経が画面右へ外れて、木々と石畳だけの空きスペースを映して終わる。木の葉が数枚舞う。",
    // 採用版(2026-07-16)のプロンプト。「桜吹雪が強めに舞う」だけでは描画されなかったため
    // 明示的に強調している(冒頭から舞い続ける = 弱との出だし完全一致より効果の確実さを優先)
    strongAction:
      "義経が何かに気づいて、ゆっくりと右を向く。カメラは義経の視線を追って右へゆっくりパンし、" +
      "義経が画面左へ外れて、木々と石畳だけの空きスペースを映して終わる。" +
      "動画の冒頭から最後まで、画面全体にピンク色の桜の花びらが大量に舞い散り続ける(桜吹雪)。" +
      "パン後の空きスペースでも桜吹雪が舞い続ける。",
  },
};

// 弱・強共通のプロンプト末尾(動き・画づくりの指定のみ。顔は @Image に任せる)
const COMMON_TAIL =
  "動きはすべてゆっくりで落ち着いている。振り向きはゆっくり。" +
  "落ち着いたシネマティックな和風の照明。文字・ロゴ・字幕は入れない。";

// API キーは FAL_KEY2 を使用する(2026-07-16 ユーザー指示。旧 FAL_KEY は使わない)
if (!process.env.FAL_KEY2) {
  console.error("ERROR: 環境変数 FAL_KEY2 が設定されていません。");
  process.exit(1);
}
fal.config({ credentials: process.env.FAL_KEY2 });

const [bgName, step, startImagePath, onlyVariant] = process.argv.slice(2);
const bg = BACKGROUNDS[bgName];
if (!bg || !["start", "draft", "final"].includes(step)) {
  console.error(
    `使い方: node scripts/gen_yokoku_koyu1.mjs <${Object.keys(BACKGROUNDS).join("|")}> <start|draft|final> [起点静止画パス]`,
  );
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

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`saved: ${dest}`);
}

if (step === "start") {
  // 起点静止画(生成手法 1.)。確認後に draft / final へ渡す
  const faceUrl = await uploadRef(bg.face);
  const bodyUrl = await uploadRef(bg.body);
  const bgUrl = await uploadRef(bg.bgRef);
  const started = Date.now();
  const result = await fal.subscribe("openai/gpt-image-2/edit", {
    input: {
      prompt: bg.startPrompt,
      image_urls: [faceUrl, bodyUrl, bgUrl],
      image_size: { width: 1792, height: 1008 },
      quality: "high",
      num_images: 1,
      output_format: "png",
    },
    logs: false,
  });
  const image = result.data.images[0];
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s: ${image.width}x${image.height}`);
  await download(image.url, path.join(OUT_DIR, `${bgName}_koyu1_start.png`));
  process.exit(0);
}

// draft / final: 起点静止画から弱・強の 2 本を生成(生成手法 2.)
if (!startImagePath) {
  console.error("ERROR: draft / final には起点静止画パスを渡してください(start で生成)。");
  process.exit(1);
}
const model =
  step === "draft"
    ? "bytedance/seedance-2.0/fast/reference-to-video"
    : "bytedance/seedance-2.0/reference-to-video";
const resolution = step === "draft" ? "480p" : "720p";

const faceUrl = await uploadRef(bg.face);
const bodyUrl = await uploadRef(bg.body);
const startUrl = await uploadRef(startImagePath);

const variants = onlyVariant ? [onlyVariant] : ["weak", "strong"];
for (const variant of variants) {
  const action = variant === "weak" ? bg.weakAction : bg.strongAction;
  const prompt =
    `@Image1 は主人公・${bg.desc}の顔の参照(顔立ち・髪型はこの画像から一切変えない)。` +
    `@Image2 は同じキャラクターの全身・衣装の参照。` +
    `@Image3 はこの動画の最初のフレーム(開始構図。この画から動画を始める)。` +
    bg.scene +
    action +
    COMMON_TAIL;
  const started = Date.now();
  console.log(`\n=== ${bgName} koyu1 ${variant} (${step}: ${model} ${resolution}) ===`);
  const result = await fal.subscribe(model, {
    input: {
      prompt,
      image_urls: [faceUrl, bodyUrl, startUrl],
      resolution,
      duration: "6",
      aspect_ratio: "16:9",
      generate_audio: false,
    },
    logs: true,
    onQueueUpdate: (update) => console.log(`[${variant}] status=${update.status}`),
  });
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s seed=${result.data.seed ?? "-"}`);
  await download(result.data.video.url, path.join(OUT_DIR, `${bgName}_koyu1_${variant}_${step}.mp4`));
}

console.log("\n生成完了。/tmp/yokoku_gen/ の動画を確認し、採用版を incoming/ へコピーして取り込むこと。");
