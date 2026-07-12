import { describe, expect, it } from 'vitest';
import { simulate } from './simulate';

/**
 * 固定シードのシミュレーション統計テスト(STEP 2e。回帰検出用)。
 *
 * - 固定値の検証: 乱数消費順序・抽せんテーブル・リール制御・打ち方ポリシーの
 *   どれかが変わると値が動く(意図した変更なら値を取り直して更新する)。
 * - 範囲の検証: SPEC の設計想定値(確定 16・26 と Excel 記載値)との整合。
 *   機械割・初当りは設計想定値なし = 計測値(docs/SIMULATION_REPORT.md)を
 *   基準にした回帰範囲(仕様値ではない。ユーザー妥当性確認は 2e で依頼済み)。
 */

const SEED = 20260712;
const GAMES = 100_000;

describe(`simulate(固定シード ${SEED} / ${GAMES}G)`, () => {
  const stats = simulate(GAMES, SEED);

  it('固定値: 投入・払出・初当り・セット・上位 AT・エンディング(回帰検出)', () => {
    expect(stats.coinsIn).toBe(259098);
    expect(stats.coinsOut).toBe(401215);
    expect(stats.normal.games).toBe(59937);
    expect(stats.at.games).toBe(GAMES - 59937);
    expect(stats.atCount).toBe(271);
    expect(stats.totalSets).toBe(2222);
    expect(stats.upperAtCount).toBe(80);
    expect(stats.endingCount).toBe(71);
    expect(stats.vStockGains).toBe(371);
  });

  it('通常時純増 ≒ -1.8 枚/G(SPEC 想定)', () => {
    expect(stats.normal.netPerGame).toBeGreaterThan(-2.0);
    expect(stats.normal.netPerGame).toBeLessThan(-1.6);
  });

  it('AT 中純増 ≒ +6.4 枚/G(SPEC 想定)', () => {
    expect(stats.at.netPerGame).toBeGreaterThan(6.0);
    expect(stats.at.netPerGame).toBeLessThan(6.9);
  });

  it('コイン持ち ≒ 27G/50 枚(確定 16)', () => {
    expect(stats.coinHold50).toBeGreaterThan(25);
    expect(stats.coinHold50).toBeLessThan(29);
  });

  it('機械割・初当りは計測値基準の回帰範囲(設計想定値なし = 確定 26)', () => {
    // 2026-07-12 計測(docs/SIMULATION_REPORT.md): 機械割 ≒ 155% / 初当り ≒ 1/220
    expect(stats.payoutRate).toBeGreaterThan(1.4);
    expect(stats.payoutRate).toBeLessThan(1.7);
    expect(stats.hitDenominator).toBeGreaterThan(180);
    expect(stats.hitDenominator).toBeLessThan(280);
  });

  it('整合性: 区間合計 = 総計 / 平均値の再計算が一致', () => {
    expect(stats.normal.games + stats.at.games).toBe(stats.games);
    expect(stats.coinsIn).toBe(stats.normal.coinsIn + stats.at.coinsIn);
    expect(stats.coinsOut).toBe(stats.normal.coinsOut + stats.at.coinsOut);
    expect(stats.payoutRate).toBeCloseTo(stats.coinsOut / stats.coinsIn, 10);
    expect(stats.avgSets).toBeCloseTo(stats.totalSets / stats.atCount, 10);
    expect(stats.avgAtNet).toBeCloseTo(stats.at.net / stats.atCount, 10);
  });

  it('役抽せんの検算: リプレイ・ベルの当選回数が理論値 ±4σ 以内', () => {
    // リプレイ 8970/65536・ベル 45000/65536(lottery.ts)
    for (const [count, p] of [
      [stats.roleWon.REPLAY, 8970 / 65536],
      [stats.roleWon.BELL, 45000 / 65536],
    ] as const) {
      const mean = GAMES * p;
      const sigma = Math.sqrt(GAMES * p * (1 - p));
      expect(Math.abs(count - mean)).toBeLessThan(4 * sigma);
    }
    // リプレイ・ベルは 100% 引き込み(取りこぼしなし)
    expect(stats.roleDisplayed.REPLAY).toBe(stats.roleWon.REPLAY);
    expect(stats.roleDisplayed.BELL).toBe(stats.roleWon.BELL);
    // 適当押しのレア役は取りこぼしが発生する
    expect(stats.roleDisplayed.CHERRY_CORNER).toBeLessThan(stats.roleWon.CHERRY_CORNER);
  });

  it('純関数性: 同じシード・G 数で全指標が再現される', () => {
    const again = simulate(3000, SEED);
    const once = simulate(3000, SEED);
    expect(again).toEqual(once);
  });
});
