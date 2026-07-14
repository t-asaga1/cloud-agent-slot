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
 * - **エンディング**: フェーズ ENDING の常時表示(`overlayForState`)に全画面ムービーを
 *   追加(`EndingPhase.after` で `ending_to_upper` / `ending_complete` を描き分け = Q20)。
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
import { AT_VIDEOS, EFFECT_VIDEOS, RENZOKU_VIDEOS, SYMBOL_IMAGES, YOKOKU_VIDEOS } from '../assets';
import { BATTLE_PART_GAMES, KOYAKU_PART_GAMES } from '../core/at';
import type { Background } from '../core/background';
import { RENZOKU_GAMES, type RenzokuKind } from '../core/omen';
import type { PushOrder, ReelIndex, ReelSymbol } from '../core/reel';
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
} from '../core/state';
import type { SoundCueId } from './sound';

// ---------------------------------------------------------------------------
// フェーズ由来の常時表示(StateOverlay)
// ---------------------------------------------------------------------------

/** フェーズ由来の常時表示(毎ゲーム state から導出) */
export type StateOverlay = {
  /** エンディング中の全画面ムービー + バナー(n/10G) */
  kind: 'ENDING';
  game: number;
  totalGames: number;
  after: EndingAfter;
  /** 全画面エンディングムービー(after で描き分け = Q20。STEP 4e) */
  videoUrl: string;
};

/**
 * 現在のフェーズから常時表示の演出を導出する(通常時・前兆中・AT 中は undefined)。
 * 前兆中の予告は 4c のシナリオ由来レバーオン演出(`scenarioYokokuAtLeverOn`)、
 * 連続演出 4G は 4d のレバーオン演出(`renzokuAtLeverOn`)が担い、常時表示は出さない
 * (予告のない G は静かに進む = 予告が出た時だけ前兆を匂わせる)。
 * エンディングは 10G 通しの全画面ムービー(STEP 4e。`ending_to_upper` = 上位 AT 突入前 /
 * `ending_complete` = 完全制覇 → AT 終了)。
 */
