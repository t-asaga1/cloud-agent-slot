import { describe, expect, it } from 'vitest';
import { createRng, type Rng } from './rng';
import { ROLES } from './roles';
import {
  AT_BATTLE_LOSE_ROUTES,
  AT_BATTLE_RATES,
  AT_BATTLE_WIN_ROUTES,
  AT_REVIVAL_PATTERNS,
  AT_YOKOKU_TABLE,
  battleRouteTable,
  drawAtYokoku,
  drawBattleRoute,
  drawKoyakuHint,
  drawOmenScenario,
  drawRevival,
  KOYAKU_HINT_SLOT_TABLE,
  KOYAKU_HINT_TABLE,
  RENZOKU_CHANCE_TABLE,
  SCENARIO_DENOM,
  SCENARIO_LEVEL_TABLE,
  stepAt,
  UPPER_BATTLE_LOSE_ROUTES,
  UPPER_BATTLE_RATES,
  UPPER_BATTLE_WIN_ROUTES,
  UPPER_REVIVAL_PATTERNS,
  ZENCHO_SLOT_TABLE,
} from './scenario';

/** 指定した値列を順に返すスクリプト RNG(state.test.ts と同型。消費超過で throw) */
function seqRng(values: number[]): Rng {
  let i = 0;
  const take = (): number => {
    if (i >= values.length) {
      throw new Error(`seqRng: 乱数の消費が想定回数(${values.length})を超えた`);
    }
    return values[i++];
  };
  return {
    next: () => take(),
    nextInt: (max: number) => {
      const v = take();
      if (v < 0 || v >= max) throw new Error(`seqRng: 値 ${v} が範囲 [0, ${max}) 外`);
      return v;
    },
  };
}

describe('テーブルの整合性(全行合計 = 分母 100)', () => {
  it('強度カーブ: 各(種別 × G 位置)の合計 = 100、偽前兆に L3(確定)なし', () => {
    for (const kind of ['FAKE', 'REAL'] as const) {
      for (const [pos, weights] of Object.entries(SCENARIO_LEVEL_TABLE[kind])) {
        expect(weights.reduce((a, b) => a + b, 0), `${kind} ${pos}`).toBe(SCENARIO_DENOM);
      }
    }
    for (const weights of Object.values(SCENARIO_LEVEL_TABLE.FAKE)) {
      expect(weights[3]).toBe(0);
    }
  });

  it('スロット振分け(前兆系・小役示唆系)の合計 = 100', () => {
    expect(Object.values(ZENCHO_SLOT_TABLE).reduce((a, b) => a + b, 0)).toBe(SCENARIO_DENOM);
    expect(Object.values(KOYAKU_HINT_SLOT_TABLE).reduce((a, b) => a + b, 0)).toBe(SCENARIO_DENOM);
  });

  it('連続演出チャンスアップ・小役示唆発生率・AT 予告の各行合計 = 100(全役分の行がある)', () => {
    for (const kind of ['FAKE', 'REAL'] as const) {
      expect(RENZOKU_CHANCE_TABLE[kind].reduce((a, b) => a + b, 0)).toBe(SCENARIO_DENOM);
    }
    for (const role of ROLES) {
      expect(
        KOYAKU_HINT_TABLE[role].reduce((a, b) => a + b, 0),
        `小役示唆 ${role}`,
      ).toBe(SCENARIO_DENOM);
      expect(AT_YOKOKU_TABLE[role].reduce((a, b) => a + b, 0), `AT 予告 ${role}`).toBe(
        SCENARIO_DENOM,
      );
    }
  });

  it('バトルルート: 各(階層 × 確定状態 × 継続率列)の合計 = 100・約 20 ルート(AT 14 + 上位 12)', () => {
    for (const routes of [AT_BATTLE_WIN_ROUTES, AT_BATTLE_LOSE_ROUTES]) {
      for (let col = 0; col < AT_BATTLE_RATES.length; col++) {
        const sum = routes.reduce((a, r) => a + r.weights[col], 0);
        expect(sum, `AT 継続率 ${AT_BATTLE_RATES[col]}`).toBe(SCENARIO_DENOM);
      }
    }
    for (const routes of [UPPER_BATTLE_WIN_ROUTES, UPPER_BATTLE_LOSE_ROUTES]) {
      for (let col = 0; col < UPPER_BATTLE_RATES.length; col++) {
        const sum = routes.reduce((a, r) => a + r.weights[col], 0);
        expect(sum, `上位 継続率 ${UPPER_BATTLE_RATES[col]}`).toBe(SCENARIO_DENOM);
      }
    }
    // Q18「約 20 ルート」: AT = 勝利 8 + 敗北寄り 6、上位 = 勝利 7 + 敗北寄り 5
    expect(AT_BATTLE_WIN_ROUTES.length + AT_BATTLE_LOSE_ROUTES.length).toBe(14);
    expect(UPPER_BATTLE_WIN_ROUTES.length + UPPER_BATTLE_LOSE_ROUTES.length).toBe(12);
    // 勝利ルートは outcome WIN・敗北寄りは LOSE
    for (const r of [...AT_BATTLE_WIN_ROUTES, ...UPPER_BATTLE_WIN_ROUTES]) {
      expect(r.outcome).toBe('WIN');
    }
    for (const r of [...AT_BATTLE_LOSE_ROUTES, ...UPPER_BATTLE_LOSE_ROUTES]) {
      expect(r.outcome).toBe('LOSE');
    }
  });

  it('復活告知の振分け合計 = 100', () => {
    expect(AT_REVIVAL_PATTERNS.reduce((a, r) => a + r.weight, 0)).toBe(SCENARIO_DENOM);
    expect(UPPER_REVIVAL_PATTERNS.reduce((a, r) => a + r.weight, 0)).toBe(SCENARIO_DENOM);
  });
});

