/**
 * シード指定可能な乱数生成器(mulberry32)。
 * テスト再現性のため、ゲームロジックからは必ずこのインターフェース経由で乱数を使う。
 * Math.random は core/ 内では使用禁止。
 */
export interface Rng {
  /** [0, 1) の浮動小数を返す */
  next(): number;
  /** [0, max) の整数を返す */
  nextInt(max: number): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    nextInt(max: number): number {
      if (!Number.isInteger(max) || max <= 0) {
        throw new RangeError(`nextInt: max must be a positive integer, got ${max}`);
      }
      return Math.floor(next() * max);
    },
  };
}

/** 非テスト用途(実プレイ)のシード生成 */
export function randomSeed(): number {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}
