/**
 * 演出マッピング層(STEP 3d 新設 / STEP 4c でシナリオテーブル → 演出の解決へ置換)。
 * React 非依存の純ロジック。
 *
 * # 構造
 *
 * - 出力は宣言的データのみ:
 *   - `StateOverlay` = フェーズ由来の常時表示(連続演出画面 / エンディングバナー)。
 *     毎ゲーム `overlayForState(state)` で導出する(状態が変われば自然に消える)。
 *   - `LeverDirection` = レバーオン時に決定する 1G 分の予告演出(STEP 4c):
 *     前兆シナリオ予告(`scenarioYokokuAtLeverOn`)+ 小役示唆予告(`drawKoyakuHint` の
 *     結果を `koyakuHintView` で見た目へ解決)。UI 側はレバーオンごとに差し替えて
 *     次のレバーオンまで表示する(実機の「予告はレバーオンから始まる」に対応)。
 *   - `Cutin` = イベント由来のワンショット表示(AT 突入・セット継続・成否告知 等)。
 *     1G の締め(全停止後)に `cutinsForEvents(result.events)` で列挙し、UI 側
 *     (`DirectionLayer`)がキューに積んで順番に表示・SE 再生する。
 * - 描画(`DirectionLayer.tsx`)はこの宣言的データを表示するだけで、演出の中身を知らない。
 * - SE はサウンドキュー ID(`src/ui/sound.ts`)で参照し、音声ファイルへ直接依存しない
 *   (BGM / SE の実素材差し替えは sound.ts / assets 側で完結する)。
 *
 * # 連続演出の解決規約(STEP 4d。docs/DIRECTION_SPEC.md「2.4」= Q19)
 *
 * - 連続演出 4G(G1 導入 / G2 展開 / G3 あおり / G4 決着)は予告と同じく
 *   **レバーオン時に「これから回すゲーム」の 1G 分を解決**する(`renzokuAtLeverOn`)。
 *   連続演出 1G 目のレバーオンはフェーズ `OMEN`(前兆最終 G 消化済み)、2G 目以降は
 *   フェーズ `RENZOKU`(game = 消化済み G 数)で判定する。
 * - A/B = 背景固有(発展時の滞在背景の素材。前兆背景含む 5 種)/ C = 背景共通(Q19。
 *   前兆背景の連続演出 C も共通素材を流用)。連続演出中に背景は変わらない
 *   (30G 契機は前兆・演出中停止 = 確定 25、予約契機も構造上発生しない)。
 * - チャンスアップ(G1〜3 の通常/チャンス)は `RenzokuPhase.chanceUps`(1G 目は
 *   `OmenPhase.scenario.renzokuSteps`)を参照し、仮素材では表示差分(バッジ + 枠色)で
 *   表現する(ムービー差分は実素材入稿時に検討 = DIRECTION_SPEC「4.」)。
 * - G4 の成否告知は全停止後のカットイン(`cutinsForEvents` の `RENZOKU_RESULT` →
 *   `renzoku_result_<win|lose>` ムービー)。演出の見た目は前兆種別(本/偽)に依存しない
 *   ため、偽→本書き換え(確定 21(c))が起きても演出は自然に継続する。
 *
 * # 予告の解決規約(STEP 4c。docs/DIRECTION_SPEC.md「2.1」= 確定 33・34)
 *
 * - **前兆シナリオ予告**(固有 4・5 / 共通 3・4): `OmenPhase.scenario` の
 *   「これから回すゲーム」のステップ(`stepAt(scenario, phase.game + 1)`)を
 *   レバーオン時に「現在の背景 × スロット × レベル」で具体ムービーへ解決する。
 *   - 通常 4 背景: L1 → スロットの弱素材 / L2・L3 → 強素材。
 *     ただし**共通 3 はリール消灯演出**(確定 39 = 2026-07-14 指示。ムービーなし):
 *     画面(液晶)を左中右 3 分割し、リールが停止するたび対応する部分が消灯(黒)する。
 *     L1(弱)= 左のみ / L2(強)= 左・中 / L3(確定)= 左・中・右(全画面消灯)。
 *     `blackoutReels` に消灯対象リールを持ち、描画(DirectionLayer)が停止済み
 *     リールと突き合わせて消灯する(第一停止から順に暗くなる)。
 *   - 前兆背景: スロットを無視し L1 → 固有 1(弱)/ L2 → 固有 2(中)/ L3 → 固有 3(確定)。
 *   - 表示タイミングの解釈: シナリオの gG 目のステップは「gG 目のレバーオン〜次レバーオン」
 *     に表示する(小役示唆予告と同じ時点で決定・競合判定できる)。背景はレバーオン時点の
 *     滞在背景で解決する(前兆 1G 目の契機 2/4 の背景移行はそのゲームの終了時に反映される
 *     ため、表示中のステージ動画と常に一致する)。
 * - **小役示唆予告**(固有 1〜3 / 共通 1・2): レバーオン時に成立役から `drawKoyakuHint`
 *   (scenario.ts の独立関数。advanceGame の乱数列を汚さない別 rng で呼ぶ)で抽せんし、
 *   `koyakuHintView` でムービー + 成立役の図柄画像(確定 33)へ解決する。通常時も出す(Q12)。
 * - **競合規約**: 同一 G にシナリオ予告(L1 以上)がある場合はシナリオ予告を優先し
 *   小役示唆予告は出さない(UI 側は `scenarioYokokuAtLeverOn` が undefined のときだけ
 *   `koyakuHintAllowed` を確認して `drawKoyakuHint` を呼ぶ)。前兆背景滞在中は
 *   小役示唆予告なし(前兆背景の固有 1〜3 は期待度ラダー専用)。連続演出・AT・
 *   エンディング中も出さない(AT 中の予告は 4e の `drawAtYokoku` が担う)。
 *   **押し順ベルは「ベルが停止する(揃う)」か「ハズレ目が停止する(左第一こぼし =
 *   確定 35)」かで振分けを変える**(確定 39。`drawKoyakuHint` へ bellMiss を渡すと
 *   テーブル行が切り替わる。旧「こぼすベルには出さない」規約は廃止)。
 *   ハズレ時・ベルこぼし時の弱はブランク図柄を表示する(確定 39)。
 *
 * # AT・上位 AT・エンディング演出の解決規約(STEP 4e。docs/DIRECTION_SPEC.md「2.3」「2.5」「3.5」「3.6」)
 *
 * - **AT 小役パート予告**(`AT_NAVI` / `AT_RARE` / `AT_STRONG`): 予告と同じく
 *   レバーオン時に成立役から `drawAtYokoku`(独立関数・UI 専用 rng)で抽せんし、
 *   `atYokokuView` で AT 階層別のムービー + 図柄画像(NAVI = ベル + 押し順 /
 *   RARE = 成立役の図柄 = 確定 33)へ解決する。バトルパート・エンディング中は出さない(2.3)。
 * - **バトルパート 8G**: バトル開始(バトル 1G 目のレバーオン)で `drawBattleRoute` により
 *   ルートを一括抽せんし(UI 側が保持)、毎 G `battleView` で「G 位置 × ルート」を
 *   Excel パターン No のムービーへ解決する(G1〜3 = 通常/チャンスのペア No、
 *   G4〜8 = ルート分岐の No)。
 *   - **継続確定状態の実装解釈**: バトル開始時の継続率抽せん(確定 29)は core では
 *     バトル 1G 目の `advanceGame`(= 全停止時)で行われるため、レバーオン時点で UI が
 *     知り得る確定は V ストック(> 0 なら消費で確定)のみ。ルートは V ストック有無で
 *     仮抽せんし、**1G 目の全停止で率当せん(継続確定)が判明したら勝利ルートへ
 *     引き直す**(2G 目以降の表示から反映)。バトル 2G 目以降の小役継続当せんは
 *     引き直さない(敗北寄りルートのまま 8G 目の復活告知で見せる = 2.5)。
 * - **復活告知**: 敗北寄りルートの 8G 目全停止でセット継続(`AT_SET_CONTINUE` /
 *   `ENDING_START`)が発生していたら、UI が `drawRevival` で告知パターンを抽せんし
 *   `revivalCutin` をカットイン列の先頭へ差し込む(第 3 リール停止 = 全停止時の告知)。
 * - **エンディング**(2026-07-18 = 実素材静止画の紙芝居へ差し替え): フェーズ ENDING の
 *   常時表示(`overlayForState`)。下位(after = UPPER_AT)= レバーオンで 1 枚目 →
 *   第 2 停止で 2 枚目 / 上位(after = AT_END)= レバーオンで 1 枚目のみ。
 * - **AT 終了画面**(2026-07-18 指示): バトル敗北後・上位エンディング到達後
 *   (= `AT_END` イベント)の全停止で `atResultView` を解決し、次のレバーオンまで
 *   リザルト静止画 + バトル回数・獲得枚数を全画面表示する。
 *
 * # 赤7待機・AT 導入の解決規約(確定 37 = 2026-07-14 のユーザー指示)
 *
 * - **赤7待機**(フェーズ SEVEN_WAIT): レバーオン時に `sevenWaitAtLeverOn` で解決。
 *   AT確定ムービー(`at_kakutei` = ユーザー入稿素材)を全画面表示し、待機 1G 目
 *   (phase.game 0 のレバーオン)のみ再生 → 最終フレームで停止。2G 目以降
 *   (揃えられなかった場合)は最終フレーム固定のまま(`freeze: true`)。
 *   ムービー終了後(または freeze 時)に赤7 図柄 3 つ + 目押し指示を重ねて表示する。
 *   表示側(DirectionLayer)はゲームを跨いで video 要素を維持する(再生し直さない)。
 * - **AT 導入**(フェーズ AT_INTRO): 赤7 が揃った次ゲームのレバーオンに
 *   `atIntroAtLeverOn` で AT 導入ムービー(`at_intro`)を全画面表示する(1G)。
 * - 赤7 が揃ったゲームの全停止で `SEVEN_ALIGNED` イベント → 「赤7揃い!」カットイン。
 */
import {
  AT_VIDEOS,
  BATTLE_IMAGES,
  EFFECT_VIDEOS,
  ENDING_IMAGES,
  RENZOKU_VIDEOS,
  SYMBOL_IMAGES,
  YOKOKU_IMAGES,
  YOKOKU_VIDEOS,
} from '../assets';
import { BATTLE_PART_GAMES, KOYAKU_PART_GAMES, RENCHAN_LIMIT } from '../core/at';
import type { Background } from '../core/background';
import { RENZOKU_GAMES, type RenzokuKind } from '../core/omen';
import type { PushOrder, ReelIndex, ReelSymbol } from '../core/reel';
import type { Rng } from '../core/rng';
import { isRareRole, type Role } from '../core/roles';
import {
  stepAt,
  type AtYokoku,
  type BattleRoute,
  type BattleTier,
  type KoyakuHint,
  type RenzokuChanceUps,
  type RevivalPattern,
  type ScenarioLevel,
  type ZenchoYokokuSlot,
} from '../core/scenario';
import {
  ENDING_GAMES,
  type EndingAfter,
  type GameEvent,
  type GameState,
  type Phase,
} from '../core/state';
import type { SoundCueId } from './sound';

