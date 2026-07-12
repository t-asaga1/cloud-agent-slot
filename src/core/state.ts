import {
  BACKGROUND_ELAPSED_GAMES,
  drawBackgroundTransition,
  drawInitialBackground,
  type Background,
  type BackgroundTrigger,
} from './background';
import {
  BATTLE_PART_GAMES,
  drawBattleContinue,
  drawContinueRate,
  drawSetContinue,
  drawVStock,
  KOYAKU_PART_GAMES,
  RENCHAN_LIMIT,
  UPPER_AT_CONTINUE_RATE,
} from './at';
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
 * 2d 時点の実装範囲: 1〜6 すべて(2b = 前兆管理、2c = 背景移行、2d = AT 管理)。
 * 残りは 2e(打ち方ポリシーとの結合ラッパー + シミュレーション)・2f(UI 連動)。
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
 *
 * # 背景移行の実装規約(2c で確定。確定 24・25 準拠)
 *
 * - スロット 5 で発火するのは「ゲーム開始時点の予約」= `state.pendingBackgroundTrigger`
 *   (契機 2/3/4)。発火と同時に消化し、スロット 3・4 がこのゲームで設定した新予約が
 *   次ゲームの発火対象になる(例: 連続演出失敗(FAKE_OMEN_FAIL 予約)の次ゲームで新たに
 *   偽前兆へ当せんした場合、このゲームで FAKE_OMEN_FAIL を発火しつつ FAKE_OMEN_NEXT を
 *   次ゲームへ予約する)。
 * - 優先順位: 予約契機(2/3/4)> 30G 経過(契機 1 = ELAPSED)(確定 25)。同一ゲームで
 *   重なった場合は予約契機のみ抽せんし、カウンタリセットで 30G 側も消化される。
 *   予約契機同士の衝突は構造上起こらない(予約スロットは 1 つで、同一ゲームに 2 つの
 *   予約を設定する分岐が存在しない)。
 * - 契機 1(ELAPSED)は「このゲームが通常時(ゲーム開始・終了ともフェーズ NORMAL)」の
 *   ときのみ有効: 前兆中(偽・本・連続演出。当せんゲーム・解決ゲームを含む)は停止 =
 *   確定 25、AT・エンディング中は背景移行自体が停止 = 確定 11。判定は
 *   `backgroundGames + 1 >= BACKGROUND_ELAPSED_GAMES`(このゲームが同一背景 30G 目以降。
 *   停止期間中にカウンタが 30 を超えて持ち越された場合も次の通常ゲームで発火する)。
 * - 背景移行抽せんを実施したら、結果が自背景(= 維持)でもカウンタをリセット(確定 24)。
 *   `BACKGROUND_CHANGE` イベントは背景が実際に変わったときのみ発行する。
 * - 抽せんに使う滞在モードは当ゲームのモード移行(スロット 2)後の値。偽→本書き換えと
 *   契機 2 の発火が同一ゲームで重なった稀ケース(偽前兆当せんの次ゲームで本前兆へ移行)は、
 *   モード HONZENCHO に契機 2 のテーブルが存在しないため背景維持(乱数消費なし)で
 *   カウンタのみリセットする(実装解釈。背景の前兆感は契機 2 発火予定だった演出上の穴に
 *   なるが、極めて稀なうえ確定 21(d) の「書き換えで背景を動かさない」とも整合)。
 * - AT 中(上位含む)・エンディング中に予約契機は存在し得ない(予約の設定元はすべて
 *   通常フェーズか連続演出の解決で、いずれも次ゲームに消化されるため)。AT 終了時の
 *   モード・背景再抽せん(2d)では `backgroundGames` を 0 へリセットする(実装済み)。
 *
 * # AT 管理の実装規約(2d で確定。SPEC「7.」「8.」+ 確定 11・12・27 準拠)
 *
 * - タイムライン: 連続演出成功ゲーム(RENZOKU_RESULT success)で `drawContinueRate` を
 *   抽せんし `AT { partGame: 0 }` + `AT_START` イベント。次ゲームが小役パート 1G 目。
 *   小役 10G → バトル 8G の順(確定 27)で、パート切替・セット継続も partGame: 0 を
 *   経由せず「次ゲームが次パート 1G 目」として直接進む(小役 10G 目の次ゲームが
 *   バトル 1G 目、バトル 8G 目(継続)の次ゲームが次セット小役 1G 目)。
 * - 毎ゲームの抽せん(スロット 4): リプレイ・レア役も 1G 消化(確定 27)。
 *   小役パート = 成立役で V ストック抽せん(`drawVStock`。複数ストック可 = 確定 11)。
 *   バトルパート = 継続未確定なら成立役で継続抽せん(`drawBattleContinue`)/
 *   継続確定済みなら V ストック抽せん(確定 11)。
 * - バトル開始時(バトル 1G 目の冒頭・成立役の抽せんより先): まず継続率で継続抽せん
 *   (`drawSetContinue`)。当せんなら継続確定(V ストックは温存)。漏れた場合は
 *   V ストックが 1 個以上あれば 1 個消費して継続確定(**消費規則の実装決定**:
 *   継続率抽せん → 漏れたらストック消費、の順。SPEC「まず継続率に沿って継続抽選 →
 *   漏れていた場合、小役による継続抽選」の間へ挟む解釈)。どちらも漏れたら未確定のまま
 *   バトル中の小役継続抽せんに委ねる。
 * - バトル 8G 目の解決(成立役の抽せんの後): 継続確定なら連チャン数 +1 して次セットへ
 *   (`AT_SET_CONTINUE`)。未確定なら敗北 = AT 終了(上位 AT でも即終了 = 確定 12)。
 * - 10 連(確定 11・12。**実装解釈**): 連チャン数(renchan)が 10(`RENCHAN_LIMIT`)の
 *   セットは「必ず移行」= バトル開始時の継続抽せん・ストック消費なし・バトル中も
 *   継続確定扱い(V ストック抽せん)で、8G 目の解決で通常 AT → 上位 AT
 *   (`UPPER_AT_ENTER`。連チャン数 1 へリセット・継続率 0.93 固定・V ストックは持越し)/
 *   上位 AT → エンディング(`ENDING_START`)。つまり 10 連目のセット自体は現階層で
 *   遊技し、その終了時に必ず移行する(バトル敗北で 10 連目に到達できないことはある)。
 * - エンディング: `ENDING { game: 0 }` で開始し次ゲームが 1G 目。`ENDING_GAMES`(暫定 1)
 *   消化ゲームで AT 終了処理(演出尺は STEP 4 で確定するまで 1G の暫定値)。
 *   エンディング中は各種抽せんなし(モード・背景・偽前兆・V ストックとも停止)。
 * - AT 終了処理(バトル敗北 or エンディング終了のゲーム内で実施):
 *   `drawInitialMode('AT_END')` → `drawInitialBackground` の順に再抽せんして通常へ。
 *   `backgroundGames` は 0 へリセット。再抽せんの結果が本前兆なら `initGameState` と
 *   同様にその場で本前兆スケジュールを抽せんし、次ゲームが前兆 1G 目(契機 4 の予約は
 *   しない。背景は HONZENCHO 用初期テーブルで抽せん済みのため)。`AT_END` イベントに
 *   再抽せん後のモード・背景を載せる(`BACKGROUND_CHANGE` イベントは発行しない =
 *   移行契機 4 種の抽せんではないため)。
 * - 乱数の消費順序(AT 関連): [連続演出成功 G] 継続率 → [小役パート] V ストック →
 *   [バトル 1G 目] セット継続 → 成立役の継続/V ストック → [終了 G] モード → 背景 →
 *   (本前兆なら)前兆 G 数 → 連続演出種別。
 * - 押し順ナビ: AT 中(上位含む)は全ゲームナビあり。`isNaviActive(state)` で導出する
 *   (2e の打ち方ポリシー用。状態には持たない)。
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
 * AT / 上位 AT(セット継続型)。
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

