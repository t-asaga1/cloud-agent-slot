import { drawInitialBackground, type Background, type BackgroundTrigger } from './background';
import { drawInitialMode, drawModeTransition, type Mode } from './mode';
import type { OmenKind, RenzokuKind } from './omen';
import { calcPayout, type PayoutResult } from './payout';
import type { Rng } from './rng';
import type { Role } from './roles';

/**
 * 1 ゲーム通しフローのステートマシン(STEP 2a で骨格を確定。以後のサブステップは骨格を変えない)。
 *
 * # 全体設計(docs/ROADMAP.md「STEP 2」・docs/SPEC.md「13. 確定事項」準拠)
 *
 * - 純関数 `advanceGame(state, input, rng) → { state, events, ... }`。`state` は不変オブジェクト
 *   として扱い、毎ゲーム新しいオブジェクトを返す(UI・テスト・シミュレーションで共用)。
 * - リール制御(`reel.ts`)とは疎結合: 本モジュールは「内部当選役 + 表示役(+ 押し順ベル正否)」を
 *   入力に取る。押下位置・押し順・`resolveSpin` との結合や打ち方ポリシー(通常時 = 左第一・適当押し /
 *   AT 中 = ナビ遵守。確定 26)は UI / シミュレーション共用のラッパー側で行う(STEP 2e)。
 * - フェーズは判別可能ユニオン `Phase` で表現: 通常 / 前兆(偽・本)/ 連続演出 / AT(通常・上位)/
 *   エンディング。偽前兆は「偽前兆 + モード」(確定 9)なのでモードとフェーズは直交して持つ
 *   (本前兆はモード HONZENCHO + フェーズ OMEN(REAL))。
 * - 毎 G の出力に演出層が必要とする情報を全部含める(確定 28・シナリオ方式):
 *   モード / 背景 = `state`、前兆種別・経過 G・総 G / 連続演出種別・何 G 目 = `state.phase`、
 *   成否・移行 = `events`、成立役・払出 = `AdvanceResult` のエコー。
 *   演出シナリオテーブル自体は STEP 4 で差し込む(本モジュールは情報の供給のみ)。
 *
 * # 1G 内の処理順序(ここで固定。確定 18〜25 と整合)
 *
 * 1. 払出計算(表示役 + リプレイ持越しによる BET 有無)
 * 2. モード移行抽せん(AT 中・エンディング中は停止 = 確定 11 / 本前兆滞在中は停止 = 確定 9 /
 *    ハズレは維持 = 確定 8 / 偽前兆中・連続演出中は実施 = 確定 9・23)
 * 3. 偽前兆突入抽せん + 前兆スケジュール開始(2b。前兆中の新規当せんは無視 = 確定 22)
 * 4. 前兆 / 連続演出 / AT の進行・解決(2b・2d。前兆 1G 目 = 当せんの次ゲーム = 確定 18)
 * 5. 背景移行(2c。「次ゲーム」契機は `pendingBackgroundTrigger` の予約フラグを 2b が設定し
 *    2c が発火する = 確定 19・21(d)。優先順位・30G カウンタは確定 24・25)
 * 6. ゲーム数・差枚・背景経過 G の集計(本ファイル)
 *
 * 2a 時点の実装範囲: 1・2・6 + 本前兆移行の検出イベント(前兆スケジュール開始 = フェーズ遷移は 2b)。
 */

/** AT の階層(通常 AT / 上位 AT)。確定 12 */
export type AtTier = 'NORMAL' | 'UPPER';

/** AT 1 セット内のパート(小役 10G → バトル 8G の順 = 確定 27) */
export type AtPart = 'KOYAKU' | 'BATTLE';

/** 通常時(前兆・AT のいずれでもない) */
export interface NormalPhase {
  type: 'NORMAL';
}

/**
 * 前兆(偽・本)7〜10G。2b で遷移を実装。
 * - `kind`: FAKE = 偽前兆(モードと共存)/ REAL = 本前兆(モード HONZENCHO)
 * - `game`: 経過 G(1 始まり。当せんの次ゲームが 1G 目 = 確定 18)
 * - `totalGames`: 抽せん済みの前兆総 G 数(偽 7〜9 / 本 7〜10)
 * - `renzoku`: 当せん時に確定済みの発展先連続演出(偽→本書き換えでも引き継ぐ = 確定 21)
 */