describe('drawOmenScenario(前兆シナリオの一括抽せん)', () => {
  it('乱数消費順序: 各 G「レベル → L1 以上でスロット」→ チャンスアップ 3 つ(固定値)', () => {
    // 偽前兆 7G。序盤(1〜3G)= [50, 40, 10, 0] / 中盤(4〜6G)= [40, 45, 15, 0] /
    // 終盤(7G〜)= [30, 45, 25, 0]。スロット = 固有4 27 / 固有5 27 / 共通3 23 / 共通4 23。
    const scenario = drawOmenScenario(
      seqRng([
        49, // g1: 49 < 50 → L0(スロット消費なし)
        50, // g2: L1
        0, // g2 スロット: KOYU_4
        99, // g3: L2
        54, // g3 スロット: KYOTSU_3(累計 27 / 54 / 77 / 100)
        0, // g4: L0
        85, // g5: L2(累計 40 / 85 / 100)
        99, // g5 スロット: KYOTSU_4
        39, // g6: L0
        29, // g7: L0
        79, // チャンスアップ 1G 目: NORMAL(偽 [80, 20])
        80, // 2G 目: CHANCE
        0, // 3G 目: NORMAL
      ]),
      'FAKE',
      7,
    );
    expect(scenario.steps).toEqual([
      { level: 0 },
      { level: 1, slot: 'KOYU_4' },
      { level: 2, slot: 'KYOTSU_3' },
      { level: 0 },
      { level: 2, slot: 'KYOTSU_4' },
      { level: 0 },
      { level: 0 },
    ]);
    expect(scenario.renzokuSteps).toEqual(['NORMAL', 'CHANCE', 'NORMAL']);
    // stepAt は 1 始まりの G 番号で引く
    expect(stepAt(scenario, 2)).toEqual({ level: 1, slot: 'KOYU_4' });
    expect(stepAt(scenario, 8)).toBeUndefined();
  });

  it('本前兆の終盤は L3(確定)が出る(値 90 以上)', () => {
    // 本・終盤 = [10, 30, 50, 10] → 90 以上で L3
    const scenario = drawOmenScenario(
      seqRng([0, 0, 0, 0, 0, 0, 99, 0, 0, 0, 0]), // g7 = 99 → L3 + スロット 0 → KOYU_4
      'REAL',
      7,
    );
    expect(stepAt(scenario, 7)).toEqual({ level: 3, slot: 'KOYU_4' });
  });

  it('シナリオ長 = 前兆総 G 数(7〜10)・L1 以上のステップは必ずスロットを持つ', () => {
    const rng = createRng(20260713);
    for (const kind of ['FAKE', 'REAL'] as const) {
      for (const totalGames of [7, 8, 9, 10]) {
        const scenario = drawOmenScenario(rng, kind, totalGames);
        expect(scenario.steps).toHaveLength(totalGames);
        expect(scenario.renzokuSteps).toHaveLength(3);
        for (const step of scenario.steps) {
          if (step.level >= 1) expect(step.slot).toBeDefined();
          else expect(step.slot).toBeUndefined();
        }
      }
    }
  });

  it('大量試行: 偽前兆に L3 は出ない・本前兆終盤の強度分布がテーブルに収束する', () => {
    const trials = 20000;
    const rng = createRng(42);
    const lateLevels: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (let i = 0; i < trials; i++) {
      const fake = drawOmenScenario(rng, 'FAKE', 9);
      for (const step of fake.steps) expect(step.level).toBeLessThan(3);
      const real = drawOmenScenario(rng, 'REAL', 7);
      lateLevels[stepAt(real, 7)!.level]++;
    }
    // 本・終盤 [10, 30, 50, 10]
    const expected = [0.1, 0.3, 0.5, 0.1];
    for (let level = 0; level <= 3; level++) {
      const p = expected[level];
      const exp = trials * p;
      const sigma = Math.sqrt(trials * p * (1 - p));
      expect(Math.abs(lateLevels[level] - exp), `L${level}`).toBeLessThanOrEqual(sigma * 4);
    }
  });
});

