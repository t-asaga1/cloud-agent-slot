import { describe, expect, it } from 'vitest';
import { BELL_MISS_DENOM, drawBellMiss } from './lottery';
import { BELL_PAYOUT, BET_PER_GAME } from './payout';
import {
  decidePush,
  drawNaviPushOrder,
  NAVI_PUSH_ORDERS,
  NORMAL_PUSH_ORDER,
  playGame,
} from './play';
import { KOMA_COUNT, REEL_LAYOUT } from './reel';
import { createRng } from './rng';
import type { GameState } from './state';

function normalState(overrides: Partial<GameState> = {}): GameState {
  return {
    mode: 'NORMAL',
    background: 'YOSHITSUNE',
    backgroundGames: 0,
    phase: { type: 'NORMAL' },
    pendingBackgroundTrigger: null,
    totalGames: 0,
    netCoins: 0,
    replayCarry: false,
    ...overrides,
  };
}

function atState(): GameState {
  return normalState({
    phase: {
      type: 'AT',
      tier: 'NORMAL',
      part: 'KOYAKU',
      partGame: 1,
      renchan: 1,
      continueRate: 0.66,
      vStock: 0,
      continueConfirmed: false,
    },
  });
}

function sevenWaitState(game = 0): GameState {
  return normalState({ mode: 'HONZENCHO', phase: { type: 'SEVEN_WAIT', game } });
}

describe('decidePush(打ち方ポリシー = 確定 26)', () => {
  it('通常時は役によらず左第一(順押し)', () => {
    const rng = createRng(1);
    expect(decidePush(normalState(), 'BELL', rng).pushOrder).toBe(NORMAL_PUSH_ORDER);
    expect(decidePush(normalState(), 'REPLAY', rng).pushOrder).toBe(NORMAL_PUSH_ORDER);
    expect(decidePush(normalState(), 'NONE', rng).pushOrder).toBe(NORMAL_PUSH_ORDER);
  });

  it('AT 中のベルはナビ遵守(正解 4 通りのどれか)・ベル以外は左第一のまま', () => {
    const rng = createRng(1);
    expect(NAVI_PUSH_ORDERS).toContain(decidePush(atState(), 'BELL', rng).pushOrder);
    expect(decidePush(atState(), 'REPLAY', rng).pushOrder).toBe(NORMAL_PUSH_ORDER);
    expect(decidePush(atState(), 'CHERRY_CORNER', rng).pushOrder).toBe(NORMAL_PUSH_ORDER);
  });

  it('押下位置は左・中・右の順に乱数 3 個を消費する(通常時は押し順抽せんなし)', () => {
    const rng = createRng(42);
    const expected = [rng.nextInt(20), rng.nextInt(20), rng.nextInt(20)];
    const decision = decidePush(normalState(), 'BELL', createRng(42));
    expect(decision.pushPositions).toEqual(expected);
  });

  it('赤7待機中(確定 37)は全リール赤7 狙い(0〜4 コマ手前)の押下位置になる', () => {
    // 赤7 のコマ index(SPEC「3.」: 左 3 / 中 10 / 右 5 = コマ番号 4 / 11 / 6)
    const sevenIndexes = [0, 1, 2].map((reel) =>
      REEL_LAYOUT[reel as 0 | 1 | 2].indexOf('SEVEN_RED'),
    );
    for (let seed = 0; seed < 50; seed++) {
      const decision = decidePush(sevenWaitState(), 'REACH_ME', createRng(seed));
      expect(decision.pushOrder).toBe(NORMAL_PUSH_ORDER);
      decision.pushPositions.forEach((position, reel) => {
        const before = (sevenIndexes[reel] - position + KOMA_COUNT) % KOMA_COUNT;
        expect(before, `リール${reel}`).toBeGreaterThanOrEqual(0);
        expect(before, `リール${reel}`).toBeLessThanOrEqual(4);
      });
    }
  });

  it('ナビ中のベルはナビ押し順抽せん(1)→ 押下位置(3)の順に乱数を消費する(確定 36)', () => {
    for (let seed = 0; seed < 10; seed++) {
      const manual = createRng(seed);
      const expectedOrder = drawNaviPushOrder(manual);
      const expectedPositions = [
        manual.nextInt(KOMA_COUNT),
        manual.nextInt(KOMA_COUNT),
        manual.nextInt(KOMA_COUNT),
      ];
      const decision = decidePush(atState(), 'BELL', createRng(seed));
      expect(decision.pushOrder).toBe(expectedOrder);
      expect(decision.pushPositions).toEqual(expectedPositions);
    }
  });
});

