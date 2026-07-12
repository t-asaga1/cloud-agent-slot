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

/**
 * 指定した値列を順に返すスクリプト RNG(2b テスト用)。
 * 値列を使い切った後に乱数を消費すると throw するため、
 * 「このゲームで抽せんが行われない(乱数を消費しない)」ことの検証にも使う。
 */
function seqRng(values: number[]): ReturnType<typeof createRng> {
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

describe('initGameState', () => {
  it('全フィールドが初期値(フェーズ NORMAL・カウンタ 0・持越しなし)', () => {
    const state = initGameState(createRng(1));
    expect(MODES).toContain(state.mode);
    expect(BACKGROUNDS).toContain(state.background);
    // 初期モードが本前兆のときのみ前兆スケジュール済みで開始(2b)
    if (state.mode === 'HONZENCHO') {
      expect(state.phase).toMatchObject({ type: 'OMEN', kind: 'REAL', game: 0 });
    } else {
      expect(state.phase).toEqual({ type: 'NORMAL' });
    }
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
      { type: 'RENZOKU', kind: 'FAKE', renzoku: 'A', game: 2 },
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
    // 2b: 当せんゲームで本前兆スケジュール開始(game 0。前兆 1G 目は次ゲーム = 確定 18)
    expect(result.state.phase).toMatchObject({ type: 'OMEN', kind: 'REAL', game: 0 });
    expect(result.state.pendingBackgroundTrigger).toBe('HONZENCHO_NEXT');
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

  it('偽→本書き換えでも入力の state(フェーズ含む)を変更しない(純関数)', () => {
    const state = normalState({
      mode: 'HEAVEN',
      phase: { type: 'OMEN', kind: 'FAKE', game: 3, totalGames: 9, renzoku: 'B' },
    });
    const before = structuredClone(state);
    // 天国 × 中段チェリーは本前兆 100% → 書き換えが必ず起きる
    advanceGame(state, input('CHERRY_CENTER'), createRng(11));
    expect(state).toEqual(before);
  });
});

describe('advanceGame: 偽前兆の突入(確定 3・18・22)', () => {
  // seqRng の値: [モード移行(維持), 突入率 1/10(0 = 当せん), 前兆 G 数, 連続演出]
  it('弱スイカ 1/10 当せんで偽前兆へ突入(当せん G は game 0・FAKE_OMEN_NEXT 予約)', () => {
    const result = advanceGame(normalState(), input('WATERMELON_WEAK'), seqRng([0, 0, 30, 70]));
    // 30 → 前兆 8G(偽: 7=0.25 / 8=0.5 / 9=0.25)、70 → 連続演出 B(偽: A=0.6 / B=0.4)
    expect(result.state.phase).toEqual({
      type: 'OMEN',
      kind: 'FAKE',
      game: 0,
      totalGames: 8,
      renzoku: 'B',
    });
    expect(result.state.pendingBackgroundTrigger).toBe('FAKE_OMEN_NEXT');
    expect(result.events).toEqual([
      { type: 'FAKE_OMEN_ENTER', trigger: 'WATERMELON_WEAK', totalGames: 8, renzoku: 'B' },
    ]);
  });

  it('弱スイカ 1/10 に漏れたら突入なし', () => {
    const result = advanceGame(normalState(), input('WATERMELON_WEAK'), seqRng([0, 5]));
    expect(result.state.phase).toEqual({ type: 'NORMAL' });
    expect(result.state.pendingBackgroundTrigger).toBeNull();
    expect(result.events).toEqual([]);
  });

  it('強スイカ・中段チェリーは本前兆非当選なら 100% 偽前兆(突入率の乱数消費なし)', () => {
    // 通常 × 強スイカ: 値 0 → 天国へ移行(本前兆ではない)→ 100% 偽前兆
    const strong = advanceGame(normalState(), input('WATERMELON_STRONG'), seqRng([0, 20, 65]));
    expect(strong.state.mode).toBe('HEAVEN');
    expect(strong.state.phase).toEqual({
      type: 'OMEN',
      kind: 'FAKE',
      game: 0,
      totalGames: 7,
      renzoku: 'B',
    });
    expect(strong.events).toEqual([
      { type: 'MODE_CHANGE', from: 'NORMAL', to: 'HEAVEN', trigger: 'WATERMELON_STRONG' },
      { type: 'FAKE_OMEN_ENTER', trigger: 'WATERMELON_STRONG', totalGames: 7, renzoku: 'B' },
    ]);

    // 通常 × 中段チェリー: 値 0 → 通常維持 → 100% 偽前兆
    const center = advanceGame(normalState(), input('CHERRY_CENTER'), seqRng([0, 30, 10]));
    expect(center.state.mode).toBe('NORMAL');
    expect(center.state.phase).toEqual({
      type: 'OMEN',
      kind: 'FAKE',
      game: 0,
      totalGames: 8,
      renzoku: 'A',
    });
  });

  it('ベル・リプレイ・ハズレは偽前兆抽せんの対象外(突入率の乱数消費なし)', () => {
    // seqRng はモード移行分のみ。突入率を引くと消費超過で throw する
    const bell = advanceGame(normalState(), input('BELL'), seqRng([0]));
    expect(bell.state.phase).toEqual({ type: 'NORMAL' });
    const replay = advanceGame(normalState(), input('REPLAY'), seqRng([800]));
    expect(replay.state.phase).toEqual({ type: 'NORMAL' });
    const none = advanceGame(normalState(), input('NONE'), seqRng([]));
    expect(none.state.phase).toEqual({ type: 'NORMAL' });
  });

  it('前兆中(偽)の新規レア役当せんは無視 = 突入抽せん自体なし(確定 22)', () => {
    const state = normalState({
      phase: { type: 'OMEN', kind: 'FAKE', game: 2, totalGames: 8, renzoku: 'A' },
    });
    // seqRng はモード移行分のみ(値 0 → 通常維持)。突入率を引くと throw する
    const result = advanceGame(state, input('WATERMELON_WEAK'), seqRng([0]));
    expect(result.state.phase).toEqual({
      type: 'OMEN',
      kind: 'FAKE',
      game: 3,
      totalGames: 8,
      renzoku: 'A',
    });
    expect(result.events).toEqual([]);
    expect(result.state.pendingBackgroundTrigger).toBeNull();
  });

  it('連続演出中(偽)の新規当せんも無視。モード移行抽せんは実施(確定 22・23)', () => {
    const state = normalState({
      phase: { type: 'RENZOKU', kind: 'FAKE', renzoku: 'A', game: 1 },
    });
    // 通常 × 強スイカ 値 0 → 天国へ移行。100% 偽前兆の役でも既存前兆を継続(再スケジュールなし)
    const result = advanceGame(state, input('WATERMELON_STRONG'), seqRng([0]));
    expect(result.state.mode).toBe('HEAVEN');
    expect(result.state.phase).toEqual({ type: 'RENZOKU', kind: 'FAKE', renzoku: 'A', game: 2 });
    expect(result.events).toEqual([
      { type: 'MODE_CHANGE', from: 'NORMAL', to: 'HEAVEN', trigger: 'WATERMELON_STRONG' },
    ]);
  });

  it('AT 中・エンディング中は偽前兆抽せんなし(乱数消費ゼロ)', () => {
    const phases: GameState['phase'][] = [
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
    ];
    for (const phase of phases) {
      const result = advanceGame(
        normalState({ phase: structuredClone(phase) }),
        input('WATERMELON_STRONG'),
        seqRng([]),
      );
      expect(result.state.phase).toEqual(phase);
      expect(result.events).toEqual([]);
    }
  });
});

describe('advanceGame: 本前兆スケジュールと前兆タイムライン(確定 18・19・20)', () => {
  it('本前兆移行ゲームでスケジュール抽せん(本 7〜10G)+ HONZENCHO_NEXT 予約', () => {
    // 80 → 前兆 10G(本: 7/8/9/10 各 0.25)、90 → 連続演出 C(本: A=0.4 / B=0.4 / C=0.2)
    const result = advanceGame(normalState(), input('REACH_ME'), seqRng([0, 80, 90]));
    expect(result.state.mode).toBe('HONZENCHO');
    expect(result.state.phase).toEqual({
      type: 'OMEN',
      kind: 'REAL',
      game: 0,
      totalGames: 10,
      renzoku: 'C',
    });
    expect(result.state.pendingBackgroundTrigger).toBe('HONZENCHO_NEXT');
  });

  it('本前兆の通しタイムライン: 当せん → 前兆 7G → 連続演出 4G → 成功 → AT スタブ(確定 19・20)', () => {
    // リーチ目も同一フロー(即告知の特例なし = 確定 20)
    let result = advanceGame(normalState(), input('REACH_ME'), seqRng([0, 0, 0]));
    expect(result.state.phase).toEqual({
      type: 'OMEN',
      kind: 'REAL',
      game: 0,
      totalGames: 7,
      renzoku: 'A',
    });

    // 前兆 1G 目 = 当せんの次ゲーム(確定 18)〜 7G 目。
    // 本前兆中はモード移行・偽前兆抽せんとも停止 = 乱数消費ゼロ(seqRng([]))
    for (let g = 1; g <= 7; g++) {
      result = advanceGame(result.state, input(g === 4 ? 'CHERRY_CENTER' : 'NONE'), seqRng([]));
      expect(result.state.phase).toEqual({
        type: 'OMEN',
        kind: 'REAL',
        game: g,
        totalGames: 7,
        renzoku: 'A',
      });
      expect(result.events).toEqual([]);
      expect(result.state.mode).toBe('HONZENCHO');
    }

    // 前兆 G 数消化後の次ゲーム = 連続演出 1G 目
    result = advanceGame(result.state, input('NONE'), seqRng([]));
    expect(result.events).toEqual([{ type: 'RENZOKU_START', kind: 'REAL', renzoku: 'A' }]);
    expect(result.state.phase).toEqual({ type: 'RENZOKU', kind: 'REAL', renzoku: 'A', game: 1 });

    // 連続演出 2〜3G 目
    for (let g = 2; g <= 3; g++) {
      result = advanceGame(result.state, input('NONE'), seqRng([]));
      expect(result.state.phase).toEqual({ type: 'RENZOKU', kind: 'REAL', renzoku: 'A', game: g });
      expect(result.events).toEqual([]);
    }

    // 連続演出 4G 目 = 成否告知(成功)→ AT スタブ(partGame 0 = 次 G から AT 1G 目)
    result = advanceGame(result.state, input('NONE'), seqRng([]));
    expect(result.events).toEqual([
      { type: 'RENZOKU_RESULT', kind: 'REAL', renzoku: 'A', success: true },
    ]);
    expect(result.state.phase).toEqual({
      type: 'AT',
      tier: 'NORMAL',
      part: 'KOYAKU',
      partGame: 0,
      renchan: 1,
      continueRate: 0,
      vStock: 0,
      continueConfirmed: false,
    });
  });

  it('偽前兆の通しタイムライン: 当せん → 前兆 7G → 連続演出 4G → 失敗 → 通常 + FAKE_OMEN_FAIL 予約', () => {
    let result = advanceGame(normalState(), input('WATERMELON_WEAK'), seqRng([0, 0, 0, 0]));
    expect(result.state.phase).toEqual({
      type: 'OMEN',
      kind: 'FAKE',
      game: 0,
      totalGames: 7,
      renzoku: 'A',
    });
    // 前兆 7G 消化(ハズレはモード移行・突入抽せんとも乱数消費なし)
    for (let g = 1; g <= 7; g++) {
      result = advanceGame(result.state, input('NONE'), seqRng([]));
      expect(result.state.phase).toMatchObject({ type: 'OMEN', kind: 'FAKE', game: g });
    }
    // 連続演出 1〜3G 目
    result = advanceGame(result.state, input('NONE'), seqRng([]));
    expect(result.events).toEqual([{ type: 'RENZOKU_START', kind: 'FAKE', renzoku: 'A' }]);
    for (let g = 2; g <= 3; g++) {
      result = advanceGame(result.state, input('NONE'), seqRng([]));
      expect(result.state.phase).toEqual({ type: 'RENZOKU', kind: 'FAKE', renzoku: 'A', game: g });
    }
    // 4G 目 = 失敗告知 → 通常へ戻り、次ゲームの背景移行(契機 3)を予約
    result = advanceGame(result.state, input('NONE'), seqRng([]));
    expect(result.events).toEqual([
      { type: 'RENZOKU_RESULT', kind: 'FAKE', renzoku: 'A', success: false },
    ]);
    expect(result.state.phase).toEqual({ type: 'NORMAL' });
    expect(result.state.pendingBackgroundTrigger).toBe('FAKE_OMEN_FAIL');
  });

  it('initGameState: 初期モードが本前兆なら前兆スケジュール済みで開始(契機 4 予約なし)', () => {
    // 9900 → HONZENCHO(累計 9868 以上)、0 → 背景 義経、0 → 前兆 7G、50 → 連続演出 B
    const state = initGameState(seqRng([9900, 0, 0, 50]));
    expect(state.mode).toBe('HONZENCHO');
    expect(state.background).toBe('YOSHITSUNE');
    expect(state.phase).toEqual({
      type: 'OMEN',
      kind: 'REAL',
      game: 0,
      totalGames: 7,
      renzoku: 'B',
    });
    expect(state.pendingBackgroundTrigger).toBeNull();
  });
});

describe('advanceGame: 偽→本書き換え(確定 21・23)', () => {
  it('前兆 G 中の書き換え: kind のみ書き換え・G 数と演出は引継ぎ・契機 4 予約なし', () => {
    const state = normalState({
      mode: 'HEAVEN',
      phase: { type: 'OMEN', kind: 'FAKE', game: 3, totalGames: 9, renzoku: 'B' },
    });
    // 天国 × 中段チェリーは本前兆 100%。seqRng はモード移行分のみ
    // (前兆 G 数・演出の再抽せんがあれば消費超過で throw = 確定 21(a)(b) の検証)
    const result = advanceGame(state, input('CHERRY_CENTER'), seqRng([0]));
    expect(result.state.mode).toBe('HONZENCHO');
    expect(result.events).toEqual([
      { type: 'MODE_CHANGE', from: 'HEAVEN', to: 'HONZENCHO', trigger: 'CHERRY_CENTER' },
      { type: 'HONZENCHO_ENTER', trigger: 'CHERRY_CENTER' },
      { type: 'OMEN_REWRITE', trigger: 'CHERRY_CENTER' },
    ]);
    // 書き換えゲーム自体も前兆 1G 分として進行(game 3 → 4)
    expect(result.state.phase).toEqual({
      type: 'OMEN',
      kind: 'REAL',
      game: 4,
      totalGames: 9,
      renzoku: 'B',
    });
    // 契機 4(HONZENCHO_NEXT)は予約しない(確定 21(d))
    expect(result.state.pendingBackgroundTrigger).toBeNull();

    // 書き換え後の残り前兆は本前兆として進行(モード移行抽せん停止 = 乱数消費ゼロ)
    const next = advanceGame(result.state, input('CHERRY_CENTER'), seqRng([]));
    expect(next.state.phase).toEqual({
      type: 'OMEN',
      kind: 'REAL',
      game: 5,
      totalGames: 9,
      renzoku: 'B',
    });
    expect(next.events).toEqual([]);
  });

  it('連続演出中の書き換え: 進行中の演出がそのまま成功へ(確定 21(c))', () => {
    // 1G 目で書き換え → 残りを消化して成功
    let result = advanceGame(
      normalState({
        mode: 'HEAVEN',
        phase: { type: 'RENZOKU', kind: 'FAKE', renzoku: 'B', game: 1 },
      }),
      input('CHERRY_CENTER'),
      seqRng([0]),
    );
    expect(result.state.phase).toEqual({ type: 'RENZOKU', kind: 'REAL', renzoku: 'B', game: 2 });
    result = advanceGame(result.state, input('NONE'), seqRng([]));
    result = advanceGame(result.state, input('NONE'), seqRng([]));
    expect(result.events).toEqual([
      { type: 'RENZOKU_RESULT', kind: 'REAL', renzoku: 'B', success: true },
    ]);
    expect(result.state.phase.type).toBe('AT');
  });

  it('連続演出の最終 G の書き換えも有効(演出最終 G まで書き換え可能 = 確定 23)', () => {
    const state = normalState({
      mode: 'HEAVEN',
      phase: { type: 'RENZOKU', kind: 'FAKE', renzoku: 'A', game: 3 },
    });
    const result = advanceGame(state, input('CHERRY_CENTER'), seqRng([0]));
    expect(result.events).toEqual([
      { type: 'MODE_CHANGE', from: 'HEAVEN', to: 'HONZENCHO', trigger: 'CHERRY_CENTER' },
      { type: 'HONZENCHO_ENTER', trigger: 'CHERRY_CENTER' },
      { type: 'OMEN_REWRITE', trigger: 'CHERRY_CENTER' },
      { type: 'RENZOKU_RESULT', kind: 'REAL', renzoku: 'A', success: true },
    ]);
    expect(result.state.phase.type).toBe('AT');
    expect(result.state.pendingBackgroundTrigger).toBeNull();
  });
});

describe('advanceGame: 前兆スケジュールの分布(大量試行)', () => {
  it('偽前兆突入率 1/10(弱スイカ)+ 前兆 G 数・連続演出の振分けが SPEC「6.」に収束する', () => {
    const trials = 200000;
    const rng = createRng(20260712);
    let eligible = 0;
    let entered = 0;
    const gamesCounts: Record<number, number> = { 7: 0, 8: 0, 9: 0 };
    const renzokuCounts: Record<string, number> = { A: 0, B: 0 };
    for (let i = 0; i < trials; i++) {
      const result = advanceGame(normalState(), input('WATERMELON_WEAK'), rng);
      if (result.state.mode === 'HONZENCHO') continue; // 本前兆当せん分は偽前兆の対象外
      eligible++;
      if (result.state.phase.type === 'OMEN') {
        entered++;
        gamesCounts[result.state.phase.totalGames]++;
        renzokuCounts[result.state.phase.renzoku]++;
      }
    }
    // 突入率 1/10
    const expEnter = eligible / 10;
    const sigmaEnter = Math.sqrt(eligible * 0.1 * 0.9);
    expect(Math.abs(entered - expEnter)).toBeLessThanOrEqual(sigmaEnter * 4);
    // 前兆 G 数(偽: 7=0.25 / 8=0.5 / 9=0.25)
    for (const [games, p] of [
      [7, 0.25],
      [8, 0.5],
      [9, 0.25],
    ] as const) {
      const exp = entered * p;
      const sigma = Math.sqrt(entered * p * (1 - p));
      expect(Math.abs(gamesCounts[games] - exp), `前兆 ${games}G`).toBeLessThanOrEqual(sigma * 4);
    }
    // 連続演出(偽: A=0.6 / B=0.4)
    for (const [kind, p] of [
      ['A', 0.6],
      ['B', 0.4],
    ] as const) {
      const exp = entered * p;
      const sigma = Math.sqrt(entered * p * (1 - p));
      expect(Math.abs(renzokuCounts[kind] - exp), `連続演出 ${kind}`).toBeLessThanOrEqual(
        sigma * 4,
      );
    }
  });

  it('本前兆スケジュール(リーチ目)の G 数・連続演出の振分けが SPEC「6.」に収束する', () => {
    const trials = 100000;
    const rng = createRng(20260713);
    const gamesCounts: Record<number, number> = { 7: 0, 8: 0, 9: 0, 10: 0 };
    const renzokuCounts: Record<string, number> = { A: 0, B: 0, C: 0 };
    for (let i = 0; i < trials; i++) {
      const result = advanceGame(normalState(), input('REACH_ME'), rng);
      expect(result.state.phase.type).toBe('OMEN');
      if (result.state.phase.type !== 'OMEN') continue;
      gamesCounts[result.state.phase.totalGames]++;
      renzokuCounts[result.state.phase.renzoku]++;
    }
    for (const games of [7, 8, 9, 10]) {
      const exp = trials * 0.25;
      const sigma = Math.sqrt(trials * 0.25 * 0.75);
      expect(Math.abs(gamesCounts[games] - exp), `前兆 ${games}G`).toBeLessThanOrEqual(sigma * 4);
    }
    for (const [kind, p] of [
      ['A', 0.4],
      ['B', 0.4],
      ['C', 0.2],
    ] as const) {
      const exp = trials * p;
      const sigma = Math.sqrt(trials * p * (1 - p));
      expect(Math.abs(renzokuCounts[kind] - exp), `連続演出 ${kind}`).toBeLessThanOrEqual(
        sigma * 4,
      );
    }
  });
});