describe('drawKoyakuHint(小役示唆予告 = 確定 34。成立役ベースの独立抽せん)', () => {
  it('ハズレは発生なし(乱数消費なし)', () => {
    expect(drawKoyakuHint(seqRng([]), 'NONE')).toBeNull();
  });

  it('リプレイ: 発生値 → 弱 / 強 + スロット(固定値)', () => {
    // リプレイ [80, 18, 2]: 79 → なし(消費 1)/ 80〜97 → 弱 / 98〜99 → 強
    expect(drawKoyakuHint(seqRng([79]), 'REPLAY')).toBeNull();
    expect(drawKoyakuHint(seqRng([80, 0]), 'REPLAY')).toEqual({ slot: 'KOYU_1', strong: false });
    // スロット累計: KOYU_1 22 / KOYU_2 44 / KOYU_3 66 / KYOTSU_1 83 / KYOTSU_2 100
    expect(drawKoyakuHint(seqRng([98, 66]), 'REPLAY')).toEqual({ slot: 'KYOTSU_1', strong: true });
    expect(drawKoyakuHint(seqRng([99, 99]), 'REPLAY')).toEqual({ slot: 'KYOTSU_2', strong: true });
  });

  it('レア役ほど発生・強が出やすい(大量試行で発生率がテーブルへ収束)', () => {
    const trials = 20000;
    const rng = createRng(7);
    for (const [role, [none]] of Object.entries(KOYAKU_HINT_TABLE)) {
      if (none >= SCENARIO_DENOM) continue;
      let hits = 0;
      for (let i = 0; i < trials; i++) {
        if (drawKoyakuHint(rng, role as (typeof ROLES)[number]) !== null) hits++;
      }
      const p = (SCENARIO_DENOM - none) / SCENARIO_DENOM;
      const exp = trials * p;
      const sigma = Math.sqrt(trials * p * (1 - p));
      expect(Math.abs(hits - exp), role).toBeLessThanOrEqual(sigma * 4);
    }
  });
});

