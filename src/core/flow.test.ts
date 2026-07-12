import { describe, expect, it } from 'vitest';
import { RENZOKU_GAMES } from './omen';
import { playGame, type PlayResult } from './play';
import { createRng } from './rng';
import { ENDING_GAMES, initGameState, type GameEvent } from './state';

/**
 * 通しフロー統合テスト(STEP 2e)。
 * ヘッドレス 1G 実行(`playGame`)で実際に遊技を回し、
 * 「通常 → 前兆 → 連続演出 → AT → セット継続 → 上位 AT → エンディング →
 * AT 終了後の再抽せん → 通常」の一連遷移をイベント列と毎 G のフェーズで検証する。
 *
 * シード 16 は 537G 目までにエンディング経由の AT 終了へ到達する
 * (`scripts/run_simulation.ts` と同じ乱数消費順序。乱数消費を変える変更をしたら
 * このシード・G 数は取り直すこと)。
 */

const SEED = 16;
const MAX_GAMES = 600;

interface TimelineEntry extends PlayResult {
  /** 0 始まりのゲーム番号 */
  index: number;
}

function runTimeline(seed: number, games: number): TimelineEntry[] {
  const rng = createRng(seed);
  let state = initGameState(rng);
  const timeline: TimelineEntry[] = [];
  for (let i = 0; i < games; i++) {
    const result = playGame(state, rng);
    state = result.state;
    timeline.push({ ...result, index: i });
  }
  return timeline;
}

function firstIndex(
  timeline: TimelineEntry[],
  pred: (event: GameEvent) => boolean,
  from = 0,
): number {
  for (let i = from; i < timeline.length; i++) {
    if (timeline[i].events.some(pred)) return i;
  }
  return -1;
}

function eventsIn(timeline: TimelineEntry[], from: number, to: number): GameEvent[] {
  return timeline.slice(from, to + 1).flatMap((entry) => entry.events);
}

