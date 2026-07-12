/**
 * クレジット・払出・AT 獲得枚数のメーター管理(STEP 3c)。React 非依存の純ロジック。
 *
 * # 仕様(docs/ROADMAP.md「STEP 3c」)
 *
 * - 3 枚掛け固定(BET 操作はレバーオンに内包 = 実装デフォルト 3)。
 * - リプレイの次ゲームは自動 BET(クレジットを減らさない。`replayCarry` が正)。
 * - クレジットは上限なし。不足時(< 3 枚)はレバーオン時に 50 枚単位で自動補充する
 *   (実機的な精算・投入は STEP 6 の永続化と合わせて検討)。
 * - 払出枚数表示は「直近ゲームの払出」。レバーオンで 0 へ戻し、全停止(1G の締め)で
 *   そのゲームの払出を表示する。
 * - AT 獲得枚数 = AT 開始からの純増(払出 − 投入 の累計)。`AT_START` イベントで 0 へ
 *   リセットし、AT・エンディング中のゲーム(ゲーム開始時点のフェーズで判定)の純増を
 *   加算する。上位 AT 移行・エンディングを跨いでも継続し、AT 終了後は最終値のまま
 *   凍結される(表示するかは UI 側が判断。次の AT_START で再びリセット)。
 *
 * # 呼び出しタイミング(App 側の配線)
 *
 * - レバーオン: `meterOnLever(meter, state.replayCarry)`(BET 徴収 + 払出表示リセット)。
 * - 全停止(`advanceGame` 実行後): `meterOnFinish(meter, wasAtGame, result)`
 *   (払出加算 + AT 獲得枚数更新)。`wasAtGame` はゲーム開始時点(= `advanceGame` に
 *   渡した state)のフェーズが AT / ENDING だったか。
 */
import { BET_PER_GAME } from '../core/payout';
import type { PayoutResult } from '../core/payout';
import type { GameEvent } from '../core/state';

/** 初期クレジット(遊技開始・リセット時) */
export const INITIAL_CREDIT = 50;

/** クレジット不足時の自動補充単位(枚) */
export const REFILL_COINS = 50;

export interface MeterState {
  /** クレジット(上限なし) */
  credit: number;
  /** 直近ゲームの払出枚数表示(レバーオンで 0 へ戻す) */
  payout: number;
  /** 現在のゲームが自動 BET(前ゲームがリプレイ)だったか(REPLAY ランプ用) */
  autoBet: boolean;
  /** AT 獲得枚数 = AT 開始からの純増(`AT_START` でリセット) */
  atGained: number;
}

export function initMeter(): MeterState {
  return { credit: INITIAL_CREDIT, payout: 0, autoBet: false, atGained: 0 };
}

/**
 * レバーオン時のメーター更新: BET 徴収(リプレイなら自動 BET でクレジット不変)+
 * 払出枚数表示のリセット。クレジットが 3 枚未満なら 50 枚単位で自動補充してから徴収する。
 * @param replayCarry 前ゲームがリプレイ(このゲームの BET 不要 = `GameState.replayCarry`)
 */
export function meterOnLever(meter: MeterState, replayCarry: boolean): MeterState {
  let credit = meter.credit;
  if (!replayCarry) {
    while (credit < BET_PER_GAME) credit += REFILL_COINS;
    credit -= BET_PER_GAME;
  }
  return { ...meter, credit, payout: 0, autoBet: replayCarry };
}

/** `meterOnFinish` が参照する 1 ゲームの結果(`AdvanceResult` のサブセット) */
export interface FinishInput {
  events: readonly GameEvent[];
  payout: PayoutResult;
}

/**
 * 全停止(1G の締め)時のメーター更新: 払出をクレジットへ加算 + 払出枚数表示 +
 * AT 獲得枚数の更新(ヘッダーコメント参照)。
 * @param wasAtGame ゲーム開始時点のフェーズが AT / ENDING だったか(このゲームの純増を
 *   AT 獲得枚数へ加算するか)。AT 突入ゲーム(`AT_START`)自体は連続演出の最終 G なので
 *   加算せず 0 リセットのみ。
 */
export function meterOnFinish(
  meter: MeterState,
  wasAtGame: boolean,
  result: FinishInput,
): MeterState {
  const atGained = result.events.some((event) => event.type === 'AT_START')
    ? 0
    : wasAtGame
      ? meter.atGained + result.payout.net
      : meter.atGained;
  return {
    ...meter,
    credit: meter.credit + result.payout.payout,
    payout: result.payout.payout,
    atGained,
  };
}
