import { describe, expect, it } from 'vitest';
import { BACKGROUNDS, BACKGROUND_INITIAL, BACKGROUND_DENOM } from './background';
import { MODES, MODE_DENOM, MODE_INITIAL } from './mode';
import { BET_PER_GAME } from './payout';
import { createRng } from './rng';
import { ROLES } from './roles';
import { advanceGame, initGameState, type GameInput, type GameState } from './state';

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

function input(wonRole: GameInput['wonRole'], overrides: Partial<GameInput> = {}): GameInput {
  return { wonRole, displayedRole: wonRole, ...overrides };
}

describe('initGameState', () => {
  it('全フィールドが初期値(フェーズ NORMAL・カウンタ 0・持越しなし)', () => {
    const state = initGameState(createRng(1));
    expect(MODES).toContain(state.mode);
    expect(BACKGROUNDS).toContain(state.background);
    expect(state.phase).toEqual({ type: 'NORMAL' });
    expect(state.pendingBackgroundTrigger).toBeNull();
    expect(state.backgroundGames).toBe(0);
    expect(state.totalGames).toBe(0);
    expect(state.netCoins).toBe(0);
    expect(state.replayCarry).toBe(false);
  });

  it('大量試行でモード初期分布(GAME_START テーブル)に収束する', () => {
    const trials = 200000;
    const rng = createRng(20260711);
    const counts: Record<string, number> = { HELL: 0, NORMAL: 0, HEAVEN: 0, HONZENCHO: 0 };
    for (let i = 0; i < trials; i++) counts[initGameState(rng).mode]++;
    MODES.forEach((mode, i) => {
      const exp = (MODE_INITIAL.GAME_START[i] / MODE_DENOM) * trials;
      const sigma = Math.sqrt(exp * (1 - MODE_INITIAL.GAME_START[i] / MODE_DENOM));
      expect(Math.abs(counts[mode] - exp), mode).toBeLessThanOrEqual(Math.max(exp * 0.1, sigma * 4));
    });
  });

  it('大量試行で背景初期分布がモード別テーブル(SPEC「5.」)に収束する', () => {
    const trials = 200000;
    const rng = createRng(777);
    const counts: Record<string, Record<string, number>> = {};
    const modeTotals: Record<string, number> = {};
    for (let i = 0; i < trials; i++) {
      const s = initGameState(rng);
      counts[s.mode] ??= {};
      counts[s.mode][s.background] = (counts[s.mode][s.background] ?? 0) + 1;
      modeTotals[s.mode] = (modeTotals[s.mode] ?? 0) + 1;
    }
    for (const mode of MODES) {
      const weights = BACKGROUND_INITIAL[mode];
      BACKGROUNDS.forEach((bg, i) => {
        const observed = counts[mode][bg] ?? 0;
        const exp = (weights[i] / BACKGROUND_DENOM) * modeTotals[mode];
        const p = weights[i] / BACKGROUND_DENOM;
        const sigma = Math.sqrt(modeTotals[mode] * p * (1 - p));
        expect(Math.abs(observed - exp), `${mode} × ${bg}`).toBeLessThanOrEqual(
          Math.max(exp * 0.1, sigma * 4, 5),
        );
      });
    }
  });
});

