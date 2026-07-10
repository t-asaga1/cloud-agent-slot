import { describe, expect, it } from 'vitest';
import {
  OMEN_DENOM,
  OMEN_GAMES_TABLE,
  RENZOKU_GAMES,
  RENZOKU_TABLE,
  drawOmenGames,
  drawRenzoku,
} from './omen';
import { createRng } from './rng';

describe('前兆テーブル(静的検証・docs/SPEC.md「6.」と一致)', () => {
  it('前兆ゲーム数・連続演出の振分け合計が 100', () => {
    for (const kind of ['FAKE', 'REAL'] as const) {
      const gamesTotal = Object.values(OMEN_GAMES_TABLE[kind]).reduce((a, b) => a + b, 0);
      expect(gamesTotal, `ゲーム数 ${kind}`).toBe(OMEN_DENOM);
      const renzokuTotal = Object.values(RENZOKU_TABLE[kind]).reduce((a, b) => a + b, 0);
      expect(renzokuTotal, `連続演出 ${kind}`).toBe(OMEN_DENOM);
    }
  });

  it('偽前兆は 7〜9G(10G なし)、本前兆は 7〜10G 均等', () => {
    expect(OMEN_GAMES_TABLE.FAKE).toEqual({ 7: 25, 8: 50, 9: 25 });
    expect(OMEN_GAMES_TABLE.REAL).toEqual({ 7: 25, 8: 25, 9: 25, 10: 25 });
  });

  it('偽前兆は連続演出 C に発展しない', () => {
    expect(RENZOKU_TABLE.FAKE.C).toBeUndefined();
    expect(RENZOKU_TABLE.REAL.C).toBe(20);
  });

  it('連続演出は 4 ゲーム(前兆 7〜10G に含まれない・確定・回答 10)', () => {
    expect(RENZOKU_GAMES).toBe(4);
  });
});

describe('drawOmenGames / drawRenzoku(シミュレーション検証)', () => {
  it('偽前兆のゲーム数分布が 25/50/25 に収束する', () => {
    const trials = 100000;
    const rng = createRng(21);
    const counts: Record<number, number> = { 7: 0, 8: 0, 9: 0 };
    for (let i = 0; i < trials; i++) counts[drawOmenGames(rng, 'FAKE')]++;
    expect(Math.abs(counts[7] - trials * 0.25)).toBeLessThanOrEqual(trials * 0.01);
    expect(Math.abs(counts[8] - trials * 0.5)).toBeLessThanOrEqual(trials * 0.01);
    expect(Math.abs(counts[9] - trials * 0.25)).toBeLessThanOrEqual(trials * 0.01);
  });

  it('本前兆の連続演出分布が A40/B40/C20 に収束する', () => {
    const trials = 100000;
    const rng = createRng(22);
    const counts = { A: 0, B: 0, C: 0 };
    for (let i = 0; i < trials; i++) counts[drawRenzoku(rng, 'REAL')]++;
    expect(Math.abs(counts.A - trials * 0.4)).toBeLessThanOrEqual(trials * 0.01);
    expect(Math.abs(counts.B - trials * 0.4)).toBeLessThanOrEqual(trials * 0.01);
    expect(Math.abs(counts.C - trials * 0.2)).toBeLessThanOrEqual(trials * 0.01);
  });
});