describe('通しフロー統合(通常 → 前兆 → AT → 上位 AT → エンディング → 通常)', () => {
  const timeline = runTimeline(SEED, MAX_GAMES);

  const endingIdx = firstIndex(timeline, (e) => e.type === 'ENDING_START');
  // エンディングへ到達する初当り(この AT の開始)を特定する
  const atStarts = timeline
    .map((entry, i) => (entry.events.some((e) => e.type === 'AT_START') ? i : -1))
    .filter((i) => i >= 0);
  const atStartIdx = Math.max(...atStarts.filter((i) => i <= endingIdx));
  const upperIdx = firstIndex(timeline, (e) => e.type === 'UPPER_AT_ENTER', atStartIdx);
  const atEndIdx = firstIndex(timeline, (e) => e.type === 'AT_END', endingIdx);

  it('エンディングまでの一連イベントがすべて発生している', () => {
    expect(atStartIdx).toBeGreaterThanOrEqual(0);
    expect(upperIdx).toBeGreaterThan(atStartIdx);
    expect(endingIdx).toBeGreaterThan(upperIdx);
    expect(atEndIdx).toBe(endingIdx + ENDING_GAMES);
  });

  it('AT 突入ゲーム = 連続演出成功の告知ゲーム(次 G から AT 1G 目 = 確定 19)', () => {
    const entry = timeline[atStartIdx];
    expect(entry.events).toContainEqual(
      expect.objectContaining({ type: 'RENZOKU_RESULT', success: true }),
    );
    expect(entry.state.phase).toMatchObject({
      type: 'AT',
      tier: 'NORMAL',
      part: 'KOYAKU',
      partGame: 0,
      renchan: 1,
    });
    // 直前の RENZOKU_GAMES - 1 ゲームは連続演出中(1〜3G 目)
    for (let g = 1; g < RENZOKU_GAMES; g++) {
      expect(timeline[atStartIdx - g].state.phase).toMatchObject({
        type: 'RENZOKU',
        game: RENZOKU_GAMES - g,
      });
    }
  });

  it('連続演出の前は前兆(OMEN)を全 G 消化している(前兆 → 連続演出 = 確定 19)', () => {
    const renzokuStartIdx = atStartIdx - (RENZOKU_GAMES - 1);
    expect(timeline[renzokuStartIdx].events).toContainEqual(
      expect.objectContaining({ type: 'RENZOKU_START' }),
    );
    // 連続演出 1G 目の直前は前兆最終 G(game === totalGames)
    const lastOmen = timeline[renzokuStartIdx - 1].state.phase;
    expect(lastOmen.type).toBe('OMEN');
    if (lastOmen.type === 'OMEN') {
      expect(lastOmen.game).toBe(lastOmen.totalGames);
      // 前兆 1G 目まで遡れる(当せんゲーム game: 0 か初期スケジュールが起点)
      for (let g = 1; g <= lastOmen.totalGames; g++) {
        expect(timeline[renzokuStartIdx - g].state.phase).toMatchObject({
          type: 'OMEN',
          game: lastOmen.totalGames - g + 1,
        });
      }
    }
  });

  it('通常 AT 10 連(セット継続 9 回)→ 上位 AT へ(連チャンリセット・0.93 固定 = 確定 12)', () => {
    const events = eventsIn(timeline, atStartIdx, upperIdx);
    const normalContinues = events.filter(
      (e) => e.type === 'AT_SET_CONTINUE' && e.tier === 'NORMAL',
    );
    expect(normalContinues).toHaveLength(9);
    expect(events.filter((e) => e.type === 'AT_END')).toHaveLength(0);
    const upperEntry = timeline[upperIdx];
    expect(upperEntry.state.phase).toMatchObject({
      type: 'AT',
      tier: 'UPPER',
      renchan: 1,
      continueRate: 0.93,
    });
  });

  it('上位 AT 10 連(セット継続 9 回)→ エンディングへ(確定 12)', () => {
    const events = eventsIn(timeline, upperIdx, endingIdx);
    const upperContinues = events.filter(
      (e) => e.type === 'AT_SET_CONTINUE' && e.tier === 'UPPER',
    );
    expect(upperContinues).toHaveLength(9);
    expect(events.filter((e) => e.type === 'AT_END')).toHaveLength(0);
    expect(timeline[endingIdx].state.phase).toEqual({ type: 'ENDING', game: 0 });
  });

  it('エンディング消化 → AT 終了処理(モード・背景再抽せん)→ 通常へ復帰', () => {
    const entry = timeline[atEndIdx];
    const atEnd = entry.events.find((e) => e.type === 'AT_END');
    expect(atEnd).toMatchObject({ type: 'AT_END', reason: 'ENDING' });
    if (atEnd?.type !== 'AT_END') throw new Error('unreachable');
    // 再抽せん結果が state へ反映され、フェーズは通常(本前兆リドローなら前兆 game: 0)
    expect(entry.state.mode).toBe(atEnd.mode);
    expect(entry.state.background).toBe(atEnd.background);
    expect(entry.state.backgroundGames).toBe(0);
    if (atEnd.mode === 'HONZENCHO') {
      expect(entry.state.phase).toMatchObject({ type: 'OMEN', kind: 'REAL', game: 0 });
    } else {
      expect(entry.state.phase).toEqual({ type: 'NORMAL' });
    }
    // AT 終了後も遊技が継続する(次ゲームが通常区間として消化される)
    expect(timeline[atEndIdx + 1].state.totalGames).toBe(atEndIdx + 2);
  });

  it('大域不変条件: AT_START = 連続演出成功数 / 差枚集計 = 毎 G 払出の合計', () => {
    const all = eventsIn(timeline, 0, timeline.length - 1);
    const successCount = all.filter(
      (e) => e.type === 'RENZOKU_RESULT' && e.success,
    ).length;
    expect(all.filter((e) => e.type === 'AT_START')).toHaveLength(successCount);
    // 連続演出失敗の告知ゲームは通常へ戻る
    for (const entry of timeline) {
      if (entry.events.some((e) => e.type === 'RENZOKU_RESULT' && !e.success)) {
        expect(entry.state.phase).toEqual({ type: 'NORMAL' });
      }
    }
    const netSum = timeline.reduce((sum, entry) => sum + entry.payout.net, 0);
    expect(timeline[timeline.length - 1].state.netCoins).toBe(netSum);
  });
});
