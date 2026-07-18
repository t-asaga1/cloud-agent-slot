// 下位 AT バトルパート演出画像の生成スクリプト(2026-07-18 ユーザー指示)
//
// 指示元: incoming/義経物語下位AT中.pptx(構図の参考。実在機種の画面キャプチャのため
// fal.ai へは渡さない = ユーザー指示 + 実在機種素材の流用禁止ルール)。
// スライドの構図説明を AGENT が解釈し、本プロジェクトの設定資料・参考画像だけを
// 参照にして GPT Image 2 (openai/gpt-image-2/edit) で生成する。
//
// 枚数(ユーザー指定 = 計 25 枚):
//   1G: 2(導入 = 月のカット。通常 = 青い月 / チャンス = 赤い月)
//   2G: 1(義経セリフ。セリフはアプリ側テキストでバリエーション)
//   3G: 1(頼朝セリフ。同上)
//   4G: 3(レバオン = 対峙 / 第 3 停止 = 義経 or 頼朝の顔アップ)
//   5G: 8(義経弱・義経強・頼朝弱・頼朝強 × レバオンと第 3 停止)
//   6G: 4(義経攻撃 2 + 頼朝攻撃 1 + 桜花繚乱チャレンジ 1)
//   7G: 4(被弾 / 耐える / 敗北 / 義経攻撃時の継続)
//   8G: 2(倒れる義経 / 静カットイン復活)
//
// 方針:
//   - キャラクターデザインは設定資料(incoming/reference/設定資料/)から一切変えない
//     (プロンプトへデザイン要点と禁止事項を明文化 = gen_yokoku_kaiwa.mjs と同方式)
//   - 技名(穿炎刃・桜花繚乱・雷獄刃・御雷天昇)・「敗北」「継続」などの文字は
//     画像に焼き込まない(アプリ側テキスト描画 = 会話予告と同じ規約。文字用の空間を残す)
//   - 属性色: 義経 = 青い炎 / 頼朝 = 紫の雷(対峙構図.png と同じ)
//   - バトル背景 = 夜の炎上する平等院鳳凰堂(incoming/reference/背景/下位AT/)
//
// 使い方:
//   FAL_KEY2=<APIキー> node scripts/gen_battle_images.mjs all         # 全 25 枚
//   FAL_KEY2=<APIキー> node scripts/gen_battle_images.mjs <jobId>...  # 個別(再生成用)
//   ※ g1_chance は g1_normal の出力(/tmp/battle_gen/g1_normal.png)を参照連鎖する
//
// 出力: /tmp/battle_gen/<jobId>.png(1792x1008 = 16:9)
// 採用分は incoming/battle/ へ日本語名でコピーしてコミットする(JP_NAMES 参照)。

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

const KEEP_DESIGN =
  "キャラクターデザイン(顔立ち・目の形と色・眉・鼻・口・輪郭・肌の色・髪型・髪色・被り物・" +
  "装飾品・衣装の形状と色・体型・3D レンダー調の質感)は参考画像から一切変えないこと。" +
  "変えてよいのは表情とポーズだけ。";

const BATTLE_BG =
  "背景は夜、燃え盛る炎に包まれた平等院鳳凰堂と、炎の色を反射する玉砂利の広場" +
  "(背景の参考画像と同じロケーション)。";

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
  taiji: `${REF}/背景/その他/対峙構図.png`,
  atBg: `${REF}/背景/下位AT/平等院鳳凰堂1.png`,
  g1Normal: `${OUT_DIR}/g1_normal.png`, // 参照連鎖(g1_chance 用)
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

// incoming/battle/ へコピーするときの日本語ファイル名(組込みランの対応表)
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
    `使い方: node scripts/gen_battle_images.mjs <all | jobId...>\njobId: ${Object.keys(JOBS).join(" ")}`,
  );
  process.exit(1);
}
const jobIds = args[0] === "all" ? Object.keys(JOBS) : args;
for (const id of jobIds) {
  if (!JOBS[id]) {
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
  const job = JOBS[id];
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
