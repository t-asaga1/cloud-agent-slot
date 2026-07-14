import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../core/state';
import {
  cloneStats,
  initPlayStats,
  pushGameStats,
  slumpGraphData,
  statsOnFinish,
  statsSummary,
  type StatsInput,
} from './playStats';

const AT_START: GameEvent = { type: 'AT_START', continueRate: 0.79 };
const SET_CONTINUE: GameEvent = { type: 'AT_SET_CONTINUE', tier: 'NORMAL', renchan: 2 };
const UPPER_ENTER: GameEvent = { type: 'UPPER_AT_ENTER' };
const ENDING_START: GameEvent = { type: 'ENDING_START', after: 'UPPER_AT' };
const AT_END: GameEvent = {
  type: 'AT_END',
  reason: 'DEFEAT',
  mode: 'NORMAL',
  background: 'YOSHITSUNE',
};

function input(partial: Partial<StatsInput>): StatsInput {
  return { game: 1, netCoins: 0, net: 0, wasAtGame: false, events: [], ...partial };
}

describe('遊技データの収集(STEP 6a)', () => {
  it('初期状態: 差枚推移は遊技開始時点の 0 のみ・AT 履歴なし', () => {
    expect(initPlayStats()).toEqual({ slump: [0], atRecords: [], lastAtEndGame: 0 });
  });

  it('毎ゲームの差枚をゲーム順に記録する', () => {
    let stats = initPlayStats();
    stats = statsOnFinish(stats, input({ game: 1, netCoins: -3 }));
    stats = statsOnFinish(stats, input({ game: 2, netCoins: 7 }));
    expect(stats.slump).toEqual([0, -3, 7]);
  });

  it('statsOnFinish は純関数(元の stats を変更しない)', () => {
    const stats = initPlayStats();
    const before = JSON.stringify(stats);
    statsOnFinish(stats, input({ game: 1, netCoins: -3, events: [AT_START] }));
    expect(JSON.stringify(stats)).toBe(before);
  });

  it('AT_START で AT 履歴レコードを追加する(初当り G・ハマり G)', () => {
    let stats = initPlayStats();
    for (let game = 1; game <= 99; game++) {
      stats = statsOnFinish(stats, input({ game, netCoins: -3 * game }));
    }
    stats = statsOnFinish(stats, input({ game: 100, events: [AT_START] }));
    expect(stats.atRecords).toHaveLength(1);
    expect(stats.atRecords[0]).toMatchObject({
      hitGame: 100,
      normalGames: 100,
      sets: 1,
      gained: 0,
      finished: false,
    });
  });

  it('AT 突入ゲーム自体の純増は獲得枚数へ加算しない(wasAtGame = false のため)', () => {
    let stats = initPlayStats();
    stats = statsOnFinish(stats, input({ game: 1, net: 10, events: [AT_START] }));
    expect(stats.atRecords[0].gained).toBe(0);
  });

  it('AT 中(wasAtGame)のゲームは純増を進行中レコードへ加算する', () => {
    let stats = initPlayStats();
    stats = statsOnFinish(stats, input({ game: 1, events: [AT_START] }));
    stats = statsOnFinish(stats, input({ game: 2, net: 10, wasAtGame: true }));
    stats = statsOnFinish(stats, input({ game: 3, net: -3, wasAtGame: true }));
    expect(stats.atRecords[0].gained).toBe(7);
  });

  it('セット継続・上位 AT 移行でセット数を加算し、上位・エンディングのフラグを立てる', () => {
    let stats = initPlayStats();
    stats = statsOnFinish(stats, input({ game: 1, events: [AT_START] }));
    stats = statsOnFinish(stats, input({ game: 2, wasAtGame: true, events: [SET_CONTINUE] }));
    stats = statsOnFinish(stats, input({ game: 3, wasAtGame: true, events: [ENDING_START] }));
    stats = statsOnFinish(stats, input({ game: 4, wasAtGame: true, events: [UPPER_ENTER] }));
    expect(stats.atRecords[0]).toMatchObject({
      sets: 3, // 初当り 1 + 継続 1 + 上位移行 1(simulate.ts と同定義)
      upper: true,
      ending: true,
      finished: false,
    });
  });

  it('AT_END でレコードを確定し、以後の純増は加算しない(ハマり起点も更新)', () => {
    let stats = initPlayStats();
    stats = statsOnFinish(stats, input({ game: 10, events: [AT_START] }));
    stats = statsOnFinish(stats, input({ game: 11, net: 10, wasAtGame: true }));
    stats = statsOnFinish(stats, input({ game: 12, net: -3, wasAtGame: true, events: [AT_END] }));
    stats = statsOnFinish(stats, input({ game: 13, net: -3 }));
    expect(stats.atRecords[0]).toMatchObject({ gained: 7, finished: true });
    expect(stats.lastAtEndGame).toBe(12);
    // 2 回目の初当りのハマり G は前回 AT 終了から数える
    stats = statsOnFinish(stats, input({ game: 42, events: [AT_START] }));
    expect(stats.atRecords[1].normalGames).toBe(30);
  });

  it('cloneStats + pushGameStats(mutate)は statsOnFinish の繰り返しと同じ結果になる', () => {
    const inputs = [
      input({ game: 1, netCoins: -3, net: -3 }),
      input({ game: 2, netCoins: -3, net: 0, events: [AT_START] }),
      input({ game: 3, netCoins: 7, net: 10, wasAtGame: true, events: [SET_CONTINUE] }),
      input({ game: 4, netCoins: 4, net: -3, wasAtGame: true, events: [AT_END] }),
    ];
    let pure = initPlayStats();
    for (const i of inputs) pure = statsOnFinish(pure, i);
    const base = initPlayStats();
    const bulk = cloneStats(base);
    for (const i of inputs) pushGameStats(bulk, i);
    expect(bulk).toEqual(pure);
    // 元の base は変更されない
    expect(base).toEqual(initPlayStats());
  });

  it('statsSummary: 総 G・差枚・初当り・ハマり・平均値を集計する', () => {
    let stats = initPlayStats();
    stats = statsOnFinish(stats, input({ game: 1, netCoins: -3, net: -3 }));
    stats = statsOnFinish(stats, input({ game: 2, netCoins: -3, events: [AT_START] }));
    stats = statsOnFinish(stats, input({ game: 3, netCoins: 7, net: 10, wasAtGame: true }));
    stats = statsOnFinish(
      stats,
      input({ game: 4, netCoins: 17, net: 10, wasAtGame: true, events: [AT_END] }),
    );
    stats = statsOnFinish(stats, input({ game: 5, netCoins: 14, net: -3 }));
    const summary = statsSummary(stats);
    expect(summary).toMatchObject({
      totalGames: 5,
      net: 14,
      atCount: 1,
      currentNormalGames: 1, // 4G で AT 終了 → 5G 消化 = ハマり 1G
      avgSets: 1,
      avgGained: 20,
      maxGained: 20,
    });
    expect(summary.hitDenominator).toBeCloseTo(5);
  });

  it('statsSummary: AT 進行中はハマり G を出さず、平均は終了済みのみで計算する', () => {
    let stats = initPlayStats();
    stats = statsOnFinish(stats, input({ game: 1, events: [AT_START] }));
    stats = statsOnFinish(stats, input({ game: 2, net: 10, wasAtGame: true }));
    const summary = statsSummary(stats);
    expect(summary.currentNormalGames).toBeUndefined();
    expect(summary.avgSets).toBeUndefined();
    expect(summary.avgGained).toBeUndefined();
    expect(summary.maxGained).toBe(10); // 進行中を含む
  });

  it('slumpGraphData: 差枚推移を width × height の座標列へ正規化する(0 基準線あり)', () => {
    const data = slumpGraphData([0, 10, -10], 100, 50);
    // max 10 / min -10 / range 20。y = (max - v) / range * height
    expect(data.max).toBe(10);
    expect(data.min).toBe(-10);
    expect(data.zeroY).toBe(25);
    expect(data.points).toBe('0.0,25.0 50.0,0.0 100.0,50.0');
  });

  it('slumpGraphData: 全て 0 でも range 1 で描画できる(ゼロ割りなし)', () => {
    const data = slumpGraphData([0], 100, 50);
    expect(data.points).toBe('0.0,0.0');
    expect(data.zeroY).toBe(0);
    expect(Number.isFinite(data.zeroY)).toBe(true);
  });

  it('slumpGraphData: 点数が maxPoints を超えたら間引き、最終点は必ず含める', () => {
    const slump = Array.from({ length: 2001 }, (_, i) => i);
    const data = slumpGraphData(slump, 1000, 100, 240);
    const points = data.points.split(' ');
    expect(points.length).toBeLessThanOrEqual(241);
    // 最終点(x = width, y = 最大値の位置 = 0)
    expect(points.at(-1)).toBe('1000.0,0.0');
  });
});