describe('drawNaviPushOrder(ナビ押し順抽せん = 確定 36)', () => {
  it('候補は正解 4 通り(中左右・中右左・右左中・右中左 = 中・右第一のみ)', () => {
    expect(NAVI_PUSH_ORDERS).toEqual([
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ]);
    for (const order of NAVI_PUSH_ORDERS) expect(order[0]).not.toBe(0);
  });

  it('4 通りが均等(各 1/4)に抽せんされる(大量試行 ±4σ)', () => {
    const trials = 40_000;
    const rng = createRng(123);
    const counts = new Map<unknown, number>();
    for (let i = 0; i < trials; i++) {
      const order = drawNaviPushOrder(rng);
      expect(NAVI_PUSH_ORDERS).toContain(order);
      counts.set(order, (counts.get(order) ?? 0) + 1);
    }
    const p = 1 / NAVI_PUSH_ORDERS.length;
    const sigma = Math.sqrt(trials * p * (1 - p));
    for (const order of NAVI_PUSH_ORDERS) {
      expect(Math.abs((counts.get(order) ?? 0) - trials * p)).toBeLessThanOrEqual(4 * sigma);
    }
  });
});

describe('playGame(ヘッドレス 1G 実行)', () => {
  it('通常時のベルは左第一 = 12/13 こぼし(0 枚)/ 1/13 上段揃い 13 枚(確定 35)', () => {
    let aligned = 0;
    let missed = 0;
    for (let seed = 0; seed < 400; seed++) {
      const result = playGame(normalState(), createRng(seed), 'BELL');
      if (result.displayedRole === 'BELL') {
        // 揃い側(1/13): 上段揃い 13 枚
        expect(result.spin.lines).toEqual(['TOP']);
        expect(result.payout.payout).toBe(BELL_PAYOUT);
        aligned += 1;
      } else {
        // こぼし側(12/13): ハズレ目・払出 0
        expect(result.displayedRole).toBe('NONE');
        expect(result.spin.displayed).toBe('NONE');
        expect(result.payout.payout).toBe(0);
        missed += 1;
      }
    }
    // 400 シードで揃い・こぼしの両方が発生する(期待値 揃い ≒ 400/13 ≒ 31)
    expect(aligned).toBeGreaterThan(0);
    expect(missed).toBeGreaterThan(aligned);
  });

  it('AT 中のベルはナビ遵守 = 4 通りどのナビ押し順でも斜め揃い 13 枚(こぼし抽せんの結果に依らない)', () => {
    const seenOrders = new Set<unknown>();
    for (let seed = 0; seed < 80; seed++) {
      const result = playGame(atState(), createRng(seed), 'BELL');
      expect(NAVI_PUSH_ORDERS).toContain(result.push.pushOrder);
      seenOrders.add(result.push.pushOrder);
      expect(result.displayedRole).toBe('BELL');
      expect(
        result.spin.lines.some((line) => line === 'DOWN_RIGHT' || line === 'UP_RIGHT'),
      ).toBe(true);
      expect(result.payout.payout).toBe(BELL_PAYOUT);
    }
    // 80 シードで 4 通りすべてのナビ押し順が出現する(確定 36 の均等抽せん)
    expect(seenOrders.size).toBe(NAVI_PUSH_ORDERS.length);
  });

  it('ベル当選時の乱数消費 = こぼし 1 +(ナビ中のみ)ナビ押し順 1 + 押下位置 3(固定シード再現性)', () => {
    for (let seed = 0; seed < 10; seed++) {
      // 通常時: こぼし 1 → 押下位置 3
      const manualNormal = createRng(seed);
      drawBellMiss(manualNormal);
      const normalPositions = [
        manualNormal.nextInt(KOMA_COUNT),
        manualNormal.nextInt(KOMA_COUNT),
        manualNormal.nextInt(KOMA_COUNT),
      ];
      expect(playGame(normalState(), createRng(seed), 'BELL').push.pushPositions).toEqual(
        normalPositions,
      );
      // AT 中(ナビ): こぼし 1 → ナビ押し順 1 → 押下位置 3
      const manualAt = createRng(seed);
      drawBellMiss(manualAt);
      const expectedOrder = drawNaviPushOrder(manualAt);
      const atPositions = [
        manualAt.nextInt(KOMA_COUNT),
        manualAt.nextInt(KOMA_COUNT),
        manualAt.nextInt(KOMA_COUNT),
      ];
      const at = playGame(atState(), createRng(seed), 'BELL');
      expect(at.push.pushOrder).toBe(expectedOrder);
      expect(at.push.pushPositions).toEqual(atPositions);
    }
    // こぼし抽せんの分母は 13(12/13 こぼし)
    expect(BELL_MISS_DENOM).toBe(13);
  });

  it('赤7待機中は REACH_ME 強制 + 赤7 狙いで 1 ゲームで揃う(確定 37。forcedRole より優先)', () => {
    for (let seed = 0; seed < 50; seed++) {
      // forcedRole に別役を渡しても仕様上の REACH_ME 強制が最優先
      const result = playGame(sevenWaitState(), createRng(seed), 'NONE');
      expect(result.wonRole).toBe('REACH_ME');
      // 全リール赤7 狙い(目押し成功想定)は 100% 7 揃い(STEP 1e の網羅テスト済み)
      expect(result.displayedRole).toBe('REACH_ME');
      expect(result.events).toContainEqual({ type: 'SEVEN_ALIGNED' });
      expect(result.state.phase).toEqual({ type: 'AT_INTRO' });
    }
  });

  it('赤7待機中の乱数消費 = 押下位置 3 のみ(役抽せんなし。固定シード再現性)', () => {
    for (let seed = 0; seed < 10; seed++) {
      // 手動で同じ消費順序を再現: 役抽せんなし → 押下位置 3(赤7 狙い)
      const manual = createRng(seed);
      const sevenIndexes = [0, 1, 2].map((reel) =>
        REEL_LAYOUT[reel as 0 | 1 | 2].indexOf('SEVEN_RED'),
      );
      const expected = sevenIndexes.map(
        (index) => (index - manual.nextInt(5) + KOMA_COUNT) % KOMA_COUNT,
      );
      const result = playGame(sevenWaitState(), createRng(seed));
      expect(result.push.pushPositions).toEqual(expected);
    }
  });

  it('リプレイは 100% 引き込み + 次ゲームの BET 不要(replayCarry)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const result = playGame(normalState(), createRng(seed), 'REPLAY');
      expect(result.displayedRole).toBe('REPLAY');
      expect(result.state.replayCarry).toBe(true);
      expect(result.payout.net).toBe(-BET_PER_GAME);
      // 持越しゲーム: 投入 0
      const next = playGame(result.state, createRng(seed + 100), 'NONE');
      expect(next.payout.net).toBe(0);
    }
  });

  it('適当押しのレア役は「揃う or 取りこぼし(NONE)」のみ(誤った役は表示されない)', () => {
    let displayed = 0;
    let missed = 0;
    for (let seed = 0; seed < 200; seed++) {
      const result = playGame(normalState(), createRng(seed), 'CHERRY_CORNER');
      expect(['CHERRY_CORNER', 'NONE']).toContain(result.displayedRole);
      if (result.displayedRole === 'CHERRY_CORNER') displayed += 1;
      else missed += 1;
    }
    // 角チェリーの引き込み可能押下位置は 12/20(1d の網羅テスト)。揃い・こぼし両方発生する
    expect(displayed).toBeGreaterThan(0);
    expect(missed).toBeGreaterThan(0);
  });

  it('advanceGame へ表示役が配線される(取りこぼし時は displayedRole = NONE で払出 0)', () => {
    const result = playGame(normalState(), createRng(3), 'CHERRY_CORNER');
    expect(result.wonRole).toBe('CHERRY_CORNER');
    expect(result.displayedRole).toBe(result.spin.displayed);
    if (result.displayedRole === 'NONE') {
      expect(result.payout.payout).toBe(0);
    } else {
      expect(result.payout.payout).toBeGreaterThan(0);
    }
    // 取りこぼしでも内部当選役で状態抽せんされる(netCoins 以外の検証は state.test.ts)
    expect(result.state.totalGames).toBe(1);
  });

  it('forcedRole 省略時は役抽せんから乱数を消費する(固定シードで再現可能)', () => {
    const a = playGame(normalState(), createRng(7));
    const b = playGame(normalState(), createRng(7));
    expect(a.wonRole).toBe(b.wonRole);
    expect(a.spin.positions).toEqual(b.spin.positions);
    expect(a.state).toEqual(b.state);
  });
});
