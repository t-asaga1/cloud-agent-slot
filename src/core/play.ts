import { drawRole } from './lottery';
import {
  KOMA_COUNT,
  PUSH_ORDERS,
  resolveSpin,
  type PushOrder,
  type SpinResult,
} from './reel';
import type { Rng } from './rng';
import type { Role } from './roles';
import { advanceGame, isNaviActive, type AdvanceResult, type GameState } from './state';

/**
 * ヘッドレス 1 ゲーム実行(STEP 2e)。
 * 役抽せん(`drawRole`)+ 打ち方ポリシー(確定 26)+ リール制御(`resolveSpin`)+
 * ステートマシン(`advanceGame`)を繋ぐ。UI(STEP 2f)とシミュレーション
 * (`simulate.ts`)で共用する。
 *
 * # 打ち方ポリシー(確定 26)
 *
 * - 通常時: 左第一・適当押し(押下位置は全リール一様ランダム)。
 *   チェリー・スイカ・リーチ目はタイミング押し依存のため取りこぼしあり。
 * - AT 中(`isNaviActive`): ナビ遵守。押し順ベルはナビの押し順(中第一 = 斜め揃い
 *   13 枚)に従う。ベル以外はナビなし = 左第一・適当押しのまま(レア役の
 *   取りこぼしは通常時と同様に発生する)。
 *
 * # 乱数の消費順序(1 ゲームあたり)
 *
 * 役抽せん(1)→ 押下位置(3。左・中・右の順)→ `advanceGame` 内部の各抽せん。
 * `playGame` はこの順序で単一の `rng` を消費する(固定シードで完全再現可能)。
 */

/** 通常時の押し順 = 左第一の順押し(確定 26) */
export const NORMAL_PUSH_ORDER: PushOrder = PUSH_ORDERS[0];

/**
 * AT 中の押し順ベルのナビ押し順(= 中第一)。
 * 押し順正解 = 中・右第一の斜め揃い 13 枚(`reel.ts` の bellTarget 参照)。
 * ナビの押し順表示自体は演出の領分のため、シミュレーションでは中第一に固定する
 * (正解 4 通りのどれでも払出は同じ 13 枚)。
 */
export const NAVI_PUSH_ORDER: PushOrder = PUSH_ORDERS[2];

/** 打ち方ポリシーが決めた 1 ゲーム分の操作(押し順 + 押下位置) */
export interface PushDecision {
  pushOrder: PushOrder;
  pushPositions: [number, number, number];
}

/**
 * 打ち方ポリシー(確定 26): 通常時 = 左第一・適当押し / AT 中のベル = ナビ遵守。
 * 押下位置は左・中・右の順に乱数 3 個を消費する(押し順によらず固定)。
 */
export function decidePush(state: GameState, wonRole: Role, rng: Rng): PushDecision {
  const pushPositions: [number, number, number] = [
    rng.nextInt(KOMA_COUNT),
    rng.nextInt(KOMA_COUNT),
    rng.nextInt(KOMA_COUNT),
  ];
  const pushOrder =
    isNaviActive(state) && wonRole === 'BELL' ? NAVI_PUSH_ORDER : NORMAL_PUSH_ORDER;
  return { pushOrder, pushPositions };
}

/** `playGame` の結果 = `advanceGame` の結果 + このゲームのリール操作・停止結果 */
export interface PlayResult extends AdvanceResult {
  /** リール停止結果(停止位置・表示役・揃ったライン・押し順ベル正否) */
  spin: SpinResult;
  /** 打ち方ポリシーが選んだ操作(押し順・押下位置) */
  push: PushDecision;
}

/**
 * 1 ゲームをヘッドレスで実行する(レバーオン 1 回分)。
 * @param forcedRole 内部当選役の強制指定(テスト・デモ用。省略時は `drawRole` で抽せん)。
 *   強制時は役抽せんの乱数を消費しない。
 */
export function playGame(state: GameState, rng: Rng, forcedRole?: Role): PlayResult {
  const wonRole = forcedRole ?? drawRole(rng);
  const push = decidePush(state, wonRole, rng);
  const spin = resolveSpin(wonRole, push.pushPositions, push.pushOrder);
  const result = advanceGame(
    state,
    { wonRole, displayedRole: spin.displayed, bellSuccess: spin.bellSuccess },
    rng,
  );
  return { ...result, spin, push };
}
