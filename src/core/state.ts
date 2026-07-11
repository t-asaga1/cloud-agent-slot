import { drawInitialBackground, type Background, type BackgroundTrigger } from './background';
import { drawFakeOmen, drawInitialMode, drawModeTransition, type Mode } from './mode';
import {
  drawOmenGames,
  drawRenzoku,
  RENZOKU_GAMES,
  type OmenKind,
  type RenzokuKind,
} from './omen';
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
 * 2b 時点の実装範囲: 1〜4・6(前兆管理 = 偽前兆突入・前兆スケジュール・連続演出・偽→本書き換え・解決)。
 * 5(背景移行)は 2c、AT の進行(スロット 4 の AT 部分)は 2d。連続演出成功時の AT 突入は
 * スタブ(`atStubPhase`。継続率抽せん・セット進行は 2d)。
 *
 * # 前兆タイムラインの実装規約(2b で確定。確定 18〜23 準拠)
 *
 * - `advanceGame` の返り値 `state.phase` は「そのゲームがどのフェーズ・何 G 目だったか」を表す
 *   (演出層は毎 G の `AdvanceResult` を参照する = 確定 28)。
 * - 当せんゲーム(スロット 3 で前兆スケジュール開始)は `OMEN { game: 0 }` で返し、
 *   次ゲームのスロット 4 で `game: 1`(= 前兆 1G 目 = 確定 18)へ進む。同一ゲーム内で
 *   スケジュール開始と進行の両方は行わない。
 * - 前兆 G 数(`totalGames`)消化後の次ゲームが連続演出 1G 目(`RENZOKU_START`)。
 *   連続演出 4G 目(`RENZOKU_GAMES`)に成否告知(`RENZOKU_RESULT`)し、同ゲームの返り state で
 *   本 = AT スタブフェーズ(partGame: 0。次 G から AT 1G 目 = 確定 19)/
 *   偽 = NORMAL へ戻し `FAKE_OMEN_FAIL` を予約(次 G に背景移行 = 契機 3)。
 * - 偽→本書き換え(確定 21)はスロット 3 で行う: kind のみ FAKE → REAL に書き換え、
 *   前兆 G 数・経過 G・連続演出種別は引き継ぐ(a・b)。連続演出中(最終 G 含む)も有効で、
 *   スロット 4 の解決が書き換え後の kind を見るため進行中の演出がそのまま成功する(c)。
 *   背景移行契機 4(HONZENCHO_NEXT)は予約しない(d)。
 * - 前兆中(OMEN・RENZOKU)の新規偽前兆当せんは「無視」= 抽せん自体を行わない(確定 22。
 *   挙動として等価)。本前兆(REAL)中はモードが HONZENCHO のためモード移行抽せんも
 *   `drawModeTransition` 内で停止する(確定 9・23 の「本は停止」)。
 * - 乱数の消費順序: モード移行 → 偽前兆突入率(1/10 グループのみ)→ 前兆 G 数 → 連続演出種別。
 * - `initGameState` で初期モードが本前兆(0.0132)の場合はその場で本前兆スケジュールを抽せんし、
 *   最初のゲームが前兆 1G 目になる(「当せん」= 初期抽せんと解釈。背景は HONZENCHO 用の
 *   初期テーブルで抽せん済みのため契機 4 の予約はしない)。
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
 * 前兆(偽・本)7〜10G。
 * - `kind`: FAKE = 偽前兆(モードと共存)/ REAL = 本前兆(モード HONZENCHO)
 * - `game`: 経過 G(当せんゲームは 0。当せんの次ゲームが 1G 目 = 確定 18)
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
 * 連続演出 4G(前兆 G 数消化後に発展 = 確定 19)。
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
  /** パート内の経過 G(AT 突入(連続演出成功)ゲームは 0。次ゲームが 1G 目) */
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
 * 2a: MODE_CHANGE / HONZENCHO_ENTER。2b: FAKE_OMEN_ENTER / OMEN_REWRITE /
 * RENZOKU_START / RENZOKU_RESULT。
 * 以後のサブステップでユニオンへ追加予定(骨格は変えない):
 * - 2c: BACKGROUND_CHANGE(背景移行。契機付き)
 * - 2d: AT_START / AT_SET_CONTINUE / V_STOCK_GAIN / UPPER_AT_ENTER / ENDING_START / AT_END
 */
