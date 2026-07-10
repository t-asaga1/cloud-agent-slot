import { describe, expect, it } from 'vitest';
import {
  LOTTERY_DENOM,
  NONE_WEIGHT,
  ROLE_WEIGHTS,
  drawRole,
  theoreticalDenominator,
} from './lottery';
import { createRng } from './rng';
import type { Role } from './roles';

describe('ROLE_WEIGHTS(確率テーブルの静的検証・docs/SPEC.md「2.」と一致)', () => {
  it('当選個数 + ハズレ = 分母 65536(Excel の検算どおり)', () => {
    const total = Object.values(ROLE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total + NONE_WEIGHT).toBe(LOTTERY_DENOM);
  });

  it('全役の当選個数は正の整数', () => {
    for (const [role, weight] of Object.entries(ROLE_WEIGHTS)) {
      expect(Number.isInteger(weight), role).toBe(true);
      expect(weight, role).toBeGreaterThan(0);
    }
  });

  it('SPEC.md の当選個数と一致する', () => {
    expect(ROLE_WEIGHTS.REPLAY).toBe(8970);
    expect(ROLE_WEIGHTS.BELL).toBe(45000);
    expect(ROLE_WEIGHTS.CHERRY_CORNER).toBe(600);
    expect(ROLE_WEIGHTS.CHERRY_CENTER).toBe(344);
    expect(ROLE_WEIGHTS.WATERMELON_WEAK).toBe(667);
    expect(ROLE_WEIGHTS.WATERMELON_STRONG).toBe(194);
    expect(ROLE_WEIGHTS.CHANCE_ME).toBe(369);
    expect(ROLE_WEIGHTS.REACH_ME).toBe(8);
    expect(NONE_WEIGHT).toBe(9384);
  });
});

describe('drawRole(シミュレーション検証)', () => {
  it('大量試行で実測確率が理論値に収束する', () => {
    const trials = 500000;
    const rng = createRng(20260710);
    const counts = new Map<Role, number>();
    for (let i = 0; i < trials; i++) {
      const role = drawRole(rng);
      counts.set(role, (counts.get(role) ?? 0) + 1);
    }
    for (const [role, weight] of Object.entries(ROLE_WEIGHTS)) {
      const expected = (weight / LOTTERY_DENOM) * trials;
      const actual = counts.get(role as Role) ?? 0;
      // 期待回数の ±10% または ±4σ の大きい方まで許容
      const sigma = Math.sqrt(expected * (1 - weight / LOTTERY_DENOM));
      const tolerance = Math.max(expected * 0.1, sigma * 4);
      expect(
        Math.abs(actual - expected),
        `${role}: 実測 ${actual} / 期待 ${expected.toFixed(0)}`,
      ).toBeLessThanOrEqual(tolerance);
    }
    // ハズレも理論値(9384/65536)に収束する
    const noneExpected = (NONE_WEIGHT / LOTTERY_DENOM) * trials;
    expect(Math.abs((counts.get('NONE') ?? 0) - noneExpected)).toBeLessThanOrEqual(
      noneExpected * 0.1,
    );
  });

  it('同一シードなら抽選結果も同一(再現性)', () => {
    const a = createRng(777);
    const b = createRng(777);
    for (let i = 0; i < 1000; i++) {
      expect(drawRole(a)).toBe(drawRole(b));
    }
  });
});

describe('theoreticalDenominator(SPEC.md の実確率と一致)', () => {
  it('リプレイ 1/7.31・押し順ベル 1/1.46・リーチ目 1/8192', () => {
    expect(theoreticalDenominator('REPLAY')).toBeCloseTo(7.31, 2);
    expect(theoreticalDenominator('BELL')).toBeCloseTo(1.46, 2);
    expect(theoreticalDenominator('REACH_ME')).toBe(8192);
  });

  it('角チェリー 1/109.2・中段チェリー 1/190.5・弱スイカ 1/98.3・強スイカ 1/337.8・チャンス目 1/177.6', () => {
    expect(theoreticalDenominator('CHERRY_CORNER')).toBeCloseTo(109.2, 1);
    expect(theoreticalDenominator('CHERRY_CENTER')).toBeCloseTo(190.5, 1);
    expect(theoreticalDenominator('WATERMELON_WEAK')).toBeCloseTo(98.3, 1);
    expect(theoreticalDenominator('WATERMELON_STRONG')).toBeCloseTo(337.8, 1);
    expect(theoreticalDenominator('CHANCE_ME')).toBeCloseTo(177.6, 1);
  });
});