export function overlayForState(state: GameState): StateOverlay | undefined {
  const { phase } = state;
  if (phase.type === 'ENDING') {
    return {
      kind: 'ENDING',
      game: phase.game,
      totalGames: ENDING_GAMES,
      after: phase.after,
      videoUrl: atVideoUrl(phase.after === 'UPPER_AT' ? 'ending_to_upper' : 'ending_complete'),
    };
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

/** 小役示唆予告の表示データ(ムービー + ムービー後に出す成立役の図柄画像) */
export interface KoyakuHintView {
  videoUrl: string;
  /** デバッグ・テスト用(画面には出さない) */
  label: string;
  /** ムービー再生後に画面表示する成立役の図柄画像(確定 33) */
  symbolUrl: string;
  strong: boolean;
}

/**
 * 小役示唆予告(`drawKoyakuHint` の結果)を見た目へ解決する。
 * 固有 1〜3 は現在の背景の素材 / 共通 1・2 は 4 背景共通の素材(確定 34)。
 * 前兆背景には小役示唆の素材がない(呼び出し側が `koyakuHintAllowed` で除外)。
 * 図柄はハズレ = ブランク(確定 39)/ こぼすベル(bellMiss = 確定 35)も
 * ハズレ目が停止するためブランクを表示する(実装解釈)。
 */
export function koyakuHintView(
  hint: KoyakuHint,
  role: Role,
  background: Background,
  bellMiss = false,
): KoyakuHintView | undefined {
  const symbol = role === 'BELL' && bellMiss ? 'BLANK' : HINT_SYMBOLS[role];
  if (symbol === undefined || background === 'ZENCHO') return undefined;
  const variant = hint.strong ? 'strong' : 'weak';
  const slotNo = Number(hint.slot.slice(-1));
  const key = hint.slot.startsWith('KYOTSU')
    ? `yokoku_common${slotNo}_${variant}`
    : `yokoku_${BACKGROUND_KEYS[background]}_koyu${slotNo}_${variant}`;
  return {
    videoUrl: yokokuVideoUrl(key),
    label: `${HINT_SLOT_LABELS[hint.slot]}(${hint.strong ? '強' : '弱'})`,
    symbolUrl: SYMBOL_IMAGES[symbol],
    strong: hint.strong,
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

/** バトルの全画面タイトル(仮素材用) */
export const BATTLE_TITLES: Record<BattleTier, string> = {
  NORMAL: 'BATTLE — 頼朝との一戦',
  UPPER: '共闘BATTLE — 敵軍との決戦',
};

/** バトル 8G の役割ラベル(SPEC「7.」「8.」の 8G 構成表) */
export const BATTLE_STAGE_LABELS: Record<BattleTier, readonly string[]> = {
  NORMAL: ['導入', '義経台詞', '頼朝台詞', '攻撃決め', '攻撃', '判定', '帰結', '最終'],
  UPPER: ['導入', '義経台詞', '頼朝台詞', '攻撃決め', '攻撃', 'ヒット判定', '帰結', '最終'],
};

/**
 * ルート ID → G4〜G8 のパターン No(Excel「AT中」シートの No 1〜20)。
 * G1〜3 は通常/チャンスのペア(No 1/2・3/4・5/6)でルートの chanceUps から解決する。
 */
const AT_ROUTE_PATTERN_NOS: Record<string, readonly [number, number, number, number, number]> = {
  W1: [7, 9, 13, 16, 19],
  W2: [7, 9, 13, 16, 19],
  W3: [7, 10, 14, 16, 19],
  W4: [7, 10, 14, 16, 19],
  W5: [8, 11, 15, 17, 19],
  W6: [8, 11, 15, 17, 19],
  W7: [8, 12, 15, 17, 19],
  W8: [8, 12, 15, 17, 19],
  U1: [8, 11, 15, 18, 20],
  U2: [8, 11, 15, 18, 20],
  U3: [8, 11, 15, 18, 20],
  U4: [8, 12, 15, 18, 20],
  U5: [8, 12, 15, 18, 20],
  U6: [8, 12, 15, 18, 20],
};

/**
 * ルート ID → G4〜G8 のパターン No(Excel「上位AT中」シートの No。
 * 13・15・16・19 は歯抜けで、G6 のヒット判定は No 14 の 1 種のみ)。
 */
const UPPER_ROUTE_PATTERN_NOS: Record<string, readonly [number, number, number, number, number]> = {
  W1: [7, 10, 14, 17, 20],
  W2: [7, 10, 14, 17, 20],
  W3: [8, 11, 14, 17, 20],
  W4: [8, 11, 14, 17, 20],
  W5: [9, 12, 14, 17, 20],
  W6: [9, 12, 14, 17, 20],
  W7: [9, 12, 14, 17, 20],
  U1: [7, 10, 14, 18, 21],
  U2: [7, 10, 14, 18, 21],
  U3: [8, 11, 14, 18, 21],
  U4: [8, 11, 14, 18, 21],
  U5: [8, 11, 14, 18, 21],
};

/** バトル 1G 分の表示データ(レバーオン時に解決し、次のレバーオンまで全画面表示) */
export interface BattleView {
  tier: BattleTier;
  /** これから回すゲームがバトル何 G 目か(1〜BATTLE_PART_GAMES) */
  game: number;
  totalGames: number;
  videoUrl: string;
  title: string;
  /** 8G 構成の役割ラベル(導入 / 台詞 / 攻撃 / …) */
  stage: string;
  /** この G がチャンスアップか(G1〜3 のみ。ルートへ焼き込み = Q18) */
  chanceUp: boolean;
  routeId: string;
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

/** ルート × G → 具体ムービーの解決(DIRECTION_SPEC 3.6。UI がルートを保持して毎 G 呼ぶ) */
export function battleView(tier: BattleTier, route: BattleRoute, game: number): BattleView {
  const chanceUp = game <= 3 && route.chanceUps.includes(game);
  let no: number;
  if (game <= 3) {
    // G1〜3 は通常/チャンスのペア No(1/2・3/4・5/6)
    no = (game - 1) * 2 + (chanceUp ? 2 : 1);
  } else {
    const nos = (tier === 'NORMAL' ? AT_ROUTE_PATTERN_NOS : UPPER_ROUTE_PATTERN_NOS)[route.id];
    if (nos === undefined) throw new Error(`未知のバトルルート: ${tier} ${route.id}`);
    no = nos[game - 4];
  }
  const key = `battle_${tier === 'NORMAL' ? 'at' : 'uat'}_${String(no).padStart(2, '0')}`;
  const stage = BATTLE_STAGE_LABELS[tier][game - 1];
  return {
    tier,
    game,
    totalGames: BATTLE_PART_GAMES,
    videoUrl: atVideoUrl(key),
    title: BATTLE_TITLES[tier],
    stage,
    chanceUp,
    routeId: route.id,
    label: `${tier === 'UPPER' ? '共闘' : 'AT'}バトル ${route.id} G${game} ${stage}${chanceUp ? '(チャンス)' : ''}`,
  };
}

/**
 * 復活告知のカットイン(敗北寄りルートの 8G 目全停止でセット継続が確定していたとき、
 * UI が `drawRevival` の結果を渡してカットイン列の先頭へ差し込む = 第 3 リール停止の告知)。
 */
export function revivalCutin(pattern: RevivalPattern): Cutin {
  return {
    title: '復活!',
    sub: pattern.label,
    style: 'SPECIAL',
    videoUrl: EFFECT_VIDEOS.cutinStrong,
    sound: 'BIG_WIN',
    durationMs: 2200,
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

/**
 * 1G の締め(全停止後)の基本 SE を 1 つ選ぶ(なければ undefined)。
 * レア役成立 > 払出あり、の優先(カットインの告知音とは独立に鳴る)。
 */
export function resultSoundCue(wonRole: Role, payout: number): SoundCueId | undefined {
  if (isRareRole(wonRole)) return 'RARE';
  if (payout > 0) return 'PAYOUT';
  return undefined;
}
