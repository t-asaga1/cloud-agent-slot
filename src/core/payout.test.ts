import { describe, expect, it } from 'vitest';
import { BET_PER_GAME, PAYOUT_TABLE, calcPayout } from './payout';
import { ROLES } from './roles';

describe('PAYOUT_TABLE', () => {
  it('全役にエントリが定義されている', () => {
    for (const role of ROLES) {
      expect(PAYOUT_TABLE[role]).toBeDefined();
      expect(PAYOUT_TABLE[role]).toBeGreaterThanOrEqual(0);
    }
  });

  it('ベルは払い出しが投入(3枚)を上回る(AT 中の主獲得役)', () => {
    expect(PAYOUT_TABLE.BELL).toBeGreaterThan(BET_PER_GAME);
  });
});

describe('calcPayout', () => {
  it('ベル入賞(通常 BET): 8 枚払い出し・収支 +5', () => {
    const result = calcPayout('BELL', true);
    expect(result.payout).toBe(8);
    expect(result.isReplay).toBe(false);
    expect(result.net).toBe(8 - BET_PER_GAME);
  });

  it('リプレイ: 払い出し 0・再遊技フラグが立つ', () => {
    const result = calcPayout('REPLAY', true);
    expect(result.payout).toBe(0);
    expect(result.isReplay).toBe(true);
    expect(result.net).toBe(-BET_PER_GAME);
  });

  it('リプレイ後のゲーム(betPaid=false)は投入 0 で計算される', () => {
    const result = calcPayout('BELL', false);
    expect(result.net).toBe(8);
  });

  it('ハズレ: 払い出し 0・収支 -3', () => {
    const result = calcPayout('NONE', true);
    expect(result.payout).toBe(0);
    expect(result.isReplay).toBe(false);
    expect(result.net).toBe(-BET_PER_GAME);
  });

  it('チェリー(弱・強)は 2 枚', () => {
    expect(calcPayout('CHERRY_WEAK', true).payout).toBe(2);
    expect(calcPayout('CHERRY_STRONG', true).payout).toBe(2);
  });

  it('ボーナス・チャンス目は当該ゲームの払い出しなし', () => {
    expect(calcPayout('BONUS_BIG', true).payout).toBe(0);
    expect(calcPayout('BONUS_REG', true).payout).toBe(0);
    expect(calcPayout('CHANCE_ME', true).payout).toBe(0);
  });
});
