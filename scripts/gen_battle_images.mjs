// AT バトルパート演出画像の生成スクリプト
//   - 下位 AT バトル 25 枚(JOBS。2026-07-18 ユーザー指示 = 経緯 86)
//   - 上位 AT バトル 25 枚(UAT_JOBS。2026-07-18 Q35〜Q40 承認 = docs/UAT_BATTLE_PRODUCTION_PLAN.md)
//   - エンディング・リザルト 4 枚(ENDING_JOBS。2026-07-18 ユーザー指示)
//
// 下位 AT の指示元: incoming/義経物語下位AT中.pptx(構図の参考。実在機種の画面キャプチャのため
// fal.ai へは渡さない = ユーザー指示 + 実在機種素材の流用禁止ルール)。
// スライドの構図説明を AGENT が解釈し、本プロジェクトの設定資料・参考画像だけを
// 参照にして GPT Image 2 (openai/gpt-image-2/edit) で生成する。
//
// 下位 AT の枚数(ユーザー指定 = 計 25 枚):
//   1G: 2(導入 = 月のカット。通常 = 青い月 / チャンス = 赤い月)
//   2G: 1(義経セリフ。セリフはアプリ側テキストでバリエーション)
//   3G: 1(頼朝セリフ。同上)
//   4G: 3(レバオン = 対峙 / 第 3 停止 = 義経 or 頼朝の顔アップ)
//   5G: 8(義経弱・義経強・頼朝弱・頼朝強 × レバオンと第 3 停止)
//   6G: 4(義経攻撃 2 + 頼朝攻撃 1 + 桜花繚乱チャレンジ 1)
//   7G: 4(被弾 / 耐える / 敗北 / 義経攻撃時の継続)
//   8G: 2(倒れる義経 / 静カットイン復活)
//
// 上位 AT の枚数(承認済みプラン セクション 2 = 計 25 枚):
//   G1: 2(雪原の月 青/赤)/ G2: 1(義経台詞)/ G3: 1(頼朝台詞)/
//   G4: 4(対峙 + 攻撃側アップ 3 種 = 義経・頼朝・ダブル)/
//   G5: 6(構え + 技名カット × 義経・頼朝・ダブル)/
//   G6: 4(氷の障壁 + 成否 3 種)/ G7: 4(崩れる・吹き飛ぶ・反撃 2)/
//   G8: 3(継続・敗北・復活カットイン = 二人が共に立ち上がる)
//
// エンディング・リザルト(2026-07-18 ユーザー指示 = 計 4 枚):
//   1. 下位 AT エンディング 1 = 燃え盛る平等院鳳凰堂が一瞬で赤く凍り付く
//   2. 下位 AT エンディング 2 = 凍った鳳凰堂を砕いて後白河法皇が登場し義経・頼朝と対峙
//   3. 上位 AT エンディング = 雪原が晴れ渡り義経と頼朝が笑い合う
//   4. 敗北後の共通リザルト = 義経・頼朝・弁慶・静の全員集合の決めカット
//      (実機では獲得枚数とバトル回数の数値をアプリ側テキストで重ねる)
//
// 方針:
//   - キャラクターデザインは設定資料(incoming/reference/設定資料/)・
//     後白河 案A(incoming/reference/キャラクター/黒幕/)から一切変えない
//     (プロンプトへデザイン要点と禁止事項を明文化 = gen_yokoku_kaiwa.mjs と同方式)
//   - 技名・「敗北」「継続」「復活」・台詞・獲得枚数などの文字は画像に焼き込まない
//     (アプリ側テキスト描画 = 会話予告と同じ規約。文字用の空間を残す)
//   - 属性色: 義経 = 青い炎 / 頼朝 = 紫の雷 / 後白河 = 赤い氷
//   - 下位バトル背景 = 夜の炎上する平等院鳳凰堂(incoming/reference/背景/下位AT/)
//   - 上位バトル背景 = 夜の吹雪の雪原(参考画像なし。プロンプトのみ = Q38 承認)
//
// 使い方:
//   FAL_KEY2=<APIキー> node scripts/gen_battle_images.mjs at          # 下位 25 枚
//   FAL_KEY2=<APIキー> node scripts/gen_battle_images.mjs uat         # 上位 25 枚
//   FAL_KEY2=<APIキー> node scripts/gen_battle_images.mjs ending      # エンディング系 4 枚
//   FAL_KEY2=<APIキー> node scripts/gen_battle_images.mjs all         # 全ジョブ
//   FAL_KEY2=<APIキー> node scripts/gen_battle_images.mjs <jobId>...  # 個別(再生成用)
//   ※ g1_chance / uat_g1_chance / ending_at_2_goshirakawa は直前ジョブの出力を参照連鎖する
//
// 出力: /tmp/battle_gen/<jobId>.png(1792x1008 = 16:9)
// 採用分は incoming/battle/(バトル)・incoming/ending/(エンディング系)へ
// 日本語名でコピーしてコミットする(JP_NAMES 参照)。

import { fal } from "@fal-ai/client";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = "/tmp/battle_gen";
const SHEETS = "incoming/reference/設定資料";
const REF = "incoming/reference";

// --- キャラクターデザインの要点(設定資料から書き起こし。ドリフト防止で明文化) ---
const YOSHI_DESIGN =
  "義経のデザイン: 短く無造作な茶髪のショートヘア(ポニーテール・結んだ髪・長い後ろ髪は絶対に描かない)、" +
  "茶色の目、袖なしの白い胴着(赤い縁取り・紫の破線ステッチ・胸元の紫の紐飾り)、両肩の白い毛皮の飾り、" +
  "裾が炎の文様で赤く染まる白い袴、銀の籠手(縁に白い毛皮)。武器は赤い柄の太刀で、刀身に青い炎を纏う。";
const YORI_DESIGN =
  "頼朝のデザイン: 胸まで届くまっすぐな白銀の長髪、額の赤い紋様(刺青)、左右に輪状の角飾りが付いた黒い装飾冠、" +
  "切れ長の鋭い目元(赤みを帯びる)、色白の肌、胸元の開いた黒い鎖帷子、" +
  "白い羽根と茶色の毛皮の肩飾りが付いた茶×金刺繍の長羽織、胸元の赤い紐結び。" +
  "武器は太刀で、刀身に紫の雷を纏う。黒髪・短髪・烏帽子・あご髭・口髭は絶対に描かない。";
const SHIZUKA_DESIGN =
  "静のデザイン: 肩までの紺色(暗い青)の内巻きボブ(髪を腰まで長くしない)、金の文様が入った赤紫の立烏帽子、" +
  "金の髪飾りと水色の玉の耳飾り、青い瞳、白地に金の文様の上衣(襟はピンク)、" +
  "青緑の宝玉が付いた金の首飾り、赤い帯と大きなリボン結び、白い広袖。";