export interface OmenPhase {
  type: 'OMEN';
  kind: OmenKind;
  game: number;
  totalGames: number;
  renzoku: RenzokuKind;
}

/**
 * 連続演出 4G(前兆 G 数消化後に発展 = 確定 19)。2b で遷移を実装。
 * 4G 目に成否告知(本 = 成功 → 次 G から AT / 偽 = 失敗 → 次 G に背景移行して通常へ)。
 * 偽のまま最終 G まで本前兆書き換えの可能性あり(確定 21(c)・23)。
 */
export interface RenzokuPhase {
  type: 'RENZOKU';
  kind: OmenKind;
  renzoku: RenzokuKind;
  /** 何 G 目か(1〜RENZOKU_GAMES) */
  game: number;
}

/**
 * AT / 上位 AT(セット継続型)。2d で遷移を実装。
 * - `renchan`: 連チャン数(初回セット = 1 = 確定 11。10 連で上位 AT / エンディング = 確定 12)
 * - `continueRate`: バトル継続率(AT 移行時抽せん。上位 AT は 0.93 固定)
 * - `vStock`: V ストック数(複数可 = 確定 11)
 * - `continueConfirmed`: 現セットのバトル継続が確定済みか(バトル中の抽せん分岐に使用 = 確定 11)
 */
export interface AtPhase {
  type: 'AT';
  tier: AtTier;
  part: AtPart;
  /** パート内の経過 G(1 始まり) */
  partGame: number;
  renchan: number;
  continueRate: number;
  vStock: number;
  continueConfirmed: boolean;
}

/** エンディング(上位 AT 10 連)。終了後は AT 終了処理へ(確定 12)。2d で遷移を実装 */
export interface EndingPhase {
  type: 'ENDING';
  /** 経過 G(1 始まり) */
  game: number;
}

/** 全フェーズの判別可能ユニオン(2a で確定。以後のサブステップは骨格を変えない) */
export type Phase = NormalPhase | OmenPhase | RenzokuPhase | AtPhase | EndingPhase;

/** ゲーム全体の状態(単一オブジェクト)。`advanceGame` は毎回新しいオブジェクトを返す */
export interface GameState {
  /** 滞在モード(本前兆 = HONZENCHO もモードの一種) */
  mode: Mode;
  /** 現在の背景(通常 5 種。AT 中の専用背景はフェーズから導出するため持たない) */
  background: Background;
  /**
   * 同一背景の経過ゲーム数(30G 契機 = `BACKGROUND_ELAPSED_GAMES` 用)。
   * 背景移行抽せんの実施時にリセット(自背景維持でもリセット = 確定 24)。
   * 発火・リセットの配線は 2c(2a では毎 G インクリメントのみ)。
   */
  backgroundGames: number;
  /** 現在のフェーズ(通常 / 前兆 / 連続演出 / AT / エンディング) */
  phase: Phase;
  /**
   * 「次ゲーム」で効く背景移行契機の予約(確定 19)。
   * 2b が偽前兆当せん(FAKE_OMEN_NEXT)・本前兆移行(HONZENCHO_NEXT)・
   * 連続演出失敗(FAKE_OMEN_FAIL)で設定し、2c が次ゲーム冒頭で発火・クリアする。
   * 偽→本書き換え時は HONZENCHO_NEXT を予約しない(確定 21(d))。
   */
  pendingBackgroundTrigger: BackgroundTrigger | null;
  /** 総ゲーム数(累計) */
  totalGames: number;
  /** 差枚(払出 − 投入 の累計) */
  netCoins: number;
  /** 前ゲームがリプレイ(このゲームの BET 不要) */
  replayCarry: boolean;
}

/**
 * 1 ゲームの入力。リール制御・打ち方ポリシーとの結合はラッパー側(STEP 2e)で行う。
 * - `wonRole`: 内部当選役。モード移行・前兆・AT 中抽せんの契機に使う。
 * - `displayedRole`: 表示役(取りこぼし時は 'NONE')。払出計算に使う。
 * - `bellSuccess`: 押し順ベルの押し順正解か(表示役が BELL のときのみ参照)。
 */
export interface GameInput {
  wonRole: Role;
  displayedRole: Role;
  bellSuccess?: boolean;
}

