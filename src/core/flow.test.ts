import { describe, expect, it } from 'vitest';
import { RENZOKU_GAMES } from './omen';
import { playGame, type PlayResult } from './play';
import { createRng } from './rng';
import { ENDING_GAMES, initGameState, type GameEvent } from './state';

/**
 * 通しフロー統合テスト(STEP 2e。確定 29〜31・37 反映済み)。
 * ヘッドレス 1G 実行(`playGame`)で実際に遊技を回し、
 * 「通常 → 前兆 → 連続演出 → 赤7待機 → AT 導入 → AT → セット継続 → 10 連勝利 →
 * エンディング 10G → 上位 AT → 10 連勝利 → エンディング 10G →
 * AT 終了後の再抽せん → 通常」の一連遷移をイベント列と毎 G のフェーズで検証する。
 *
 * シード 115 は 432G 目までにエンディング(上位 AT 10 連)経由の AT 終了へ到達する
 * (`scripts/run_simulation.ts` と同じ乱数消費順序。乱数消費を変える変更をしたら
 * このシード・G 数は取り直すこと。赤7待機・AT 導入(確定 37)の追加でシード 1 から
 * 取り直し済み = 2026-07-14。その前はナビ押し順抽せん(確定 36)でシード 73 から、
 * ベルこぼし抽せん(確定 35)でシード 30 から取り直し)。
 */

const SEED = 115;
const MAX_GAMES = 450;

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

