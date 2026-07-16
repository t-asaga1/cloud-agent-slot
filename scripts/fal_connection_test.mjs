// fal.ai 接続テストスクリプト(演出素材生成フェーズの事前確認用)
//
// 使い方:
//   FAL_KEY=<APIキー> node scripts/fal_connection_test.mjs [storage|image|video|all]
//     storage : fal ストレージへの参考画像アップロードのみ
//     image   : ストレージ + GPT Image 2 (edit) での画像生成
//     video   : ストレージ + Seedance 2.0 (fast/image-to-video) での動画生成
//     all     : すべて(デフォルト)
//
// 使用モデル(2026-07-16 時点の fal.ai モデル ID):
//   画像: openai/gpt-image-2 (text-to-image) / openai/gpt-image-2/edit (参考画像あり)
//   動画: bytedance/seedance-2.0/fast/image-to-video(text-to-video / reference-to-video もあり)
//
// 出力は /tmp/fal_test/ に保存する(リポジトリへはコミットしない)。
// コストを抑えるため quality=low・480p・4 秒で叩く。本番生成時は quality / resolution を上げること。

import { fal } from "@fal-ai/client";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = "/tmp/fal_test";
const REFERENCE_IMAGE =
  "incoming/reference/キャラクター/義経/義経正面エフェクト無し.png";

const mode = process.argv[2] ?? "all";

if (!process.env.FAL_KEY) {
  console.error("ERROR: 環境変数 FAL_KEY が設定されていません。");
  process.exit(1);
}

function logQueueUpdate(label) {
  return (update) => {
    console.log(`[${label}] status=${update.status}`);
    if (update.status === "IN_PROGRESS" && update.logs) {
      for (const log of update.logs) console.log(`[${label}] ${log.message}`);
    }
  };
}

async function download(url, filename) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const dest = path.join(OUT_DIR, filename);
  await writeFile(dest, buf);
  console.log(`saved: ${dest} (${(buf.length / 1024).toFixed(0)} KB)`);
  return dest;
}

await mkdir(OUT_DIR, { recursive: true });

// --- 1. ストレージアップロード(参考画像を fal へ渡す経路の確認) ---
console.log(`\n=== 1. fal ストレージへ参考画像をアップロード ===`);
console.log(`file: ${REFERENCE_IMAGE}`);
const refData = await readFile(REFERENCE_IMAGE);
const refFile = new File([refData], path.basename(REFERENCE_IMAGE), {
  type: "image/png",
});
const refUrl = await fal.storage.upload(refFile);
console.log(`uploaded: ${refUrl}`);
if (mode === "storage") process.exit(0);

// --- 2. GPT Image 2 (edit): 参考画像ベースの画像生成 ---
let generatedImageUrl;
if (mode === "image" || mode === "all") {
  console.log(`\n=== 2. GPT Image 2 (openai/gpt-image-2/edit) で画像生成 ===`);
  const started = Date.now();
  const result = await fal.subscribe("openai/gpt-image-2/edit", {
    input: {
      prompt:
        "参考画像のキャラクター(白い狩衣風の衣装の若い剣士)をそのままのデザインで、" +
        "夜の京都の橋の上に立たせてください。満月を背にした構図、和風ゲームのキービジュアル風、" +
        "劇的なライティング。横長 16:9。",
      image_urls: [refUrl],
      image_size: "landscape_16_9",
      quality: "low",
      num_images: 1,
      output_format: "png",
    },
    logs: true,
    onQueueUpdate: logQueueUpdate("image"),
  });
  const image = result.data.images[0];
  console.log(
    `done in ${((Date.now() - started) / 1000).toFixed(1)}s: ` +
      `${image.width}x${image.height} ${image.url}`
  );
  generatedImageUrl = image.url;
  await download(image.url, "gpt_image_2_test.png");
}

// --- 3. Seedance 2.0 (fast/image-to-video): 画像から動画生成 ---
if (mode === "video" || mode === "all") {
  console.log(
    `\n=== 3. Seedance 2.0 (bytedance/seedance-2.0/fast/image-to-video) で動画生成 ===`
  );
  const sourceUrl = generatedImageUrl ?? refUrl;
  const started = Date.now();
  const result = await fal.subscribe(
    "bytedance/seedance-2.0/fast/image-to-video",
    {
      input: {
        prompt:
          "キャラクターの羽織と髪が夜風に静かになびく。カメラはゆっくり寄る。" +
          "背景の月明かりが揺らめく。シネマティック。",
        image_url: sourceUrl,
        resolution: "480p",
        duration: "4",
        aspect_ratio: "16:9",
        generate_audio: false,
      },
      logs: true,
      onQueueUpdate: logQueueUpdate("video"),
    }
  );
  console.log(
    `done in ${((Date.now() - started) / 1000).toFixed(1)}s: seed=${result.data.seed} ${result.data.video.url}`
  );
  await download(result.data.video.url, "seedance_test.mp4");
}

console.log("\n接続テスト完了");