/**
 * 発生イベント(UI の演出表示・テスト検証用)。
 * 2a では MODE_CHANGE / HONZENCHO_ENTER のみ発行。
 * 以後のサブステップでユニオンへ追加予定(骨格は変えない):
 * - 2b: FAKE_OMEN_ENTER(偽前兆突入)/ OMEN_REWRITE(偽→本書き換え)/
 *       RENZOKU_START(連続演出発展)/ RENZOKU_RESULT(4G 目の成否告知)
 * - 2c: BACKGROUND_CHANGE(背景移行。契機付き)
 * - 2d: AT_START / AT_SET_CONTINUE / V_STOCK_GAIN / UPPER_AT_ENTER / ENDING_START / AT_END
 */
export type GameEvent =
  | { type: 'MODE_CHANGE'; from: Mode; to: Mode; trigger: Role }
  | {
      /** 本前兆へのモード移行の検出(前兆スケジュール開始 = フェーズ遷移は 2b) */
      type: 'HONZENCHO_ENTER';
      trigger: Role;
    };

/** `advanceGame` の結果。`state` + `events` + このゲームのエコー(演出層・集計用) */
export interface AdvanceResult {
  state: GameState;
  events: GameEvent[];
  /** このゲームの内部当選役(入力のエコー) */
  wonRole: Role;
  /** このゲームの表示役(入力のエコー) */
  displayedRole: Role;
  /** このゲームの払出結果(BET 有無はリプレイ持越しから自動決定) */
  payout: PayoutResult;
}

/**
 * ゲーム開始時の初期状態を作る。
 * モード初期抽せん(GAME_START テーブル)→ モード別の背景初期抽せん(SPEC「5.」)。
 * 初期モードが本前兆(0.0132)でもフェーズは NORMAL で開始する
 * (前兆スケジュール開始 = OMEN フェーズへの遷移は 2b。モード滞在としての本前兆は成立している)。
 */
export function initGameState(rng: Rng): GameState {
  const mode = drawInitialMode(rng, 'GAME_START');
  const background = drawInitialBackground(rng, mode);
  return {
    mode,
    background,
    backgroundGames: 0,
    phase: { type: 'NORMAL' },
    pendingBackgroundTrigger: null,
    totalGames: 0,
    netCoins: 0,
    replayCarry: false,
  };
}

/** このフェーズでモード移行抽せんを実施するか(AT 中・エンディング中は停止 = 確定 11) */
function modeLotteryActive(phase: Phase): boolean {
  return phase.type !== 'AT' && phase.type !== 'ENDING';
}

/**
 * 1 ゲームを進める(レバーオン 1 回分)。ヘッダーコメントの処理順序に従う。
 * 2a 時点では「払出 → モード移行抽せん → 集計」のみ。前兆(2b)・背景(2c)・AT(2d)の
 * 進行は該当サブステップで順序スロットへ挿入する。
 */
export function advanceGame(state: GameState, input: GameInput, rng: Rng): AdvanceResult {
  const events: GameEvent[] = [];

  // 1. 払出計算(前ゲームがリプレイなら BET 不要 = 投入 0)
  const payout = calcPayout(input.displayedRole, !state.replayCarry, input.bellSuccess ?? false);

  // 2. モード移行抽せん(本前兆滞在中の停止・ハズレ維持は drawModeTransition 内で処理)
  let mode = state.mode;
  if (modeLotteryActive(state.phase)) {
    const next = drawModeTransition(rng, state.mode, input.wonRole);
    if (next !== state.mode) {
      events.push({ type: 'MODE_CHANGE', from: state.mode, to: next, trigger: input.wonRole });
      if (next === 'HONZENCHO') {
        events.push({ type: 'HONZENCHO_ENTER', trigger: input.wonRole });
      }
      mode = next;
    }
  }

  // 3. 偽前兆突入抽せん + 前兆スケジュール開始(2b で実装)
  // 4. 前兆 / 連続演出 / AT の進行・解決(2b・2d で実装)
  // 5. 背景移行(予約契機の発火・30G 契機・カウンタリセット。2c で実装)

  // 6. 集計
  const nextState: GameState = {
    ...state,
    mode,
    backgroundGames: state.backgroundGames + 1,
    totalGames: state.totalGames + 1,
    netCoins: state.netCoins + payout.net,
    replayCarry: payout.isReplay,
  };

  return {
    state: nextState,
    events,
    wonRole: input.wonRole,
    displayedRole: input.displayedRole,
    payout,
  };
}
