import { describe, expect, it } from 'vitest';
import { createRng, randomSeed } from './rng';

describe('createRng', () => {
  it('同じシードなら同じ系列を返す(再現性)', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('異なるシードなら異なる系列を返す', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('next() は [0, 1) の範囲', () => {
    const rng = createRng(999);
    for (let i = 0; i < 10000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt(max) は [0, max) の整数で全値が出現する', () => {
    const rng = createRng(42);
    const max = 6;
    const seen = new Set<number>();
    for (let i = 0; i < 10000; i++) {
      const v = rng.nextInt(max);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(max);
      seen.add(v);
    }
    expect(seen.size).toBe(max);
  });

  it('nextInt は不正な max で例外を投げる', () => {
    const rng = createRng(1);
    expect(() => rng.nextInt(0)).toThrow(RangeError);
    expect(() => rng.nextInt(-1)).toThrow(RangeError);
    expect(() => rng.nextInt(1.5)).toThrow(RangeError);
  });

  it('分布が概ね一様(カイ二乗の簡易チェック)', () => {
    const rng = createRng(2026);
    const buckets = Array.from({ length: 10 }, () => 0);
    const trials = 100000;
    for (let i = 0; i < trials; i++) {
      buckets[rng.nextInt(10)]++;
    }
    const expected = trials / 10;
    for (const count of buckets) {
      // 期待値 ±5% 以内
      expect(count).toBeGreaterThan(expected * 0.95);
      expect(count).toBeLessThan(expected * 1.05);
    }
  });
});

describe('randomSeed', () => {
  it('32bit 非負整数を返す', () => {
    const s = randomSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});
