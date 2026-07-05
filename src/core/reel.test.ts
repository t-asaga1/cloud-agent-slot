import { describe, expect, it } from 'vitest';
import {
  CHERRY_REEL,
  GUARANTEED_ROLES,
  MAX_SLIDE,
  REEL_COUNT,
  REEL_INDEXES,
  REEL_STRIPS,
  SYMBOLS_PER_REEL,
  judgeDisplay,
  normalizePosition,
  stopAll,
  stopReel,
  symbolAt,
  windowFor,
  type ReelIndex,
  type StopInput,
  type SymbolId,
} from './reel';
import { ROLES, type Role } from './roles';

/** 役 → 中段ライン構成図柄(テスト側で独立に定義し、実装との一致を検証する) */
const LINE_SYMBOL: Partial<Record<Role, SymbolId>> = {
  BELL: 'BELL',
  REPLAY: 'REPLAY',
  WATERMELON: 'WATERMELON',
  BONUS_BIG: 'RED7',
  BONUS_REG: 'WHITE7',
};

/** 押し順の全 6 通り(左中右のリール番号の順列) */
const PRESS_ORDERS: readonly (readonly ReelIndex[])[] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

function pressesFor(
  order: readonly ReelIndex[],
  positions: readonly [number, number, number],
): [StopInput, StopInput, StopInput] {
  return order.map((reel) => ({ reel, position: positions[reel] })) as [
    StopInput,
    StopInput,
    StopInput,
  ];
}

function windowHasCherry(reel: ReelIndex, position: number): boolean {
  const w = windowFor(reel, position);
  return w.top === 'CHERRY' || w.middle === 'CHERRY' || w.bottom === 'CHERRY';
}

/**
 * テスト側で独立に計算する「このリールで当選役を引き込めるか」。
 * 左リールは誤チェリー出目防止の蹴飛ばしルール
 * (チェリー視認位置は、100% 役 or 左最終停止でライン完成が確定する場合のみ停止可)を織り込む。
 */
function lineReachable(role: Role, reel: ReelIndex, press: number, leftIsLast: boolean): boolean {
  const symbol = LINE_SYMBOL[role];
  if (symbol === undefined) return false;
  for (let s = 0; s <= MAX_SLIDE; s++) {
    const pos = normalizePosition(press + s);
    if (symbolAt(reel, pos) !== symbol) continue;
    if (reel !== CHERRY_REEL) return true;
    if (!windowHasCherry(reel, pos)) return true;
    if (GUARANTEED_ROLES.includes(role) || leftIsLast) return true;
  }
  return false;
}

/** チェリー役の左リール停止形が押下位置から到達可能か */
function cherryReachable(role: 'CHERRY_WEAK' | 'CHERRY_STRONG', press: number): boolean {
  for (let s = 0; s <= MAX_SLIDE; s++) {
    const w = windowFor(CHERRY_REEL, press + s);
    if (role === 'CHERRY_STRONG' && w.middle === 'CHERRY') return true;
    if (
      role === 'CHERRY_WEAK' &&
      w.middle !== 'CHERRY' &&
      (w.top === 'CHERRY' || w.bottom === 'CHERRY')
    ) {
      return true;
    }
  }
  return false;
}

/** 当選役から「期待される表示役」を判定(取りこぼし時は 'NONE') */
function expectedDisplay(
  role: Role,
  order: readonly ReelIndex[],
  positions: readonly [number, number, number],
): Role {
  if (LINE_SYMBOL[role] !== undefined) {
    const leftIsLast = order[REEL_COUNT - 1] === CHERRY_REEL;
    const complete = REEL_INDEXES.every((r) => lineReachable(role, r, positions[r], leftIsLast));
    return complete ? role : 'NONE';
  }
  if (role === 'CHERRY_WEAK' || role === 'CHERRY_STRONG') {
    return cherryReachable(role, positions[CHERRY_REEL]) ? role : 'NONE';
  }
  return 'NONE'; // CHANCE_ME / NONE
}