describe('drawAtYokoku(AT 小役パート予告 = Q17。成立役ベース)', () => {
  it('振分けが一意の役は乱数を消費しない(ハズレ・リプレイ = なし / ベル = ナビ / 中段チェ・リーチ目 = 強)', () => {
    expect(drawAtYokoku(seqRng([]), 'NONE')).toBeNull();
    expect(drawAtYokoku(seqRng([]), 'REPLAY')).toBeNull();
    expect(drawAtYokoku(seqRng([]), 'BELL')).toBe('AT_NAVI');
    expect(drawAtYokoku(seqRng([]), 'CHERRY_CENTER')).toBe('AT_STRONG');
    expect(drawAtYokoku(seqRng([]), 'REACH_ME')).toBe('AT_STRONG');
  });

  it('弱スイカ [0, 0, 90, 10]: 89 → レア役示唆 / 90 → 強予告', () => {
    expect(drawAtYokoku(seqRng([89]), 'WATERMELON_WEAK')).toBe('AT_RARE');
    expect(drawAtYokoku(seqRng([90]), 'WATERMELON_WEAK')).toBe('AT_STRONG');
  });

  it('強スイカ [0, 0, 40, 60]: 39 → レア役示唆 / 40 → 強予告', () => {
    expect(drawAtYokoku(seqRng([39]), 'WATERMELON_STRONG')).toBe('AT_RARE');
    expect(drawAtYokoku(seqRng([40]), 'WATERMELON_STRONG')).toBe('AT_STRONG');
  });
});

describe('drawBattleRoute / drawRevival(バトル演出 = Q18)', () => {
  it('開始時確定 = 勝利ルート / 未確定 = 敗北寄りルートから継続率列で抽せん(固定値)', () => {
    // AT 継続確定 × 0.66: W1 = 24 → 値 0 は W1、値 99 は W8
    expect(drawBattleRoute(seqRng([0]), 'NORMAL', true, 0.66)).toMatchObject({
      id: 'W1',
      outcome: 'WIN',
    });
    expect(drawBattleRoute(seqRng([99]), 'NORMAL', true, 0.66)).toMatchObject({
      id: 'W8',
      chanceUps: [1, 2, 3],
    });
    // AT 未確定 × 0.88: U1 = 28 → 値 28 は U2
    expect(drawBattleRoute(seqRng([28]), 'NORMAL', false, 0.88)).toMatchObject({
      id: 'U2',
      outcome: 'LOSE',
    });
    // 上位 AT(0.93 固定)
    expect(drawBattleRoute(seqRng([0]), 'UPPER', true, 0.93)).toMatchObject({ id: 'W1' });
    expect(drawBattleRoute(seqRng([99]), 'UPPER', false, 0.93)).toMatchObject({
      id: 'U5',
      outcome: 'LOSE',
    });
  });

  it('未知の継続率は throw(テーブル選択は battleRouteTable と一致)', () => {
    expect(() => drawBattleRoute(seqRng([0]), 'NORMAL', true, 0.5)).toThrow();
    expect(battleRouteTable('NORMAL', true)).toBe(AT_BATTLE_WIN_ROUTES);
    expect(battleRouteTable('NORMAL', false)).toBe(AT_BATTLE_LOSE_ROUTES);
    expect(battleRouteTable('UPPER', true)).toBe(UPPER_BATTLE_WIN_ROUTES);
    expect(battleRouteTable('UPPER', false)).toBe(UPPER_BATTLE_LOSE_ROUTES);
  });

  it('復活告知(固定値): 値 0 → R1 / 値 99 → 最終行', () => {
    expect(drawRevival(seqRng([0]), 'NORMAL')).toEqual({ id: 'R1', label: '義経、立ち上がる(弱)' });
    expect(drawRevival(seqRng([99]), 'NORMAL')).toEqual({ id: 'R6', label: '桜花繚乱・復活' });
    expect(drawRevival(seqRng([99]), 'UPPER')).toEqual({ id: 'R5', label: '雪原の奇跡' });
  });

  it('大量試行: AT 確定 × 0.66 のルート分布がテーブルへ収束する', () => {
    const trials = 20000;
    const rng = createRng(20260718);
    const counts: Record<string, number> = {};
    for (let i = 0; i < trials; i++) {
      const route = drawBattleRoute(rng, 'NORMAL', true, 0.66);
      counts[route.id] = (counts[route.id] ?? 0) + 1;
    }
    for (const row of AT_BATTLE_WIN_ROUTES) {
      const p = row.weights[0] / SCENARIO_DENOM;
      const exp = trials * p;
      const sigma = Math.sqrt(trials * p * (1 - p));
      expect(Math.abs((counts[row.id] ?? 0) - exp), row.id).toBeLessThanOrEqual(sigma * 4);
    }
  });
});
