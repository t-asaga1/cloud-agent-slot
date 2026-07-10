import type { Rng } from './rng';

/**
 * 前兆抽せん。docs/SPEC.md「6. 前兆抽せん」準拠。
 * - 本前兆・偽前兆とも 7〜10G の前兆演出後に連続演出へ発展。
 * - 連続演出は A/B/C とも 4 ゲームで、前兆 7〜10G には含まれない(確定・回答 10)。
 * 振分けは分母 100 の整数で持つ。合計 = 100 はテストで保証。
 */
export type OmenKind = 'FAKE' | 'REAL';

export const OMEN_DENOM = 100;

/** 前兆ゲーム数の振分け(ゲーム数 → 当選個数) */
export const OMEN_GAMES_TABLE: Record<OmenKind, Record<number, number>> = {
  FAKE: { 7: 25, 8: 50, 9: 25 },
  REAL: { 7: 25, 8: 25, 9: 25, 10: 25 },
};

/** 発展連続演出の振分け */
export const RENZOKU_TABLE: Record<OmenKind, Record<string, number>> = {
  FAKE: { A: 60, B: 40 },
  REAL: { A: 40, B: 40, C: 20 },
};

/** 連続演出のゲーム数(A/B/C 共通・前兆ゲーム数には含まれない) */
export const RENZOKU_GAMES = 4;

function drawFromRecord<K extends string | number>(rng: Rng, table: Record<K, number>): K {
  const value = rng.nextInt(OMEN_DENOM);
  let threshold = 0;
  for (const key of Object.keys(table) as K[]) {
    threshold += table[key];
    if (value < threshold) return key;
  }
  throw new Error(`振分けの合計が ${OMEN_DENOM} 未満`);
}

/** 前兆ゲーム数の抽せん */
export function drawOmenGames(rng: Rng, kind: OmenKind): number {
  return Number(drawFromRecord(rng, OMEN_GAMES_TABLE[kind]));
}

export type RenzokuKind = 'A' | 'B' | 'C';

/** 発展連続演出の抽せん */
export function drawRenzoku(rng: Rng, kind: OmenKind): RenzokuKind {
  return drawFromRecord(rng, RENZOKU_TABLE[kind]) as RenzokuKind;
}