describe('リール配列(REEL_STRIPS)の静的検証', () => {
  it('3 リール × 20 コマである', () => {
    expect(REEL_STRIPS).toHaveLength(REEL_COUNT);
    for (const strip of REEL_STRIPS) {
      expect(strip).toHaveLength(SYMBOLS_PER_REEL);
    }
  });

  it('ベル・リプレイは全リールで隙間 4 コマ以内(100% 引き込み可能)に配置されている', () => {
    for (const symbol of ['BELL', 'REPLAY'] as const) {
      for (const reel of REEL_INDEXES) {
        const positions = REEL_STRIPS[reel]
          .map((s, i) => (s === symbol ? i : -1))
          .filter((i) => i >= 0);
        expect(positions.length).toBeGreaterThan(0);
        for (let i = 0; i < positions.length; i++) {
          const cur = positions[i];
          const next = positions[(i + 1) % positions.length];
          const gap = normalizePosition(next - cur);
          // 隙間(間のコマ数)が 4 以内 = 連続する同図柄の間隔が 5 コマ以内
          expect(gap, `${symbol} リール${reel} ${cur}→${next}`).toBeLessThanOrEqual(MAX_SLIDE + 1);
        }
      }
    }
  });

  it('ボーナス図柄(赤7・白7)と BAR が全リールに存在する', () => {
    for (const symbol of ['RED7', 'WHITE7', 'BAR'] as const) {
      for (const reel of REEL_INDEXES) {
        expect(REEL_STRIPS[reel]).toContain(symbol);
      }
    }
  });

  it('チェリー役の判定対象である左リールにチェリーが存在し、取りこぼしが発生し得る間隔である', () => {
    const positions = REEL_STRIPS[CHERRY_REEL]
      .map((s, i) => (s === 'CHERRY' ? i : -1))
      .filter((i) => i >= 0);
    expect(positions.length).toBeGreaterThan(0);
    const maxGap = Math.max(
      ...positions.map((cur, i) =>
        normalizePosition(positions[(i + 1) % positions.length] - cur),
      ),
    );
    expect(maxGap).toBeGreaterThan(MAX_SLIDE + 1);
  });
});

describe('表示窓とコマ番号', () => {
  it('停止位置 p の窓は 上段=p+1 / 中段=p / 下段=p−1(mod 20)', () => {
    expect(windowFor(0, 0)).toEqual({
      top: symbolAt(0, 1),
      middle: symbolAt(0, 0),
      bottom: symbolAt(0, 19),
    });
    expect(windowFor(2, 19)).toEqual({
      top: symbolAt(2, 0),
      middle: symbolAt(2, 19),
      bottom: symbolAt(2, 18),
    });
  });

  it('normalizePosition は負数・20 以上を 0〜19 に丸める', () => {
    expect(normalizePosition(-1)).toBe(19);
    expect(normalizePosition(20)).toBe(0);
    expect(normalizePosition(45)).toBe(5);
  });
});

describe('stopAll の入力検証', () => {
  it('同じリールを複数回押すとエラー', () => {
    expect(() =>
      stopAll('BELL', [
        { reel: 0, position: 0 },
        { reel: 0, position: 0 },
        { reel: 2, position: 0 },
      ]),
    ).toThrow();
  });
});