const BENKEI_DESIGN =
  "弁慶のデザイン: 白い頭巾と金の額当て、首の緑の大きな数珠(玉が大きい)を必ず描く。" +
  "日焼けした肌、腕と胸の刺青、金の縁取りの紫の羽織(袖なし)、藍色の胴着、白い帯、" +
  "金の鋲付きの腕輪、屈強な大柄の体格。武器は長い薙刀。";
const GOSHIRAKAWA_DESIGN =
  "後白河法皇のデザイン: 剃髪(坊主頭)の 30 歳前後の僧形の男。血の気のない蒼白な肌、" +
  "赤く光る鋭い瞳、額に赤い氷の結晶でできた第三の目のような紋様、冷酷で禍々しい微笑。" +
  "ゆったりした白い法衣 + 肩から斜めに掛けた赤茶(柿渋色)の袈裟(縁と首元に金の菊の刺繍)。" +
  "肩・袖口・裾に半透明の深紅の氷の結晶が張り付き、足元から赤い冷気が漂う。" +
  "左手に深紅の氷でできた大数珠を提げる。長髪・黒髪・髭・烏帽子は絶対に描かない。" +
  "属性は赤い氷のみで、炎や雷のエフェクトは後白河からは出さない。";

const KEEP_DESIGN =
  "キャラクターデザイン(顔立ち・目の形と色・眉・鼻・口・輪郭・肌の色・髪型・髪色・被り物・" +
  "装飾品・衣装の形状と色・体型・3D レンダー調の質感)は参考画像から一切変えないこと。" +
  "変えてよいのは表情とポーズだけ。";

const BATTLE_BG =
  "背景は夜、燃え盛る炎に包まれた平等院鳳凰堂と、炎の色を反射する玉砂利の広場" +
  "(背景の参考画像と同じロケーション)。";
const UAT_BATTLE_BG =
  "背景は夜、吹雪の舞う広大な雪原。青白い月明かりが雪面を照らし、" +
  "地平線は暗い夜空と雪煙に溶けている。寒々しく張り詰めた決戦の空気。";

const COMMON =
  "パチスロの液晶演出用のフルスクリーン静止画。和風ダークファンタジーの 3D レンダー調、" +
  "シネマティックで劇的なライティング。" +
  "文字・ロゴ・字幕・透かし・ゲーム UI・枠は一切描き込まない。横長 16:9 の画像。";

// 参照画像のショートハンド
const R = {
  yoshiFace: `${SHEETS}/義経_顔.png`,
  yoshiBody: `${SHEETS}/義経_全身.png`,
  yoshiBatto: `${REF}/キャラクター/義経/義経抜刀1.png`,
  yoriFace: `${SHEETS}/頼朝_顔.png`,
  yoriBody: `${SHEETS}/頼朝_全身.png`,
  yoriBatto: `${REF}/キャラクター/頼朝/頼朝抜刀.png`,
  shizukaFace: `${SHEETS}/静_顔.png`,
  shizukaBody: `${SHEETS}/静_全身.png`,
  benkeiFace: `${SHEETS}/弁慶_顔.png`,
  benkeiBody: `${SHEETS}/弁慶_全身.png`,
  goshiFace: `${REF}/キャラクター/黒幕/後白河_顔アップ.png`,
  goshiBody: `${REF}/キャラクター/黒幕/後白河_案A_全身.png`,
  taiji: `${REF}/背景/その他/対峙構図.png`,
  kyoto: `${REF}/背景/その他/共闘構図.png`,
  atBg: `${REF}/背景/下位AT/平等院鳳凰堂1.png`,
  g1Normal: `${OUT_DIR}/g1_normal.png`, // 参照連鎖(g1_chance 用)
  uatG1Normal: `${OUT_DIR}/uat_g1_normal.png`, // 参照連鎖(uat_g1_chance 用)
  endingAt1: `${OUT_DIR}/ending_at_1_freeze.png`, // 参照連鎖(ending_at_2 用)
};

