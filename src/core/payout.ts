import type { Role } from './roles';

/**
 * 払い出し計算。数値は docs/SPEC.md「6. 払い出し」の叩き台と一致させること。
 * ボーナス・AT 中の増加は状態管理(Phase 3 の state.ts)側で扱い、ここは 1 ゲームの小役払い出しのみ。
 */
export const BET_PER_GAME = 3;

/** 役別の払い出し枚数(リプレイは再遊技なので 0 枚 + 次ゲーム BET 不要) */
export const PAYOUT_TABLE: Record<Role, number> = {
  REPLAY: 0,
  BELL: 8,
  WATERMELON: 5,
  CHERRY_WEAK: 2,
  CHERRY_STRONG: 2,
  CHANCE_ME: 0,
  BONUS_BIG: 0,
  BONUS_REG: 0,
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
 */
export function calcPayout(role: Role, betPaid: boolean): PayoutResult {
  const payout = PAYOUT_TABLE[role];
  const bet = betPaid ? BET_PER_GAME : 0;
  return {
    payout,
    isReplay: role === 'REPLAY',
    net: payout - bet,
  };
}
