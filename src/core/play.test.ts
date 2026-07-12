import { describe, expect, it } from 'vitest';
import { BELL_PAYOUT_FAIL, BELL_PAYOUT_SUCCESS, BET_PER_GAME } from './payout';
import { decidePush, NAVI_PUSH_ORDER, NORMAL_PUSH_ORDER, playGame } from './play';
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

describe('decidePush(打ち方ポリシー = 確定 26)', () => {
  it('通常時は役によらず左第一(順押し)', () => {
    const rng = createRng(1);
    expect(decidePush(normalState(), 'BELL', rng).pushOrder).toBe(NORMAL_PUSH_ORDER);
    expect(decidePush(normalState(), 'REPLAY', rng).pushOrder).toBe(NORMAL_PUSH_ORDER);
    expect(decidePush(normalState(), 'NONE', rng).pushOrder).toBe(NORMAL_PUSH_ORDER);
  });

  it('AT 中のベルはナビ遵守(中第一)・ベル以外は左第一のまま', () => {
    const rng = createRng(1);
    expect(decidePush(atState(), 'BELL', rng).pushOrder).toBe(NAVI_PUSH_ORDER);
    expect(decidePush(atState(), 'REPLAY', rng).pushOrder).toBe(NORMAL_PUSH_ORDER);
    expect(decidePush(atState(), 'CHERRY_CORNER', rng).pushOrder).toBe(NORMAL_PUSH_ORDER);
  });

  it('押下位置は左・中・右の順に乱数 3 個を消費する(押し順によらず固定)', () => {
    const rng = createRng(42);
    const expected = [rng.nextInt(20), rng.nextInt(20), rng.nextInt(20)];
    const decision = decidePush(normalState(), 'BELL', createRng(42));
    expect(decision.pushPositions).toEqual(expected);
  });
});

describe('playGame(ヘッドレス 1G 実行)', () => {
  it('通常時のベルは左第一 = 上段揃い 1 枚(押し順不正解)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const result = playGame(normalState(), createRng(seed), 'BELL');
      expect(result.displayedRole).toBe('BELL');
      expect(result.spin.bellSuccess).toBe(false);
      expect(result.payout.payout).toBe(BELL_PAYOUT_FAIL);
    }
  });

  it('AT 中のベルはナビ遵守 = 斜め揃い 13 枚(押し順正解)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const result = playGame(atState(), createRng(seed), 'BELL');
      expect(result.displayedRole).toBe('BELL');
      expect(result.spin.bellSuccess).toBe(true);
      expect(result.payout.payout).toBe(BELL_PAYOUT_SUCCESS);
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

  it('advanceGame へ表示役・bellSuccess が配線される(取りこぼし時は displayedRole = NONE で払出 0)', () => {
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
