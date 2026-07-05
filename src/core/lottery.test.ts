import { describe, expect, it } from 'vitest';
import { LOTTERY_DENOM, ROLE_WEIGHTS, drawRole, theoreticalDenominator } from './lottery';
import { createRng } from './rng';
import { SETTINGS, type Role } from './roles';

describe('ROLE_WEIGHTS(確率テーブルの静的検証)', () => {
  it('全設定で当選個数の合計が分母以下(ハズレ領域が存在する)', () => {
    for (const setting of SETTINGS) {
      const total = Object.values(ROLE_WEIGHTS[setting]).reduce((a, b) => a + b, 0);
      expect(total).toBeLessThan(LOTTERY_DENOM);
      expect(total).toBeGreaterThan(0);
    }
  });

  it('全役の当選個数は正の整数', () => {
    for (const setting of SETTINGS) {
      for (const [role, weight] of Object.entries(ROLE_WEIGHTS[setting])) {
        expect(Number.isInteger(weight), `${role}(設定${setting})`).toBe(true);
        expect(weight, `${role}(設定${setting})`).toBeGreaterThan(0);
      }
    }
  });

  it('設定が上がるとベル・スイカ・ボーナス確率は単調に良くなる(設定差)', () => {
    const monotonic: (keyof (typeof ROLE_WEIGHTS)[1])[] = [
      'BELL',
      'WATERMELON',
      'BONUS_BIG',
      'BONUS_REG',
    ];
    for (const role of monotonic) {
      for (let i = 1; i < SETTINGS.length; i++) {
        const lower = ROLE_WEIGHTS[SETTINGS[i - 1]][role];
        const higher = ROLE_WEIGHTS[SETTINGS[i]][role];
        expect(higher, `${role}: 設定${SETTINGS[i]} >= 設定${SETTINGS[i - 1]}`).toBeGreaterThanOrEqual(lower);
      }
    }
  });

  it('リプレイは全設定共通(設定差なし)', () => {
    const base = ROLE_WEIGHTS[1].REPLAY;
    for (const setting of SETTINGS) {
      expect(ROLE_WEIGHTS[setting].REPLAY).toBe(base);
    }
  });
});

describe('drawRole(シミュレーション検証)', () => {
  it('大量試行で実測確率が理論値に収束する(設定1・設定6)', () => {
    const trials = 500000;
    for (const setting of [1, 6] as const) {
      const rng = createRng(20260705 + setting);
      const counts = new Map<Role, number>();
      for (let i = 0; i < trials; i++) {
        const role = drawRole(rng, setting);
        counts.set(role, (counts.get(role) ?? 0) + 1);
      }
      for (const [role, weight] of Object.entries(ROLE_WEIGHTS[setting])) {
        const expected = (weight / LOTTERY_DENOM) * trials;
        const actual = counts.get(role as Role) ?? 0;
        // 期待回数の ±10% または ±4σ の大きい方まで許容
        const sigma = Math.sqrt(expected * (1 - weight / LOTTERY_DENOM));
        const tolerance = Math.max(expected * 0.1, sigma * 4);
        expect(
          Math.abs(actual - expected),
          `${role}(設定${setting}): 実測 ${actual} / 期待 ${expected.toFixed(0)}`,
        ).toBeLessThanOrEqual(tolerance);
      }
    }
  });

  it('同一シードなら抽選結果も同一(再現性)', () => {
    const a = createRng(777);
    const b = createRng(777);
    for (let i = 0; i < 1000; i++) {
      expect(drawRole(a, 3)).toBe(drawRole(b, 3));
    }
  });

  it('ハズレ(NONE)も出現する', () => {
    const rng = createRng(555);
    let none = 0;
    for (let i = 0; i < 10000; i++) {
      if (drawRole(rng, 1) === 'NONE') none++;
    }
    expect(none).toBeGreaterThan(0);
  });
});

describe('theoreticalDenominator', () => {
  it('リプレイは全設定で約 1/7.3', () => {
    for (const setting of SETTINGS) {
      expect(theoreticalDenominator('REPLAY', setting)).toBeCloseTo(65536 / 8978, 5);
    }
  });

  it('ボーナス合算は設定 1 で約 1/596、設定 6 で約 1/434', () => {
    const combined = (s: 1 | 6) =>
      LOTTERY_DENOM / (ROLE_WEIGHTS[s].BONUS_BIG + ROLE_WEIGHTS[s].BONUS_REG);
    expect(combined(1)).toBeGreaterThan(500);
    expect(combined(6)).toBeLessThan(500);
  });
});
