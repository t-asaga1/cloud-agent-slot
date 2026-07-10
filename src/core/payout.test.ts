import { describe, expect, it } from 'vitest';
import {
  BELL_PAYOUT_FAIL,
  BELL_PAYOUT_SUCCESS,
  BET_PER_GAME,
  PAYOUT_TABLE,
  calcPayout,
} from './payout';
import { ROLES } from './roles';

describe('PAYOUT_TABLE(docs/SPEC.md「2.」と一致)', () => {
  it('ベル以外の全役にエントリが定義されている', () => {
    for (const role of ROLES) {
      if (role === 'BELL') continue;
      expect(PAYOUT_TABLE[role]).toBeDefined();
      expect(PAYOUT_TABLE[role]).toBeGreaterThanOrEqual(0);
    }
  });

  it('チェリー 2 枚・スイカ 3 枚・チャンス目 3 枚・リーチ目 3 枚', () => {
    expect(PAYOUT_TABLE.CHERRY_CORNER).toBe(2);
    expect(PAYOUT_TABLE.CHERRY_CENTER).toBe(2);
    expect(PAYOUT_TABLE.WATERMELON_WEAK).toBe(3);
    expect(PAYOUT_TABLE.WATERMELON_STRONG).toBe(3);
    expect(PAYOUT_TABLE.CHANCE_ME).toBe(3);
    expect(PAYOUT_TABLE.REACH_ME).toBe(3);
  });

  it('押し順ベルは正解 13 枚 / 不正解 1 枚', () => {
    expect(BELL_PAYOUT_SUCCESS).toBe(13);
    expect(BELL_PAYOUT_FAIL).toBe(1);
  });
});

describe('calcPayout', () => {
  it('押し順ベル正解(通常 BET): 13 枚払い出し・収支 +10', () => {
    const result = calcPayout('BELL', true, true);
    expect(result.payout).toBe(13);
    expect(result.isReplay).toBe(false);
    expect(result.net).toBe(13 - BET_PER_GAME);
  });

  it('押し順ベル不正解(左第一停止): 1 枚払い出し・収支 -2', () => {
    const result = calcPayout('BELL', true, false);
    expect(result.payout).toBe(1);
    expect(result.net).toBe(1 - BET_PER_GAME);
  });

  it('リプレイ: 払い出し 0・再遊技フラグが立つ', () => {
    const result = calcPayout('REPLAY', true);
    expect(result.payout).toBe(0);
    expect(result.isReplay).toBe(true);
    expect(result.net).toBe(-BET_PER_GAME);
  });

  it('リプレイ後のゲーム(betPaid=false)は投入 0 で計算される', () => {
    const result = calcPayout('BELL', false, true);
    expect(result.net).toBe(13);
  });

  it('ハズレ: 払い出し 0・収支 -3', () => {
    const result = calcPayout('NONE', true);
    expect(result.payout).toBe(0);
    expect(result.isReplay).toBe(false);
    expect(result.net).toBe(-BET_PER_GAME);
  });

  it('通常時(全役の期待値)純増は約 -1.8 枚/G(左押しベル 1 枚)', () => {
    // SPEC.md「2.」の参考試算の検算。リプレイはハズレ扱いの投入 3 枚で近似せず、
    // 当選個数で加重平均: (Σ 個数×払出 − リプレイ以外の投入) / 65536
    const denom = 65536;
    // リプレイ(8970 個)は払出 0
    const totalPayout = 45000 * 1 + 600 * 2 + 344 * 2 + 667 * 3 + 194 * 3 + 369 * 3 + 8 * 3;
    const totalBet = (denom - 8970) * BET_PER_GAME;
    const net = (totalPayout - totalBet) / denom;
    expect(net).toBeCloseTo(-1.8, 1);
  });

  it('AT 中(全ナビ 13 枚)純増は約 +6.4 枚/G', () => {
    const denom = 65536;
    // リプレイ(8970 個)は払出 0
    const totalPayout = 45000 * 13 + 600 * 2 + 344 * 2 + 667 * 3 + 194 * 3 + 369 * 3 + 8 * 3;
    const totalBet = (denom - 8970) * BET_PER_GAME;
    const net = (totalPayout - totalBet) / denom;
    expect(net).toBeCloseTo(6.4, 1);
  });
});