// ---------------------------------------------------------------------------
// フェーズ由来の常時表示(StateOverlay)
// ---------------------------------------------------------------------------

/** フェーズ由来の常時表示(毎ゲーム state から導出) */
export type StateOverlay = {
  /** エンディング中の全画面静止画 + バナー(n/10G) */
  kind: 'ENDING';
  game: number;
  totalGames: number;
  after: EndingAfter;
  /** レバーオンで表示する 1 枚目(静止画紙芝居 = 2026-07-18 組込み) */
  leverUrl: string;
  /** 第 2 停止で切り替える 2 枚目(下位エンディングのみ。上位は 1 枚目のまま) */
  stop2Url?: string;
};

/** エンディング・リザルト静止画 URL をキーから解決する(存在しないキーは入稿漏れ = 即エラー) */
export function endingImageUrl(key: string): string {
  const url = ENDING_IMAGES[key];
  if (url === undefined) throw new Error(`エンディング演出静止画がありません: ${key}`);
  return url;
}

/**
 * 現在のフェーズから常時表示の演出を導出する(通常時・前兆中・AT 中は undefined)。
 * 前兆中の予告は 4c のシナリオ由来レバーオン演出(`scenarioYokokuAtLeverOn`)、
 * 連続演出 4G は 4d のレバーオン演出(`renzokuAtLeverOn`)が担い、常時表示は出さない
 * (予告のない G は静かに進む = 予告が出た時だけ前兆を匂わせる)。
 * エンディングは 10G 通しの全画面静止画(2026-07-18 = AI 生成の実素材へ差し替え):
 * - 下位(after = UPPER_AT): **レバーオンで 1 枚目(鳳凰堂凍結)→ 第 2 停止で
 *   2 枚目(後白河登場・対峙)**の紙芝居(毎 G 繰り返し。切替は DirectionLayer の
 *   stoppedReels 検知)。
 * - 上位(after = AT_END): レバーオンで 1 枚目(雪原晴れ・笑い合う二人)のみ。
 */
