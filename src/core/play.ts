import { drawBellMiss, drawRole } from './lottery';
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
 *   押し順ベルは左第一のため 12/13 でこぼし(0 枚)/ 1/13 で上段揃い 13 枚(確定 35)。
 * - AT 中・エンディング中(`isNaviActive`。確定 31): ナビ遵守。押し順ベルはナビの
 *   押し順(正解 4 通り = 中・右第一から均等抽せん = 確定 36。斜め揃い 13 枚)に従う。
 *   ベル以外はナビなし = 左第一・適当押しのまま(レア役の取りこぼしは通常時と
 *   同様に発生する)。
 *
 * # 乱数の消費順序(1 ゲームあたり)
 *
 * 役抽せん(1)→ ベルこぼし抽せん(ベル当選時のみ 1。押し順に依らず消費 = 確定 35)→
 * ナビ押し順抽せん(ナビ中のベル当選時のみ 1 = 確定 36)→
 * 押下位置(3。左・中・右の順)→ `advanceGame` 内部の各抽せん。
 * `playGame` はこの順序で単一の `rng` を消費する(固定シードで完全再現可能)。
 */

/** 通常時の押し順 = 左第一の順押し(確定 26) */
export const NORMAL_PUSH_ORDER: PushOrder = PUSH_ORDERS[0];

/**
 * AT 中の押し順ベルのナビ押し順候補 = 正解 4 通り(確定 36)。
 * 中左右・中右左・右左中・右中左(= 中・右第一)を均等(各 1/4)にナビする。
 * どの押し順でも斜め揃い 13 枚(`reel.ts` の bellTarget 参照)のため出玉への影響はない。
 */
export const NAVI_PUSH_ORDERS: readonly PushOrder[] = [
  PUSH_ORDERS[2], // 中→左→右
  PUSH_ORDERS[3], // 中→右→左
  PUSH_ORDERS[4], // 右→左→中
  PUSH_ORDERS[5], // 右→中→左
];

/**
 * ナビ押し順の抽せん(確定 36): 正解 4 通りから均等に 1 つ選ぶ(乱数 1 個消費)。
 * ナビ中(AT・エンディング)のベル当選時に、レバーオンで 1 回だけ呼ぶこと
 * (ベルこぼし抽せんの直後 = 上記「乱数の消費順序」参照)。
 */
export function drawNaviPushOrder(rng: Rng): PushOrder {
  return NAVI_PUSH_ORDERS[rng.nextInt(NAVI_PUSH_ORDERS.length)];
}

/** 打ち方ポリシーが決めた 1 ゲーム分の操作(押し順 + 押下位置) */
export interface PushDecision {
  pushOrder: PushOrder;
  pushPositions: [number, number, number];
}

/**
 * 打ち方ポリシー(確定 26): 通常時 = 左第一・適当押し / AT 中のベル = ナビ遵守
 * (ナビ押し順は正解 4 通りから均等抽せん = 確定 36。乱数 1 個消費)。
 * 押下位置は左・中・右の順に乱数 3 個を消費する(押し順によらず固定)。
 * 消費順序はナビ押し順 → 押下位置 3(ヘッダーの「乱数の消費順序」参照)。
 */
export function decidePush(state: GameState, wonRole: Role, rng: Rng): PushDecision {
  const pushOrder =
    isNaviActive(state) && wonRole === 'BELL' ? drawNaviPushOrder(rng) : NORMAL_PUSH_ORDER;
  const pushPositions: [number, number, number] = [
    rng.nextInt(KOMA_COUNT),
    rng.nextInt(KOMA_COUNT),
    rng.nextInt(KOMA_COUNT),
  ];
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
 *   強制時は役抽せんの乱数を消費しない(ベルこぼし抽せんは強制時も消費する)。
 */
export function playGame(state: GameState, rng: Rng, forcedRole?: Role): PlayResult {
  const wonRole = forcedRole ?? drawRole(rng);
  // ベル当選時は押し順に依らず常に 1/13 のこぼし抽せんを消費(確定 35。
  // 結果はナビ遵守(中・右第一)では効かず、左第一停止のときのみ停止制御に効く)
  const bellMiss = wonRole === 'BELL' ? drawBellMiss(rng) : false;
  const push = decidePush(state, wonRole, rng);
  const spin = resolveSpin(wonRole, push.pushPositions, push.pushOrder, bellMiss);
  const result = advanceGame(state, { wonRole, displayedRole: spin.displayed }, rng);
  return { ...result, spin, push };
}
