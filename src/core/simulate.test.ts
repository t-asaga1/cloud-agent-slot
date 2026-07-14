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
    // ナビ押し順抽せん(確定 36)が playGame の乱数列へ加わったため取り直し(2026-07-14。
    // 前回はベルこぼし抽せん = 確定 35 の追加時)
    expect(stats.coinsIn).toBe(258675);
    expect(stats.coinsOut).toBe(328477);
    expect(stats.normal.games).toBe(68606);
    expect(stats.at.games).toBe(GAMES - 68606);
    expect(stats.atCount).toBe(283);
    expect(stats.totalSets).toBe(1703);
    expect(stats.upperAtCount).toBe(49);
    expect(stats.endingCount).toBe(74);
    expect(stats.endingCompleteCount).toBe(25);
    expect(stats.vStockGains).toBe(280);
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
    // 2026-07-12 計測(docs/SIMULATION_REPORT.md。確定 29〜31 反映後): 機械割 ≒ 138% / 初当り ≒ 1/215
    expect(stats.payoutRate).toBeGreaterThan(1.25);
    expect(stats.payoutRate).toBeLessThan(1.55);
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
    // リプレイは 100% 引き込み(取りこぼしなし)
    expect(stats.roleDisplayed.REPLAY).toBe(stats.roleWon.REPLAY);
    // ベルは通常時(左第一)の 12/13 がこぼしになる(確定 35)。表示率 ≒
    // AT 区間割合 + 通常区間割合 × 1/13 で、当選数より確実に少ない
    expect(stats.roleDisplayed.BELL).toBeLessThan(stats.roleWon.BELL);
    const atRatio = stats.at.games / stats.games;
    const expectedBellDisplayRatio = atRatio + (1 - atRatio) / 13;
    expect(stats.roleDisplayed.BELL / stats.roleWon.BELL).toBeCloseTo(
      expectedBellDisplayRatio,
      1,
    );
    // 適当押しのレア役は取りこぼしが発生する
    expect(stats.roleDisplayed.CHERRY_CORNER).toBeLessThan(stats.roleWon.CHERRY_CORNER);
  });

  it('純関数性: 同じシード・G 数で全指標が再現される', () => {
    const again = simulate(3000, SEED);
    const once = simulate(3000, SEED);
    expect(again).toEqual(once);
  });
});
