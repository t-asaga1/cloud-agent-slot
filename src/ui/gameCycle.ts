/**
 * 遊技サイクル(STEP 3a): 1 ゲームの UI 内部進行のうち「回転 → 停止ボタンで
 * 1 リールずつ停止 → 全停止」を扱う React 非依存の純ロジック。
 *
 * 1G の流れ(役抽せん・`advanceGame` の呼び出しは App 側):
 * レバー待ち → レバーオン(役抽せん + `startSpin`)→ 全リール回転 →
 * 停止ボタンで 1 リールずつ停止(押下瞬間に中段にあるコマ = 押下位置 →
 * `pressStop` が `resolveStop` を呼ぶ)→ 全停止(`finishSpin` で表示判定)→
 * `advanceGame` で状態進行 → レバー待ちへ戻る。
 *
 * # 押し順の確定(対話式停止)
 *
 * 押し順は「停止ボタンを押した順」で確定する(SPEC・ROADMAP STEP 3 全体設計)。
 * 第一停止の時点では残り 2 リールをどの順で押すかが未確定のため、`resolveStop` へ
 * 渡す押し順は「押した順 + 未停止リールの左→右昇順」で仮確定する
 * (`provisionalPushOrder`)。第二停止以降は全順序が確定する。
 * 押し順ベルの停止形は第一停止のリールだけで決まる(`reel.ts` の `bellTargetFor` が
 * pushOrder[0] のみ参照)ため仮確定の影響を受けない。残り 2 リールの順序の仮確定が
 * 出目の合法性(スベリ 4 コマ以内 / 非当選図柄を揃えない / リプレイ 100% 引き込み /
 * ベルの押し順別停止形 / 取りこぼしはクリーンなハズレ目)を壊さないことは
 * `gameCycle.test.ts` で全役 × 全押し順 6 通り × 全 20³ 押下位置の網羅検証済み。
 *
 * # 押し順ベルの左第一「こぼし」(確定 35)
 *
 * ベル当選時の 1/13 抽せん(揃い / こぼし)はレバーオン時に App 側で行い、
 * `startSpin` の `bellMiss` で受け取ってサイクル中保持する(第一停止まで押し順が
 * 未確定のため、左第一で押されたときだけ `resolveStop` 経由で停止制御に効く)。
 *
 * # 回転の時間モデル
 *
 * リールは下方向回転(コマ位置は時間とともに増加)で、回転速度は
 * `SPIN_MS_PER_REV`(約 750ms/周 = 実機の約 80rpm 相当。ROADMAP 実装デフォルト 1)。
 * 「回転開始からの経過時間 → 現在中段にあるコマ」は `spinningPosition` で求める
 * (滑らかなスクロール描画とスベリの視覚化は STEP 3b。3a はコマ送り表示)。
 */
import {
  KOMA_COUNT,
  REEL_COUNT,
  REEL_INDEXES,
  judgeDisplayDetail,
  resolveStop,
  type PushOrder,
  type ReelIndex,
  type SpinResult,
  type StopPositions,
} from '../core/reel';
import type { Role } from '../core/roles';

/** リール回転速度: 1 周(20 コマ)あたりのミリ秒(実機の約 80rpm 相当。調整可) */
export const SPIN_MS_PER_REV = 750;

/** 1 コマ進むのにかかるミリ秒 */
export const SPIN_MS_PER_KOMA = SPIN_MS_PER_REV / KOMA_COUNT;

/**
 * 回転開始位置と経過時間から、現在中段にあるコマ位置を求める。
 * リールは下方向回転のため位置は時間とともに増加する(上段のコマが中段へ降りてくる)。
 */
export function spinningPosition(startPosition: number, elapsedMs: number): number {
  const advanced = Math.floor(Math.max(0, elapsedMs) / SPIN_MS_PER_KOMA);
  const start = ((startPosition % KOMA_COUNT) + KOMA_COUNT) % KOMA_COUNT;
  return (start + advanced) % KOMA_COUNT;
}

/** 回転中の 1 ゲーム(レバーオン〜全停止)の進行状態 */
export interface SpinCycle {
  /** このゲームの内部当選役(レバーオン時に確定) */
  readonly wonRole: Role;
  /** 押し順ベルの左第一こぼし抽せん結果(レバーオン時に確定 = 確定 35。ベル当選時のみ意味を持つ) */
  readonly bellMiss: boolean;
  /** 停止ボタンを押した順(確定分。長さ 0〜3) */
  readonly pressed: readonly ReelIndex[];
  /** 各リールの押下位置(押下瞬間に中段にあったコマ。未停止は undefined) */
  readonly pushPositions: readonly (number | undefined)[];
  /** 各リールの停止位置(中段のコマ番号。未停止は undefined) */
  readonly stopped: readonly (number | undefined)[];
}

/** レバーオン: 全リール回転開始(押下・停止とも未確定の初期サイクル) */
export function startSpin(wonRole: Role, bellMiss = false): SpinCycle {
  return {
    wonRole,
    bellMiss,
    pressed: [],
    pushPositions: [undefined, undefined, undefined],
    stopped: [undefined, undefined, undefined],
  };
}

/**
 * `resolveStop` へ渡す押し順の仮確定:
 * 押した順(pressed + 今回押した reel)+ 未停止リールの左→右昇順。
 * 第二停止以降は実際の押し順と完全に一致する(未確定は第一停止時の残り 2 リールのみ)。
 */
export function provisionalPushOrder(pressed: readonly ReelIndex[], reel: ReelIndex): PushOrder {
  const rest = REEL_INDEXES.filter((r) => r !== reel && !pressed.includes(r));
  return [...pressed, reel, ...rest] as unknown as PushOrder;
}

/**
 * 停止ボタン押下: リール reel を押下位置 pushPosition(押下瞬間に中段にあったコマ)で
 * 停止し、進行後のサイクルを返す。停止済みリールへの押下は無視(同じサイクルを返す)。
 */
export function pressStop(cycle: SpinCycle, reel: ReelIndex, pushPosition: number): SpinCycle {
  if (cycle.stopped[reel] !== undefined) return cycle;
  const push = ((pushPosition % KOMA_COUNT) + KOMA_COUNT) % KOMA_COUNT;
  const order = provisionalPushOrder(cycle.pressed, reel);
  const position = resolveStop(reel, push, cycle.wonRole, cycle.stopped, order, cycle.bellMiss);
  const stopped = cycle.stopped.slice();
  stopped[reel] = position;
  const pushPositions = cycle.pushPositions.slice();
  pushPositions[reel] = push;
  return {
    wonRole: cycle.wonRole,
    bellMiss: cycle.bellMiss,
    pressed: [...cycle.pressed, reel],
    pushPositions,
    stopped,
  };
}

/** 全リール停止済みか(true なら `finishSpin` で表示判定へ進める) */
export function isAllStopped(cycle: SpinCycle): boolean {
  return cycle.pressed.length === REEL_COUNT;
}

/**
 * 全停止後の表示判定。`resolveSpin` と同じ形(`SpinResult`)を返すため、
 * `advanceGame` への入力(displayedRole)と UI 表示(lines)へそのまま使える。
 */
export function finishSpin(cycle: SpinCycle): SpinResult {
  if (!isAllStopped(cycle)) {
    throw new Error(`全リール停止前に finishSpin が呼ばれた(pressed=${cycle.pressed})`);
  }
  const positions = cycle.stopped as StopPositions;
  const detail = judgeDisplayDetail(positions, cycle.wonRole);
  return {
    positions,
    displayed: detail.role,
    lines: detail.lines,
  };
}