export type GameEvent =
  | { type: 'MODE_CHANGE'; from: Mode; to: Mode; trigger: Role }
  | {
      /** 本前兆へのモード移行の検出(同ゲームのスロット 3 で前兆スケジュールが始まる) */
      type: 'HONZENCHO_ENTER';
      trigger: Role;
    }
  | {
      /** 偽前兆突入(当せんゲームに発行。前兆 1G 目は次ゲーム = 確定 18) */
      type: 'FAKE_OMEN_ENTER';
      trigger: Role;
      /** 抽せん済みの前兆総 G 数(偽 7〜9) */
      totalGames: number;
      /** 抽せん済みの発展先連続演出(偽 A/B) */
      renzoku: RenzokuKind;
    }
  | {
      /** 偽前兆 → 本前兆の書き換え(確定 21。スケジュール引継ぎ・契機 4 予約なし) */
      type: 'OMEN_REWRITE';
      trigger: Role;
    }
  | {
      /** 連続演出 1G 目への発展(前兆 G 数消化後の次ゲーム = 確定 19) */
      type: 'RENZOKU_START';
      kind: OmenKind;
      renzoku: RenzokuKind;
    }
  | {
      /** 連続演出 4G 目の成否告知(本 = 成功 → 次 G から AT / 偽 = 失敗 → 通常へ = 確定 19) */
      type: 'RENZOKU_RESULT';
      kind: OmenKind;
      renzoku: RenzokuKind;
      success: boolean;
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
 * 前兆スケジュールの抽せん(前兆総 G 数 → 発展連続演出の順に乱数を消費)。
 * 当せんゲーム = game: 0 で開始し、次ゲームが前兆 1G 目(確定 18)。
 */
function scheduleOmen(rng: Rng, kind: OmenKind): OmenPhase {
  const totalGames = drawOmenGames(rng, kind);
  const renzoku = drawRenzoku(rng, kind);
  return { type: 'OMEN', kind, game: 0, totalGames, renzoku };
}

/**
 * 連続演出成功時の AT 突入スタブ(2d で解消)。
 * `continueRate` は AT 移行時抽せん(`drawContinueRate`)ごと 2d で実装するため 0 を置く。
 * partGame: 0 = 次ゲームが AT 小役パート 1G 目(確定 19)。
 */
function atStubPhase(): AtPhase {
  return {
    type: 'AT',
    tier: 'NORMAL',
    part: 'KOYAKU',
    partGame: 0,
    renchan: 1,
    continueRate: 0,
    vStock: 0,
    continueConfirmed: false,
  };
}

/**
 * ゲーム開始時の初期状態を作る。
 * モード初期抽せん(GAME_START テーブル)→ モード別の背景初期抽せん(SPEC「5.」)。
 * 初期モードが本前兆(0.0132)の場合はその場で本前兆スケジュールを抽せんし、
 * 最初のゲームが前兆 1G 目になる(背景は HONZENCHO 用初期テーブルで抽せん済みのため
 * 契機 4(HONZENCHO_NEXT)の予約はしない)。
 */
export function initGameState(rng: Rng): GameState {
  const mode = drawInitialMode(rng, 'GAME_START');
  const background = drawInitialBackground(rng, mode);
  const phase: Phase = mode === 'HONZENCHO' ? scheduleOmen(rng, 'REAL') : { type: 'NORMAL' };
  return {
    mode,
    background,
    backgroundGames: 0,
    phase,
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
 * 2b 時点では「払出 → モード移行抽せん → 偽前兆突入・前兆スケジュール → 前兆/連続演出の
 * 進行・解決 → 集計」。背景移行(2c)・AT の進行(2d)は該当サブステップで順序スロットへ挿入する。
 */
export function advanceGame(state: GameState, input: GameInput, rng: Rng): AdvanceResult {
  const events: GameEvent[] = [];

  // 1. 払出計算(前ゲームがリプレイなら BET 不要 = 投入 0)
  const payout = calcPayout(input.displayedRole, !state.replayCarry, input.bellSuccess ?? false);

  // 2. モード移行抽せん(本前兆滞在中の停止・ハズレ維持は drawModeTransition 内で処理)
  let mode = state.mode;
  let movedToHonzencho = false;
  if (modeLotteryActive(state.phase)) {
    const next = drawModeTransition(rng, state.mode, input.wonRole);
    if (next !== state.mode) {
      events.push({ type: 'MODE_CHANGE', from: state.mode, to: next, trigger: input.wonRole });
      if (next === 'HONZENCHO') {
        events.push({ type: 'HONZENCHO_ENTER', trigger: input.wonRole });
        movedToHonzencho = true;
      }
      mode = next;
    }
  }

  // 3. 偽前兆突入抽せん + 前兆スケジュール開始(偽→本書き換え含む)
  let phase = state.phase;
  let pendingBackgroundTrigger = state.pendingBackgroundTrigger;
  /** このゲームで前兆スケジュールを新規開始したか(同一ゲーム内でスロット 4 の進行はしない) */
  let scheduledThisGame = false;
  if (movedToHonzencho) {
    if (phase.type === 'NORMAL') {
      // 本前兆へのモード移行: 前兆スケジュール開始 + 次ゲームの背景移行(契機 4)を予約
      phase = scheduleOmen(rng, 'REAL');
      pendingBackgroundTrigger = 'HONZENCHO_NEXT';
      scheduledThisGame = true;
    } else if ((phase.type === 'OMEN' || phase.type === 'RENZOKU') && phase.kind === 'FAKE') {
      // 偽→本書き換え(確定 21): kind のみ書き換え、G 数・連続演出種別は引継ぎ(a・b)。
      // 連続演出中も有効(c)。契機 4(HONZENCHO_NEXT)は予約しない(d)。
      phase = { ...phase, kind: 'REAL' };
      events.push({ type: 'OMEN_REWRITE', trigger: input.wonRole });
    }
    // OMEN/RENZOKU(REAL)中はモードが HONZENCHO でモード移行抽せんが停止しているため、
    // movedToHonzencho は発生しない(ここへは来ない)
  } else if (phase.type === 'NORMAL' && mode !== 'HONZENCHO') {
    // 偽前兆突入抽せん。前兆中(OMEN・RENZOKU)の新規当せんは「無視」= 抽せんしない(確定 22)。
    // AT 中・エンディング中も対象外(phase.type === 'NORMAL' のみ)。
    // mode !== 'HONZENCHO': 本前兆滞在中はレア役でもモード移行なし・偽前兆抽せんも不要
    // (確定 9。本前兆に偽前兆を重ねない)。
    if (drawFakeOmen(rng, input.wonRole, false)) {
      phase = scheduleOmen(rng, 'FAKE');
      pendingBackgroundTrigger = 'FAKE_OMEN_NEXT';
      scheduledThisGame = true;
      events.push({
        type: 'FAKE_OMEN_ENTER',
        trigger: input.wonRole,
        totalGames: phase.totalGames,
        renzoku: phase.renzoku,
      });
    }
  }

  // 4. 前兆 / 連続演出の進行・解決(AT の進行は 2d で実装)
  if (!scheduledThisGame) {
    if (phase.type === 'OMEN') {
      if (phase.game < phase.totalGames) {
        // 前兆 G 数の消化(このゲームが前兆 game + 1 G 目)
        phase = { ...phase, game: phase.game + 1 };
      } else {
        // 前兆 G 数消化済み → このゲームが連続演出 1G 目(確定 19)
        events.push({ type: 'RENZOKU_START', kind: phase.kind, renzoku: phase.renzoku });
        phase = { type: 'RENZOKU', kind: phase.kind, renzoku: phase.renzoku, game: 1 };
      }
    } else if (phase.type === 'RENZOKU') {
      const game = phase.game + 1;
      if (game < RENZOKU_GAMES) {
        phase = { ...phase, game };
      } else {
        // 連続演出 4G 目 = 成否告知(確定 19)。スロット 3 の書き換え後の kind で解決する
        // (= 演出最終 G までレア役で本前兆書き換えの可能性あり = 確定 21(c)・23)
        const success = phase.kind === 'REAL';
        events.push({
          type: 'RENZOKU_RESULT',
          kind: phase.kind,
          renzoku: phase.renzoku,
          success,
        });
        if (success) {
          // AT 当選(次ゲームから AT 小役パート 1G 目)。継続率抽せん・セット進行は 2d
          phase = atStubPhase();
        } else {
          // 偽前兆の演出失敗 → 通常へ戻り、次ゲームの背景移行(契機 3)を予約
          phase = { type: 'NORMAL' };
          pendingBackgroundTrigger = 'FAKE_OMEN_FAIL';
        }
      }
    }
  }

  // 5. 背景移行(予約契機の発火・30G 契機・カウンタリセット。2c で実装)
  //    注意(2c 向け): 発火するのは「ゲーム開始時点の予約」= state.pendingBackgroundTrigger。
  //    スロット 3 がこのゲームで設定した新しい予約(ローカル変数の値)は次ゲームで発火する。
  //    例: 連続演出失敗(FAKE_OMEN_FAIL 予約)の次ゲームで新たに偽前兆へ当せんした場合、
  //    このゲームで FAKE_OMEN_FAIL を発火しつつ FAKE_OMEN_NEXT を次ゲームへ予約する。

  // 6. 集計
  const nextState: GameState = {
    ...state,
    mode,
    phase,
    pendingBackgroundTrigger,
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