/**
 * エンディング(上位 AT 10 連 = 確定 12)。開始ゲームは game: 0 で、次ゲームが 1G 目。
 * `ENDING_GAMES` 消化ゲームで AT 終了処理(「AT 終了後」テーブルでモード・背景再抽せん)。
 */
export interface EndingPhase {
  type: 'ENDING';
  /** 経過 G(開始ゲームは 0。次ゲームが 1G 目) */
  game: number;
}

/**
 * エンディングのゲーム数(暫定 1G)。
 * エンディングムービーの尺・演出は STEP 4 で確定するまでの暫定値(ヘッダー「AT 管理の実装規約」参照)。
 */
export const ENDING_GAMES = 1;

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
   * 背景移行抽せんの実施ゲームで 0 へリセット(自背景維持でもリセット = 確定 24)、
   * それ以外は毎 G インクリメント。AT 終了時の背景再抽せん(2d)でもリセットすること。
   */
  backgroundGames: number;
  /** 現在のフェーズ(通常 / 前兆 / 連続演出 / AT / エンディング) */
  phase: Phase;
  /**
   * 「次ゲーム」で効く背景移行契機の予約(確定 19)。
   * スロット 3・4 が偽前兆当せん(FAKE_OMEN_NEXT)・本前兆移行(HONZENCHO_NEXT)・
   * 連続演出失敗(FAKE_OMEN_FAIL)で設定し、次ゲームのスロット 5 が発火・消化する。
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
 * RENZOKU_START / RENZOKU_RESULT。2c: BACKGROUND_CHANGE。
 * 2d: AT_START / V_STOCK_GAIN / AT_SET_CONTINUE / UPPER_AT_ENTER / ENDING_START / AT_END。
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
    }
  | {
      /**
       * 背景移行(確定 24・25)。抽せんで背景が実際に変わったときのみ発行
       * (自背景維持のときはイベントなし。カウンタリセットは維持でも行う)。
       */
      type: 'BACKGROUND_CHANGE';
      trigger: BackgroundTrigger;
      from: Background;
      to: Background;
    }
  | {
      /** AT 当選確定 = 連続演出成功ゲームに発行(AT 1G 目は次ゲーム)。継続率抽せん済み */
      type: 'AT_START';
      continueRate: number;
    }
  | {
      /** V ストック獲得(小役パート / バトルパート継続確定後 = 確定 11) */
      type: 'V_STOCK_GAIN';
      trigger: Role;
      /** 獲得後のストック数 */
      vStock: number;
    }
  | {
      /** セット継続(バトル 8G 目の解決で継続確定していた)。次ゲームが次セット小役 1G 目 */
      type: 'AT_SET_CONTINUE';
      tier: AtTier;
      /** 継続後の連チャン数 */
      renchan: number;
    }
  | {
      /** 通常 AT 10 連目の終了で上位 AT へ(連チャン数リセット・継続率 0.93 固定 = 確定 12) */
      type: 'UPPER_AT_ENTER';
    }
  | {
      /** 上位 AT 10 連目の終了でエンディングへ(確定 12)。次ゲームがエンディング 1G 目 */
      type: 'ENDING_START';
    }
  | {
      /**
       * AT 終了(バトル敗北 or エンディング終了)。「AT 終了後」テーブルでモード・背景を
       * 再抽せん済み(`mode` / `background` は再抽せん後の値。`BACKGROUND_CHANGE` は発行しない)。
       */
      type: 'AT_END';
      reason: 'DEFEAT' | 'ENDING';
      mode: Mode;
      background: Background;
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
 * 連続演出成功時の AT 突入(継続率をここで抽せん = SPEC「7.」)。
 * partGame: 0 = 次ゲームが AT 小役パート 1G 目(確定 19)。初回セット = 1 連目(確定 11)。
 */
function enterAt(rng: Rng): AtPhase {
  return {
    type: 'AT',
    tier: 'NORMAL',
    part: 'KOYAKU',
    partGame: 0,
    renchan: 1,
    continueRate: drawContinueRate(rng),
    vStock: 0,
    continueConfirmed: false,
  };
}

/** AT 中の押し順ナビ(全ナビ = 確定 26)が有効か。2e の打ち方ポリシーはこれで分岐する */
export function isNaviActive(state: GameState): boolean {
  return state.phase.type === 'AT';
}

/**
 * AT 中の 1 ゲーム進行(ヘッダー「AT 管理の実装規約」参照)。
 * パート進行(小役 10G → バトル 8G = 確定 27)→ バトル開始時の継続処理 →
 * 成立役の V ストック / 継続抽せん(確定 11)→ バトル 8G 目の解決、の順。
 * @param finishAt バトル敗北時の AT 終了処理(モード・背景の再抽せんを行う)
 */
function advanceAt(
  phase: AtPhase,
  wonRole: Role,
  rng: Rng,
  events: GameEvent[],
  finishAt: (reason: 'DEFEAT' | 'ENDING') => Phase,
): Phase {
  let { part, partGame, vStock, continueConfirmed } = phase;
  /** 10 連目のセットは「必ず移行」(確定 11・12 の実装解釈。実装規約参照) */
  const guaranteed = phase.renchan >= RENCHAN_LIMIT;

  if (part === 'KOYAKU' && partGame >= KOYAKU_PART_GAMES) {
    // 小役 10G 消化済み → このゲームがバトル 1G 目。
    // バトル開始時の継続処理: 継続率で継続抽せん(当せんなら V ストック温存)→
    // 漏れたら V ストック 1 個消費で継続確定 → どちらも漏れたら未確定のまま
    part = 'BATTLE';
    partGame = 1;
    if (guaranteed) {
      continueConfirmed = true;
    } else if (drawSetContinue(rng, phase.continueRate)) {
      continueConfirmed = true;
    } else if (vStock > 0) {
      vStock -= 1;
      continueConfirmed = true;
    }
  } else {
    partGame += 1;
  }

  // 成立役の抽せん(確定 11): 小役パート / バトル継続確定済み = V ストック抽せん、
  // バトル継続未確定 = 小役による継続抽せん(テーブルは同一)
  if (part === 'KOYAKU' || continueConfirmed) {
    if (drawVStock(rng, wonRole)) {
      vStock += 1;
      events.push({ type: 'V_STOCK_GAIN', trigger: wonRole, vStock });
    }
  } else if (drawBattleContinue(rng, wonRole)) {
    continueConfirmed = true;
  }

  if (part === 'BATTLE' && partGame >= BATTLE_PART_GAMES) {
    // バトル 8G 目の解決
    if (guaranteed) {
      if (phase.tier === 'NORMAL') {
        // 通常 AT 10 連 → 上位 AT(連チャン数リセット・継続率 0.93 固定・V ストック持越し)
        events.push({ type: 'UPPER_AT_ENTER' });
        return {
          type: 'AT',
          tier: 'UPPER',
          part: 'KOYAKU',
          partGame: 0,
          renchan: 1,
          continueRate: UPPER_AT_CONTINUE_RATE,
          vStock,
          continueConfirmed: false,
        };
      }
      // 上位 AT 10 連 → エンディング(次ゲームが 1G 目)
      events.push({ type: 'ENDING_START' });
      return { type: 'ENDING', game: 0 };
    }
    if (continueConfirmed) {
      const renchan = phase.renchan + 1;
      events.push({ type: 'AT_SET_CONTINUE', tier: phase.tier, renchan });
      return { ...phase, part: 'KOYAKU', partGame: 0, renchan, vStock, continueConfirmed: false };
    }
    // バトル敗北 = AT 終了(上位 AT でも即終了 = 確定 12)
    return finishAt('DEFEAT');
  }

  return { ...phase, part, partGame, vStock, continueConfirmed };
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
 * 1 ゲームを進める(レバーオン 1 回分)。ヘッダーコメントの処理順序に従う:
 * 「払出 → モード移行抽せん → 偽前兆突入・前兆スケジュール → 前兆/連続演出/AT/
 * エンディングの進行・解決 → 背景移行 → 集計」。
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
  /**
   * このゲームで新規に設定する「次ゲーム」契機の予約(発火は次ゲームのスロット 5)。
   * ゲーム開始時点の予約(state.pendingBackgroundTrigger)はこのゲームのスロット 5 で
   * 発火・消化するため、別変数で持つ。
   */
  let reservedTrigger: BackgroundTrigger | null = null;
  /** このゲームで前兆スケジュールを新規開始したか(同一ゲーム内でスロット 4 の進行はしない) */
  let scheduledThisGame = false;
  if (movedToHonzencho) {
    if (phase.type === 'NORMAL') {
      // 本前兆へのモード移行: 前兆スケジュール開始 + 次ゲームの背景移行(契機 4)を予約
      phase = scheduleOmen(rng, 'REAL');
      reservedTrigger = 'HONZENCHO_NEXT';
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
      reservedTrigger = 'FAKE_OMEN_NEXT';
      scheduledThisGame = true;
      events.push({
        type: 'FAKE_OMEN_ENTER',
        trigger: input.wonRole,
        totalGames: phase.totalGames,
        renzoku: phase.renzoku,
      });
    }
  }

  // 4. 前兆 / 連続演出 / AT / エンディングの進行・解決
  /** AT 終了処理を行ったゲームの再抽せん後背景(スロット 5・6 が背景の確定・カウンタリセットに使う) */
  let atEndBackground: Background | null = null;
  /**
   * AT 終了処理(ヘッダー「AT 管理の実装規約」参照): 「AT 終了後」テーブルでモードを
   * 再抽せん → 背景を再抽せんして通常へ。本前兆ならその場で本前兆スケジュール開始
   * (次ゲームが前兆 1G 目。契機 4 の予約はしない = `initGameState` と同じ解釈)。
   */
  const finishAt = (reason: 'DEFEAT' | 'ENDING'): Phase => {
    mode = drawInitialMode(rng, 'AT_END');
    atEndBackground = drawInitialBackground(rng, mode);
    events.push({ type: 'AT_END', reason, mode, background: atEndBackground });
    return mode === 'HONZENCHO' ? scheduleOmen(rng, 'REAL') : { type: 'NORMAL' };
  };
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
          // AT 当選(次ゲームから AT 小役パート 1G 目)。継続率をここで抽せん
          phase = enterAt(rng);
          events.push({ type: 'AT_START', continueRate: phase.continueRate });
        } else {
          // 偽前兆の演出失敗 → 通常へ戻り、次ゲームの背景移行(契機 3)を予約
          phase = { type: 'NORMAL' };
          reservedTrigger = 'FAKE_OMEN_FAIL';
        }
      }
    } else if (phase.type === 'AT') {
      phase = advanceAt(phase, input.wonRole, rng, events, finishAt);
    } else if (phase.type === 'ENDING') {
      const game = phase.game + 1;
      if (game < ENDING_GAMES) {
        phase = { ...phase, game };
      } else {
        // エンディング最終 G = AT 終了処理(確定 12: エンディング後は「AT 終了後」テーブル)
        phase = finishAt('ENDING');
      }
    }
  }

  // 5. 背景移行(ヘッダー「背景移行の実装規約」参照。確定 24・25)
  //    優先順位: ゲーム開始時点の予約契機(2/3/4)> 30G 経過(契機 1)。
  //    契機 1 はこのゲームが通常時(開始・終了ともフェーズ NORMAL)のときのみ有効
  //    (前兆中は停止 = 確定 25 / AT・エンディング中は背景移行自体が停止 = 確定 11。
  //    AT 中に予約契機は構造上存在し得ない)。
  //    AT 終了ゲーム(atEndBackground あり)は「AT 終了後」テーブルで再抽せん済みのため
  //    移行契機の抽せんは行わない(予約なし・ELAPSED も開始フェーズ AT/ENDING で対象外)。
  const backgroundTrigger: BackgroundTrigger | null =
    state.pendingBackgroundTrigger ??
    (state.phase.type === 'NORMAL' &&
    phase.type === 'NORMAL' &&
    state.backgroundGames + 1 >= BACKGROUND_ELAPSED_GAMES
      ? 'ELAPSED'
      : null);
  let background = state.background;
  if (atEndBackground !== null) {
    background = atEndBackground;
  } else if (backgroundTrigger !== null) {
    background = drawBackgroundTransition(rng, mode, backgroundTrigger, state.background);
    if (background !== state.background) {
      events.push({
        type: 'BACKGROUND_CHANGE',
        trigger: backgroundTrigger,
        from: state.background,
        to: background,
      });
    }
  }

  // 6. 集計(背景カウンタは抽せん実施ゲームでリセット。自背景維持でもリセット = 確定 24。
  //    AT 終了ゲームも背景再抽せん済みのためリセット)
  const nextState: GameState = {
    ...state,
    mode,
    background,
    phase,
    pendingBackgroundTrigger: reservedTrigger,
    backgroundGames:
      backgroundTrigger !== null || atEndBackground !== null ? 0 : state.backgroundGames + 1,
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
