// 後白河法皇(黒幕・ラスボス)全身デザイン画の生成スクリプト
//
// 背景: docs/CHARACTER_GOSHIRAKAWA_PLAN.md のプロンプト案 A/B/C(2026-07-17 ユーザー承認済み)。
// 3 案を各 1 枚生成し、ユーザーがどの案を採用するか決める(組込みはデザイン確定後の別ラン)。
//
// 参照画像について(計画からの変更点):
//   計画では @Image1 = 後白河法皇の実物写真(座像)を衣装参照に使う想定だったが、
//   写真はチャット添付のみで VM にファイルとして存在せず取得不能だった(2026-07-17 ラン)。
//   そのため実物写真から読み取れる衣装情報(白い法衣 + 柿渋色の袈裟 + 剃髪)を
//   プロンプトの文章描写へ展開し、参照画像はスタイルアンカーの 頼朝_全身.png 1 枚のみとした。
//
// 使い方:
//   FAL_KEY2=<APIキー> node scripts/gen_goshirakawa_design.mjs [A B C ...]
//     案名省略 = 全 3 案(A B C)
//
// 出力: /tmp/goshirakawa/後白河_案A_全身.png など(1792x2896)
// 確認後にユーザーが採用案を決定する(自動で incoming/ へはコピーしない)。

import { fal } from "@fal-ai/client";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = "/tmp/goshirakawa";
const STYLE_ANCHOR = "incoming/reference/設定資料/頼朝_全身.png";

// 共通ベース(docs/CHARACTER_GOSHIRAKAWA_PLAN.md「4. プロンプト案」の共通ベース。
// @Image1(実物写真)は入手不能のため、写真の衣装情報を文章へ展開済み)
const BASE_PROMPT =
  "パチスロ「義経物語」のラスボス・後白河法皇のキャラクターデザイン(全身立ち絵)を作成してください。" +
  "【画風】参考画像(@Image1)と同じフォトリアルな 3D ゲームキャラクターレンダー調。" +
  "質感・ライティング・頭身を参考画像に合わせる(デザイン自体は参考画像から流用しない)。" +
  "【衣装の基本】平安時代の法皇(出家した上皇)の僧形: ゆったりとした純白の法衣(広袖の僧衣)を着て、" +
  "肩から斜めに赤茶(柿渋色)の袈裟を掛け、頭は剃髪(坊主頭)。" +
  "この「白い法衣 + 斜め掛けの柿渋色の袈裟 + 剃髪」の構成は必ず維持する。" +
  "【顔・年齢】若く力強い僧形の男。血の気のない蒼白な肌、赤く光る鋭い瞳、冷酷で禍々しい微笑。" +
  "【属性】「赤い氷」。半透明の深紅の氷の結晶が肩・袖口・裾に張り付き、法衣の裾は凍りついて" +
  "足元から赤い冷気(フロストミスト)が漂う。氷は血のように深い赤で、内側から不気味に発光する。" +
  "炎や雷のエフェクトは出さない。" +
  "【構図】自然な直立の立ちポーズ、真正面、頭からつま先まで全身が完全に収まる。" +
  "背景は無地の明るいグレー、影のない均一なスタジオライティング。文字・ロゴ・枠・透かしは入れない。";

const VARIANTS = {
  A: {
    title: "若き覇王(30歳前後・力強さ重視)",
    extra:
      "【追加指定】年齢は 30 歳前後。長身で肩幅のある堂々とした体格。眉は鋭く、目つきは獲物を見下ろす" +
      "ように冷たい。額に赤い氷の結晶でできた第三の目のような紋様が浮かぶ。左手に深紅の氷でできた" +
      "大数珠を提げ、右手は軽く開いて掌に小さな赤い氷晶を浮かべている。袈裟の縁と首元に金の刺繍で" +
      "菊の文様をあしらい、法皇(治天の君)の格を示す。",
  },
  B: {
    title: "壮年の巨悪(40代前半・威厳と底知れなさ重視)",
    extra:
      "【追加指定】年齢は 40 代前半。「若返らせた後白河」とわかる面影を残しつつ、頬はこけ、" +
      "彫りの深い顔立ちに深い威厳を宿す。表情は薄笑いで目だけが笑っていない。右手に赤い氷が" +
      "螺旋状に巻き付いた黒漆の錫杖(頭部の遊環も深紅の氷でできている)を持ち、左手に数珠を提げる。" +
      "白い法衣の裾は長く床へ広がり、裾の先が凍って赤い氷の棘になっている。",
  },
  C: {
    title: "傀儡師(20代後半・妖しさ重視・琵琶持ち)",
    extra:
      "【追加指定】年齢は 20 代後半。中性的で妖しく整った顔立ち、切れ長の目。表情は恍惚とした" +
      "薄笑いで狂気を感じさせる。背に深紅の氷でできた琵琶を負い、右手にその撥(ばち)を持つ。" +
      "指先から赤い氷の糸が数本、操り人形の糸のように垂れて足元の冷気へ消えていく。",
  },
};

// API キーは FAL_KEY2 を使用する(2026-07-16 ユーザー指示。旧 FAL_KEY は使わない)
if (!process.env.FAL_KEY2) {
  console.error("ERROR: 環境変数 FAL_KEY2 が設定されていません。");
  process.exit(1);
}
fal.config({ credentials: process.env.FAL_KEY2 });

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(VARIANTS);

for (const key of targets) {
  if (!VARIANTS[key]) {
    console.error(`ERROR: 未知の案 "${key}"(候補: ${Object.keys(VARIANTS).join(" ")})`);
    process.exit(1);
  }
}

await mkdir(OUT_DIR, { recursive: true });

const data = await readFile(STYLE_ANCHOR);
const file = new File([data], path.basename(STYLE_ANCHOR), { type: "image/png" });
const styleUrl = await fal.storage.upload(file);
console.log(`uploaded style anchor: ${STYLE_ANCHOR}`);

for (const key of targets) {
  const v = VARIANTS[key];
  console.log(`\n=== 案 ${key}: ${v.title} ===`);
  const started = Date.now();
  const result = await fal.subscribe("openai/gpt-image-2/edit", {
    input: {
      prompt: BASE_PROMPT + v.extra,
      image_urls: [styleUrl],
      image_size: { width: 1792, height: 2896 },
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
  const dest = path.join(OUT_DIR, `後白河_案${key}_全身.png`);
  await writeFile(dest, buf);
  console.log(
    `  ${image.width}x${image.height} ${((Date.now() - started) / 1000).toFixed(0)}s → ${dest}`
  );
}

console.log("\n生成完了。/tmp/goshirakawa/ を確認し、採用案をユーザーが決定する。");
