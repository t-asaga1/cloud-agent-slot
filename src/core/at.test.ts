import { describe, expect, it } from 'vitest';
import {
  BATTLE_PART_GAMES,
  CONTINUE_RATE_DENOM,
  CONTINUE_RATE_TABLE,
  KOYAKU_PART_GAMES,
  RENCHAN_LIMIT,
  STOCK_DENOM,
  UPPER_AT_CONTINUE_RATE,
  V_STOCK_WEIGHTS,
  drawBattleContinue,
  drawContinueRate,
  drawSetContinue,
  drawVStock,
} from './at';
import { createRng } from './rng';

describe('AT テーブル(静的検証・docs/SPEC.md「7.」「8.」と一致)', () => {
  it('セット構成は小役 10G + バトル 8G、10 連で上位 AT / エンディング', () => {
    expect(KOYAKU_PART_GAMES).toBe(10);
    expect(BATTLE_PART_GAMES).toBe(8);
    expect(RENCHAN_LIMIT).toBe(10);
  });

  it('継続率振分けの合計が 10(66%:0.5 / 79%:0.3 / 84%:0.1 / 88%:0.1)', () => {
    const total = Object.values(CONTINUE_RATE_TABLE).reduce((a, b) => a + b, 0);
    expect(total).toBe(CONTINUE_RATE_DENOM);
    expect(CONTINUE_RATE_TABLE[0.66]).toBe(5);
    expect(CONTINUE_RATE_TABLE[0.79]).toBe(3);
    expect(CONTINUE_RATE_TABLE[0.84]).toBe(1);
    expect(CONTINUE_RATE_TABLE[0.88]).toBe(1);
  });

  it('上位 AT の継続率は 93% 固定', () => {
    expect(UPPER_AT_CONTINUE_RATE).toBe(0.93);
  });

  it('V ストック獲得率が SPEC.md と一致(中段チェリー・リーチ目は 100%)', () => {
    expect(V_STOCK_WEIGHTS.REPLAY).toBe(1);
    expect(V_STOCK_WEIGHTS.BELL).toBe(1);
    expect(V_STOCK_WEIGHTS.WATERMELON_WEAK).toBe(50);
    expect(V_STOCK_WEIGHTS.WATERMELON_STRONG).toBe(500);
    expect(V_STOCK_WEIGHTS.CHERRY_CORNER).toBe(50);
    expect(V_STOCK_WEIGHTS.CHERRY_CENTER).toBe(STOCK_DENOM);
    expect(V_STOCK_WEIGHTS.CHANCE_ME).toBe(150);
    expect(V_STOCK_WEIGHTS.REACH_ME).toBe(STOCK_DENOM);
  });
});

describe('drawContinueRate', () => {
  it('大量試行で分布(0.5/0.3/0.1/0.1)に収束する', () => {
    const trials = 100000;
    const rng = createRng(31);
    const counts = new Map<number, number>();
    for (let i = 0; i < trials; i++) {
      const rate = drawContinueRate(rng);
      counts.set(rate, (counts.get(rate) ?? 0) + 1);
    }
    expect(Math.abs((counts.get(0.66) ?? 0) - trials * 0.5)).toBeLessThanOrEqual(trials * 0.01);
    expect(Math.abs((counts.get(0.79) ?? 0) - trials * 0.3)).toBeLessThanOrEqual(trials * 0.01);
    expect(Math.abs((counts.get(0.84) ?? 0) - trials * 0.1)).toBeLessThanOrEqual(trials * 0.01);
    expect(Math.abs((counts.get(0.88) ?? 0) - trials * 0.1)).toBeLessThanOrEqual(trials * 0.01);
  });
});

describe('drawVStock / drawBattleContinue', () => {
  it('中段チェリー・リーチ目は 100% 獲得', () => {
    const rng = createRng(32);
    for (let i = 0; i < 100; i++) {
      expect(drawVStock(rng, 'CHERRY_CENTER')).toBe(true);
      expect(drawVStock(rng, 'REACH_ME')).toBe(true);
      expect(drawBattleContinue(rng, 'CHERRY_CENTER')).toBe(true);
    }
  });

  it('ハズレは獲得しない', () => {
    const rng = createRng(33);
    for (let i = 0; i < 100; i++) {
      expect(drawVStock(rng, 'NONE')).toBe(false);
    }
  });

  it('強スイカは約 1/2 で獲得', () => {
    const trials = 100000;
    const rng = createRng(34);
    let hit = 0;
    for (let i = 0; i < trials; i++) {
      if (drawVStock(rng, 'WATERMELON_STRONG')) hit++;
    }
    expect(Math.abs(hit - trials * 0.5)).toBeLessThanOrEqual(trials * 0.01);
  });
});

describe('drawSetContinue', () => {
  it('継続率 93%(上位 AT)で約 93% 継続する', () => {
    const trials = 100000;
    const rng = createRng(35);
    let hit = 0;
    for (let i = 0; i < trials; i++) {
      if (drawSetContinue(rng, UPPER_AT_CONTINUE_RATE)) hit++;
    }
    expect(Math.abs(hit - trials * 0.93)).toBeLessThanOrEqual(trials * 0.01);
  });
});