describe('通しフロー統合(通常 → 前兆 → AT → エンディング → 上位 AT → エンディング → 通常)', () => {
  const timeline = runTimeline(SEED, MAX_GAMES);

  // 上位 AT 10 連完走(AT_END reason ENDING)から遡って同一 AT の各イベントを特定する
  const atEndIdx = firstIndex(
    timeline,
    (e) => e.type === 'AT_END' && e.reason === 'ENDING',
  );
  // 2 回目のエンディング(上位 AT 10 連。after = AT_END)の開始ゲーム
  const ending2Idx = atEndIdx - ENDING_GAMES;
  // この AT の上位 AT 移行ゲーム(= 1 回目のエンディング消化ゲーム)
  const upperStarts = timeline
    .map((entry, i) => (entry.events.some((e) => e.type === 'UPPER_AT_ENTER') ? i : -1))
    .filter((i) => i >= 0 && i <= ending2Idx);
  const upperIdx = Math.max(...upperStarts);
  // 1 回目のエンディング(通常 AT 10 連。after = UPPER_AT)の開始ゲーム
  const ending1Idx = upperIdx - ENDING_GAMES;
  // この AT の初当りゲーム
  const atStarts = timeline
    .map((entry, i) => (entry.events.some((e) => e.type === 'AT_START') ? i : -1))
    .filter((i) => i >= 0 && i <= ending1Idx);
  const atStartIdx = Math.max(...atStarts);

  it('エンディング完走までの一連イベントがすべて発生している', () => {
    expect(atStartIdx).toBeGreaterThanOrEqual(0);
    expect(ending1Idx).toBeGreaterThan(atStartIdx);
    expect(upperIdx).toBe(ending1Idx + ENDING_GAMES);
    expect(ending2Idx).toBeGreaterThan(upperIdx);
    expect(atEndIdx).toBe(ending2Idx + ENDING_GAMES);
    expect(timeline[ending1Idx].events).toContainEqual({
      type: 'ENDING_START',
      after: 'UPPER_AT',
    });
    expect(timeline[ending2Idx].events).toContainEqual({
      type: 'ENDING_START',
      after: 'AT_END',
    });
  });

  it('AT 突入 = 成功告知 → 赤7待機(1G で揃う)→ AT 導入 1G → 次 G から AT 1G 目(確定 19・37)', () => {
    // AT_START = AT 導入ゲーム(次 G から AT 小役 1G 目)
    const entry = timeline[atStartIdx];
    expect(entry.state.phase).toMatchObject({
      type: 'AT',
      tier: 'NORMAL',
      part: 'KOYAKU',
      partGame: 0,
      renchan: 1,
    });
    // 1 つ前 = 赤7待機ゲーム(打ち方ポリシーの赤7 狙いで 1G で揃う = SEVEN_ALIGNED)
    const alignedEntry = timeline[atStartIdx - 1];
    expect(alignedEntry.wonRole).toBe('REACH_ME');
    expect(alignedEntry.displayedRole).toBe('REACH_ME');
    expect(alignedEntry.events).toContainEqual({ type: 'SEVEN_ALIGNED' });
    expect(alignedEntry.state.phase).toEqual({ type: 'AT_INTRO' });
    // 2 つ前 = 連続演出成功の告知ゲーム(AT 確定 → 赤7待機へ)
    const successEntry = timeline[atStartIdx - 2];
    expect(successEntry.events).toContainEqual(
      expect.objectContaining({ type: 'RENZOKU_RESULT', success: true }),
    );
    expect(successEntry.state.phase).toEqual({ type: 'SEVEN_WAIT', game: 0 });
    // その前の RENZOKU_GAMES - 1 ゲームは連続演出中(1〜3G 目)
    for (let g = 1; g < RENZOKU_GAMES; g++) {
      expect(timeline[atStartIdx - 2 - g].state.phase).toMatchObject({
        type: 'RENZOKU',
        game: RENZOKU_GAMES - g,
      });
    }
  });

  it('連続演出の前は前兆(OMEN)を全 G 消化している(前兆 → 連続演出 = 確定 19)', () => {
    const renzokuStartIdx = atStartIdx - 2 - (RENZOKU_GAMES - 1);
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

  it('通常 AT 10 連(セット継続 9 回)→ 10 連目勝利でエンディングへ(確定 30)', () => {
    const events = eventsIn(timeline, atStartIdx, ending1Idx);
    const normalContinues = events.filter(
      (e) => e.type === 'AT_SET_CONTINUE' && e.tier === 'NORMAL',
    );
    expect(normalContinues).toHaveLength(9);
    expect(events.filter((e) => e.type === 'AT_END')).toHaveLength(0);
    expect(timeline[ending1Idx].state.phase).toMatchObject({
      type: 'ENDING',
      game: 0,
      after: 'UPPER_AT',
    });
  });

  it('エンディング 10G 消化(確定 31)→ 上位 AT へ(連チャンリセット・0.93 固定 = 確定 12・29)', () => {
    // エンディング 1〜9G 目は ENDING フェーズのまま経過(10G 目の消化で上位 AT へ)
    for (let g = 1; g < ENDING_GAMES; g++) {
      expect(timeline[ending1Idx + g].state.phase).toMatchObject({
        type: 'ENDING',
        game: g,
        after: 'UPPER_AT',
      });
    }
    const upperEntry = timeline[upperIdx];
    expect(upperEntry.events).toContainEqual({ type: 'UPPER_AT_ENTER' });
    expect(upperEntry.state.phase).toMatchObject({
      type: 'AT',
      tier: 'UPPER',
      part: 'KOYAKU',
      partGame: 0,
      renchan: 1,
      continueRate: 0.93,
    });
  });

  it('上位 AT 10 連(セット継続 9 回)→ 10 連目勝利でエンディングへ(確定 12・30)', () => {
    const events = eventsIn(timeline, upperIdx, ending2Idx);
    const upperContinues = events.filter(
      (e) => e.type === 'AT_SET_CONTINUE' && e.tier === 'UPPER',
    );
    expect(upperContinues).toHaveLength(9);
    expect(events.filter((e) => e.type === 'AT_END')).toHaveLength(0);
    expect(timeline[ending2Idx].state.phase).toMatchObject({
      type: 'ENDING',
      game: 0,
      after: 'AT_END',
    });
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