// --- 生成ジョブ定義(順番どおりに生成。g1_chance は g1_normal の後) ---
const JOBS = {
  // 1G 導入(2 枚)
  g1_normal: {
    refs: [R.atBg],
    prompt:
      "夜空を覆う厚い黒雲の切れ間から満月が覗いている情景。" +
      "月と雲は冷たい青白い光で照らされ、月光が雲の縁を青く縁取る。" +
      "画面最下部に、参考画像の寺院(平等院鳳凰堂)の屋根の黒いシルエットをわずかに入れる(炎は小さく)。" +
      "決戦の前の不穏で静かな導入の空気感。" +
      COMMON,
  },
  g1_chance: {
    refs: [R.g1Normal],
    prompt:
      "参考画像とまったく同じ構図(雲の形・月の位置・寺院のシルエットを維持)のまま、" +
      "色だけを変えた画像を作成してください: 月を禍々しい赤色に変え、" +
      "雲と空全体も赤黒い不気味な光で照らされているようにする。" +
      "青い色味は残さない。チャンスを示唆する不吉で熱い空気感。" +
      COMMON,
  },
  // 2G 義経セリフ(1 枚)
  g2_yoshitsune_serifu: {
    refs: [R.yoshiFace, R.yoshiBody, R.yoshiBatto, R.atBg],
    prompt:
      "参考画像のキャラクター(義経)が、画面右に向かって太刀を構えるミディアムショット。" +
      "体と視線は画面右の敵(画面外)へ向ける。刀身には青い炎が揺らめく。" +
      "表情は凛々しく、戦いへの決意に満ちている。" +
      "画面下部 1/4 は後から台詞テキストを重ねるため、暗めでコントラストを抑えた空間を残す。" +
      BATTLE_BG +
      YOSHI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  // 3G 頼朝セリフ(1 枚)
  g3_yoritomo_serifu: {
    refs: [R.yoriFace, R.yoriBody, R.yoriBatto, R.atBg],
    prompt:
      "参考画像のキャラクター(頼朝)が、画面左に向かって太刀を構えるミディアムショット。" +
      "体と視線は画面左の敵(画面外)へ向ける。刀身には紫の雷が絡みつく。" +
      "表情は不敵で威圧的、余裕のある笑み。" +
      "画面下部 1/4 は後から台詞テキストを重ねるため、暗めでコントラストを抑えた空間を残す。" +
      BATTLE_BG +
      YORI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  // 4G 攻撃決め(3 枚)
  g4_lever_taiji: {
    refs: [R.taiji, R.yoshiFace, R.yoriFace, R.atBg],
    prompt:
      "1 枚目の参考画像の対峙構図(左 = 義経、右 = 頼朝が至近距離で刀を交え、" +
      "義経の青い炎と頼朝の紫の雷が中央で激突して火花を散らす)をそのまま使い、" +
      "透明背景の代わりに、夜の燃え盛る平等院鳳凰堂の前の広場を背景にした" +
      "フルスクリーンの対峙シーンを作成してください。" +
      "二人の顔は 2〜3 枚目の参考画像に正確に合わせる。中央の激突エフェクトが最も明るい光源。" +
      YOSHI_DESIGN +
      YORI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  g4_stop3_yoshitsune_up: {
    refs: [R.yoshiFace],
    prompt:
      "参考画像のキャラクター(義経)の顔の超クローズアップ(顔が画面の大部分を占める)。" +
      "鋭い眼光で正面やや右を睨みつける真剣な表情。" +
      "頬には燃える炎のオレンジ色の照り返し、背景は暗闇に舞う火の粉。決戦の緊張感。" +
      YOSHI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  g4_stop3_yoritomo_up: {
    refs: [R.yoriFace],
    prompt:
      "参考画像のキャラクター(頼朝)の顔の超クローズアップ(顔が画面の大部分を占める)。" +
      "不敵な笑みを浮かべて正面やや左を見下ろす、威圧感のある表情。" +
      "顔には紫の雷の青白い照り返し、背景は暗闇に紫の稲光。決戦の緊張感。" +
      YORI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  // 5G 攻撃(8 枚)
  g5_yoshitsune_weak_lever: {
    refs: [R.yoshiFace, R.yoshiBody, R.yoshiBatto, R.atBg],
    prompt:
      "参考画像のキャラクター(義経)が太刀を横に構え、刀身に青い炎を纏わせる攻撃直前のアクションカット。" +
      "青い炎が渦を巻いて刀身へ集まり、周囲の空気が揺らめく。" +
      "ローアングルの迫力ある構図。表情は集中して鋭い。" +
      BATTLE_BG +
      YOSHI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  g5_yoshitsune_weak_stop3: {
    refs: [R.yoshiBody],
    prompt:
      "パチスロの技名カット用の背景画像。青い炎の斬撃エフェクトが画面を斜めに切り裂き、" +
      "その周囲を青い炎と白い火の粉が渦巻く。" +
      "画面中央に、白い筆の掠れのような横長の帯を走らせる" +
      "(後から技名テキストを重ねるための空間。帯の中には何も描かない)。" +
      "画面左下に、参考画像のキャラクター(義経)が太刀を振り抜く後ろ姿の暗いシルエットを小さく入れる。" +
      "文字は一切描かない。" +
      COMMON,
  },
  g5_yoshitsune_strong_lever: {
    refs: [R.yoshiBody],
    prompt:
      "パチスロの技名カット用の背景画像。画面奥に巨大な青い光の魔法陣が輝き、" +
      "ピンクの桜の花びらの大嵐が画面全体に渦巻く。" +
      "画面中央に、白い筆の掠れのような横長の帯を走らせる" +
      "(後から技名テキストを重ねるための空間。帯の中には何も描かない)。" +
      "画面下部に、参考画像のキャラクター(義経)が舞うように太刀を構える後ろ姿の暗いシルエットを小さく入れる。" +
      "文字は一切描かない。" +
      COMMON,
  },
  g5_yoshitsune_strong_stop3: {
    refs: [R.yoshiFace, R.yoshiBody, R.yoshiBatto],
    prompt:
      "参考画像のキャラクター(義経)の格好良い決めカット。" +
      "太刀を振り抜いた直後の流れるようなポーズで、刀の軌跡に青い炎の残光が走る。" +
      "背後一面にピンクの桜吹雪が夜空に渦巻き、月光に照らされる。" +
      "表情は静かな確信に満ちている。" +
      YOSHI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  g5_yoritomo_weak_lever: {
    refs: [R.yoriFace, R.yoriBody, R.yoriBatto, R.atBg],
    prompt:
      "参考画像のキャラクター(頼朝)が太刀を掲げ、刀身に紫の雷を纏わせる攻撃直前のアクションカット。" +
      "紫の稲妻が地面から螺旋を描いて刀身へ駆け上がる。" +
      "ローアングルの迫力ある構図。表情は冷酷で愉しげ。" +
      BATTLE_BG +
      YORI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  g5_yoritomo_weak_stop3: {
    refs: [R.yoriBody],
    prompt:
      "パチスロの技名カット用の背景画像。紫の雷の斬撃エフェクトが画面を斜めに貫き、" +
      "無数の紫の稲妻と青白いスパークが飛び散る。" +
      "画面中央に、白い筆の掠れのような横長の帯を走らせる" +
      "(後から技名テキストを重ねるための空間。帯の中には何も描かない)。" +
      "画面左下に、参考画像のキャラクター(頼朝)が太刀を振り抜く後ろ姿の暗いシルエットを小さく入れる。" +
      "文字は一切描かない。" +
      COMMON,
  },
  g5_yoritomo_strong_lever: {
    refs: [R.yoriFace, R.yoriBody, R.atBg],
    prompt:
      "参考画像のキャラクター(頼朝)が両手で太刀を天に掲げる大技の構え。" +
      "天の黒雲から無数の紫の雷が刀身へ降り注ぎ、羽織と白銀の長髪が衝撃波でなびく。" +
      "禍々しい紫のオーラが足元から立ち昇る。圧倒的な気迫。" +
      BATTLE_BG +
      YORI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  g5_yoritomo_strong_stop3: {
    refs: [R.yoriBody],
    prompt:
      "パチスロの技名カット用の背景画像。天に向かって立ち昇る巨大な紫の雷の柱が画面中央を貫き、" +
      "雷の柱から枝分かれした稲妻が四方へ走る。" +
      "画面中央に、白い筆の掠れのような横長の帯を走らせる" +
      "(後から技名テキストを重ねるための空間。帯の中には何も描かない)。" +
      "画面下部に、参考画像のキャラクター(頼朝)が太刀を天に掲げる後ろ姿の暗いシルエットを小さく入れる。" +
      "文字は一切描かない。" +
      COMMON,
  },
  // 6G 判定(4 枚)
  g6_yoshitsune_atk_lever: {
    refs: [R.yoriFace, R.yoriBody, R.atBg],
    prompt:
      "参考画像のキャラクター(頼朝)が太刀を横にして、画面外(画面左)から迫る" +
      "義経の青い炎の斬撃を受け止める防御の構え。" +
      "刀の上で青い炎の火花が激しく散り、頼朝の顔を青く照らす。" +
      "頼朝は踏ん張りながらも表情は崩れない。" +
      BATTLE_BG +
      YORI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  g6_yoshitsune_atk_stop3: {
    refs: [R.yoriFace],
    prompt:
      "参考画像のキャラクター(頼朝)のバストアップ。" +
      "義経の攻撃を受け止めたまま、余裕の笑みを浮かべてこちらを見る。" +
      "青い炎の照り返しの中で不敵に微笑む、格の違いを見せつける表情。" +
      "背景は暗闇に青い火花。" +
      YORI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  g6_yoritomo_atk_lever: {
    refs: [R.yoshiFace, R.yoshiBody, R.atBg],
    prompt:
      "紫の雷でできた巨大な龍が大口を開けて、参考画像のキャラクター(義経)に襲い掛かる瞬間。" +
      "雷の龍は画面上半分を大きく占め、体は稲妻の束でできている。" +
      "義経は画面下の手前で太刀を構えて迎え撃つ(小さめに配置)。" +
      BATTLE_BG +
      YOSHI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  g6_ouka_challenge: {
    refs: [R.yoshiFace, R.yoshiBody, R.yoshiBatto],
    prompt:
      "「桜花繚乱チャレンジ」突入の全画面カット。" +
      "参考画像のキャラクター(義経)が、ピンクの桜の花びらの大渦の中心で" +
      "舞うように太刀を振るう全身アクション。青い炎の軌跡と桜吹雪が螺旋を描いて画面を包む。" +
      "画面中央上部は後からテキストを重ねるため、エフェクトのコントラストを抑えた空間を残す。" +
      "文字は一切描かない。" +
      YOSHI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  // 7G 帰結(4 枚)
  g7_yoritomo_atk_lever: {
    refs: [R.yoshiFace, R.yoshiBody, R.atBg],
    prompt:
      "頼朝の雷の攻撃を喰らった瞬間の、参考画像のキャラクター(義経)。" +
      "紫の稲妻が義経の体で激しく弾け、義経は苦悶の表情でのけぞる。" +
      "衝撃で火の粉と玉砂利が舞い上がる。" +
      BATTLE_BG +
      YOSHI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  g7_stop3_taeru: {
    refs: [R.yoshiFace, R.yoshiBody, R.atBg],
    prompt:
      "参考画像のキャラクター(義経)が、ダメージを負いながらも踏みとどまって太刀を構え直すカット。" +
      "肩で息をしつつも眼光は鋭く、体には紫の雷の残光がまとわりつく。" +
      "折れない闘志を感じさせる。" +
      BATTLE_BG +
      YOSHI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  g7_stop3_haiboku: {
    refs: [R.yoshiBody, R.atBg],
    prompt:
      "参考画像のキャラクター(義経)が力尽きて崩れ落ちる敗北のシーン。" +
      "義経は片膝と片手を地面につき、うなだれる。太刀は傍らの地面に落ちている。" +
      "周囲は赤黒い闇で、火の粉が舞い散る。" +
      "画面中央は後から大きな「敗北」のテキストを重ねるため、" +
      "コントラストを抑えた暗い空間を残す。文字は一切描かない。" +
      BATTLE_BG +
      YOSHI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  g7_yoshitsune_atk_keizoku: {
    refs: [R.yoshiFace, R.yoshiBody, R.atBg],
    prompt:
      "攻撃を決めた参考画像のキャラクター(義経)が、太刀を手に悠然と立つ勝利の立ち姿。" +
      "夜の炎を背にした逆光気味のミディアムショットで、静かな闘志を感じさせる。" +
      "画面中央上部は後から「継続」のテキストを重ねるため、" +
      "コントラストを抑えた暗い空間を残す。文字は一切描かない。" +
      BATTLE_BG +
      YOSHI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  // 8G 最終(2 枚)
  g8_lever_down: {
    refs: [R.yoshiBody, R.atBg],
    prompt:
      "参考画像のキャラクター(義経)が地面に倒れ伏している敗北のシーン。" +
      "義経はうつ伏せに近い姿勢で力なく倒れ、傍らに太刀が転がっている。" +
      "周囲は赤黒い闇で、余韻のように火の粉が舞う。" +
      "画面中央上部は後から大きな「敗北」のテキストを重ねるため、" +
      "コントラストを抑えた暗い空間を残す。文字は一切描かない。" +
      BATTLE_BG +
      YOSHI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  g8_stop3_shizuka_cutin: {
    refs: [R.shizukaFace, R.shizukaBody],
    prompt:
      "復活を告げる静のカットイン。参考画像のキャラクター(静)が、" +
      "天から差す暖かな金色の光に包まれ、胸の前で両手をそっと重ねて優しく微笑み、" +
      "画面中央でこちらを見つめるバストアップ。" +
      "背景は光り輝く雲と金色の光の粒、舞い散る桜の花びら。" +
      "希望と救いを感じさせる神々しい雰囲気。" +
      SHIZUKA_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
};

// --- 上位 AT バトル(25 枚。docs/UAT_BATTLE_PRODUCTION_PLAN.md セクション 2 = Q35〜Q40 承認済み)---
// 敵 = 後白河法皇(赤い氷)/ 義経(青い炎)と頼朝(紫の雷)は共闘。舞台 = 夜の吹雪の雪原。
const UAT_JOBS = {
  // G1 導入(2 枚。下位の「雲間の月」と統一文法 = 雪原の月 青/赤)
  uat_g1_normal: {
    refs: [R.goshiBody],
    prompt:
      "夜の広大な雪原の空に、吹雪の雲の切れ間から満月が覗いている情景。" +
      "月と雪原は冷たい青白い光で照らされ、雪面が月光を淡く反射する。" +
      "画面下部の遠景に、参考画像の人物(白い法衣の後白河法皇)の小さな後ろ姿のシルエットを 1 人だけ置き、" +
      "法衣の裾が吹雪に揺れている(遠景のため顔は見えない)。" +
      "決戦の前の不穏で静かな導入の空気感。" +
      COMMON,
  },
  uat_g1_chance: {
    refs: [R.uatG1Normal],
    prompt:
      "参考画像とまったく同じ構図(雲の形・月の位置・雪原とシルエットを維持)のまま、" +
      "色だけを変えた画像を作成してください: 月を禍々しい赤色に変え、" +
      "雲と空全体も赤黒い不気味な光で照らされ、雪面にも赤い冷気が漂うようにする。" +
      "青い色味は残さない。チャンスを示唆する不吉で熱い空気感。" +
      COMMON,
  },
  // G2 義経台詞(1 枚。台詞はアプリ側テキストで通常/チャンスを差替え)
  uat_g2_yoshitsune_serifu: {
    refs: [R.yoshiFace, R.yoshiBody, R.yoriFace, R.yoriBody],
    prompt:
      "吹雪の雪原に並び立つ二人の武者のミディアムショット。" +
      "手前メインは参考画像 1〜2 枚目のキャラクター(義経)で、太刀の柄に手を掛けて" +
      "画面右の敵(画面外)を見据える凛々しい表情。刀身の根元に青い炎が揺らめき始めている。" +
      "その斜め後ろに参考画像 3〜4 枚目のキャラクター(頼朝)が味方として控える(ピントは義経)。" +
      "二人は仲間であり、対立していない。" +
      "画面下部 1/4 は後から台詞テキストを重ねるため、暗めでコントラストを抑えた空間を残す。" +
      UAT_BATTLE_BG +
      YOSHI_DESIGN +
      YORI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  // G3 頼朝台詞(1 枚。同上)
  uat_g3_yoritomo_serifu: {
    refs: [R.yoriFace, R.yoriBody, R.yoshiFace, R.yoshiBody],
    prompt:
      "吹雪の雪原に並び立つ二人の武者のミディアムショット。" +
      "手前メインは参考画像 1〜2 枚目のキャラクター(頼朝)で、太刀を軽く構え、" +
      "指先と刀身に紫の雷が走る。不敵で頼もしい笑みで画面右の敵(画面外)を見据える。" +
      "その斜め後ろに参考画像 3〜4 枚目のキャラクター(義経)が味方として控える(ピントは頼朝)。" +
      "二人は仲間であり、対立していない。" +
      "画面下部 1/4 は後から台詞テキストを重ねるため、暗めでコントラストを抑えた空間を残す。" +
      UAT_BATTLE_BG +
      YORI_DESIGN +
      YOSHI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  // G4 攻撃決め(4 枚。レバオン = 三者対峙 → 第 3 停止で攻撃側アップ)
  uat_g4_lever_taiji: {
    refs: [R.kyoto, R.goshiFace, R.goshiBody],
    prompt:
      "夜の吹雪の雪原での決戦の対峙シーン。" +
      "画面手前の左右に、1 枚目の参考画像の二人(左 = 大柄な白髪の武者 = 頼朝 / 右 = 白い胴着の剣士 = 義経)の" +
      "背中越しのシルエット(義経の太刀に青い炎・頼朝の太刀に紫の雷)。" +
      "雪原の奥、画面中央に 2〜3 枚目の参考画像のキャラクター(後白河法皇)が悠然と立ち、" +
      "その周囲に深紅の氷の結晶が浮かんで回っている。" +
      "後白河の赤い氷の輝きと手前の青炎・紫雷が対比する緊張感のある構図。" +
      GOSHIRAKAWA_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  uat_g4_stop3_yoshitsune_up: {
    refs: [R.yoshiFace],
    prompt:
      "参考画像のキャラクター(義経)の顔の超クローズアップ(顔が画面の大部分を占める)。" +
      "鋭い眼光で正面やや右を睨みつける真剣な表情。" +
      "頬には青い炎の冷たい照り返し、背景は吹雪の闇に舞う青い火の粉と雪片。決戦の緊張感。" +
      YOSHI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  uat_g4_stop3_yoritomo_up: {
    refs: [R.yoriFace],
    prompt:
      "参考画像のキャラクター(頼朝)の顔の超クローズアップ(顔が画面の大部分を占める)。" +
      "不敵な笑みで正面やや右を見据える、頼もしく威圧感のある表情。" +
      "顔には紫の雷の青白い照り返し、背景は吹雪の闇に紫の稲光と雪片。決戦の緊張感。" +
      YORI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  uat_g4_stop3_double_up: {
    refs: [R.yoshiFace, R.yoriFace],
    prompt:
      "二人並びの顔のクローズアップ。画面左に 1 枚目の参考画像のキャラクター(義経)、" +
      "画面右に 2 枚目の参考画像のキャラクター(頼朝)の顔を大きく並べ、" +
      "二人とも決意に満ちた表情で正面を見据える。" +
      "義経側から青い炎、頼朝側から紫の雷が立ち上り、画面中央で交差して火花を散らす。" +
      "背景は吹雪の闇。共闘の力が高まる勝利確定の合図となる熱いカット。" +
      YOSHI_DESIGN +
      YORI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  // G5 攻撃(6 枚。構え → 第 3 停止で技名カット。技名はアプリ側テキストを白帯へ)
  uat_g5_yoshitsune_lever: {
    refs: [R.yoshiFace, R.yoshiBody, R.yoshiBatto],
    prompt:
      "参考画像のキャラクター(義経)が雪原で太刀を横に構え、刀身に青い炎を纏わせる攻撃直前のアクションカット。" +
      "青い炎が渦を巻いて刀身へ集まり、周囲の雪片が熱で舞い上がる。" +
      "ローアングルの迫力ある構図。表情は集中して鋭い。" +
      UAT_BATTLE_BG +
      YOSHI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  uat_g5_yoshitsune_stop3: {
    refs: [R.yoshiBody],
    prompt:
      "パチスロの技名カット用の背景画像。青い炎の斬撃エフェクトが吹雪の画面を斜めに切り裂き、" +
      "その周囲を青い炎と白い雪片が渦巻く。" +
      "画面中央に、白い筆の掠れのような横長の帯を走らせる" +
      "(後から技名テキストを重ねるための空間。帯の中には何も描かない)。" +
      "画面左下に、参考画像のキャラクター(義経)が太刀を振り抜く後ろ姿の暗いシルエットを小さく入れる。" +
      "文字は一切描かない。" +
      COMMON,
  },
  uat_g5_yoritomo_lever: {
    refs: [R.yoriFace, R.yoriBody, R.yoriBatto],
    prompt:
      "参考画像のキャラクター(頼朝)が雪原で太刀を天に掲げ、刀身に紫の雷を纏わせる攻撃直前のアクションカット。" +
      "夜空の雪雲から紫の稲妻が刀身へ降り注ぎ、白銀の長髪と羽織が衝撃波でなびく。" +
      "ローアングルの迫力ある構図。表情は不敵で気迫に満ちる。" +
      UAT_BATTLE_BG +
      YORI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  uat_g5_yoritomo_stop3: {
    refs: [R.yoriBody],
    prompt:
      "パチスロの技名カット用の背景画像。紫の雷の奔流が吹雪の画面を斜めに貫き、" +
      "無数の紫の稲妻と青白いスパークが雪片とともに飛び散る。" +
      "画面中央に、白い筆の掠れのような横長の帯を走らせる" +
      "(後から技名テキストを重ねるための空間。帯の中には何も描かない)。" +
      "画面左下に、参考画像のキャラクター(頼朝)が太刀を振り抜く後ろ姿の暗いシルエットを小さく入れる。" +
      "文字は一切描かない。" +
      COMMON,
  },
  uat_g5_double_lever: {
    refs: [R.yoshiFace, R.yoshiBody, R.yoriFace, R.yoriBody],
    prompt:
      "雪原で二人が同時に構える合体技の直前カット。" +
      "画面左に 1〜2 枚目の参考画像のキャラクター(義経)が青い炎を纏う太刀を構え、" +
      "画面右に 3〜4 枚目の参考画像のキャラクター(頼朝)が紫の雷を纏う太刀を構える。" +
      "青い炎と紫の雷が二人の間で渦を巻いて共鳴し始めている。" +
      "背中合わせに近い立ち位置で、二人の視線は画面奥の敵へ向かう。" +
      UAT_BATTLE_BG +
      YOSHI_DESIGN +
      YORI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  uat_g5_double_stop3: {
    refs: [R.yoshiBody, R.yoriBody],
    prompt:
      "パチスロの技名カット用の背景画像。青い炎と紫の雷が絡み合いながら二重の螺旋を描いて" +
      "画面を貫く合体技のエフェクト。周囲に雪片と火花が舞い散る。" +
      "画面中央に、白い筆の掠れのような横長の帯を走らせる" +
      "(後から技名テキストを重ねるための空間。帯の中には何も描かない)。" +
      "画面下部に、参考画像の二人(義経と頼朝)が並んで太刀を振り抜く後ろ姿の暗いシルエットを小さく入れる。" +
      "文字は一切描かない。" +
      COMMON,
  },
  // G6 ヒット判定(4 枚。レバオン = 障壁 → 第 3 停止で成否)
  uat_g6_lever_shouheki: {
    refs: [R.goshiFace, R.goshiBody],
    prompt:
      "参考画像のキャラクター(後白河法皇)が、画面外(画面左)から迫る攻撃の閃光に対して" +
      "深紅の氷でできた巨大な障壁を眼前に展開して受け止める防御のカット。" +
      "半透明の赤い氷の壁が結晶状に組み上がり、攻撃の光が壁面で弾けて火花を散らす。" +
      "後白河は障壁の奥で袈裟を翻し、余裕の表情。" +
      UAT_BATTLE_BG +
      GOSHIRAKAWA_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  uat_g6_stop3_hit: {
    refs: [R.goshiFace, R.goshiBody],
    prompt:
      "深紅の氷の障壁が粉々に砕け散り、参考画像のキャラクター(後白河法皇)が攻撃を受ける瞬間。" +
      "砕けた赤い氷の破片が四方へ飛び散り、後白河は苦悶の表情でのけぞる。" +
      "衝撃で法衣と袈裟が激しくはためき、雪煙が舞い上がる。" +
      UAT_BATTLE_BG +
      GOSHIRAKAWA_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  uat_g6_stop3_guard: {
    refs: [R.goshiFace],
    prompt:
      "参考画像のキャラクター(後白河法皇)のバストアップ。" +
      "無傷の深紅の氷の障壁越しに、冷酷な余裕の笑みでこちらを見下ろす。" +
      "攻撃を完全に防ぎきった格の違いを見せつける表情。" +
      "障壁の赤い輝きが顔を不気味に照らし、背景は吹雪の闇。" +
      GOSHIRAKAWA_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  uat_g6_stop3_double_hit: {
    refs: [R.goshiBody],
    prompt:
      "合体技が深紅の氷の障壁ごと後白河法皇を飲み込む大爆発の瞬間。" +
      "青い炎と紫の雷が混ざり合った巨大な閃光が画面中央で炸裂し、" +
      "砕けた赤い氷の破片と雪煙が四方へ吹き飛ぶ。" +
      "閃光の中に、参考画像のキャラクター(後白河法皇)が仰け反るシルエットが浮かぶ。" +
      "画面全体が眩しい光に包まれる勝利確定の派手なカット。" +
      GOSHIRAKAWA_DESIGN +
      COMMON,
  },
  // G7 帰結(4 枚)
  uat_g7_win_kuzureru: {
    refs: [R.goshiFace, R.goshiBody],
    prompt:
      "参考画像のキャラクター(後白河法皇)が雪原に膝をつき崩れ落ちる敗北のカット。" +
      "法衣は所々焦げて乱れ、体に張り付いていた深紅の氷の結晶が砕けて赤い光の粒となって舞い散る。" +
      "苦しげにうつむき、傍らの雪面に大数珠が落ちている。" +
      UAT_BATTLE_BG +
      GOSHIRAKAWA_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  uat_g7_double_tobu: {
    refs: [R.goshiBody],
    prompt:
      "参考画像のキャラクター(後白河法皇)が合体技の直撃で大きく後方へ吹き飛ぶ瞬間。" +
      "体は雪煙と砕けた赤い氷の破片の中で宙に浮き、法衣と袈裟が激しくはためく。" +
      "画面手前から奥へ吹き飛ぶダイナミックな構図で、軌跡に青い炎と紫の雷の残光が走る。" +
      UAT_BATTLE_BG +
      GOSHIRAKAWA_DESIGN +
      COMMON,
  },
  uat_g7_lose_hangeki_lever: {
    refs: [R.goshiFace, R.goshiBody],
    prompt:
      "後白河法皇の反撃のカット。参考画像のキャラクター(後白河法皇)が右手を前へかざし、" +
      "その前方(画面手前方向)へ無数の深紅の氷柱の槍が射出される瞬間。" +
      "氷の槍は内側から不気味に発光し、軌跡に赤い冷気を曳く。" +
      "後白河は冷酷な微笑を浮かべ、圧倒的な力の差を見せつける。" +
      UAT_BATTLE_BG +
      GOSHIRAKAWA_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  uat_g7_lose_hangeki_stop3: {
    refs: [R.yoshiFace, R.yoshiBody, R.yoriFace, R.yoriBody],
    prompt:
      "深紅の氷の槍の反撃を受けた二人のカット。" +
      "画面左で 1〜2 枚目の参考画像のキャラクター(義経)、画面右で 3〜4 枚目の参考画像のキャラクター(頼朝)が、" +
      "ともに被弾して雪原に片膝をつく。二人の周囲で赤い氷の破片が弾け、体に赤い冷気がまとわりつく。" +
      "苦悶しながらも太刀は手放していない。雪煙が舞う。" +
      UAT_BATTLE_BG +
      YOSHI_DESIGN +
      YORI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  // G8 最終(3 枚)
  uat_g8_win_keizoku: {
    refs: [R.yoshiFace, R.yoshiBody, R.yoriFace, R.yoriBody, R.goshiBody],
    prompt:
      "勝どきのカット。画面手前で 1〜2 枚目の参考画像のキャラクター(義経)と" +
      "3〜4 枚目の参考画像のキャラクター(頼朝)が並んで太刀を掲げ、勝利の雄叫びを上げる。" +
      "画面奥の雪原に 5 枚目の参考画像のキャラクター(後白河法皇)が倒れ伏している(小さく)。" +
      "義経の青い炎と頼朝の紫の雷が勝利の輝きとして立ち上る。" +
      "画面中央上部は後から「継続」のテキストを重ねるため、" +
      "コントラストを抑えた暗い空間を残す。文字は一切描かない。" +
      UAT_BATTLE_BG +
      YOSHI_DESIGN +
      YORI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  uat_g8_lever_down: {
    refs: [R.yoshiBody, R.yoriBody, R.goshiFace, R.goshiBody],
    prompt:
      "敗北のカット。雪原に 1 枚目の参考画像のキャラクター(義経)と 2 枚目の参考画像のキャラクター(頼朝)が" +
      "力尽きて倒れ伏し、傍らに太刀が転がっている。" +
      "その二人を、3〜4 枚目の参考画像のキャラクター(後白河法皇)が画面奥から冷酷に見下ろしている。" +
      "周囲は赤黒い冷気と吹雪。" +
      "画面中央上部は後から大きな「敗北」のテキストを重ねるため、" +
      "コントラストを抑えた暗い空間を残す。文字は一切描かない。" +
      GOSHIRAKAWA_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  uat_g8_stop3_fukkatsu_cutin: {
    refs: [R.yoshiFace, R.yoshiBody, R.yoriFace, R.yoriBody],
    prompt:
      "復活を告げるカットイン。雪原で 1〜2 枚目の参考画像のキャラクター(義経)と" +
      "3〜4 枚目の参考画像のキャラクター(頼朝)が、肩を支え合いながら共に立ち上がる瞬間。" +
      "二人の瞳に再び闘志が宿り、義経の太刀に青い炎、頼朝の太刀に紫の雷が再燃して" +
      "吹雪の闇を明るく照らす。希望と反撃の始まりを感じさせる熱いカット。" +
      UAT_BATTLE_BG +
      YOSHI_DESIGN +
      YORI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
};

// --- エンディング・リザルト(4 枚。2026-07-18 ユーザー指示)---
const ENDING_JOBS = {
  // 下位 AT エンディング 1 枚目: 燃え盛る平等院鳳凰堂が一瞬で赤く凍り付く
  ending_at_1_freeze: {
    refs: [R.atBg],
    prompt:
      "燃え盛る炎に包まれた夜の平等院鳳凰堂(背景の参考画像と同じロケーション)が、" +
      "一瞬で深紅の氷に凍り付く瞬間の情景。" +
      "画面の片側からもう片側へ凍結が走り抜けている途中で、炎の一部はまだ揺れているが、" +
      "建物と炎の大部分はすでに半透明の赤い氷に閉じ込められて結晶化している。" +
      "凍った炎は氷の中で赤く発光し、空気中の火の粉も凍って赤い氷の粒として静止している。" +
      "地面の玉砂利にも赤い霜が走る。時間が止まったような不気味で圧倒的な静寂。人物は描かない。" +
      COMMON,
  },
  // 下位 AT エンディング 2 枚目: 凍った鳳凰堂を砕いて後白河法皇が登場、義経・頼朝と対峙
  ending_at_2_goshirakawa: {
    refs: [R.endingAt1, R.goshiFace, R.goshiBody, R.yoshiBody, R.yoriBody],
    prompt:
      "1 枚目の参考画像(赤い氷に凍り付いた平等院鳳凰堂)の続きのシーン。" +
      "凍り付いた鳳凰堂の正面が砕け散り、舞い散る赤い氷の破片の中から" +
      "2〜3 枚目の参考画像のキャラクター(後白河法皇)が姿を現す。" +
      "後白河は画面中央奥に悠然と立ち、周囲に深紅の氷の結晶が浮かび、足元から赤い冷気が広がる。" +
      "画面手前の左右に、4 枚目の参考画像のキャラクター(義経。太刀に青い炎)と" +
      "5 枚目の参考画像のキャラクター(頼朝。太刀に紫の雷)の背中越しのシルエットを置き、" +
      "二人が並んで後白河と対峙する構図。新たな強敵の登場を告げる衝撃的なカット。" +
      GOSHIRAKAWA_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  // 上位 AT エンディング: 雪原が晴れ渡り、義経と頼朝が笑い合う
  ending_uat_clear: {
    refs: [R.yoshiFace, R.yoshiBody, R.yoriFace, R.yoriBody],
    prompt:
      "決戦後の清々しいエンディングのカット。吹雪が止んで雲が晴れ、" +
      "朝日が差し込む雪原が金色と淡い青に輝いている。" +
      "画面中央で 1〜2 枚目の参考画像のキャラクター(義経)と 3〜4 枚目の参考画像のキャラクター(頼朝)が" +
      "向かい合い、互いに笑い合っているミディアムショット。" +
      "義経は屈託のない笑顔、頼朝も珍しく穏やかに笑っている。太刀は納めているか下ろしている。" +
      "戦いを終えた安堵と友情を感じさせる暖かい雰囲気。エフェクト(炎・雷・氷)は出さない。" +
      YOSHI_DESIGN +
      YORI_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
  // 敗北後の共通リザルト: 義経・頼朝・弁慶・静の全員集合の決めカット
  // (実機では獲得枚数とバトル回数の数値をアプリ側テキストで重ねる)
  ending_result_all: {
    refs: [R.yoshiBody, R.yoriBody, R.benkeiBody, R.shizukaBody],
    prompt:
      "パチスロのリザルト画面用の全員集合の決めカット。" +
      "夜明けの空(深い青から金色へのグラデーション)と舞い散る桜の花びらを背景に、" +
      "4 人のキャラクターが横に並んで堂々とこちらを向いて立つ。" +
      "画面左から: 2 枚目の参考画像のキャラクター(頼朝。太刀を肩に担ぎ不敵に微笑む)、" +
      "1 枚目の参考画像のキャラクター(義経。中央やや左。太刀を手に凛々しく立つ)、" +
      "4 枚目の参考画像のキャラクター(静。中央やや右。金の扇を広げて優雅に微笑む)、" +
      "3 枚目の参考画像のキャラクター(弁慶。薙刀を地に立てて豪快に笑う)。" +
      "4 人とも膝から上のニーショットで、全員の顔がはっきり見える。" +
      "画面下部 1/3 は後から獲得枚数などの数値テキストを重ねるため、" +
      "キャラクターや明るい要素を置かず、コントラストを抑えた暗めの空間を残す。" +
      "物語の締めくくりにふさわしい格好良く華やかな雰囲気。" +
      YOSHI_DESIGN +
      YORI_DESIGN +
      BENKEI_DESIGN +
      SHIZUKA_DESIGN +
      KEEP_DESIGN +
      COMMON,
  },
};

// 全ジョブの統合(jobId は全体で一意)
const ALL_JOBS = { ...JOBS, ...UAT_JOBS, ...ENDING_JOBS };

// incoming/ へコピーするときの日本語ファイル名(組込みランの対応表)
// 下位・上位バトル = incoming/battle/ / エンディング系 = incoming/ending/
export const JP_NAMES = {
  g1_normal: "バトル_1G_導入_通常.png",
  g1_chance: "バトル_1G_導入_チャンス.png",
  g2_yoshitsune_serifu: "バトル_2G_義経セリフ.png",
  g3_yoritomo_serifu: "バトル_3G_頼朝セリフ.png",
  g4_lever_taiji: "バトル_4G_レバオン_対峙.png",
  g4_stop3_yoshitsune_up: "バトル_4G_第3停止_義経アップ.png",
  g4_stop3_yoritomo_up: "バトル_4G_第3停止_頼朝アップ.png",
  g5_yoshitsune_weak_lever: "バトル_5G_義経弱_レバオン_構え.png",
  g5_yoshitsune_weak_stop3: "バトル_5G_義経弱_第3停止_技名穿炎刃.png",
  g5_yoshitsune_strong_lever: "バトル_5G_義経強_レバオン_技名桜花繚乱.png",
  g5_yoshitsune_strong_stop3: "バトル_5G_義経強_第3停止_決めカット.png",
  g5_yoritomo_weak_lever: "バトル_5G_頼朝弱_レバオン_構え.png",
  g5_yoritomo_weak_stop3: "バトル_5G_頼朝弱_第3停止_技名雷獄刃.png",
  g5_yoritomo_strong_lever: "バトル_5G_頼朝強_レバオン_構え.png",
  g5_yoritomo_strong_stop3: "バトル_5G_頼朝強_第3停止_技名御雷天昇.png",
  g6_yoshitsune_atk_lever: "バトル_6G_義経攻撃_レバオン_頼朝防御.png",
  g6_yoshitsune_atk_stop3: "バトル_6G_義経攻撃_第3停止_頼朝余裕.png",
  g6_yoritomo_atk_lever: "バトル_6G_頼朝攻撃_レバオン_雷の龍.png",
  g6_ouka_challenge: "バトル_6G_桜花繚乱チャレンジ.png",
  g7_yoritomo_atk_lever: "バトル_7G_頼朝攻撃_レバオン_被弾.png",
  g7_stop3_taeru: "バトル_7G_第3停止_耐える.png",
  g7_stop3_haiboku: "バトル_7G_第3停止_敗北.png",
  g7_yoshitsune_atk_keizoku: "バトル_7G_義経攻撃_継続.png",
  g8_lever_down: "バトル_8G_レバオン_敗北_倒れる義経.png",
  g8_stop3_shizuka_cutin: "バトル_8G_第3停止_静カットイン復活.png",
  // 上位 AT バトル(25 枚)
  uat_g1_normal: "上位バトル_1G_導入_通常_青い月.png",
  uat_g1_chance: "上位バトル_1G_導入_チャンス_赤い月.png",
  uat_g2_yoshitsune_serifu: "上位バトル_2G_義経セリフ.png",
  uat_g3_yoritomo_serifu: "上位バトル_3G_頼朝セリフ.png",
  uat_g4_lever_taiji: "上位バトル_4G_レバオン_三者対峙.png",
  uat_g4_stop3_yoshitsune_up: "上位バトル_4G_第3停止_義経アップ.png",
  uat_g4_stop3_yoritomo_up: "上位バトル_4G_第3停止_頼朝アップ.png",
  uat_g4_stop3_double_up: "上位バトル_4G_第3停止_ダブルアップ.png",
  uat_g5_yoshitsune_lever: "上位バトル_5G_義経_レバオン_構え.png",
  uat_g5_yoshitsune_stop3: "上位バトル_5G_義経_第3停止_技名蒼炎一閃.png",
  uat_g5_yoritomo_lever: "上位バトル_5G_頼朝_レバオン_構え.png",
  uat_g5_yoritomo_stop3: "上位バトル_5G_頼朝_第3停止_技名紫電轟雷.png",
  uat_g5_double_lever: "上位バトル_5G_ダブル_レバオン_構え.png",
  uat_g5_double_stop3: "上位バトル_5G_ダブル_第3停止_技名炎雷共鳴.png",
  uat_g6_lever_shouheki: "上位バトル_6G_レバオン_氷の障壁.png",
  uat_g6_stop3_hit: "上位バトル_6G_第3停止_障壁砕け被弾.png",
  uat_g6_stop3_guard: "上位バトル_6G_第3停止_防がれ冷笑.png",
  uat_g6_stop3_double_hit: "上位バトル_6G_第3停止_ダブル大爆発.png",
  uat_g7_win_kuzureru: "上位バトル_7G_勝ち_後白河崩れる.png",
  uat_g7_double_tobu: "上位バトル_7G_ダブル_後白河吹き飛ぶ.png",
  uat_g7_lose_hangeki_lever: "上位バトル_7G_負け_レバオン_氷柱の反撃.png",
  uat_g7_lose_hangeki_stop3: "上位バトル_7G_負け_第3停止_二人被弾.png",
  uat_g8_win_keizoku: "上位バトル_8G_継続_勝どき.png",
  uat_g8_lever_down: "上位バトル_8G_レバオン_敗北_倒れる二人.png",
  uat_g8_stop3_fukkatsu_cutin: "上位バトル_8G_第3停止_復活カットイン_共に立ち上がる.png",
  // エンディング・リザルト(4 枚)
  ending_at_1_freeze: "下位ATエンディング_1_鳳凰堂凍結.png",
  ending_at_2_goshirakawa: "下位ATエンディング_2_後白河登場対峙.png",
  ending_uat_clear: "上位ATエンディング_雪原晴れ_笑い合う二人.png",
  ending_result_all: "敗北後リザルト_全員集合.png",
};

// API キーは FAL_KEY2 を使用する(2026-07-16 ユーザー指示。旧 FAL_KEY は使わない)
if (!process.env.FAL_KEY2) {
  console.error("ERROR: 環境変数 FAL_KEY2 が設定されていません。");
  process.exit(1);
}
fal.config({ credentials: process.env.FAL_KEY2 });

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    `使い方: node scripts/gen_battle_images.mjs <at | uat | ending | all | jobId...>\njobId: ${Object.keys(ALL_JOBS).join(" ")}`,
  );
  process.exit(1);
}
const jobIds =
  args[0] === "all"
    ? Object.keys(ALL_JOBS)
    : args[0] === "at"
      ? Object.keys(JOBS)
      : args[0] === "uat"
        ? Object.keys(UAT_JOBS)
        : args[0] === "ending"
          ? Object.keys(ENDING_JOBS)
          : args;
for (const id of jobIds) {
  if (!ALL_JOBS[id]) {
    console.error(`ERROR: 未知の jobId: ${id}`);
    process.exit(1);
  }
}

await mkdir(OUT_DIR, { recursive: true });

const uploadCache = new Map();
async function uploadRef(filePath) {
  if (uploadCache.has(filePath)) return uploadCache.get(filePath);
  const data = await readFile(filePath);
  const file = new File([data], path.basename(filePath), { type: "image/png" });
  const url = await fal.storage.upload(file);
  console.log(`uploaded: ${filePath}`);
  uploadCache.set(filePath, url);
  return url;
}

const failed = [];
for (const id of jobIds) {
  const job = ALL_JOBS[id];
  const started = Date.now();
  console.log(`\n=== ${id}(${JP_NAMES[id]})===`);
  try {
    const imageUrls = [];
    for (const ref of job.refs) imageUrls.push(await uploadRef(ref));
    const result = await fal.subscribe("openai/gpt-image-2/edit", {
      input: {
        prompt: job.prompt,
        image_urls: imageUrls,
        image_size: { width: 1792, height: 1008 },
        quality: "high",
        num_images: 1,
        output_format: "png",
      },
      logs: false,
    });
    const image = result.data.images[0];
    const dest = path.join(OUT_DIR, `${id}.png`);
    const res = await fetch(image.url);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    console.log(
      `done in ${((Date.now() - started) / 1000).toFixed(0)}s: ${image.width}x${image.height} -> ${dest}`,
    );
  } catch (err) {
    console.error(`FAILED ${id}: ${err?.message ?? err}`);
    failed.push(id);
  }
}

console.log(`\n=== 完了: ${jobIds.length - failed.length}/${jobIds.length} 成功 ===`);
if (failed.length > 0) {
  console.log(`失敗(再実行: node scripts/gen_battle_images.mjs ${failed.join(" ")})`);
  process.exit(2);
}
