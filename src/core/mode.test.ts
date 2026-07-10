import { describe, expect, it } from 'vitest';
import {
  MODES,
  MODE_DENOM,
  MODE_INITIAL,
  MODE_TRANSITION,
  drawFakeOmen,
  drawInitialMode,
  drawModeTransition,
  type Mode,
} from './mode';
import { createRng } from './rng';
import { ROLES } from './roles';

describe('モード移行テーブル(静的検証・docs/SPEC.md「4.」と一致)', () => {
  it('全テーブルの行合計が 10000(振分け合計 = 1)', () => {
    for (const [mode, table] of Object.entries(MODE_TRANSITION)) {
      for (const [role, weights] of Object.entries(table)) {
        const total = weights.reduce((a, b) => a + b, 0);
        expect(total, `${mode} × ${role}`).toBe(MODE_DENOM);
      }
    }
  });

  it('モード初期設定の合計が 10000(AT 終了後は 0.0001 を地獄に加算・確定)', () => {
    for (const [timing, weights] of Object.entries(MODE_INITIAL)) {
      const total = weights.reduce((a, b) => a + b, 0);
      expect(total, timing).toBe(MODE_DENOM);
    }
    // Excel 値 3155 + 訂正 1 = 3156
    expect(MODE_INITIAL.AT_END[0]).toBe(3156);
  });

  it('リーチ目は全モードで本前兆 100%', () => {
    for (const mode of ['HELL', 'NORMAL', 'HEAVEN'] as const) {
      expect(MODE_TRANSITION[mode].REACH_ME).toEqual([0, 0, 0, 10000]);
    }
  });

  it('地獄・通常・天国とも 8 役(ハズレ以外)のテーブルを持つ', () => {
    for (const mode of ['HELL', 'NORMAL', 'HEAVEN'] as const) {
      expect(Object.keys(MODE_TRANSITION[mode])).toHaveLength(8);
    }
  });
});

describe('drawModeTransition', () => {
  it('ハズレは現状維持(確定・回答 8)', () => {
    const rng = createRng(1);
    for (const mode of MODES) {
      expect(drawModeTransition(rng, mode, 'NONE')).toBe(mode);
    }
  });

  it('本前兆滞在中はモード移行抽せん停止(確定・回答 9)', () => {
    const rng = createRng(2);
    for (const role of ROLES) {
      expect(drawModeTransition(rng, 'HONZENCHO', role)).toBe('HONZENCHO');
    }
  });

  it('大量試行で実測分布がテーブル値に収束する(地獄 × 弱スイカ)', () => {
    const trials = 200000;
    const rng = createRng(20260710);
    const counts: Record<Mode, number> = { HELL: 0, NORMAL: 0, HEAVEN: 0, HONZENCHO: 0 };
    for (let i = 0; i < trials; i++) {
      counts[drawModeTransition(rng, 'HELL', 'WATERMELON_WEAK')]++;
    }
    const expected = [5392, 4069, 271, 268]; // 地獄 / 通常 / 天国 / 本前兆
    MODES.forEach((mode, i) => {
      const exp = (expected[i] / MODE_DENOM) * trials;
      const sigma = Math.sqrt(exp * (1 - expected[i] / MODE_DENOM));
      expect(Math.abs(counts[mode] - exp), mode).toBeLessThanOrEqual(Math.max(exp * 0.1, sigma * 4));
    });
  });

  it('天国のベルは天国維持 100%', () => {
    const rng = createRng(3);
    for (let i = 0; i < 100; i++) {
      expect(drawModeTransition(rng, 'HEAVEN', 'BELL')).toBe('HEAVEN');
    }
  });
});

describe('drawInitialMode', () => {
  it('大量試行でゲーム開始時の分布(0.3001/0.4075/0.2792/0.0132)に収束する', () => {
    const trials = 200000;
    const rng = createRng(42);
    const counts: Record<Mode, number> = { HELL: 0, NORMAL: 0, HEAVEN: 0, HONZENCHO: 0 };
    for (let i = 0; i < trials; i++) counts[drawInitialMode(rng, 'GAME_START')]++;
    const expected = [3001, 4075, 2792, 132];
    MODES.forEach((mode, i) => {
      const exp = (expected[i] / MODE_DENOM) * trials;
      expect(Math.abs(counts[mode] - exp), mode).toBeLessThanOrEqual(exp * 0.1);
    });
  });
});

describe('drawFakeOmen(偽前兆突入・モード移行シートが正・確定・回答 3)', () => {
  it('本前兆へ移行した場合は偽前兆にならない', () => {
    const rng = createRng(5);
    for (const role of ROLES) {
      expect(drawFakeOmen(rng, role, true)).toBe(false);
    }
  });

  it('強スイカ・中段チェリーは本前兆非移行時 100% 偽前兆', () => {
    const rng = createRng(6);
    for (let i = 0; i < 100; i++) {
      expect(drawFakeOmen(rng, 'WATERMELON_STRONG', false)).toBe(true);
      expect(drawFakeOmen(rng, 'CHERRY_CENTER', false)).toBe(true);
    }
  });

  it('弱スイカ・角チェリー・チャンス目は約 1/10 で偽前兆', () => {
    const trials = 100000;
    for (const role of ['WATERMELON_WEAK', 'CHERRY_CORNER', 'CHANCE_ME'] as const) {
      const rng = createRng(7);
      let hit = 0;
      for (let i = 0; i < trials; i++) {
        if (drawFakeOmen(rng, role, false)) hit++;
      }
      expect(Math.abs(hit - trials / 10), role).toBeLessThanOrEqual(trials * 0.01);
    }
  });

  it('リプレイ・ベル・ハズレ・リーチ目は偽前兆にならない', () => {
    const rng = createRng(8);
    for (const role of ['REPLAY', 'BELL', 'NONE', 'REACH_ME'] as const) {
      for (let i = 0; i < 100; i++) {
        expect(drawFakeOmen(rng, role, false)).toBe(false);
      }
    }
  });
});
