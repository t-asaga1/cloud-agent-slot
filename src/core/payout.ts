import type { Role } from './roles';

/**
 * 払い出し計算。docs/SPEC.md「2. 役構成・確率」(= Excel 基本確率シート)準拠。
 * AT のセット管理・純増計算は状態管理(state)側で扱い、ここは 1 ゲームの払い出しのみ。
 */
export const BET_PER_GAME = 3;

/** 押し順ベルの払出: 押し順正解(AT 中のナビ準拠 or 変則押し)で 13 枚、不正解(左第一)で 1 枚 */
export const BELL_PAYOUT_SUCCESS = 13;
export const BELL_PAYOUT_FAIL = 1;

/** 役別の払い出し枚数(リプレイは再遊技なので 0 枚 + 次ゲーム BET 不要) */
export const PAYOUT_TABLE: Record<Exclude<Role, 'BELL'>, number> = {
  REPLAY: 0,
  CHERRY_CORNER: 2,
  CHERRY_CENTER: 2,
  WATERMELON_WEAK: 3,
  WATERMELON_STRONG: 3,
  CHANCE_ME: 3,
  REACH_ME: 3,
  NONE: 0,
};

export interface PayoutResult {
  /** 払い出し枚数 */
  payout: number;
  /** 次ゲームの投入が不要か(リプレイ) */
  isReplay: boolean;
  /** このゲームでのメダル収支(払い出し − 投入) */
  net: number;
}

/**
 * @param role 揃った役(取りこぼし時は 'NONE' を渡す)
 * @param betPaid このゲームで実際にメダルを投入したか(前ゲームがリプレイなら false)
 * @param bellSuccess 押し順ベルの押し順正解か(role が 'BELL' のときのみ参照)
 */
export function calcPayout(role: Role, betPaid: boolean, bellSuccess = false): PayoutResult {
  const payout =
    role === 'BELL' ? (bellSuccess ? BELL_PAYOUT_SUCCESS : BELL_PAYOUT_FAIL) : PAYOUT_TABLE[role];
  const bet = betPaid ? BET_PER_GAME : 0;
  return {
    payout,
    isReplay: role === 'REPLAY',
    net: payout - bet,
  };
}