describe('停止制御の網羅検証(当選役 9 種 × 押し順 6 通り × 全 20^3 押下位置)', () => {
  // 各リール 20 通りの押下位置すべての組(8000 通り)× 押し順 6 通りを全役で検証する。
  for (const role of ROLES) {
    it(`${role}: 引き込み可能なら必ず揃い、非当選役は絶対に揃わない`, () => {
      for (const order of PRESS_ORDERS) {
        for (let p0 = 0; p0 < SYMBOLS_PER_REEL; p0++) {
          for (let p1 = 0; p1 < SYMBOLS_PER_REEL; p1++) {
            for (let p2 = 0; p2 < SYMBOLS_PER_REEL; p2++) {
              const positions = [p0, p1, p2] as const;
              const stops = stopAll(role, pressesFor(order, positions));

              // スベリは最大 4 コマ
              for (const reel of REEL_INDEXES) {
                const slide = normalizePosition(stops[reel] - positions[reel]);
                if (slide > MAX_SLIDE) {
                  throw new Error(
                    `スベリ超過: role=${role} order=${order.join('')} press=${positions.join(',')} reel=${reel} stop=${stops[reel]}`,
                  );
                }
              }

              const display = judgeDisplay(stops);
              const expected = expectedDisplay(role, order, positions);
              if (display !== expected) {
                throw new Error(
                  `表示役不一致: role=${role} order=${order.join('')} press=${positions.join(',')} stops=${stops.join(',')} display=${display} expected=${expected}`,
                );
              }
            }
          }
        }
      }
    });
  }

  it('ベル・リプレイ(100% 引き込み役)は全押し順・全押下位置で必ず揃う', () => {
    // 上の網羅テストで expectedDisplay === role を検証済みだが、
    // 「期待値計算側も 100% になっている」ことを独立に確認する(配列設計の保証)。
    for (const role of GUARANTEED_ROLES) {
      for (const order of PRESS_ORDERS) {
        const leftIsLast = order[REEL_COUNT - 1] === CHERRY_REEL;
        for (const reel of REEL_INDEXES) {
          for (let press = 0; press < SYMBOLS_PER_REEL; press++) {
            expect(
              lineReachable(role, reel, press, leftIsLast),
              `${role} reel=${reel} press=${press}`,
            ).toBe(true);
          }
        }
      }
    }
  });
});

describe('停止形の個別ケース', () => {
  it('ベル当選・左リール押下位置 8 では、チェリー同時視認位置(10)まで滑ってベルを引き込む', () => {
    const stop = stopReel('BELL', 0, 8, {});
    expect(stop).toBe(10);
    expect(symbolAt(0, stop)).toBe('BELL');
  });

  it('スイカ当選・左リール押下位置 0 は、チェリー視認位置(4)を蹴飛ばして取りこぼす', () => {
    const stop = stopReel('WATERMELON', 0, 0, {});
    expect(symbolAt(0, stop)).not.toBe('WATERMELON');
    expect(windowHasCherry(0, stop)).toBe(false);
  });

  it('REG 当選は左最終停止のときのみ白7 が揃う(白7 の下段にチェリーがあるため)', () => {
    // 白7 = 左 12 / 中 11 / 右 14。押下位置は全リール引き込み可能な位置にする
    const positions = [10, 9, 12] as const;
    const leftLast = stopAll('BONUS_REG', pressesFor([1, 2, 0], positions));
    expect(judgeDisplay(leftLast)).toBe('BONUS_REG');

    const leftFirst = stopAll('BONUS_REG', pressesFor([0, 1, 2], positions));
    expect(judgeDisplay(leftFirst)).toBe('NONE');
  });

  it('強チェリー当選は中段チェリー、弱チェリー当選は角チェリーで停止する', () => {
    const strong = stopAll('CHERRY_STRONG', pressesFor([0, 1, 2], [1, 0, 0]));
    expect(windowFor(0, strong[0]).middle).toBe('CHERRY');
    expect(judgeDisplay(strong)).toBe('CHERRY_STRONG');

    const weak = stopAll('CHERRY_WEAK', pressesFor([0, 1, 2], [1, 0, 0]));
    const w = windowFor(0, weak[0]);
    expect(w.middle).not.toBe('CHERRY');
    expect(w.top === 'CHERRY' || w.bottom === 'CHERRY').toBe(true);
    expect(judgeDisplay(weak)).toBe('CHERRY_WEAK');
  });

  it('ハズレ・チャンス目はどのラインも揃わず、チェリーも視認されない', () => {
    for (const role of ['NONE', 'CHANCE_ME'] as const) {
      for (let press = 0; press < SYMBOLS_PER_REEL; press++) {
        const stops = stopAll(role, pressesFor([0, 1, 2], [press, press, press]));
        expect(judgeDisplay(stops)).toBe('NONE');
        expect(windowHasCherry(0, stops[0])).toBe(false);
      }
    }
  });
});