describe('advanceGame: モード移行の骨格', () => {
  it('ハズレはモード維持(確定 8)+ イベントなし', () => {
    for (const mode of MODES) {
      const result = advanceGame(normalState({ mode }), input('NONE'), createRng(1));
      expect(result.state.mode).toBe(mode);
      expect(result.events).toEqual([]);
    }
  });

  it('本前兆滞在中は全役でモード移行抽せん停止(確定 9)', () => {
    const rng = createRng(2);
    for (const role of ROLES) {
      const result = advanceGame(normalState({ mode: 'HONZENCHO' }), input(role), rng);
      expect(result.state.mode).toBe('HONZENCHO');
      expect(result.events).toEqual([]);
    }
  });

  it('AT 中・エンディング中はモード移行抽せん停止(確定 11)', () => {
    const phases = [
      {
        type: 'AT',
        tier: 'NORMAL',
        part: 'KOYAKU',
        partGame: 1,
        renchan: 1,
        continueRate: 0.66,
        vStock: 0,
        continueConfirmed: false,
      },
      { type: 'ENDING', game: 1 },
    ] as const;
    for (const phase of phases) {
      // 中段チェリーは通常滞在なら維持 0(必ずどこかへ移行する)役。
      // 大量試行で 1 度も移行しない = 抽せんが行われていないことを確認する。
      for (let seed = 0; seed < 200; seed++) {
        const result = advanceGame(
          normalState({ phase: structuredClone(phase) as GameState['phase'] }),
          input('CHERRY_CENTER'),
          createRng(seed),
        );
        expect(result.state.mode).toBe('NORMAL');
        expect(result.events).toEqual([]);
      }
    }
  });

  it('前兆(偽)・連続演出(偽)中はモード移行抽せんを実施(確定 9・23)', () => {
    const phases = [
      { type: 'OMEN', kind: 'FAKE', game: 1, totalGames: 8, renzoku: 'A' },
      { type: 'RENZOKU', kind: 'FAKE', renzoku: 'A', game: 4 },
    ] as const;
    for (const phase of phases) {
      // 通常滞在 × 中段チェリーは維持 0 のため必ず MODE_CHANGE が出る
      const result = advanceGame(
        normalState({ phase: structuredClone(phase) as GameState['phase'] }),
        input('CHERRY_CENTER'),
        createRng(3),
      );
      expect(result.state.mode).not.toBe('NORMAL');
      expect(result.events[0]?.type).toBe('MODE_CHANGE');
    }
  });

  it('本前兆移行時に MODE_CHANGE + HONZENCHO_ENTER イベントが出る', () => {
    // リーチ目は全モードで本前兆 100%
    const result = advanceGame(normalState(), input('REACH_ME'), createRng(4));
    expect(result.state.mode).toBe('HONZENCHO');
    expect(result.events).toEqual([
      { type: 'MODE_CHANGE', from: 'NORMAL', to: 'HONZENCHO', trigger: 'REACH_ME' },
      { type: 'HONZENCHO_ENTER', trigger: 'REACH_ME' },
    ]);
    // 前兆スケジュール開始(フェーズ遷移)は 2b。2a ではフェーズは変わらない
    expect(result.state.phase).toEqual({ type: 'NORMAL' });
  });

  it('大量試行で移行分布がテーブル値に収束する(通常 × 弱スイカ)', () => {
    const trials = 200000;
    const rng = createRng(5);
    const counts: Record<string, number> = { HELL: 0, NORMAL: 0, HEAVEN: 0, HONZENCHO: 0 };
    for (let i = 0; i < trials; i++) {
      counts[advanceGame(normalState(), input('WATERMELON_WEAK'), rng).state.mode]++;
    }
    const expected = [0, 5388, 4009, 603];
    MODES.forEach((mode, i) => {
      const exp = (expected[i] / MODE_DENOM) * trials;
      const sigma = Math.sqrt(trials * (expected[i] / MODE_DENOM) * (1 - expected[i] / MODE_DENOM));
      expect(Math.abs(counts[mode] - exp), mode).toBeLessThanOrEqual(Math.max(exp * 0.1, sigma * 4));
    });
  });
});

describe('advanceGame: ゲーム数・差枚・リプレイ持越しの集計', () => {
  it('総ゲーム数・背景経過ゲーム数が毎ゲーム加算される', () => {
    let state = normalState();
    const rng = createRng(6);
    for (let i = 1; i <= 5; i++) {
      state = advanceGame(state, input('NONE'), rng).state;
      expect(state.totalGames).toBe(i);
      expect(state.backgroundGames).toBe(i);
    }
  });

  it('差枚: ハズレは −3(BET のみ)、押し順ベル正解は +10(13 − 3)', () => {
    const rng = createRng(7);
    const miss = advanceGame(normalState(), input('NONE'), rng);
    expect(miss.payout.net).toBe(-BET_PER_GAME);
    expect(miss.state.netCoins).toBe(-BET_PER_GAME);

    const bell = advanceGame(normalState(), input('BELL', { bellSuccess: true }), rng);
    expect(bell.payout.net).toBe(10);
    expect(bell.state.netCoins).toBe(10);

    const bellFail = advanceGame(normalState(), input('BELL', { bellSuccess: false }), rng);
    expect(bellFail.payout.net).toBe(1 - BET_PER_GAME);
  });

  it('リプレイの次ゲームは BET 不要(replayCarry)', () => {
    const rng = createRng(8);
    // リプレイ成立 G: 投入 3・払出 0 → net −3、持越しセット
    const replayGame = advanceGame(normalState(), input('REPLAY'), rng);
    expect(replayGame.payout.net).toBe(-BET_PER_GAME);
    expect(replayGame.state.replayCarry).toBe(true);

    // 次 G(ハズレ): 投入 0 → net 0、持越し解除
    const nextGame = advanceGame(replayGame.state, input('NONE'), rng);
    expect(nextGame.payout.net).toBe(0);
    expect(nextGame.state.netCoins).toBe(-BET_PER_GAME);
    expect(nextGame.state.replayCarry).toBe(false);
  });

  it('取りこぼし(内部当選あり・表示役 NONE)は払出 0 だがモード移行抽せんは内部当選役で実施', () => {
    // リーチ目の取りこぼし: 払出なしでも本前兆へは移行する(確定 14 と整合)
    const result = advanceGame(
      normalState(),
      input('REACH_ME', { displayedRole: 'NONE' }),
      createRng(9),
    );
    expect(result.payout.payout).toBe(0);
    expect(result.state.mode).toBe('HONZENCHO');
  });

  it('advanceGame は入力の state を変更しない(純関数)', () => {
    const state = normalState();
    const before = structuredClone(state);
    advanceGame(state, input('REACH_ME'), createRng(10));
    expect(state).toEqual(before);
  });
});
