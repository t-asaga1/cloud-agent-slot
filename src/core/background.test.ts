import { describe, expect, it } from 'vitest';
import {
  BACKGROUNDS,
  BACKGROUND_DENOM,
  BACKGROUND_ELAPSED_GAMES,
  BACKGROUND_INITIAL,
  BACKGROUND_TRANSITION,
  BACKGROUND_TRIGGERS,
  drawBackgroundTransition,
  drawInitialBackground,
  type Background,
} from './background';
import { createRng } from './rng';

describe('背景移行テーブル(静的検証・docs/SPEC.md「5.」と一致)', () => {
  it('初期設定テーブルの行合計が 100', () => {
    for (const [mode, weights] of Object.entries(BACKGROUND_INITIAL)) {
      const total = weights.reduce((a, b) => a + b, 0);
      expect(total, mode).toBe(BACKGROUND_DENOM);
    }
  });

  it('全モード × 全契機 × 全背景の行合計が 100(Excel 誤植の訂正込み・確定・回答 2)', () => {
    for (const [mode, tables] of Object.entries(BACKGROUND_TRANSITION)) {
      for (const trigger of BACKGROUND_TRIGGERS) {
        for (const bg of BACKGROUNDS) {
          const total = tables[trigger][bg].reduce((a, b) => a + b, 0);
          expect(total, `${mode} × ${trigger} × ${bg}`).toBe(BACKGROUND_DENOM);
        }
      }
    }
  });

  it('本前兆移行時テーブルの静・弁慶行は自背景 0.25(Excel の 0.5 を訂正・確定・回答 2)', () => {
    for (const mode of ['HELL', 'NORMAL', 'HEAVEN'] as const) {
      const table = BACKGROUND_TRANSITION[mode].HONZENCHO_NEXT;
      expect(table.SHIZUKA).toEqual([0, 25, 0, 25, 50]);
      expect(table.BENKEI).toEqual([0, 0, 25, 25, 50]);
      // 義経行は Excel どおり
      expect(table.YOSHITSUNE).toEqual([25, 0, 0, 25, 50]);
    }
  });

  it('地獄と通常は同一テーブル、本前兆移行時は全モード共通', () => {
    expect(BACKGROUND_TRANSITION.HELL).toBe(BACKGROUND_TRANSITION.NORMAL);
    expect(BACKGROUND_TRANSITION.HELL.HONZENCHO_NEXT).toBe(
      BACKGROUND_TRANSITION.HEAVEN.HONZENCHO_NEXT,
    );
  });

  it('天国の規定ゲーム数経過と連続演出失敗後は同一テーブル', () => {
    expect(BACKGROUND_TRANSITION.HEAVEN.ELAPSED).toBe(BACKGROUND_TRANSITION.HEAVEN.FAKE_OMEN_FAIL);
  });

  it('経過ゲーム数の規定値は暫定 30G(確定・回答 15。変更時は SPEC とセットで更新)', () => {
    expect(BACKGROUND_ELAPSED_GAMES).toBe(30);
  });
});

describe('drawInitialBackground', () => {
  it('大量試行で本前兆モードの分布(0.01/0.01/0.01/0.07/0.9)に収束する', () => {
    const trials = 100000;
    const rng = createRng(11);
    const counts: Record<Background, number> = {
      YOSHITSUNE: 0,
      SHIZUKA: 0,
      BENKEI: 0,
      YUGATA: 0,
      ZENCHO: 0,
    };
    for (let i = 0; i < trials; i++) counts[drawInitialBackground(rng, 'HONZENCHO')]++;
    const expected = [1, 1, 1, 7, 90];
    BACKGROUNDS.forEach((bg, i) => {
      const exp = (expected[i] / BACKGROUND_DENOM) * trials;
      const sigma = Math.sqrt(exp * (1 - expected[i] / BACKGROUND_DENOM));
      expect(Math.abs(counts[bg] - exp), bg).toBeLessThanOrEqual(Math.max(exp * 0.15, sigma * 4));
    });
  });
});

describe('drawBackgroundTransition', () => {
  it('地獄 規定ゲーム数経過: 義経 → 静 100%(ローテーション)', () => {
    const rng = createRng(12);
    for (let i = 0; i < 100; i++) {
      expect(drawBackgroundTransition(rng, 'HELL', 'ELAPSED', 'YOSHITSUNE')).toBe('SHIZUKA');
      expect(drawBackgroundTransition(rng, 'HELL', 'ELAPSED', 'SHIZUKA')).toBe('BENKEI');
      expect(drawBackgroundTransition(rng, 'HELL', 'ELAPSED', 'BENKEI')).toBe('YOSHITSUNE');
    }
  });

  it('前兆背景で本前兆移行: 前兆背景維持 100%', () => {
    const rng = createRng(13);
    for (let i = 0; i < 100; i++) {
      expect(drawBackgroundTransition(rng, 'NORMAL', 'HONZENCHO_NEXT', 'ZENCHO')).toBe('ZENCHO');
    }
  });

  it('本前兆モード滞在中でも HONZENCHO_NEXT テーブルを参照できる', () => {
    const rng = createRng(14);
    const result = drawBackgroundTransition(rng, 'HONZENCHO', 'HONZENCHO_NEXT', 'YUGATA');
    expect(['YUGATA', 'ZENCHO']).toContain(result);
  });

  it('大量試行で静背景 × 本前兆移行の分布(0.25/0.25/0.5)に収束する(訂正値)', () => {
    const trials = 100000;
    const rng = createRng(15);
    const counts: Record<Background, number> = {
      YOSHITSUNE: 0,
      SHIZUKA: 0,
      BENKEI: 0,
      YUGATA: 0,
      ZENCHO: 0,
    };
    for (let i = 0; i < trials; i++) {
      counts[drawBackgroundTransition(rng, 'NORMAL', 'HONZENCHO_NEXT', 'SHIZUKA')]++;
    }
    expect(counts.YOSHITSUNE).toBe(0);
    expect(counts.BENKEI).toBe(0);
    expect(Math.abs(counts.SHIZUKA - trials * 0.25)).toBeLessThanOrEqual(trials * 0.01);
    expect(Math.abs(counts.YUGATA - trials * 0.25)).toBeLessThanOrEqual(trials * 0.01);
    expect(Math.abs(counts.ZENCHO - trials * 0.5)).toBeLessThanOrEqual(trials * 0.01);
  });
});