export function overlayForState(state: GameState): StateOverlay | undefined {
  const { phase } = state;
  if (phase.type === 'ENDING') {
    const base = {
      kind: 'ENDING',
      game: phase.game,
      totalGames: ENDING_GAMES,
      after: phase.after,
    } as const;
    if (phase.after === 'UPPER_AT') {
      return {
        ...base,
        leverUrl: endingImageUrl('ending_at_1_freeze'),
        stop2Url: endingImageUrl('ending_at_2_goshirakawa'),
      };
    }
    return { ...base, leverUrl: endingImageUrl('ending_uat_clear') };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// レバーオン時の予告演出(STEP 4c = シナリオテーブル → 演出の解決)
// ---------------------------------------------------------------------------

/** 予告ムービーのファイル名 stem 用の背景キー(DIRECTION_SPEC「4.」の bg) */
const BACKGROUND_KEYS: Record<Background, string> = {
  YOSHITSUNE: 'yoshitsune',
  SHIZUKA: 'shizuka',
  BENKEI: 'benkei',
  YUGATA: 'yugata',
  ZENCHO: 'zencho',
};

/** 予告ムービー URL をキーから解決する(存在しないキーは仮素材の生成漏れ = 即エラー) */
export function yokokuVideoUrl(key: string): string {
  const url = YOKOKU_VIDEOS[key];
  if (url === undefined) throw new Error(`予告ムービーがありません: ${key}`);
  return url;
}

/** 予告の静止画 URL をキーから解決する(存在しないキーは入稿漏れ = 即エラー) */
export function yokokuImageUrl(key: string): string {
  const url = YOKOKU_IMAGES[key];
  if (url === undefined) throw new Error(`予告静止画がありません: ${key}`);
  return url;
}

/** 前兆背景の期待度ラダー表示名(確定 33: 固有 1 = 弱 / 2 = 中 / 3 = 本前兆確定) */
const ZENCHO_LADDER_LABELS = ['', '期待度弱', '期待度中', '本前兆確定'] as const;

const ZENCHO_SLOT_LABELS: Record<ZenchoYokokuSlot, string> = {
  KOYU_4: '固有予告4',
  KOYU_5: '固有予告5',
  KYOTSU_3: '共通予告3',
  KYOTSU_4: '共通予告4',
};

/** リール消灯演出(共通 3 = 確定 39)のレベル別 消灯対象リール(第一停止から順に消灯) */
const BLACKOUT_REELS: Record<1 | 2 | 3, readonly ReelIndex[]> = {
  1: [0], // 弱 = 左のみ
  2: [0, 1], // 強 = 左・中
  3: [0, 1, 2], // 確定 = 左・中・右(全画面消灯)
};

const BLACKOUT_LABELS = ['', '弱', '強', '確定'] as const;

/** 前兆シナリオ予告の表示データ(レバーオン時に解決し、次のレバーオンまで表示) */
export interface ScenarioYokokuView {
  /** 予告ムービー(リール消灯演出のときは undefined) */
  videoUrl?: string;
  /**
   * リール消灯演出(共通 3 = 確定 39)の消灯対象リール。
   * 対象リールが停止するたび、画面 3 分割の対応する部分(左/中/右)が消灯する。
   */
  blackoutReels?: readonly ReelIndex[];
  /** デバッグ・テスト用(画面には出さない。仮素材ムービー自体に文言が入っている) */
  label: string;
  level: ScenarioLevel;
}

/** スロット × レベル × 背景 → 具体ムービーの解決(DIRECTION_SPEC 2.1) */
function resolveScenarioYokoku(
  background: Background,
  slot: ZenchoYokokuSlot,
  level: ScenarioLevel,
): ScenarioYokokuView {
  if (background === 'ZENCHO') {
    // 前兆背景はスロットを無視してレベル → 固有 1/2/3 の期待度ラダー
    return {
      videoUrl: yokokuVideoUrl(`yokoku_zencho${level}`),
      label: `前兆予告${level}(${ZENCHO_LADDER_LABELS[level]})`,
      level,
    };
  }
  if (slot === 'KYOTSU_3') {
    // 共通 3 はリール消灯演出(確定 39): L1 = 左 / L2 = 左中 / L3 = 全画面消灯
    const blackoutLevel = level as 1 | 2 | 3;
    return {
      blackoutReels: BLACKOUT_REELS[blackoutLevel],
      label: `共通予告3 リール消灯(${BLACKOUT_LABELS[level]})`,
      level,
    };
  }
  const variant = level >= 2 ? 'strong' : 'weak';
  const slotNo = Number(slot.slice(-1));
  const key = slot.startsWith('KYOTSU')
    ? `yokoku_common${slotNo}_${variant}`
    : `yokoku_${BACKGROUND_KEYS[background]}_koyu${slotNo}_${variant}`;
  return {
    videoUrl: yokokuVideoUrl(key),
    label: `${ZENCHO_SLOT_LABELS[slot]}(${level >= 2 ? '強' : '弱'})`,
    level,
  };
}

/**
 * これから回すゲームの前兆シナリオ予告(レバーオン時に UI が呼ぶ)。
 * 前兆中(フェーズ OMEN)のとき、次に消化するゲーム = 前兆 (phase.game + 1)G 目の
 * ステップを解決する。予告なし(L0)・前兆以外・次が連続演出のときは undefined。
 */
export function scenarioYokokuAtLeverOn(state: GameState): ScenarioYokokuView | undefined {
  const { phase } = state;
  if (phase.type !== 'OMEN') return undefined;
  const game = phase.game + 1;
  if (game > phase.totalGames) return undefined; // 次ゲームは連続演出 1G 目
  const step = stepAt(phase.scenario, game);
  if (step === undefined || step.level === 0 || step.slot === undefined) return undefined;
  return resolveScenarioYokoku(state.background, step.slot, step.level);
}

/**
 * 小役示唆予告を出せる状況か(競合規約 = DIRECTION_SPEC 2.1)。
 * - 前兆背景滞在中は出さない(前兆背景の固有 1〜3 は期待度ラダー専用)
 * - 通常時と前兆中(次ゲームも前兆の G)は出せる。連続演出・AT・エンディング中は出さない
 * - 同一 G のシナリオ予告優先は UI 側で担保する
 *   (`scenarioYokokuAtLeverOn` が undefined のときだけ抽せんする)
 */
export function koyakuHintAllowed(state: GameState): boolean {
  if (state.background === 'ZENCHO') return false;
  const { phase } = state;
  if (phase.type === 'NORMAL') return true;
  if (phase.type === 'OMEN') return phase.game < phase.totalGames;
  return false;
}

/** 成立役 → 最終表示する図柄画像(確定 33「小役示唆系は図柄画像を表示」)の対応 */
const HINT_SYMBOLS: Partial<Record<Role, ReelSymbol>> = {
  // ハズレ時(の弱)はブランク図柄を表示(確定 39)
  NONE: 'BLANK',
  REPLAY: 'REPLAY',
  BELL: 'BELL',
  WATERMELON_WEAK: 'WATERMELON',
  WATERMELON_STRONG: 'WATERMELON',
  CHERRY_CORNER: 'CHERRY',
  CHERRY_CENTER: 'CHERRY',
  // チャンス目はスイカテンパイはずし出目のためスイカ図柄で示唆
  CHANCE_ME: 'WATERMELON',
  REACH_ME: 'SEVEN_RED',
};

const HINT_SLOT_LABELS: Record<KoyakuHint['slot'], string> = {
  KOYU_1: '固有予告1',
  KOYU_2: '固有予告2',
  KOYU_3: '固有予告3',
  KYOTSU_1: '共通予告1',
  KYOTSU_2: '共通予告2',
};

/**
 * 小役示唆予告のスロット別表示形態(確定 43 = 2026-07-16 指示。
 * docs/YOKOKU_PRODUCTION_PLAN.md「5.」の UI 変更):
 * - **固有 1 は全画面**(背景ループ動画より上のレイヤーで演出が進行)。図柄は
 *   ムービーの PAN が終わった時点(`symbolDelayMs`)で**フェードインなしで
 *   すでに映っている形**で表示する(実素材 6 秒・PAN 後の空きスペースに重なる)。
 * - 固有 2・3 / 共通 1・2 は従来の右下小パネル + 1.5 秒フェードイン
 *   (それぞれの実素材の制作指示時に個別に決める)。
 * `symbolDelayMs` は実素材の尺・PAN タイミングに合わせて調整する差し替えポイント。
 */
export const KOYAKU_HINT_PRESENTATION: Record<
  KoyakuHint['slot'],
  { fullscreen: boolean; symbolDelayMs: number }
> = {
  KOYU_1: { fullscreen: true, symbolDelayMs: 4600 },
  KOYU_2: { fullscreen: false, symbolDelayMs: 1500 },
  KOYU_3: { fullscreen: false, symbolDelayMs: 1500 },
  KYOTSU_1: { fullscreen: false, symbolDelayMs: 1500 },
  KYOTSU_2: { fullscreen: false, symbolDelayMs: 1500 },
};

// ---------------------------------------------------------------------------
// 会話予告(基本背景の固有予告 3 = 2026-07-17 ユーザー指示。
// docs/YOKOKU_PRODUCTION_PLAN.md 12.7〜12.9)
// ---------------------------------------------------------------------------

/** 会話予告に登場するキャラクター */
export const KAIWA_SPEAKERS = ['YOSHITSUNE', 'YORITOMO', 'SHIZUKA', 'BENKEI'] as const;
export type KaiwaSpeaker = (typeof KAIWA_SPEAKERS)[number];

/** キャラ → 画像キー stem(`yokoku_kaiwa_<char>` + `_line1` / `_line2` / `_full`) */
const KAIWA_IMAGE_STEMS: Record<KaiwaSpeaker, string> = {
  YOSHITSUNE: 'yokoku_kaiwa_yoshitsune',
  YORITOMO: 'yokoku_kaiwa_yoritomo',
  SHIZUKA: 'yokoku_kaiwa_shizuka',
  BENKEI: 'yokoku_kaiwa_benkei',
};

/** キャラの表示名(ウィンドウ左上のネームプレートへアプリ側で描画) */
export const KAIWA_SPEAKER_NAMES: Record<KaiwaSpeaker, string> = {
  YOSHITSUNE: '義経',
  YORITOMO: '頼朝',
  SHIZUKA: '静',
  BENKEI: '弁慶',
};

/**
 * 会話予告の台詞テーブル(仮セリフ = 12.7「セリフは仮でよい」。
 * 画像へは焼き込まず、アプリ側テキスト描画で表示する = 差し替えはこの表だけでよい)。
 * first = 一言目 / second = 二言目 / full = 第 3 停止の全画面の大台詞。
 */
export const KAIWA_LINES: Record<KaiwaSpeaker, { first: string; second: string; full: string }> = {
  YOSHITSUNE: {
    first: '何かが来る…構えろ!',
    second: 'ここからが本番だ!',
    full: '勝負の時だ!',
  },
  YORITOMO: {
    first: '余の前に立つか…',
    second: 'くくく…見せてみよ',
    full: '掛かって来い!',
  },
  SHIZUKA: {
    first: '風向きが変わりました…',
    second: '良い知らせの予感がします',
    full: '舞い上がりなさい!',
  },
  BENKEI: {
    first: 'むっ、妙な気配だな',
    second: '腕が鳴るわい!',
    full: '一気に薙ぎ払う!',
  },
};

/** 会話予告のキャスト(一言目 / 二言目 / 全画面の話者) */
export interface KaiwaCast {
  first: KaiwaSpeaker;
  second: KaiwaSpeaker;
  fullscreen: KaiwaSpeaker;
}

/** 会話予告のある背景 → 背景キャラ(夕方は専用ルールのため含めない) */
const KAIWA_BG_SPEAKERS: Partial<Record<Background, KaiwaSpeaker>> = {
  YOSHITSUNE: 'YOSHITSUNE',
  SHIZUKA: 'SHIZUKA',
  BENKEI: 'BENKEI',
};

/**
 * 会話予告のキャスト抽せん(2026-07-17 ユーザー指示。UI がレバーオン時に
 * `drawKoyakuHint` の結果が固有 3 だったとき演出用 rng で呼ぶ独立関数):
 * - 義経/静/弁慶背景: 一言目 = 背景キャラ / 二言目 = 背景キャラ以外の 3 人から抽せん /
 *   全画面 = 背景キャラ or 頼朝。
 * - 夕方背景: 一言目 = 弁慶 or 義経 / 二言目 = 静固定 / 全画面 = 頼朝固定。
 * 前兆背景では呼ばない(`koyakuHintAllowed` が除外済み)。
 */
export function drawKaiwaCast(rng: Rng, background: Background): KaiwaCast {
  if (background === 'YUGATA') {
    return {
      first: rng.nextInt(2) === 0 ? 'BENKEI' : 'YOSHITSUNE',
      second: 'SHIZUKA',
      fullscreen: 'YORITOMO',
    };
  }
  const bgSpeaker = KAIWA_BG_SPEAKERS[background];
  if (bgSpeaker === undefined) throw new Error(`会話予告のない背景です: ${background}`);
  const others = KAIWA_SPEAKERS.filter((speaker) => speaker !== bgSpeaker);
  return {
    first: bgSpeaker,
    second: others[rng.nextInt(others.length)],
    fullscreen: rng.nextInt(2) === 0 ? bgSpeaker : 'YORITOMO',
  };
}

/** 会話ウィンドウ / 全画面 1 枚分の表示データ(台詞はアプリ側テキスト描画) */
export interface KaiwaWindowView {
  imageUrl: string;
  /** 話者の表示名(ネームプレートへ描画) */
  name: string;
  /** 台詞(仮セリフ = KAIWA_LINES) */
  text: string;
}

/**
 * 会話予告(固有 3)の表示データ。
 * レバーオンで一言目 → 第 1 停止で(一言目を消さずに)二言目を追加表示 →
 * 第 3 停止で全画面(強のみ)。表示切替は DirectionLayer が stoppedReels で行う。
 */
export interface KaiwaTalkView {
  /** 一言目ウィンドウ(画面左。レバーオンから表示) */
  first: KaiwaWindowView;
  /**
   * 二言目ウィンドウ(画面右。第 1 停止で追加表示)。
   * 弱で小役がそろわないゲーム(ハズレ・ベルこぼし・チャンス目・リーチ目)は
   * undefined = 一言目のみで終わる(2026-07-17 指示「小役がそろう場合は必ず二言目」)。
   */
  second?: KaiwaWindowView;
  /** 第 3 停止の全画面(強のみ。背景は見えない + 大台詞) */
  fullscreen?: KaiwaWindowView;
}

/**
 * 「小役がそろう」= 図柄が実際に有効ラインへ揃う役(2026-07-17 指示の実装解釈)。
 * リプレイも揃うため含める。チャンス目(スイカテンパイはずし)・リーチ目・ハズレ・
 * ベルこぼし(bellMiss)は揃わない扱い = 弱では一言目のみ。
 */
const KAIWA_ALIGNED_ROLES: readonly Role[] = [
  'REPLAY',
  'BELL',
  'WATERMELON_WEAK',
  'WATERMELON_STRONG',
  'CHERRY_CORNER',
  'CHERRY_CENTER',
];

/** 会話予告のウィンドウ / 全画面 1 枚分を解決する */
function kaiwaWindowView(speaker: KaiwaSpeaker, part: 'line1' | 'line2' | 'full'): KaiwaWindowView {
  const line = KAIWA_LINES[speaker];
  return {
    imageUrl: yokokuImageUrl(`${KAIWA_IMAGE_STEMS[speaker]}_${part}`),
    name: KAIWA_SPEAKER_NAMES[speaker],
    text: part === 'line1' ? line.first : part === 'line2' ? line.second : line.full,
  };
}

/**
 * 紙芝居(静止画切替)方式の予告 3 枚(2026-07-17 方針転換 = 各予告は静止画 3 枚程度で
 * 制作。切替タイミングは 2026-07-17 のユーザー指示):
 * レバーオンで 1 枚目 → 第 1 停止ボタンで 2 枚目(弱強差分)→
 * 第 3 停止ボタンで 3 枚目 + 成立小役の図柄表示。
 */
export interface KoyakuHintStills {
  /** 1 枚目(レバーオン時に表示) */
  leverOn: string;
  /** 2 枚目(第 1 停止ボタンで切替。弱強の差分はここ) */
  firstStop: string;
  /** 3 枚目(第 3 停止ボタンで切替。成立小役の図柄を重ねて表示) */
  allStop: string;
}

/** 小役示唆予告の表示データ(ムービー or 紙芝居 or 会話予告 + 成立役の図柄画像) */
export interface KoyakuHintView {
  /** 予告ムービー(紙芝居・会話予告方式のスロットでは undefined) */
  videoUrl?: string;
  /** 紙芝居方式の静止画 3 枚(ムービー・会話予告方式のスロットでは undefined) */
  stills?: KoyakuHintStills;
  /** 会話予告(固有 3 = 2026-07-17 指示。他スロットでは undefined) */
  kaiwa?: KaiwaTalkView;
  /** デバッグ・テスト用(画面には出さない) */
  label: string;
  /** ムービー再生後(紙芝居は第 3 停止時)に画面表示する成立役の図柄画像(確定 33) */
  symbolUrl: string;
  strong: boolean;
  /** 全画面表示か(固有 1 = 確定 43。false = 右下小パネル) */
  fullscreen: boolean;
  /** 図柄画像の表示開始タイミング(ms)。全画面はフェードインなしの即時表示(確定 43)。
   *  紙芝居方式は停止ボタン連動のため未使用(0) */
  symbolDelayMs: number;
}

/**
 * 紙芝居(静止画切替)方式で表示するスロット × 背景 → 静止画キーの stem。
 * 実素材の静止画が入稿されたものから順次追加する(2026-07-17 現在: 静・弁慶・夕方背景の固有 1)。
 * stem に `_still1` / `_still2_<weak|strong>` / `_still3` を付けた 4 枚が揃っている前提
 * (存在は direction.test.ts で検証)。
 */
const KOYAKU_HINT_STILLS: Partial<Record<KoyakuHint['slot'], Partial<Record<Background, string>>>> =
  {
    KOYU_1: {
      SHIZUKA: 'yokoku_shizuka_koyu1',
      BENKEI: 'yokoku_benkei_koyu1',
      YUGATA: 'yokoku_yugata_koyu1',
    },
  };

/**
 * 小役示唆予告(`drawKoyakuHint` の結果)を見た目へ解決する。
 * 固有 1〜3 は現在の背景の素材 / 共通 1・2 は 4 背景共通の素材(確定 34)。
 * 前兆背景には小役示唆の素材がない(呼び出し側が `koyakuHintAllowed` で除外)。
 * 図柄はハズレ = ブランク(確定 39)/ こぼすベル(bellMiss = 確定 35)も
 * ハズレ目が停止するためブランクを表示する(実装解釈)。
 * 静止画 3 枚が入稿済みのスロット × 背景(`KOYAKU_HINT_STILLS`)は紙芝居方式で解決する
 * (レバーオン → 第 1 停止 → 第 3 停止 + 図柄。2026-07-17 のユーザー指示)。
 * **固有 3 は 4 背景とも会話予告**(2026-07-17 指示): 呼び出し側が `drawKaiwaCast` の
 * 結果を渡すこと。弱 = 一言目(+ 小役がそろうゲームは二言目)/
 * 強 = 一言目 → 二言目 → 第 3 停止の全画面、を `KaiwaTalkView` へ解決する。
 */
export function koyakuHintView(
  hint: KoyakuHint,
  role: Role,
  background: Background,
  bellMiss = false,
  kaiwaCast?: KaiwaCast,
): KoyakuHintView | undefined {
  const symbol = role === 'BELL' && bellMiss ? 'BLANK' : HINT_SYMBOLS[role];
  if (symbol === undefined || background === 'ZENCHO') return undefined;
  const variant = hint.strong ? 'strong' : 'weak';
  const label = `${HINT_SLOT_LABELS[hint.slot]}(${hint.strong ? '強' : '弱'})`;
  if (hint.slot === 'KOYU_3') {
    // 会話予告(2026-07-17 指示)。弱強の見た目差は第 3 停止まで出ない
    // (弱 = 二言目まで / 強 = 全画面まで)ため、レバーオン時点では悟らせない
    if (kaiwaCast === undefined) {
      throw new Error('固有予告3(会話予告)には drawKaiwaCast の結果が必要です');
    }
    const aligned = KAIWA_ALIGNED_ROLES.includes(role) && !(role === 'BELL' && bellMiss);
    const second = hint.strong || aligned ? kaiwaWindowView(kaiwaCast.second, 'line2') : undefined;
    const fullscreen = hint.strong ? kaiwaWindowView(kaiwaCast.fullscreen, 'full') : undefined;
    const castLabel = [
      KAIWA_SPEAKER_NAMES[kaiwaCast.first],
      ...(second !== undefined ? [KAIWA_SPEAKER_NAMES[kaiwaCast.second]] : []),
      ...(fullscreen !== undefined ? [KAIWA_SPEAKER_NAMES[kaiwaCast.fullscreen]] : []),
    ].join('→');
    return {
      kaiwa: { first: kaiwaWindowView(kaiwaCast.first, 'line1'), second, fullscreen },
      label: `固有予告3 会話予告(${hint.strong ? '強' : '弱'}: ${castLabel})`,
      symbolUrl: SYMBOL_IMAGES[symbol],
      strong: hint.strong,
      fullscreen: false,
      symbolDelayMs: 0,
    };
  }
  const stillStem = KOYAKU_HINT_STILLS[hint.slot]?.[background];
  if (stillStem !== undefined) {
    return {
      stills: {
        leverOn: yokokuImageUrl(`${stillStem}_still1`),
        firstStop: yokokuImageUrl(`${stillStem}_still2_${variant}`),
        allStop: yokokuImageUrl(`${stillStem}_still3`),
      },
      label,
      symbolUrl: SYMBOL_IMAGES[symbol],
      strong: hint.strong,
      fullscreen: KOYAKU_HINT_PRESENTATION[hint.slot].fullscreen,
      symbolDelayMs: 0,
    };
  }
  const slotNo = Number(hint.slot.slice(-1));
  const key = hint.slot.startsWith('KYOTSU')
    ? `yokoku_common${slotNo}_${variant}`
    : `yokoku_${BACKGROUND_KEYS[background]}_koyu${slotNo}_${variant}`;
  const presentation = KOYAKU_HINT_PRESENTATION[hint.slot];
  return {
    videoUrl: yokokuVideoUrl(key),
    label,
    symbolUrl: SYMBOL_IMAGES[symbol],
    strong: hint.strong,
    fullscreen: presentation.fullscreen,
    symbolDelayMs: presentation.symbolDelayMs,
  };
}

// ---------------------------------------------------------------------------
// レバーオン時の連続演出表示(STEP 4d = 4G 構成の解決)
// ---------------------------------------------------------------------------

/** 連続演出のタイトル(仮素材用。実素材入稿時はムービーへ焼き込まれる想定) */
export const RENZOKU_TITLES: Record<RenzokuKind, string> = {
  A: '連続演出A「追走」',
  B: '連続演出B「一騎打ち」',
  C: '連続演出C「決戦」',
};

/** 4G 構成の段階名(DIRECTION_SPEC 2.4: G1 導入 / G2 展開 / G3 あおり / G4 = 成否告知へ) */
export const RENZOKU_STAGE_LABELS = ['導入', '展開', 'あおり', '決着'] as const;

/** 連続演出ムービー URL をキーから解決する(存在しないキーは仮素材の生成漏れ = 即エラー) */
export function renzokuVideoUrl(key: string): string {
  const url = RENZOKU_VIDEOS[key];
  if (url === undefined) throw new Error(`連続演出ムービーがありません: ${key}`);
  return url;
}

/** 連続演出 1G 分の表示データ(レバーオン時に解決し、次のレバーオンまで全画面表示) */
export interface RenzokuView {
  renzoku: RenzokuKind;
  /** これから回すゲームが連続演出何 G 目か(1〜RENZOKU_GAMES) */
  game: number;
  totalGames: number;
  videoUrl: string;
  title: string;
  /** 4G 構成の段階名(導入 / 展開 / あおり / 決着) */
  stage: string;
  /** この G がチャンスアップか(G1〜3 のみ。G4 は成否告知のため常に false) */
  chanceUp: boolean;
  /** デバッグ・テスト用(画面には出さない) */
  label: string;
}

/** 種別 × 背景 × G → 具体ムービーの解決(A/B = 背景固有 / C = 背景共通 = Q19) */
function resolveRenzoku(
  background: Background,
  renzoku: RenzokuKind,
  game: number,
  chanceUps: RenzokuChanceUps,
): RenzokuView {
  const key =
    renzoku === 'C'
      ? `renzoku_c_g${game}`
      : `renzoku_${renzoku.toLowerCase()}_${BACKGROUND_KEYS[background]}_g${game}`;
  const stage = RENZOKU_STAGE_LABELS[game - 1];
  const chanceUp = game <= chanceUps.length && chanceUps[game - 1] === 'CHANCE';
  return {
    renzoku,
    game,
    totalGames: RENZOKU_GAMES,
    videoUrl: renzokuVideoUrl(key),
    title: RENZOKU_TITLES[renzoku],
    stage,
    chanceUp,
    label: `連続演出${renzoku} G${game} ${stage}${chanceUp ? '(チャンス)' : ''}`,
  };
}

/**
 * これから回すゲームの連続演出表示(レバーオン時に UI が呼ぶ)。
 * - 連続演出 1G 目 = 前兆最終 G 消化済みのフェーズ `OMEN`(チャンスアップは
 *   シナリオの `renzokuSteps` から)
 * - 2〜4G 目 = フェーズ `RENZOKU`(game = 消化済み G 数。チャンスアップは引継ぎ済みの
 *   `chanceUps` から)
 * - それ以外(連続演出最終 G 消化後を含む)は undefined。
 * 見た目は前兆種別(本/偽)に依存しないため、偽→本書き換え(確定 21(c))が
 * 途中で起きても演出は継続する(G4 の成否告知だけが変わる)。
 */
export function renzokuAtLeverOn(state: GameState): RenzokuView | undefined {
  const { phase } = state;
  if (phase.type === 'OMEN' && phase.game >= phase.totalGames) {
    return resolveRenzoku(state.background, phase.renzoku, 1, phase.scenario.renzokuSteps);
  }
  if (phase.type === 'RENZOKU' && phase.game < RENZOKU_GAMES) {
    return resolveRenzoku(state.background, phase.renzoku, phase.game + 1, phase.chanceUps);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// AT 中の演出(STEP 4e = 小役パート予告 / バトルパート 8G / 復活告知)
// ---------------------------------------------------------------------------

/** AT 演出ムービー URL をキーから解決する(存在しないキーは仮素材の生成漏れ = 即エラー) */
export function atVideoUrl(key: string): string {
  const url = AT_VIDEOS[key];
  if (url === undefined) throw new Error(`AT 演出ムービーがありません: ${key}`);
  return url;
}

const AT_YOKOKU_LABELS: Record<AtYokoku, string> = {
  AT_NAVI: 'ベルナビ',
  AT_RARE: 'レア役示唆',
  AT_STRONG: '強予告(Vストック濃厚)',
};

const AT_YOKOKU_KEYS: Record<AtYokoku, string> = {
  AT_NAVI: 'navi',
  AT_RARE: 'rare',
  AT_STRONG: 'strong',
};

/** 押し順の表示テキスト(例: 中→左→右) */
export function pushOrderText(order: PushOrder): string {
  return order.map((reel) => ['左', '中', '右'][reel]).join('→');
}

/** AT 小役パート予告の表示データ(レバーオン時に解決し、次のレバーオンまで表示) */
export interface AtYokokuView {
  kind: AtYokoku;
  videoUrl: string;
  /** ムービー後に画面表示する図柄画像(NAVI = ベル / RARE = 成立役の図柄 = 確定 33) */
  symbolUrl?: string;
  /** NAVI の押し順テキスト(このゲームのナビ押し順 = 確定 36。例: 中→左→右) */
  naviText?: string;
  /** 強調枠(AT_STRONG = V ストック濃厚) */
  strong: boolean;
  /** デバッグ・テスト用(画面には出さない) */
  label: string;
}

/**
 * AT 小役パート予告を出せる状況か(DIRECTION_SPEC 2.3)。
 * 次に回すゲームが AT 小役パートの G(1〜10G 目)のときのみ。
 * バトルパート(次がバトル 1G 目 = partGame 10 消化済みを含む)・エンディング中は出さない。
 */
export function atYokokuAllowed(state: GameState): boolean {
  const { phase } = state;
  return phase.type === 'AT' && phase.part === 'KOYAKU' && phase.partGame < KOYAKU_PART_GAMES;
}

/**
 * AT 小役パート予告(`drawAtYokoku` の結果)を見た目へ解決する。
 * AT と上位 AT で別ムービー(`at_koyaku_*` / `uat_koyaku_*`)。
 * 図柄画像は NAVI = ベル(+ このゲームのナビ押し順テキスト = 確定 36)/
 * RARE = 成立役の図柄(目押し補助)/ STRONG = なし(ムービーのみ。V ストック濃厚の強調枠)。
 *
 * @param naviOrder このゲームのナビ押し順(`drawNaviPushOrder` の結果。レバーオンで
 *   抽せんした値を渡す = リール窓上のナビ数字と必ず一致させる)
 */
export function atYokokuView(
  kind: AtYokoku,
  role: Role,
  tier: BattleTier,
  naviOrder?: PushOrder,
): AtYokokuView {
  const prefix = tier === 'UPPER' ? 'uat' : 'at';
  const videoUrl = atVideoUrl(`${prefix}_koyaku_${AT_YOKOKU_KEYS[kind]}`);
  const label = `${tier === 'UPPER' ? '上位AT' : 'AT'}予告 ${AT_YOKOKU_LABELS[kind]}`;
  if (kind === 'AT_NAVI') {
    return {
      kind,
      videoUrl,
      symbolUrl: SYMBOL_IMAGES.BELL,
      naviText: naviOrder !== undefined ? pushOrderText(naviOrder) : undefined,
      strong: false,
      label,
    };
  }
  if (kind === 'AT_RARE') {
    const symbol = HINT_SYMBOLS[role];
    return {
      kind,
      videoUrl,
      symbolUrl: symbol !== undefined ? SYMBOL_IMAGES[symbol] : undefined,
      strong: false,
      label,
    };
  }
  return { kind, videoUrl, strong: true, label };
}

/**
 * バトルの全画面タイトル(2026-07-18 ユーザー指示: 上位のタイトル文字
 * 「共闘BATTLE — 後白河法皇との決戦」は表示しない = 空文字。n/8G カウントは残す)
 */
export const BATTLE_TITLES: Record<BattleTier, string> = {
  NORMAL: 'BATTLE — 頼朝との一戦',
  UPPER: '',
};

/**
 * バトル演出の静止画 URL をキーから解決する(2026-07-18 = AI 生成の実素材。
 * 下位 25 枚 + 上位 25 枚。生成 = scripts/gen_battle_images.mjs)。
 * 存在しないキーは入稿漏れ = 即エラー。
 */
export function battleImageUrl(key: string): string {
  const url = BATTLE_IMAGES[key];
  if (url === undefined) throw new Error(`バトル演出静止画がありません: ${key}`);
  return url;
}

/** バトル 8G の役割ラベル(SPEC「7.」「8.」の 8G 構成表) */
export const BATTLE_STAGE_LABELS: Record<BattleTier, readonly string[]> = {
  NORMAL: ['導入', '義経台詞', '頼朝台詞', '攻撃決め', '攻撃', '判定', '帰結', '最終'],
  UPPER: ['導入', '義経台詞', '頼朝台詞', '攻撃決め', '攻撃', 'ヒット判定', '帰結', '最終'],
};

// ---------------------------------------------------------------------------
// 下位 AT バトルパートの静止画紙芝居(2026-07-18 組込み。
// 素材 = AI 生成の実素材 25 枚(BATTLE_IMAGES)/ 指示元 = incoming/義経物語下位AT中.pptx)
// ---------------------------------------------------------------------------

/**
 * バトル静止画に重ねるテキスト(画像には文字を焼き込まない = 会話予告と同じ規約。
 * 技名・「敗北」「継続」・台詞はすべてアプリ側テキスト描画)。
 * kind = 表示区分(位置・書式は DirectionLayer / CSS 側で解決):
 * - WAZA = 技名(画像中央の白い筆帯へ重ねる)
 * - SERIFU = 台詞(画面下部。speaker = 話者名。仮セリフ = AT_BATTLE_SERIFU)
 * - CHALLENGE = 桜花繚乱チャレンジの見出し(画面中央上部)
 * - KEIZOKU / HAIBOKU = 継続・敗北の大文字(画面中央上部)
 */
export interface BattleText {
  kind: 'WAZA' | 'SERIFU' | 'CHALLENGE' | 'KEIZOKU' | 'HAIBOKU';
  text: string;
  /** 台詞の話者名(SERIFU のみ) */
  speaker?: string;
}

/**
 * バトル 1G 分の静止画紙芝居。レバーオンで leverUrl を表示し、
 * 第 3 停止で stop3Url へ切替える(ない G はレバーオン画像のまま。
 * 切替は紙芝居予告と同じく DirectionLayer の stoppedReels 検知)。
 */
export interface BattleStill {
  leverUrl: string;
  leverText?: BattleText;
  /** 第 3 停止で切り替える画像(pptx の「第 3 停止で…」の G のみ) */
  stop3Url?: string;
  stop3Text?: BattleText;
}

/**
 * 下位 AT バトルの 2G・3G 台詞(仮セリフ。チャンスアップ G は台詞が変わる =
 * pptx「セリフ内容により通常 or チャンス」。差し替えはこの表だけでよい)。
 */
export const AT_BATTLE_SERIFU = {
  g2Normal: { speaker: '義経', text: '頼朝…ここで決着をつける!' },
  g2Chance: { speaker: '義経', text: '負ける気はしない…一気に行くぞ!' },
  g3Normal: { speaker: '頼朝', text: '来たか義経…余に挑むか' },
  g3Chance: { speaker: '頼朝', text: 'くくく…今宵は血が騒ぐわ' },
} as const;

/** 下位 AT バトルの技名(pptx の指定。画像の白帯へアプリ側テキストで重ねる) */
export const AT_BATTLE_WAZA = {
  YOSHI_WEAK: '穿炎刃',
  YOSHI_STRONG: '桜花繚乱',
  YORI_WEAK: '雷獄刃',
  YORI_STRONG: '御雷天昇',
} as const;

/**
 * ルート ID → 演出系統(G4 以降の静止画の分岐)。
 * DIRECTION_SPEC 3.6 のルート表(W1〜W8 / U1〜U6)の「G4〜G8 の分岐」列と対応:
 * - YOSHI_WEAK(W1・W2)= 義経弱攻撃 → ヒット → 継続
 * - YOSHI_STRONG(W3・W4)= 義経強攻撃 → 桜花繚乱チャレンジ(G6〜8)→ 継続
 * - YORI_WEAK/STRONG_WIN(W5〜W8)= 頼朝攻撃 → 耐える → 継続
 * - YORI_WEAK/STRONG_LOSE(U1〜U6)= 頼朝攻撃 → 耐えれない → 敗北 → 復活判定
 */
type AtBattleKind =
  | 'YOSHI_WEAK'
  | 'YOSHI_STRONG'
  | 'YORI_WEAK_WIN'
  | 'YORI_STRONG_WIN'
  | 'YORI_WEAK_LOSE'
  | 'YORI_STRONG_LOSE';

const AT_ROUTE_KINDS: Record<string, AtBattleKind> = {
  W1: 'YOSHI_WEAK',
  W2: 'YOSHI_WEAK',
  W3: 'YOSHI_STRONG',
  W4: 'YOSHI_STRONG',
  W5: 'YORI_WEAK_WIN',
  W6: 'YORI_WEAK_WIN',
  W7: 'YORI_STRONG_WIN',
  W8: 'YORI_STRONG_WIN',
  U1: 'YORI_WEAK_LOSE',
  U2: 'YORI_WEAK_LOSE',
  U3: 'YORI_WEAK_LOSE',
  U4: 'YORI_STRONG_LOSE',
  U5: 'YORI_STRONG_LOSE',
  U6: 'YORI_STRONG_LOSE',
};

/**
 * 下位 AT バトルの「ルート × G → 静止画紙芝居」の解決
 * (pptx の 8G 構成: G1 導入 = 月(通常 青 / チャンス 赤)/ G2・3 = 台詞 /
 * G4 = 対峙 → 顔アップ / G5 = 攻撃 → 技名 / G6 = 判定 / G7 = 帰結 / G8 = 最終)。
 * 復活時の静カットイン(G8 第 3 停止)は出目確定後でないと成否が分からないため、
 * ここでは解決せず `revivalCutin` が担う(従来どおりカットイン側 = 全停止後)。
 */
function atBattleStill(route: BattleRoute, game: number, chanceUp: boolean): BattleStill {
  if (game === 1) {
    // 導入 = 雲に隠れた月(通常 = 青い月 / チャンス = 赤い月)
    return { leverUrl: battleImageUrl(chanceUp ? 'battle_at_g1_chance' : 'battle_at_g1_normal') };
  }
  if (game === 2) {
    return {
      leverUrl: battleImageUrl('battle_at_g2_yoshitsune_serifu'),
      leverText: { kind: 'SERIFU', ...(chanceUp ? AT_BATTLE_SERIFU.g2Chance : AT_BATTLE_SERIFU.g2Normal) },
    };
  }
  if (game === 3) {
    return {
      leverUrl: battleImageUrl('battle_at_g3_yoritomo_serifu'),
      leverText: { kind: 'SERIFU', ...(chanceUp ? AT_BATTLE_SERIFU.g3Chance : AT_BATTLE_SERIFU.g3Normal) },
    };
  }
  const kind = AT_ROUTE_KINDS[route.id];
  if (kind === undefined) throw new Error(`未知のバトルルート: NORMAL ${route.id}`);
  const yoshi = kind === 'YOSHI_WEAK' || kind === 'YOSHI_STRONG';
  if (game === 4) {
    // 攻撃決め = レバオンで対峙 → 第 3 停止で攻撃側の顔アップ
    return {
      leverUrl: battleImageUrl('battle_at_g4_lever_taiji'),
      stop3Url: battleImageUrl(
        yoshi ? 'battle_at_g4_stop3_yoshitsune_up' : 'battle_at_g4_stop3_yoritomo_up',
      ),
    };
  }
  if (game === 5) {
    // 攻撃 = 構え → 技名(義経強のみ レバオンで技名 → 第 3 停止で決めカット)
    switch (kind) {
      case 'YOSHI_WEAK':
        return {
          leverUrl: battleImageUrl('battle_at_g5_yoshitsune_weak_lever'),
          stop3Url: battleImageUrl('battle_at_g5_yoshitsune_weak_stop3'),
          stop3Text: { kind: 'WAZA', text: AT_BATTLE_WAZA.YOSHI_WEAK },
        };
      case 'YOSHI_STRONG':
        return {
          leverUrl: battleImageUrl('battle_at_g5_yoshitsune_strong_lever'),
          leverText: { kind: 'WAZA', text: AT_BATTLE_WAZA.YOSHI_STRONG },
          stop3Url: battleImageUrl('battle_at_g5_yoshitsune_strong_stop3'),
        };
      case 'YORI_WEAK_WIN':
      case 'YORI_WEAK_LOSE':
        return {
          leverUrl: battleImageUrl('battle_at_g5_yoritomo_weak_lever'),
          stop3Url: battleImageUrl('battle_at_g5_yoritomo_weak_stop3'),
          stop3Text: { kind: 'WAZA', text: AT_BATTLE_WAZA.YORI_WEAK },
        };
      default:
        return {
          leverUrl: battleImageUrl('battle_at_g5_yoritomo_strong_lever'),
          stop3Url: battleImageUrl('battle_at_g5_yoritomo_strong_stop3'),
          stop3Text: { kind: 'WAZA', text: AT_BATTLE_WAZA.YORI_STRONG },
        };
    }
  }
  if (game === 6) {
    // 判定: 義経攻撃 = 頼朝防御 → 余裕 / 義経強 = 桜花繚乱チャレンジ(G6〜8)/
    // 頼朝攻撃 = 雷の龍が義経に襲い掛かる
    if (kind === 'YOSHI_WEAK') {
      return {
        leverUrl: battleImageUrl('battle_at_g6_yoshitsune_atk_lever'),
        stop3Url: battleImageUrl('battle_at_g6_yoshitsune_atk_stop3'),
      };
    }
    if (kind === 'YOSHI_STRONG') {
      return {
        leverUrl: battleImageUrl('battle_at_g6_ouka_challenge'),
        leverText: { kind: 'CHALLENGE', text: '桜花繚乱チャレンジ' },
      };
    }
    return { leverUrl: battleImageUrl('battle_at_g6_yoritomo_atk_lever') };
  }
  if (game === 7) {
    // 帰結: 義経弱 = 継続 / 義経強 = チャレンジ継続 / 頼朝攻撃 = 被弾 → 耐える or 敗北
    if (kind === 'YOSHI_WEAK') {
      return {
        leverUrl: battleImageUrl('battle_at_g7_yoshitsune_atk_keizoku'),
        leverText: { kind: 'KEIZOKU', text: '継続' },
      };
    }
    if (kind === 'YOSHI_STRONG') {
      return {
        leverUrl: battleImageUrl('battle_at_g6_ouka_challenge'),
        leverText: { kind: 'CHALLENGE', text: '桜花繚乱チャレンジ' },
      };
    }
    return {
      leverUrl: battleImageUrl('battle_at_g7_yoritomo_atk_lever'),
      stop3Url: battleImageUrl(
        kind === 'YORI_WEAK_WIN' || kind === 'YORI_STRONG_WIN'
          ? 'battle_at_g7_stop3_taeru'
          : 'battle_at_g7_stop3_haiboku',
      ),
      stop3Text:
        kind === 'YORI_WEAK_WIN' || kind === 'YORI_STRONG_WIN'
          ? undefined
          : { kind: 'HAIBOKU', text: '敗北' },
    };
  }
  // G8 最終: 勝利ルート = 継続(義経強はチャレンジ → 第 3 停止で継続)/
  // 敗北寄りルート = 倒れる義経 + 敗北(復活の成否は全停止後の revivalCutin が告知)
  if (kind === 'YORI_WEAK_LOSE' || kind === 'YORI_STRONG_LOSE') {
    return {
      leverUrl: battleImageUrl('battle_at_g8_lever_down'),
      leverText: { kind: 'HAIBOKU', text: '敗北' },
    };
  }
  if (kind === 'YOSHI_STRONG') {
    return {
      leverUrl: battleImageUrl('battle_at_g6_ouka_challenge'),
      leverText: { kind: 'CHALLENGE', text: '桜花繚乱チャレンジ' },
      stop3Url: battleImageUrl('battle_at_g7_yoshitsune_atk_keizoku'),
      stop3Text: { kind: 'KEIZOKU', text: '継続' },
    };
  }
  return {
    leverUrl: battleImageUrl('battle_at_g7_yoshitsune_atk_keizoku'),
    leverText: { kind: 'KEIZOKU', text: '継続' },
  };
}

/**
 * 下位 AT バトルの「現在のゲームが何か」の注記(G4〜8 は演出系統別。
 * 2026-07-18 指示の表示用テーブル。例の書式 =「4G目 義経攻撃へ」)。
 */
const AT_GAME_NOTES: Record<AtBattleKind, readonly [string, string, string, string, string]> = {
  YOSHI_WEAK: ['義経弱攻撃へ', '義経弱攻撃(穿炎刃)', '義経攻撃ヒット', '継続', '継続'],
  YOSHI_STRONG: [
    '義経強攻撃へ',
    '義経強攻撃(桜花繚乱)',
    '桜花繚乱チャレンジ',
    '桜花繚乱チャレンジ',
    'チャレンジ成功→継続',
  ],
  YORI_WEAK_WIN: ['頼朝弱攻撃へ', '頼朝弱攻撃(雷獄刃)', '頼朝攻撃 被弾', '耐える', '継続'],
  YORI_STRONG_WIN: ['頼朝強攻撃へ', '頼朝強攻撃(御雷天昇)', '頼朝攻撃 被弾', '耐える', '継続'],
  YORI_WEAK_LOSE: [
    '頼朝弱攻撃へ',
    '頼朝弱攻撃(雷獄刃)',
    '頼朝攻撃 被弾',
    '敗北へ',
    '敗北(復活判定)',
  ],
  YORI_STRONG_LOSE: [
    '頼朝強攻撃へ',
    '頼朝強攻撃(御雷天昇)',
    '頼朝攻撃 被弾',
    '敗北へ',
    '敗北(復活判定)',
  ],
};

/**
 * 現在のゲームが何か(何 G 目・どの展開か)の小さな注記を解決する(下位 AT)。
 * 2026-07-18 指示「今のゲームが何かを小さく文字で表示(例: 1G目 通常パターン /
 * 4G目 義経攻撃へ)」。DirectionLayer が画面左下へ小さく常時表示する。
 */
function atBattleGameNote(route: BattleRoute, game: number, chanceUp: boolean): string {
  if (game === 1) return `1G目 ${chanceUp ? 'チャンスパターン(赤い月)' : '通常パターン(青い月)'}`;
  if (game === 2) return `2G目 義経セリフ(${chanceUp ? 'チャンス' : '通常'})`;
  if (game === 3) return `3G目 頼朝セリフ(${chanceUp ? 'チャンス' : '通常'})`;
  const kind = AT_ROUTE_KINDS[route.id];
  if (kind === undefined) throw new Error(`未知のバトルルート: NORMAL ${route.id}`);
  return `${game}G目 ${AT_GAME_NOTES[kind][game - 4]}`;
}

// ---------------------------------------------------------------------------
// 上位 AT バトルパートの静止画紙芝居(2026-07-18 組込み。
// 素材 = AI 生成の実素材 25 枚(BATTLE_IMAGES の battle_uat_*)/
// プランの正 = docs/UAT_BATTLE_PRODUCTION_PLAN.md)
// ---------------------------------------------------------------------------

/**
 * 上位 AT バトルの 2G・3G 台詞(仮セリフ = UAT_BATTLE_PRODUCTION_PLAN「3.」。
 * チャンスアップ G は台詞が変わる(下位と同じ規約)。差し替えはこの表だけでよい)。
 */
export const UAT_BATTLE_SERIFU = {
  g2Normal: { speaker: '義経', text: '頼朝、ここからが本当の戦いだ!' },
  g2Chance: { speaker: '義経', text: '二人なら…負ける気はしない!' },
  g3Normal: { speaker: '頼朝', text: '義経、余に続け' },
  g3Chance: { speaker: '頼朝', text: '今宵、法皇の悪夢を断ち切る!' },
} as const;

/** 上位 AT バトルの技名(仮 = Q37 承認。画像の白帯へアプリ側テキストで重ねる) */
export const UAT_BATTLE_WAZA = {
  YOSHI: '蒼炎一閃',
  YORI: '紫電轟雷',
  DOUBLE: '炎雷共鳴',
} as const;

/**
 * 上位 AT のルート ID → 演出系統(G4 以降の静止画の分岐)。
 * UAT_BATTLE_PRODUCTION_PLAN「1.」の 5 系統:
 * - YOSHI_WIN(W1・W2)= 義経攻撃 → 障壁砕け → 後白河崩れる → 継続
 * - YORI_WIN(W3・W4)= 頼朝攻撃 → 障壁砕け → 後白河崩れる → 継続
 * - DOUBLE_WIN(W5〜W7)= ダブル攻撃(勝利確定)→ 大爆発 → 後白河吹き飛ぶ → 継続
 * - YOSHI_LOSE(U1・U2)/ YORI_LOSE(U3〜U5)= 攻撃 → 障壁に防がれる → 反撃・被弾 →
 *   敗北(復活判定)
 */
type UatBattleKind = 'YOSHI_WIN' | 'YORI_WIN' | 'DOUBLE_WIN' | 'YOSHI_LOSE' | 'YORI_LOSE';

const UAT_ROUTE_KINDS: Record<string, UatBattleKind> = {
  W1: 'YOSHI_WIN',
  W2: 'YOSHI_WIN',
  W3: 'YORI_WIN',
  W4: 'YORI_WIN',
  W5: 'DOUBLE_WIN',
  W6: 'DOUBLE_WIN',
  W7: 'DOUBLE_WIN',
  U1: 'YOSHI_LOSE',
  U2: 'YOSHI_LOSE',
  U3: 'YORI_LOSE',
  U4: 'YORI_LOSE',
  U5: 'YORI_LOSE',
};

/** 演出系統 → 攻撃側の画像キー要素(g4 アップ / g5 構え・技名)と技名テキスト */
const UAT_ATTACKER: Record<
  UatBattleKind,
  { up: string; atk: string; waza: string }
> = {
  YOSHI_WIN: { up: 'yoshitsune', atk: 'yoshitsune', waza: UAT_BATTLE_WAZA.YOSHI },
  YOSHI_LOSE: { up: 'yoshitsune', atk: 'yoshitsune', waza: UAT_BATTLE_WAZA.YOSHI },
  YORI_WIN: { up: 'yoritomo', atk: 'yoritomo', waza: UAT_BATTLE_WAZA.YORI },
  YORI_LOSE: { up: 'yoritomo', atk: 'yoritomo', waza: UAT_BATTLE_WAZA.YORI },
  DOUBLE_WIN: { up: 'double', atk: 'double', waza: UAT_BATTLE_WAZA.DOUBLE },
};

/**
 * 上位 AT バトルの「ルート × G → 静止画紙芝居」の解決(UAT_BATTLE_PRODUCTION_PLAN「2.」の
 * 8G 構成: G1 導入 = 雪原の月(通常 青 / チャンス 赤)/ G2・3 = 台詞 /
 * G4 = 三者対峙 → 攻撃側アップ / G5 = 構え → 技名 / G6 = 氷の障壁 → 成否 /
 * G7 = 帰結 / G8 = 最終)。
 * 復活カットイン(G8 第 3 停止)は出目確定後でないと成否が分からないため、
 * ここでは解決せず `revivalCutin` が担う(下位と同じ規約)。
 */
function uatBattleStill(route: BattleRoute, game: number, chanceUp: boolean): BattleStill {
  if (game === 1) {
    // 導入 = 雪原の空に浮かぶ月(通常 = 青い月 / チャンス = 赤い月。下位と統一文法)
    return { leverUrl: battleImageUrl(chanceUp ? 'battle_uat_g1_chance' : 'battle_uat_g1_normal') };
  }
  if (game === 2) {
    return {
      leverUrl: battleImageUrl('battle_uat_g2_yoshitsune_serifu'),
      leverText: {
        kind: 'SERIFU',
        ...(chanceUp ? UAT_BATTLE_SERIFU.g2Chance : UAT_BATTLE_SERIFU.g2Normal),
      },
    };
  }
  if (game === 3) {
    return {
      leverUrl: battleImageUrl('battle_uat_g3_yoritomo_serifu'),
      leverText: {
        kind: 'SERIFU',
        ...(chanceUp ? UAT_BATTLE_SERIFU.g3Chance : UAT_BATTLE_SERIFU.g3Normal),
      },
    };
  }
  const kind = UAT_ROUTE_KINDS[route.id];
  if (kind === undefined) throw new Error(`未知のバトルルート: UPPER ${route.id}`);
  const attacker = UAT_ATTACKER[kind];
  const win = kind !== 'YOSHI_LOSE' && kind !== 'YORI_LOSE';
  if (game === 4) {
    // 攻撃決め = レバオンで三者対峙 → 第 3 停止で攻撃側アップ(ダブル = 勝利確定の合図)
    return {
      leverUrl: battleImageUrl('battle_uat_g4_lever_taiji'),
      stop3Url: battleImageUrl(`battle_uat_g4_stop3_${attacker.up}_up`),
    };
  }
  if (game === 5) {
    // 攻撃 = 構え → 第 3 停止で技名カット(技名は白帯へアプリ側テキスト)
    return {
      leverUrl: battleImageUrl(`battle_uat_g5_${attacker.atk}_lever`),
      stop3Url: battleImageUrl(`battle_uat_g5_${attacker.atk}_stop3`),
      stop3Text: { kind: 'WAZA', text: attacker.waza },
    };
  }
  if (game === 6) {
    // ヒット判定 = レバオンで深紅の氷の障壁(全系統共通)→ 第 3 停止で成否
    return {
      leverUrl: battleImageUrl('battle_uat_g6_lever_shouheki'),
      stop3Url: battleImageUrl(
        kind === 'DOUBLE_WIN'
          ? 'battle_uat_g6_stop3_double_hit'
          : win
            ? 'battle_uat_g6_stop3_hit'
            : 'battle_uat_g6_stop3_guard',
      ),
    };
  }
  if (game === 7) {
    // 帰結: 勝ち = 後白河崩れる / ダブル = 吹き飛ぶ / 負け寄り = 反撃 → 二人被弾
    if (kind === 'DOUBLE_WIN') {
      return { leverUrl: battleImageUrl('battle_uat_g7_double_tobu') };
    }
    if (win) {
      return { leverUrl: battleImageUrl('battle_uat_g7_win_kuzureru') };
    }
    return {
      leverUrl: battleImageUrl('battle_uat_g7_lose_hangeki_lever'),
      stop3Url: battleImageUrl('battle_uat_g7_lose_hangeki_stop3'),
    };
  }
  // G8 最終: 勝利ルート = 勝どき + 継続 / 敗北寄りルート = 倒れる二人 + 敗北
  // (復活の成否は全停止後の revivalCutin が告知)
  if (win) {
    return {
      leverUrl: battleImageUrl('battle_uat_g8_win_keizoku'),
      leverText: { kind: 'KEIZOKU', text: '継続' },
    };
  }
  return {
    leverUrl: battleImageUrl('battle_uat_g8_lever_down'),
    leverText: { kind: 'HAIBOKU', text: '敗北' },
  };
}

/** 上位 AT バトルの「現在のゲームが何か」の注記(G4〜8 は演出系統別) */
const UAT_GAME_NOTES: Record<UatBattleKind, readonly [string, string, string, string, string]> = {
  YOSHI_WIN: ['義経攻撃へ', '義経攻撃(蒼炎一閃)', '障壁判定(砕けて被弾)', '後白河崩れる', '継続'],
  YORI_WIN: ['頼朝攻撃へ', '頼朝攻撃(紫電轟雷)', '障壁判定(砕けて被弾)', '後白河崩れる', '継続'],
  DOUBLE_WIN: [
    'ダブル攻撃へ(勝利確定)',
    'ダブル攻撃(炎雷共鳴)',
    '障壁判定(大爆発)',
    '後白河吹き飛ぶ',
    '継続',
  ],
  YOSHI_LOSE: [
    '義経攻撃へ',
    '義経攻撃(蒼炎一閃)',
    '障壁判定(防がれる)',
    '反撃・被弾',
    '敗北(復活判定)',
  ],
  YORI_LOSE: [
    '頼朝攻撃へ',
    '頼朝攻撃(紫電轟雷)',
    '障壁判定(防がれる)',
    '反撃・被弾',
    '敗北(復活判定)',
  ],
};

/** 現在のゲームが何かの小さな注記を解決する(上位 AT。書式は下位と同じ) */
function uatBattleGameNote(route: BattleRoute, game: number, chanceUp: boolean): string {
  if (game === 1) return `1G目 ${chanceUp ? 'チャンスパターン(赤い月)' : '通常パターン(青い月)'}`;
  if (game === 2) return `2G目 義経セリフ(${chanceUp ? 'チャンス' : '通常'})`;
  if (game === 3) return `3G目 頼朝セリフ(${chanceUp ? 'チャンス' : '通常'})`;
  const kind = UAT_ROUTE_KINDS[route.id];
  if (kind === undefined) throw new Error(`未知のバトルルート: UPPER ${route.id}`);
  return `${game}G目 ${UAT_GAME_NOTES[kind][game - 4]}`;
}

/** バトル 1G 分の表示データ(レバーオン時に解決し、次のレバーオンまで全画面表示) */
export interface BattleView {
  tier: BattleTier;
  /** これから回すゲームがバトル何 G 目か(1〜BATTLE_PART_GAMES) */
  game: number;
  totalGames: number;
  /** 静止画紙芝居(下位・上位とも 2026-07-18 の実素材。レバーオン → 第 3 停止で切替) */
  still: BattleStill;
  title: string;
  /** 8G 構成の役割ラベル(導入 / 台詞 / 攻撃 / …) */
  stage: string;
  /** この G がチャンスアップか(G1〜3 のみ。ルートへ焼き込み = Q18) */
  chanceUp: boolean;
  routeId: string;
  /**
   * 現在のゲームが何かの小さな注記(2026-07-18 指示。例: 1G目 通常パターン(青い月)/
   * 4G目 義経攻撃へ)。DirectionLayer が画面左下へ小さく常時表示する。
   */
  gameNote: string;
  /** デバッグ・テスト用(画面には出さない) */
  label: string;
}

/**
 * これから回すゲームがバトル何 G 目か(レバーオン時に UI が呼ぶ)。
 * バトル 1G 目 = 小役 10G 消化済みのフェーズ AT(part KOYAKU・partGame 10)、
 * 2〜8G 目 = part BATTLE(game = 消化済み G 数)。バトル以外は undefined。
 */
export function battleGameAtLeverOn(state: GameState): number | undefined {
  const { phase } = state;
  if (phase.type !== 'AT') return undefined;
  if (phase.part === 'KOYAKU') {
    return phase.partGame >= KOYAKU_PART_GAMES ? 1 : undefined;
  }
  return phase.partGame < BATTLE_PART_GAMES ? phase.partGame + 1 : undefined;
}

/**
 * ルート × G → 具体演出の解決(DIRECTION_SPEC 3.6。UI がルートを保持して毎 G 呼ぶ)。
 * 下位 AT = 静止画紙芝居(`atBattleStill`。2026-07-18 の実素材 25 枚)/
 * 上位 AT = 静止画紙芝居(`uatBattleStill`。2026-07-18 の実素材 25 枚)。
 */
export function battleView(tier: BattleTier, route: BattleRoute, game: number): BattleView {
  const chanceUp = game <= 3 && route.chanceUps.includes(game);
  const stage = BATTLE_STAGE_LABELS[tier][game - 1];
  const normal = tier === 'NORMAL';
  return {
    tier,
    game,
    totalGames: BATTLE_PART_GAMES,
    still: normal ? atBattleStill(route, game, chanceUp) : uatBattleStill(route, game, chanceUp),
    title: BATTLE_TITLES[tier],
    stage,
    chanceUp,
    routeId: route.id,
    gameNote: normal
      ? atBattleGameNote(route, game, chanceUp)
      : uatBattleGameNote(route, game, chanceUp),
    label: `${tier === 'UPPER' ? '共闘' : 'AT'}バトル ${route.id} G${game} ${stage}${chanceUp ? '(チャンス)' : ''}`,
  };
}

/**
 * バトル 1 ルートで使う静止画 URL の一覧(重複なし・G1〜8 の全画像)。
 * バトル開始時(ルート抽せん直後)に UI がプリロードし、ゲーム間の画像切替で
 * 読み込み待ちの背景動画が見えないようにする(2026-07-18 指示 = 紙芝居を途切れさせない)。
 */
export function battleStillUrls(tier: BattleTier, route: BattleRoute): readonly string[] {
  const urls = new Set<string>();
  for (let game = 1; game <= BATTLE_PART_GAMES; game++) {
    const { still } = battleView(tier, route, game);
    urls.add(still.leverUrl);
    if (still.stop3Url !== undefined) urls.add(still.stop3Url);
  }
  return [...urls];
}

/**
 * 復活告知のカットイン(敗北寄りルートの 8G 目全停止でセット継続が確定していたとき、
 * UI が `drawRevival` の結果を渡してカットイン列の先頭へ差し込む = 第 3 リール停止の告知)。
 * 下位 AT = 静のカットイン静止画(pptx 8G 目「第 3 停止で静のカットイン発生で復活」)/
 * 上位 AT = 二人が共に立ち上がるカットイン静止画(Q39 = 2026-07-18 承認)。
 */
export function revivalCutin(pattern: RevivalPattern, tier: BattleTier = 'NORMAL'): Cutin {
  return {
    title: '復活!',
    sub: pattern.label,
    style: 'SPECIAL',
    imageUrl: battleImageUrl(
      tier === 'NORMAL' ? 'battle_at_g8_stop3_shizuka_cutin' : 'battle_uat_g8_stop3_fukkatsu_cutin',
    ),
    sound: 'BIG_WIN',
    durationMs: 2600,
  };
}

// ---------------------------------------------------------------------------
// AT 終了画面(リザルト = 2026-07-18 指示。バトル敗北後・上位エンディング到達後に
// バトル回数とその AT での獲得枚数を表示する)
// ---------------------------------------------------------------------------

/** AT 終了画面の表示データ(全停止(AT_END)で解決し、次のレバーオンまで全画面表示) */
export interface AtResultView {
  /** リザルト静止画(全員集合。数値はアプリ側テキストで画面下部へ重ねる) */
  imageUrl: string;
  /** この AT で戦ったバトル回数(下位 + 上位の通算セット数) */
  battles: number;
  /** この AT の獲得枚数(MeterState.atGained。マイナスもあり得る) */
  gained: number;
  /** DEFEAT = バトル敗北 / ENDING = 上位エンディング到達(完全制覇) */
  reason: 'DEFEAT' | 'ENDING';
  /** デバッグ・テスト用(画面には出さない) */
  label: string;
}

/**
 * AT 終了画面を解決する(1G の締めで UI が呼ぶ)。イベントに `AT_END` があるとき、
 * ゲーム開始時点(advanceGame 前)のフェーズからバトル回数を数える:
 * - バトル敗北(reason = DEFEAT): 下位 = renchan / 上位 = 下位 10 + renchan
 *   (上位 AT は下位 10 連(バトル 10 回)後にのみ突入するため)。
 * - 上位エンディング到達(reason = ENDING): 下位 10 + 上位 10 = 20 回(完全制覇)。
 * 下位エンディング(after = UPPER_AT)は AT_END を発行しないため対象外
 * (= 終了画面は出ず上位 AT へ続く)。
 */
export function atResultView(
  phaseBefore: Phase,
  events: readonly GameEvent[],
  atGained: number,
): AtResultView | undefined {
  const end = events.find(
    (event): event is Extract<GameEvent, { type: 'AT_END' }> => event.type === 'AT_END',
  );
  if (end === undefined) return undefined;
  let battles: number;
  if (phaseBefore.type === 'AT') {
    battles = (phaseBefore.tier === 'UPPER' ? RENCHAN_LIMIT : 0) + phaseBefore.renchan;
  } else if (phaseBefore.type === 'ENDING') {
    battles = RENCHAN_LIMIT * 2;
  } else {
    // AT_END は AT(バトル 8G 目)/ エンディング最終 G の消化でしか発行されない
    throw new Error(`AT_END の発行元フェーズが不正です: ${phaseBefore.type}`);
  }
  return {
    imageUrl: endingImageUrl('ending_result_all'),
    battles,
    gained: atGained,
    reason: end.reason,
    label: `AT終了画面(${end.reason === 'DEFEAT' ? 'バトル敗北' : '完全制覇'}: バトル${battles}回・獲得${atGained}枚)`,
  };
}

// ---------------------------------------------------------------------------
// 赤7待機・AT 導入(確定 37)
// ---------------------------------------------------------------------------

/** 赤7待機 1G 分の表示データ(レバーオン時に解決。次のレバーオンまで全画面表示) */
export interface SevenWaitView {
  /** AT確定ムービー(ユーザー入稿素材 at_kakutei) */
  videoUrl: string;
  /**
   * ムービー再生済み(待機 2G 目以降 = 前ゲームで揃えられなかった)。
   * true のときは再生せず最終フレーム固定で表示する(新規マウント時はシークで再現)。
   */
  freeze: boolean;
  /** 画面に表示する赤7 図柄の画像 URL(3 つ並べる = 確定 37) */
  sevenUrl: string;
  /** 待機何 G 目か(1〜。デバッグ・テスト用) */
  game: number;
  /** デバッグ・テスト用(画面には出さない) */
  label: string;
}

/**
 * これから回すゲームの赤7待機表示(レバーオン時に UI が呼ぶ)。
 * フェーズ SEVEN_WAIT のとき: AT 確定ゲーム(game 0)の次のレバーオン = 待機 1G 目で
 * ムービー再生、2G 目以降は最終フレーム固定(freeze)。それ以外は undefined。
 */
export function sevenWaitAtLeverOn(state: GameState): SevenWaitView | undefined {
  const { phase } = state;
  if (phase.type !== 'SEVEN_WAIT') return undefined;
  const game = phase.game + 1;
  return {
    videoUrl: atVideoUrl('at_kakutei'),
    freeze: phase.game >= 1,
    sevenUrl: SYMBOL_IMAGES.SEVEN_RED,
    game,
    label: `赤7待機 ${game}G目(AT確定ムービー${phase.game >= 1 ? '・最終フレーム' : ''})`,
  };
}

/** AT 導入 1G の表示データ(レバーオン時に解決。次のレバーオンまで全画面表示) */
export interface AtIntroView {
  /** AT 導入ムービー(at_intro) */
  videoUrl: string;
  /** デバッグ・テスト用(画面には出さない) */
  label: string;
}

/**
 * これから回すゲームの AT 導入表示(レバーオン時に UI が呼ぶ)。
 * フェーズ AT_INTRO(= 赤7 が揃った次ゲーム)のとき AT 導入ムービーを返す(確定 37)。
 */
export function atIntroAtLeverOn(state: GameState): AtIntroView | undefined {
  if (state.phase.type !== 'AT_INTRO') return undefined;
  return { videoUrl: atVideoUrl('at_intro'), label: 'AT導入ムービー(1G)' };
}

/** レバーオン時に決定する 1G 分の演出(seq = レバーオンの通し番号) */
export interface LeverDirection {
  seq: number;
  /** 前兆シナリオ予告(優先。あるとき hint は undefined) */
  yokoku?: ScenarioYokokuView;
  /** 小役示唆予告 */
  hint?: KoyakuHintView;
  /** 連続演出の全画面表示(STEP 4d。あるとき yokoku / hint は undefined) */
  renzoku?: RenzokuView;
  /** AT 小役パート予告(STEP 4e。AT 中のみ。あるとき他は undefined) */
  atYokoku?: AtYokokuView;
  /** バトルパート 8G の全画面表示(STEP 4e。あるとき他は undefined) */
  battle?: BattleView;
  /** 赤7待機の全画面表示(確定 37。あるとき他は undefined) */
  sevenWait?: SevenWaitView;
  /** AT 導入ムービーの全画面表示(確定 37。あるとき他は undefined) */
  atIntro?: AtIntroView;
}

// ---------------------------------------------------------------------------
// イベント由来のワンショット表示(Cutin)
// ---------------------------------------------------------------------------

/** カットインの見た目の区分(色・装飾は DirectionLayer / CSS 側で解決) */
export type CutinStyle = 'WIN' | 'LOSE' | 'SPECIAL' | 'INFO';

/** ワンショットのカットイン演出(仮)。UI 側がキューに積んで durationMs ずつ順に表示する */
export interface Cutin {
  title: string;
  sub?: string;
  style: CutinStyle;
  /** 背景の演出動画(`EFFECT_VIDEOS` の URL。省略時はテキストのみ) */
  videoUrl?: string;
  /** 背景の演出静止画(復活の静カットイン等。videoUrl と排他) */
  imageUrl?: string;
  /** 表示開始時に鳴らすサウンドキュー(省略時は無音) */
  sound?: SoundCueId;
  durationMs: number;
}

/**
 * イベント → カットインの対応表(仮演出)。
 * 内部状態を悟らせるイベント(モード移行・偽前兆突入・書き換え・背景移行)は演出にしない。
 * 発行順のまま表示キューへ積まれる(例: RENZOKU_RESULT 成功 → AT_START の 2 連続)。
 */
export function cutinsForEvents(events: readonly GameEvent[]): Cutin[] {
  const cutins: Cutin[] = [];
  for (const event of events) {
    switch (event.type) {
      case 'RENZOKU_RESULT':
        // 成否告知(STEP 4d): 専用ムービー renzoku_result_<win|lose> を全画面カットインで
        cutins.push(
          event.success
            ? {
                title: '勝利!',
                sub: `連続演出${event.renzoku} 成功`,
                style: 'WIN',
                videoUrl: renzokuVideoUrl('renzoku_result_win'),
                sound: 'RENZOKU_SUCCESS',
                durationMs: 2200,
              }
            : {
                title: '敗北…',
                sub: `連続演出${event.renzoku} 失敗`,
                style: 'LOSE',
                videoUrl: renzokuVideoUrl('renzoku_result_lose'),
                sound: 'RENZOKU_FAIL',
                durationMs: 2000,
              },
        );
        break;
      case 'SEVEN_ALIGNED':
        // 赤7 揃い(確定 37)。次ゲームが AT 導入ムービー 1G
        cutins.push({
          title: '赤7揃い!',
          sub: '次ゲームからATへ',
          style: 'WIN',
          sound: 'BIG_WIN',
          durationMs: 1800,
        });
        break;
      case 'AT_START':
        cutins.push({
          title: 'AT突入!',
          sub: `継続率 ${Math.round(event.continueRate * 100)}%`,
          style: 'WIN',
          videoUrl: EFFECT_VIDEOS.cutinStrong,
          sound: 'BIG_WIN',
          durationMs: 2400,
        });
        break;
      case 'AT_SET_CONTINUE':
        cutins.push({
          title: `${event.renchan}連目 継続!`,
          style: 'WIN',
          videoUrl: EFFECT_VIDEOS.cutinWeak,
          sound: 'AT_CONTINUE',
          durationMs: 1400,
        });
        break;
      case 'V_STOCK_GAIN':
        cutins.push({
          title: 'Vストック獲得!',
          sub: `計 ${event.vStock} 個`,
          style: 'INFO',
          sound: 'AT_CONTINUE',
          durationMs: 1200,
        });
        break;
      case 'V_STOCK_USE':
        cutins.push({
          title: 'Vストック発動',
          sub: '継続確定!',
          style: 'INFO',
          durationMs: 1200,
        });
        break;
      case 'UPPER_AT_ENTER':
        cutins.push({
          title: '上位AT突入!',
          sub: '継続率 93%',
          style: 'SPECIAL',
          videoUrl: EFFECT_VIDEOS.cutinStrong,
          sound: 'BIG_WIN',
          durationMs: 2400,
        });
        break;
      case 'ENDING_START':
        cutins.push({
          title: 'エンディング!',
          sub: event.after === 'UPPER_AT' ? '10連達成' : '完全制覇へ',
          style: 'SPECIAL',
          videoUrl: EFFECT_VIDEOS.cutinStrong,
          sound: 'BIG_WIN',
          durationMs: 2400,
        });
        break;
      case 'AT_END':
        cutins.push(
          event.reason === 'DEFEAT'
            ? { title: 'バトル敗北…', sub: 'AT終了', style: 'LOSE', sound: 'RENZOKU_FAIL', durationMs: 1800 }
            : { title: '完走!', sub: 'AT終了', style: 'WIN', durationMs: 1800 },
        );
        break;
      default:
        // MODE_CHANGE / HONZENCHO_ENTER / FAKE_OMEN_ENTER / OMEN_REWRITE /
        // RENZOKU_START / BACKGROUND_CHANGE は内部情報のため演出なし
        break;
    }
  }
  return cutins;
}

// ---------------------------------------------------------------------------
// ゲーム結果の基本 SE(カットインとは独立の毎ゲーム音)
// ---------------------------------------------------------------------------

/** 表示役 → 入賞 SE(ユーザー入稿素材 = 確定 40)の対応。弱チェリー = 角チェリー */
const WIN_SOUND_CUES: Partial<Record<Role, SoundCueId>> = {
  REPLAY: 'WIN_REPLAY',
  WATERMELON_WEAK: 'WIN_WATERMELON',
  WATERMELON_STRONG: 'WIN_WATERMELON',
  CHERRY_CORNER: 'WIN_CHERRY_WEAK',
  CHERRY_CENTER: 'WIN_CHERRY_CENTER',
};

/**
 * 1G の締め(全停止後)の基本 SE を 1 つ選ぶ(なければ undefined)。
 * 入賞音(表示役 = 実際に揃った役。確定 40)> レア役成立(取りこぼし含む)>
 * 払出あり、の優先(カットインの告知音とは独立に鳴る)。
 * 入賞音の専用素材がない役(ベル・チャンス目・リーチ目)は従来の RARE / PAYOUT のまま。
 */
export function resultSoundCue(
  wonRole: Role,
  displayedRole: Role,
  payout: number,
): SoundCueId | undefined {
  const winCue = WIN_SOUND_CUES[displayedRole];
  if (winCue !== undefined) return winCue;
  if (isRareRole(wonRole)) return 'RARE';
  if (payout > 0) return 'PAYOUT';
  return undefined;
}
