import { describe, expect, it } from 'vitest';
import { CONTINUE_RATE_DENOM, CONTINUE_RATE_TABLE, UPPER_AT_CONTINUE_RATE } from './at';
import { BACKGROUNDS, BACKGROUND_INITIAL, BACKGROUND_DENOM } from './background';
import { drawRole } from './lottery';
import { MODES, MODE_DENOM, MODE_INITIAL } from './mode';
import { BET_PER_GAME } from './payout';
import { createRng } from './rng';
import { ROLES } from './roles';
import type { OmenKind, RenzokuKind } from './omen';
import type { OmenScenario } from './scenario';
import {
  advanceGame,
  ENDING_GAMES,
  initGameState,
  isNaviActive,
  isSevenFlagForced,
  type AtPhase,
  type GameInput,
  type GameState,
  type OmenPhase,
  type RenzokuPhase,
} from './state';

/**
 * 全 G レベル 0(予告なし)・チャンスアップなしのシナリオ(4b テスト用)。
 * seqRng で値 0 を供給すると `drawOmenScenario` はこの形になる
 * (レベル値 0 → L0 で全区分・全種別ともスロット抽せんなし、チャンスアップ値 0 → NORMAL)。
 */
function zeroScenario(totalGames: number): OmenScenario {
  return {
    steps: Array.from({ length: totalGames }, () => ({ level: 0 as const })),
    renzokuSteps: ['NORMAL', 'NORMAL', 'NORMAL'],
  };
}

/** シナリオ抽せん(`drawOmenScenario`)が消費する乱数の個数(全レベル 0 のとき) */
function scenarioDraws(totalGames: number): number[] {
  return Array.from({ length: totalGames + 3 }, () => 0);
}

function omenPhase(
  kind: OmenKind,
  game: number,
  totalGames: number,
  renzoku: RenzokuKind,
  scenario: OmenScenario = zeroScenario(totalGames),
): OmenPhase {
  return { type: 'OMEN', kind, game, totalGames, renzoku, scenario };
}

function renzokuPhase(kind: OmenKind, renzoku: RenzokuKind, game: number): RenzokuPhase {
  return { type: 'RENZOKU', kind, renzoku, game, chanceUps: ['NORMAL', 'NORMAL', 'NORMAL'] };
}

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

function atPhase(overrides: Partial<Omit<AtPhase, 'type'>> = {}): AtPhase {
  return {
    type: 'AT',
    tier: 'NORMAL',
    part: 'KOYAKU',
    partGame: 0,
    renchan: 1,
    continueRate: 0.66,
    vStock: 0,
    continueConfirmed: false,
    ...overrides,
  };
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
    // 中段チェリーは通常滞在なら維持 0(必ずどこかへ移行する)役。
    // AT 中: seqRng の値は V ストック抽せん 1 つのみ(中段チェリーは獲得率 1000/1000 で必ず獲得)。
    // モード移行抽せんがあれば消費超過で throw する。
    const at = advanceGame(
      normalState({
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
      }),
      input('CHERRY_CENTER'),
      seqRng([0]),
    );
    expect(at.state.mode).toBe('NORMAL');
    expect(at.events).toEqual([{ type: 'V_STOCK_GAIN', trigger: 'CHERRY_CENTER', vStock: 1 }]);

    // エンディング中(最終 G = 10G 目): AT 終了処理のモード・背景再抽せんのみ消費し、
    // モード移行抽せん(MODE_CHANGE イベント)は発生しない
    const ending = advanceGame(
      normalState({ phase: { type: 'ENDING', game: 9, after: 'AT_END', vStock: 0 } }),
      input('CHERRY_CENTER'),
      seqRng([0, 0]),
    );
    expect(ending.events).toEqual([
      { type: 'AT_END', reason: 'ENDING', mode: 'HELL', background: 'YOSHITSUNE' },
    ]);
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

  it('差枚: ハズレは −3(BET のみ)、押し順ベル揃いは +10(13 − 3。確定 35)', () => {
    const rng = createRng(7);
    const miss = advanceGame(normalState(), input('NONE'), rng);
    expect(miss.payout.net).toBe(-BET_PER_GAME);
    expect(miss.state.netCoins).toBe(-BET_PER_GAME);

    const bell = advanceGame(normalState(), input('BELL'), rng);
    expect(bell.payout.net).toBe(10);
    expect(bell.state.netCoins).toBe(10);

    // ベルこぼし(左第一 12/13)は表示役 NONE = ハズレと同じ −3
    const bellMiss = advanceGame(normalState(), input('BELL', { displayedRole: 'NONE' }), rng);
    expect(bellMiss.payout.net).toBe(-BET_PER_GAME);
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
      phase: omenPhase('FAKE', 3, 9, 'B'),
    });
    const before = structuredClone(state);
    // 天国 × 中段チェリーは本前兆 100% → 書き換えが必ず起きる
    advanceGame(state, input('CHERRY_CENTER'), createRng(11));
    expect(state).toEqual(before);
  });
});

describe('advanceGame: 偽前兆の突入(確定 3・18・22)', () => {
  // seqRng の値: [モード移行(維持), 突入率 1/10(0 = 当せん), 前兆 G 数, 連続演出,
  // シナリオ(レベル × totalGames + チャンスアップ × 3。値 0 = 全 L0・NORMAL)]
  it('弱スイカ 1/10 当せんで偽前兆へ突入(当せん G は game 0・FAKE_OMEN_NEXT 予約)', () => {
    const result = advanceGame(
      normalState(),
      input('WATERMELON_WEAK'),
      seqRng([0, 0, 30, 70, ...scenarioDraws(8)]),
    );
    // 30 → 前兆 8G(偽: 7=0.25 / 8=0.5 / 9=0.25)、70 → 連続演出 B(偽: A=0.6 / B=0.4)
    expect(result.state.phase).toEqual(omenPhase('FAKE', 0, 8, 'B'));
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
    const strong = advanceGame(
      normalState(),
      input('WATERMELON_STRONG'),
      seqRng([0, 20, 65, ...scenarioDraws(7)]),
    );
    expect(strong.state.mode).toBe('HEAVEN');
    expect(strong.state.phase).toEqual(omenPhase('FAKE', 0, 7, 'B'));
    expect(strong.events).toEqual([
      { type: 'MODE_CHANGE', from: 'NORMAL', to: 'HEAVEN', trigger: 'WATERMELON_STRONG' },
      { type: 'FAKE_OMEN_ENTER', trigger: 'WATERMELON_STRONG', totalGames: 7, renzoku: 'B' },
    ]);

    // 通常 × 中段チェリー: 値 0 → 通常維持 → 100% 偽前兆
    const center = advanceGame(
      normalState(),
      input('CHERRY_CENTER'),
      seqRng([0, 30, 10, ...scenarioDraws(8)]),
    );
    expect(center.state.mode).toBe('NORMAL');
    expect(center.state.phase).toEqual(omenPhase('FAKE', 0, 8, 'A'));
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
    const state = normalState({ phase: omenPhase('FAKE', 2, 8, 'A') });
    // seqRng はモード移行分のみ(値 0 → 通常維持)。突入率を引くと throw する
    const result = advanceGame(state, input('WATERMELON_WEAK'), seqRng([0]));
    expect(result.state.phase).toEqual(omenPhase('FAKE', 3, 8, 'A'));
    expect(result.events).toEqual([]);
    expect(result.state.pendingBackgroundTrigger).toBeNull();
  });

  it('連続演出中(偽)の新規当せんも無視。モード移行抽せんは実施(確定 22・23)', () => {
    const state = normalState({ phase: renzokuPhase('FAKE', 'A', 1) });
    // 通常 × 強スイカ 値 0 → 天国へ移行。100% 偽前兆の役でも既存前兆を継続(再スケジュールなし)
    const result = advanceGame(state, input('WATERMELON_STRONG'), seqRng([0]));
    expect(result.state.mode).toBe('HEAVEN');
    expect(result.state.phase).toEqual(renzokuPhase('FAKE', 'A', 2));
    expect(result.events).toEqual([
      { type: 'MODE_CHANGE', from: 'NORMAL', to: 'HEAVEN', trigger: 'WATERMELON_STRONG' },
    ]);
  });

  it('AT 中・エンディング中は偽前兆抽せんなし(確定 11)', () => {
    // 強スイカは通常時なら本前兆非当選時 100% 偽前兆。AT 中は V ストック抽せんのみ消費
    // (999 → 獲得率 500/1000 に漏れ)。偽前兆・モード移行の抽せんがあれば消費超過で throw
    const at = advanceGame(
      normalState({
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
      }),
      input('WATERMELON_STRONG'),
      seqRng([999]),
    );
    expect(at.state.phase).toMatchObject({ type: 'AT', part: 'KOYAKU', partGame: 2 });
    expect(at.events).toEqual([]);

    // エンディング中(途中 G): 各種抽せんなし = 乱数消費ゼロで経過 G のみ進む
    const endingMid = advanceGame(
      normalState({ phase: { type: 'ENDING', game: 0, after: 'AT_END', vStock: 0 } }),
      input('WATERMELON_STRONG'),
      seqRng([]),
    );
    expect(endingMid.state.phase).toEqual({ type: 'ENDING', game: 1, after: 'AT_END', vStock: 0 });
    expect(endingMid.events).toEqual([]);

    // エンディング最終 G(10G 目): AT 終了処理のモード・背景再抽せんのみ消費
    const ending = advanceGame(
      normalState({ phase: { type: 'ENDING', game: 9, after: 'AT_END', vStock: 0 } }),
      input('WATERMELON_STRONG'),
      seqRng([0, 0]),
    );
    expect(ending.state.phase).toEqual({ type: 'NORMAL' });
    expect(ending.events).toEqual([
      { type: 'AT_END', reason: 'ENDING', mode: 'HELL', background: 'YOSHITSUNE' },
    ]);
  });
});

describe('advanceGame: 本前兆スケジュールと前兆タイムライン(確定 18・19・20)', () => {
  it('本前兆移行ゲームでスケジュール抽せん(本 7〜10G)+ HONZENCHO_NEXT 予約', () => {
    // 80 → 前兆 10G(本: 7/8/9/10 各 0.25)、90 → 連続演出 C(本: A=0.4 / B=0.4 / C=0.2)
    const result = advanceGame(
      normalState(),
      input('REACH_ME'),
      seqRng([0, 80, 90, ...scenarioDraws(10)]),
    );
    expect(result.state.mode).toBe('HONZENCHO');
    expect(result.state.phase).toEqual(omenPhase('REAL', 0, 10, 'C'));
    expect(result.state.pendingBackgroundTrigger).toBe('HONZENCHO_NEXT');
  });

  it('本前兆の通しタイムライン: 当せん → 前兆 7G → 連続演出 4G → 成功 → 赤7待機 → AT導入 → AT(確定 19・20・37)', () => {
    // リーチ目も同一フロー(即告知の特例なし = 確定 20)
    let result = advanceGame(
      normalState(),
      input('REACH_ME'),
      seqRng([0, 0, 0, ...scenarioDraws(7)]),
    );
    expect(result.state.phase).toEqual(omenPhase('REAL', 0, 7, 'A'));

    // 前兆 1G 目 = 当せんの次ゲーム(確定 18)〜 7G 目。
    // 本前兆中はモード移行・偽前兆抽せんとも停止。1G 目のみ背景移行契機 4(HONZENCHO_NEXT)が
    // 発火して乱数 1 つ消費(値 0 → 義経維持 = イベントなし)。以降は乱数消費ゼロ(seqRng([]))
    // = 本前兆滞在中に HONZENCHO_NEXT 以外の背景契機が発生しないことの検証。
    for (let g = 1; g <= 7; g++) {
      result = advanceGame(
        result.state,
        input(g === 4 ? 'CHERRY_CENTER' : 'NONE'),
        seqRng(g === 1 ? [0] : []),
      );
      expect(result.state.phase).toEqual(omenPhase('REAL', g, 7, 'A'));
      expect(result.events).toEqual([]);
      expect(result.state.mode).toBe('HONZENCHO');
    }

    // 前兆 G 数消化後の次ゲーム = 連続演出 1G 目(チャンスアップはシナリオから引継ぎ)
    result = advanceGame(result.state, input('NONE'), seqRng([]));
    expect(result.events).toEqual([{ type: 'RENZOKU_START', kind: 'REAL', renzoku: 'A' }]);
    expect(result.state.phase).toEqual(renzokuPhase('REAL', 'A', 1));

    // 連続演出 2〜3G 目
    for (let g = 2; g <= 3; g++) {
      result = advanceGame(result.state, input('NONE'), seqRng([]));
      expect(result.state.phase).toEqual(renzokuPhase('REAL', 'A', g));
      expect(result.events).toEqual([]);
    }

    // 連続演出 4G 目 = 成否告知(成功)→ 赤7待機へ(確定 37。AT へは直行しない。
    // 継続率抽せんもここでは行わない = 乱数消費ゼロ)
    result = advanceGame(result.state, input('NONE'), seqRng([]));
    expect(result.events).toEqual([
      { type: 'RENZOKU_RESULT', kind: 'REAL', renzoku: 'A', success: true },
    ]);
    expect(result.state.phase).toEqual({ type: 'SEVEN_WAIT', game: 0 });

    // 赤7待機 1G 目: 揃えられなかった(表示役 NONE)ら同じ待機のまま継続。
    // モード移行・偽前兆・背景の抽せんはすべて停止(乱数消費ゼロ)
    result = advanceGame(result.state, input('REACH_ME', { displayedRole: 'NONE' }), seqRng([]));
    expect(result.events).toEqual([]);
    expect(result.state.phase).toEqual({ type: 'SEVEN_WAIT', game: 1 });
    expect(result.state.mode).toBe('HONZENCHO');

    // 赤7待機 2G 目: 赤7 が揃った(表示役 REACH_ME)→ 次ゲームが AT 導入 1G
    result = advanceGame(result.state, input('REACH_ME'), seqRng([]));
    expect(result.events).toEqual([{ type: 'SEVEN_ALIGNED' }]);
    expect(result.state.phase).toEqual({ type: 'AT_INTRO' });

    // AT 導入ゲームの消化 = AT 開始確定。継続率をこのゲームで抽せん
    // (値 5 → 0.79。振分け 0.66=5 / 0.79=3 / 0.84=1 / 0.88=1)。次 G から AT 小役 1G 目
    result = advanceGame(result.state, input('NONE'), seqRng([5]));
    expect(result.events).toEqual([{ type: 'AT_START', continueRate: 0.79 }]);
    expect(result.state.phase).toEqual({
      type: 'AT',
      tier: 'NORMAL',
      part: 'KOYAKU',
      partGame: 0,
      renchan: 1,
      continueRate: 0.79,
      vStock: 0,
      continueConfirmed: false,
    });
  });

  it('偽前兆の通しタイムライン: 当せん → 前兆 7G → 連続演出 4G → 失敗 → 通常 + FAKE_OMEN_FAIL 予約', () => {
    let result = advanceGame(
      normalState(),
      input('WATERMELON_WEAK'),
      seqRng([0, 0, 0, 0, ...scenarioDraws(7)]),
    );
    expect(result.state.phase).toEqual(omenPhase('FAKE', 0, 7, 'A'));
    // 前兆 7G 消化(ハズレはモード移行・突入抽せんとも乱数消費なし)。
    // 1G 目のみ背景移行契機 2(FAKE_OMEN_NEXT)が発火して乱数 1 つ消費(値 0 → 義経維持)
    for (let g = 1; g <= 7; g++) {
      result = advanceGame(result.state, input('NONE'), seqRng(g === 1 ? [0] : []));
      expect(result.state.phase).toMatchObject({ type: 'OMEN', kind: 'FAKE', game: g });
    }
    // 連続演出 1〜3G 目
    result = advanceGame(result.state, input('NONE'), seqRng([]));
    expect(result.events).toEqual([{ type: 'RENZOKU_START', kind: 'FAKE', renzoku: 'A' }]);
    for (let g = 2; g <= 3; g++) {
      result = advanceGame(result.state, input('NONE'), seqRng([]));
      expect(result.state.phase).toEqual(renzokuPhase('FAKE', 'A', g));
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
    const state = initGameState(seqRng([9900, 0, 0, 50, ...scenarioDraws(7)]));
    expect(state.mode).toBe('HONZENCHO');
    expect(state.background).toBe('YOSHITSUNE');
    expect(state.phase).toEqual(omenPhase('REAL', 0, 7, 'B'));
    expect(state.pendingBackgroundTrigger).toBeNull();
  });
});

describe('advanceGame: 赤7待機・AT 導入(確定 37)', () => {
  const sevenWaitState = (game: number, overrides: Partial<GameState> = {}): GameState =>
    normalState({ mode: 'HONZENCHO', phase: { type: 'SEVEN_WAIT', game }, ...overrides });

  it('isSevenFlagForced: 赤7待機中のみ true(役抽せんの上流が REACH_ME へ強制する)', () => {
    expect(isSevenFlagForced(sevenWaitState(0))).toBe(true);
    expect(isSevenFlagForced(sevenWaitState(3))).toBe(true);
    expect(isSevenFlagForced(normalState())).toBe(false);
    expect(isSevenFlagForced(normalState({ phase: { type: 'AT_INTRO' } }))).toBe(false);
    expect(isSevenFlagForced(normalState({ phase: atPhase() }))).toBe(false);
  });

  it('赤7待機: 揃えられない(表示役 NONE)間は毎ゲーム待機が継続する(game 加算)', () => {
    let state = sevenWaitState(0);
    for (let g = 1; g <= 5; g++) {
      const result = advanceGame(state, input('REACH_ME', { displayedRole: 'NONE' }), seqRng([]));
      expect(result.state.phase).toEqual({ type: 'SEVEN_WAIT', game: g });
      expect(result.events).toEqual([]);
      // 取りこぼしゲームは払出 0(BET 3 のみ = net -3)
      expect(result.payout.net).toBe(-BET_PER_GAME);
      state = result.state;
    }
  });

  it('赤7待機: 揃えた(表示役 REACH_ME)ゲームで SEVEN_ALIGNED → 次ゲームが AT 導入', () => {
    const result = advanceGame(sevenWaitState(2), input('REACH_ME'), seqRng([]));
    expect(result.events).toEqual([{ type: 'SEVEN_ALIGNED' }]);
    expect(result.state.phase).toEqual({ type: 'AT_INTRO' });
    // 赤7 揃い(リーチ目)の払出は 3 枚 = net 0
    expect(result.payout.net).toBe(0);
  });

  it('赤7待機中はモード移行・偽前兆・背景移行の抽せんがすべて停止(確定 37)', () => {
    // mode NORMAL × 中段チェリーは通常なら必ず移行 or 偽前兆抽せんが走る役。
    // seqRng([]) = 乱数消費があれば throw する
    const result = advanceGame(
      normalState({ phase: { type: 'SEVEN_WAIT', game: 1 }, backgroundGames: 40 }),
      input('CHERRY_CENTER', { displayedRole: 'NONE' }),
      seqRng([]),
    );
    expect(result.state.mode).toBe('NORMAL');
    expect(result.state.background).toBe('YOSHITSUNE');
    expect(result.state.backgroundGames).toBe(41); // 30G 契機も停止(カウンタ加算のみ)
    expect(result.events).toEqual([]);
  });

  it('AT 導入ゲーム: 消化で継続率抽せん + AT_START(次ゲームが AT 小役 1G 目)', () => {
    const result = advanceGame(
      normalState({ mode: 'HONZENCHO', phase: { type: 'AT_INTRO' } }),
      input('NONE'),
      seqRng([0]), // 継続率抽せん(0 → 0.66)のみ消費
    );
    expect(result.events).toEqual([{ type: 'AT_START', continueRate: 0.66 }]);
    expect(result.state.phase).toEqual(atPhase({ continueRate: 0.66 }));
  });

  it('AT 導入中もモード移行・偽前兆の抽せんは停止(確定 37)', () => {
    // mode NORMAL × 中段チェリーでもモード移行・偽前兆の乱数は消費しない
    // (消費は継続率抽せんの 1 つだけ)
    const result = advanceGame(
      normalState({ phase: { type: 'AT_INTRO' }, backgroundGames: 40 }),
      input('CHERRY_CENTER'),
      seqRng([0]),
    );
    expect(result.state.mode).toBe('NORMAL');
    expect(result.state.backgroundGames).toBe(41);
    expect(result.events).toEqual([{ type: 'AT_START', continueRate: 0.66 }]);
  });
});

describe('advanceGame: 偽→本書き換え(確定 21・23)', () => {
  it('前兆 G 中の書き換え: kind のみ書き換え・G 数と演出・シナリオは引継ぎ・契機 4 予約なし', () => {
    // 偽前兆で抽せん済みの固有シナリオ(L0 でない値を含む)が再抽せんされないことを見る
    const scenario: OmenScenario = {
      steps: [
        { level: 1, slot: 'KOYU_4' },
        { level: 0 },
        { level: 2, slot: 'KYOTSU_3' },
        ...zeroScenario(6).steps,
      ],
      renzokuSteps: ['CHANCE', 'NORMAL', 'NORMAL'],
    };
    const state = normalState({
      mode: 'HEAVEN',
      phase: omenPhase('FAKE', 3, 9, 'B', scenario),
    });
    // 天国 × 中段チェリーは本前兆 100%。seqRng はモード移行分のみ
    // (前兆 G 数・演出・シナリオの再抽せんがあれば消費超過で throw = 確定 21(a)(b)・Q16 の検証)
    const result = advanceGame(state, input('CHERRY_CENTER'), seqRng([0]));
    expect(result.state.mode).toBe('HONZENCHO');
    expect(result.events).toEqual([
      { type: 'MODE_CHANGE', from: 'HEAVEN', to: 'HONZENCHO', trigger: 'CHERRY_CENTER' },
      { type: 'HONZENCHO_ENTER', trigger: 'CHERRY_CENTER' },
      { type: 'OMEN_REWRITE', trigger: 'CHERRY_CENTER' },
    ]);
    // 書き換えゲーム自体も前兆 1G 分として進行(game 3 → 4)。シナリオはそのまま引継ぎ(Q16)
    expect(result.state.phase).toEqual(omenPhase('REAL', 4, 9, 'B', scenario));
    // 契機 4(HONZENCHO_NEXT)は予約しない(確定 21(d))
    expect(result.state.pendingBackgroundTrigger).toBeNull();

    // 書き換え後の残り前兆は本前兆として進行(モード移行抽せん停止 = 乱数消費ゼロ)
    const next = advanceGame(result.state, input('CHERRY_CENTER'), seqRng([]));
    expect(next.state.phase).toEqual(omenPhase('REAL', 5, 9, 'B', scenario));
    expect(next.events).toEqual([]);
  });

  it('連続演出中の書き換え: 進行中の演出がそのまま成功へ(確定 21(c))', () => {
    // 1G 目で書き換え → 残りを消化して成功 → 赤7待機へ(確定 37)
    let result = advanceGame(
      normalState({
        mode: 'HEAVEN',
        phase: renzokuPhase('FAKE', 'B', 1),
      }),
      input('CHERRY_CENTER'),
      seqRng([0]),
    );
    expect(result.state.phase).toEqual(renzokuPhase('REAL', 'B', 2));
    result = advanceGame(result.state, input('NONE'), seqRng([]));
    result = advanceGame(result.state, input('NONE'), seqRng([])); // 成功 = 赤7待機(乱数消費なし)
    expect(result.events).toEqual([
      { type: 'RENZOKU_RESULT', kind: 'REAL', renzoku: 'B', success: true },
    ]);
    expect(result.state.phase).toEqual({ type: 'SEVEN_WAIT', game: 0 });
  });

  it('連続演出の最終 G の書き換えも有効(演出最終 G まで書き換え可能 = 確定 23)', () => {
    const state = normalState({
      mode: 'HEAVEN',
      phase: renzokuPhase('FAKE', 'A', 3),
    });
    const result = advanceGame(state, input('CHERRY_CENTER'), seqRng([0]));
    expect(result.events).toEqual([
      { type: 'MODE_CHANGE', from: 'HEAVEN', to: 'HONZENCHO', trigger: 'CHERRY_CENTER' },
      { type: 'HONZENCHO_ENTER', trigger: 'CHERRY_CENTER' },
      { type: 'OMEN_REWRITE', trigger: 'CHERRY_CENTER' },
      { type: 'RENZOKU_RESULT', kind: 'REAL', renzoku: 'A', success: true },
    ]);
    expect(result.state.phase).toEqual({ type: 'SEVEN_WAIT', game: 0 });
    expect(result.state.pendingBackgroundTrigger).toBeNull();
  });
});

describe('advanceGame: 背景移行(確定 24・25)', () => {
  it('契機 2(FAKE_OMEN_NEXT): 偽前兆当せんの次ゲーム(= 前兆 1G 目)に発火し BACKGROUND_CHANGE', () => {
    const state = normalState({
      phase: omenPhase('FAKE', 0, 8, 'B'),
      pendingBackgroundTrigger: 'FAKE_OMEN_NEXT',
      backgroundGames: 6,
    });
    // 通常 × FAKE_OMEN_NEXT × 義経 = [50, 0, 0, 25, 25]。80 → 前兆背景
    const result = advanceGame(state, input('NONE'), seqRng([80]));
    expect(result.state.background).toBe('ZENCHO');
    expect(result.events).toEqual([
      { type: 'BACKGROUND_CHANGE', trigger: 'FAKE_OMEN_NEXT', from: 'YOSHITSUNE', to: 'ZENCHO' },
    ]);
    // 予約は消化・カウンタはリセット・前兆は 1G 目へ進行
    expect(result.state.pendingBackgroundTrigger).toBeNull();
    expect(result.state.backgroundGames).toBe(0);
    expect(result.state.phase).toMatchObject({ type: 'OMEN', kind: 'FAKE', game: 1 });
  });

  it('自背景維持でもカウンタリセット・イベントなし(確定 24)', () => {
    const state = normalState({
      phase: omenPhase('FAKE', 0, 8, 'B'),
      pendingBackgroundTrigger: 'FAKE_OMEN_NEXT',
      backgroundGames: 12,
    });
    // 10 → 義経維持(自背景)
    const result = advanceGame(state, input('NONE'), seqRng([10]));
    expect(result.state.background).toBe('YOSHITSUNE');
    expect(result.events).toEqual([]);
    expect(result.state.backgroundGames).toBe(0);
    expect(result.state.pendingBackgroundTrigger).toBeNull();
  });

  it('契機 4(HONZENCHO_NEXT): 本前兆移行の次ゲームに全モード共通テーブルで発火', () => {
    const state = normalState({
      mode: 'HONZENCHO',
      background: 'YUGATA',
      phase: omenPhase('REAL', 0, 7, 'A'),
      pendingBackgroundTrigger: 'HONZENCHO_NEXT',
      backgroundGames: 20,
    });
    // HONZENCHO_NEXT × 夕方 = [0, 0, 0, 25, 75]。30 → 前兆背景
    const result = advanceGame(state, input('NONE'), seqRng([30]));
    expect(result.state.background).toBe('ZENCHO');
    expect(result.events).toEqual([
      { type: 'BACKGROUND_CHANGE', trigger: 'HONZENCHO_NEXT', from: 'YUGATA', to: 'ZENCHO' },
    ]);
    expect(result.state.backgroundGames).toBe(0);
    expect(result.state.pendingBackgroundTrigger).toBeNull();
  });

  it('契機 3(FAKE_OMEN_FAIL): 連続演出失敗の次ゲームに発火', () => {
    const state = normalState({
      background: 'ZENCHO',
      pendingBackgroundTrigger: 'FAKE_OMEN_FAIL',
      backgroundGames: 13,
    });
    // 通常 × FAKE_OMEN_FAIL × 前兆 = [33, 34, 33, 0, 0]。50 → 静
    const result = advanceGame(state, input('NONE'), seqRng([50]));
    expect(result.state.background).toBe('SHIZUKA');
    expect(result.events).toEqual([
      { type: 'BACKGROUND_CHANGE', trigger: 'FAKE_OMEN_FAIL', from: 'ZENCHO', to: 'SHIZUKA' },
    ]);
    expect(result.state.backgroundGames).toBe(0);
  });

  it('契機 1(30G 経過): 同一背景 30G 目のゲームで発火。29G 目までは発火しない', () => {
    // 29G 目(backgroundGames 28 + 1)は抽せんなし = 乱数消費ゼロ
    const before = advanceGame(normalState({ backgroundGames: 28 }), input('NONE'), seqRng([]));
    expect(before.state.background).toBe('YOSHITSUNE');
    expect(before.state.backgroundGames).toBe(29);

    // 30G 目に発火。通常 × ELAPSED × 義経 = [0, 100, 0, 0, 0] → 静(全値)
    const result = advanceGame(before.state, input('NONE'), seqRng([0]));
    expect(result.state.background).toBe('SHIZUKA');
    expect(result.events).toEqual([
      { type: 'BACKGROUND_CHANGE', trigger: 'ELAPSED', from: 'YOSHITSUNE', to: 'SHIZUKA' },
    ]);
    expect(result.state.backgroundGames).toBe(0);
  });

  it('契機 1: 停止期間の持ち越しでカウンタが 30 を超えていても次の通常ゲームで発火', () => {
    const result = advanceGame(normalState({ backgroundGames: 45 }), input('NONE'), seqRng([0]));
    expect(result.events).toEqual([
      { type: 'BACKGROUND_CHANGE', trigger: 'ELAPSED', from: 'YOSHITSUNE', to: 'SHIZUKA' },
    ]);
    expect(result.state.backgroundGames).toBe(0);
  });

  it('優先順位: 契機 3 と契機 1 が同一ゲームなら予約契機のみ抽せん(確定 25)', () => {
    const state = normalState({
      background: 'ZENCHO',
      pendingBackgroundTrigger: 'FAKE_OMEN_FAIL',
      backgroundGames: 29,
    });
    // 乱数 1 つだけ供給。両契機が抽せんされると消費超過で throw する
    const result = advanceGame(state, input('NONE'), seqRng([0]));
    expect(result.events).toEqual([
      { type: 'BACKGROUND_CHANGE', trigger: 'FAKE_OMEN_FAIL', from: 'ZENCHO', to: 'YOSHITSUNE' },
    ]);
    expect(result.state.backgroundGames).toBe(0);
  });

  it('優先順位: 偽前兆当せんゲームは契機 1 停止 → 次ゲームに契機 2 のみ発火(確定 15・25)', () => {
    // 30G 目のゲームで偽前兆当せん(値: モード維持 / 突入当せん / 前兆 8G / 連続演出 B / シナリオ)。
    // ELAPSED の抽せんがあれば消費超過で throw する
    const win = advanceGame(
      normalState({ backgroundGames: 29 }),
      input('WATERMELON_WEAK'),
      seqRng([0, 0, 30, 70, ...scenarioDraws(8)]),
    );
    expect(win.state.background).toBe('YOSHITSUNE');
    expect(win.state.backgroundGames).toBe(30); // リセットされず持ち越し
    expect(win.state.pendingBackgroundTrigger).toBe('FAKE_OMEN_NEXT');

    // 次ゲーム(前兆 1G 目)に契機 2 が発火してカウンタリセット
    const next = advanceGame(win.state, input('NONE'), seqRng([80]));
    expect(next.events).toEqual([
      { type: 'BACKGROUND_CHANGE', trigger: 'FAKE_OMEN_NEXT', from: 'YOSHITSUNE', to: 'ZENCHO' },
    ]);
    expect(next.state.backgroundGames).toBe(0);
  });

  it('前兆中(偽)・連続演出中は契機 1 停止(確定 25)= 乱数消費なし・カウンタ加算継続', () => {
    const phases: GameState['phase'][] = [
      omenPhase('FAKE', 3, 8, 'A'),
      renzokuPhase('FAKE', 'A', 1),
    ];
    for (const phase of phases) {
      const result = advanceGame(
        normalState({ phase: structuredClone(phase), backgroundGames: 40 }),
        input('NONE'),
        seqRng([]),
      );
      expect(result.state.background).toBe('YOSHITSUNE');
      expect(result.state.backgroundGames).toBe(41);
      expect(result.events).toEqual([]);
    }
  });

  it('連続演出の解決ゲーム(4G 目)も契機 1 停止 → 次ゲームに契機 3 が発火', () => {
    const state = normalState({
      phase: renzokuPhase('FAKE', 'A', 3),
      backgroundGames: 29,
    });
    // 失敗告知ゲーム: 背景抽せんなし(乱数消費ゼロ)・カウンタ持ち越し・契機 3 予約
    const fail = advanceGame(state, input('NONE'), seqRng([]));
    expect(fail.state.phase).toEqual({ type: 'NORMAL' });
    expect(fail.state.pendingBackgroundTrigger).toBe('FAKE_OMEN_FAIL');
    expect(fail.state.backgroundGames).toBe(30);

    // 次ゲームに契機 3 のみ発火(ELAPSED は予約契機に劣後)
    const next = advanceGame(fail.state, input('NONE'), seqRng([0]));
    expect(next.events).toEqual([
      { type: 'BACKGROUND_CHANGE', trigger: 'FAKE_OMEN_FAIL', from: 'YOSHITSUNE', to: 'SHIZUKA' },
    ]);
    expect(next.state.backgroundGames).toBe(0);
  });

  it('契機 3 の発火ゲームで新規偽前兆に当せんした場合: 発火 + 次ゲームへ契機 2 を予約', () => {
    const state = normalState({
      background: 'ZENCHO',
      pendingBackgroundTrigger: 'FAKE_OMEN_FAIL',
    });
    // 値: モード維持 / 突入当せん / 前兆 8G / 連続演出 B / シナリオ / 背景(50 → 静)
    const result = advanceGame(
      state,
      input('WATERMELON_WEAK'),
      seqRng([0, 0, 30, 70, ...scenarioDraws(8), 50]),
    );
    expect(result.events).toEqual([
      { type: 'FAKE_OMEN_ENTER', trigger: 'WATERMELON_WEAK', totalGames: 8, renzoku: 'B' },
      { type: 'BACKGROUND_CHANGE', trigger: 'FAKE_OMEN_FAIL', from: 'ZENCHO', to: 'SHIZUKA' },
    ]);
    expect(result.state.phase).toMatchObject({ type: 'OMEN', kind: 'FAKE', game: 0 });
    expect(result.state.pendingBackgroundTrigger).toBe('FAKE_OMEN_NEXT');
    expect(result.state.backgroundGames).toBe(0);
  });

  it('AT 中は背景移行抽せん停止(確定 11)= 乱数消費なし・カウンタ加算継続', () => {
    // エンディングは 1G(ENDING_GAMES)で AT 終了処理に入るため、
    // エンディング中の背景の扱いは「AT 終了処理」のテストで検証する
    const result = advanceGame(
      normalState({
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
        backgroundGames: 100,
      }),
      input('NONE'),
      seqRng([]),
    );
    expect(result.state.background).toBe('YOSHITSUNE');
    expect(result.state.backgroundGames).toBe(101);
    expect(result.events).toEqual([]);
  });

  it('偽→本書き換えと契機 2 が同一ゲーム: 背景維持(乱数消費なし)でカウンタのみリセット(実装解釈)', () => {
    const state = normalState({
      mode: 'HEAVEN',
      background: 'SHIZUKA',
      phase: omenPhase('FAKE', 0, 8, 'B'),
      pendingBackgroundTrigger: 'FAKE_OMEN_NEXT',
      backgroundGames: 7,
    });
    // 天国 × 中段チェリーは本前兆 100% → 書き換え。モード HONZENCHO に契機 2 のテーブルは
    // 存在しないため背景抽せんの乱数消費なし(seqRng はモード移行分のみ)
    const result = advanceGame(state, input('CHERRY_CENTER'), seqRng([0]));
    expect(result.state.mode).toBe('HONZENCHO');
    expect(result.state.phase).toEqual(omenPhase('REAL', 1, 8, 'B'));
    expect(result.state.background).toBe('SHIZUKA');
    expect(result.state.backgroundGames).toBe(0);
    expect(result.state.pendingBackgroundTrigger).toBeNull();
    expect(result.events).toEqual([
      { type: 'MODE_CHANGE', from: 'HEAVEN', to: 'HONZENCHO', trigger: 'CHERRY_CENTER' },
      { type: 'HONZENCHO_ENTER', trigger: 'CHERRY_CENTER' },
      { type: 'OMEN_REWRITE', trigger: 'CHERRY_CENTER' },
    ]);
  });

  it('大量試行: 通常 × 契機 1 × 夕方の移行分布がテーブル値([25, 25, 25, 25, 0])に収束する', () => {
    const trials = 100000;
    const rng = createRng(20260714);
    const counts: Record<string, number> = {};
    for (let i = 0; i < trials; i++) {
      const result = advanceGame(
        normalState({ background: 'YUGATA', backgroundGames: 29 }),
        input('NONE'),
        rng,
      );
      counts[result.state.background] = (counts[result.state.background] ?? 0) + 1;
    }
    const weights = [25, 25, 25, 25, 0];
    BACKGROUNDS.forEach((bg, i) => {
      const p = weights[i] / BACKGROUND_DENOM;
      const exp = trials * p;
      const sigma = Math.sqrt(trials * p * (1 - p));
      expect(Math.abs((counts[bg] ?? 0) - exp), bg).toBeLessThanOrEqual(Math.max(sigma * 4, 0));
    });
  });

  it('大量試行: 天国 × 契機 2 × 義経は天国専用テーブル([25, 0, 0, 50, 25])を参照する', () => {
    // 地獄・通常の同契機テーブル([50, 0, 0, 25, 25])と異なることの検証(モード × 契機の選択)
    const trials = 100000;
    const rng = createRng(20260715);
    const counts: Record<string, number> = {};
    for (let i = 0; i < trials; i++) {
      const result = advanceGame(
        normalState({
          mode: 'HEAVEN',
          phase: omenPhase('FAKE', 0, 8, 'A'),
          pendingBackgroundTrigger: 'FAKE_OMEN_NEXT',
        }),
        input('NONE'),
        rng,
      );
      counts[result.state.background] = (counts[result.state.background] ?? 0) + 1;
    }
    const weights = [25, 0, 0, 50, 25];
    BACKGROUNDS.forEach((bg, i) => {
      const p = weights[i] / BACKGROUND_DENOM;
      const exp = trials * p;
      const sigma = Math.sqrt(trials * p * (1 - p));
      expect(Math.abs((counts[bg] ?? 0) - exp), bg).toBeLessThanOrEqual(Math.max(sigma * 4, 0));
    });
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

describe('advanceGame: AT 小役パート・V ストック(確定 11・27)', () => {
  it('小役パート進行: partGame 0 → 1〜10 と進み、11 ゲーム目がバトル 1G 目', () => {
    // ハズレはモード移行・偽前兆・V ストックとも乱数消費なし(確定 27: 1G 消化のみ)
    let state = normalState({ phase: atPhase() });
    for (let g = 1; g <= 10; g++) {
      const result = advanceGame(state, input('NONE'), seqRng([]));
      expect(result.state.phase).toEqual(atPhase({ partGame: g }));
      expect(result.events).toEqual([]);
      state = result.state;
    }
    // 小役 10G 消化済み → 次ゲームがバトル 1G 目(バトル開始時の継続率抽せんで乱数 1 消費)
    const battle = advanceGame(state, input('NONE'), seqRng([0.99]));
    expect(battle.state.phase).toEqual(atPhase({ part: 'BATTLE', partGame: 1 }));
  });

  it('リプレイ・レア役も 1G 消化(確定 27)+ リプレイ・ベルの V ストック獲得率は 1/1000', () => {
    // リプレイ: V ストック抽せんの乱数 1 消費(999 → 漏れ)で partGame が進む
    const replay = advanceGame(
      normalState({ phase: atPhase({ partGame: 3 }) }),
      input('REPLAY'),
      seqRng([999]),
    );
    expect(replay.state.phase).toEqual(atPhase({ partGame: 4 }));
    expect(replay.events).toEqual([]);

    // ベル: 0 → 獲得(1/1000)
    const bell = advanceGame(
      normalState({ phase: atPhase({ partGame: 3 }) }),
      input('BELL'),
      seqRng([0]),
    );
    expect(bell.state.phase).toEqual(atPhase({ partGame: 4, vStock: 1 }));
    expect(bell.events).toEqual([{ type: 'V_STOCK_GAIN', trigger: 'BELL', vStock: 1 }]);
  });

  it('V ストックは複数ストック可能(確定 11)', () => {
    // 中段チェリー(獲得率 1000/1000 = 必ず獲得)を 2 ゲーム連続
    let result = advanceGame(
      normalState({ phase: atPhase({ partGame: 1 }) }),
      input('CHERRY_CENTER'),
      seqRng([0]),
    );
    expect(result.state.phase).toEqual(atPhase({ partGame: 2, vStock: 1 }));
    result = advanceGame(result.state, input('CHERRY_CENTER'), seqRng([0]));
    expect(result.state.phase).toEqual(atPhase({ partGame: 3, vStock: 2 }));
    expect(result.events).toEqual([{ type: 'V_STOCK_GAIN', trigger: 'CHERRY_CENTER', vStock: 2 }]);
  });
});

describe('advanceGame: AT バトルパート(確定 11)', () => {
  it('バトル開始: V ストックがあれば先に 1 個消費して継続確定(継続率抽せんなし = 確定 29)', () => {
    // seqRng([]) = 乱数消費ゼロ(継続率抽せんがあれば throw)
    const result = advanceGame(
      normalState({ phase: atPhase({ partGame: 10, vStock: 2 }) }),
      input('NONE'),
      seqRng([]),
    );
    expect(result.state.phase).toEqual(
      atPhase({ part: 'BATTLE', partGame: 1, vStock: 1, continueConfirmed: true }),
    );
    expect(result.events).toEqual([{ type: 'V_STOCK_USE', vStock: 1 }]);
  });

  it('バトル開始: V ストックなし → 継続率で継続抽せん(当せんで継続確定)', () => {
    const result = advanceGame(
      normalState({ phase: atPhase({ partGame: 10 }) }),
      input('NONE'),
      seqRng([0.5]), // 0.5 < 0.66 → 当せん
    );
    expect(result.state.phase).toEqual(
      atPhase({ part: 'BATTLE', partGame: 1, continueConfirmed: true }),
    );
    expect(result.events).toEqual([]);
  });

  it('バトル開始: V ストックなし + 継続率に漏れ → 未確定のままバトルへ', () => {
    const result = advanceGame(
      normalState({ phase: atPhase({ partGame: 10 }) }),
      input('NONE'),
      seqRng([0.99]), // 0.99 >= 0.66 → 漏れ
    );
    expect(result.state.phase).toEqual(atPhase({ part: 'BATTLE', partGame: 1 }));
  });

  it('バトル中(継続未確定)の小役は継続抽せん(当せんで継続確定。イベントなし)', () => {
    // 強スイカの継続獲得率 500/1000。499 → 当せん
    const win = advanceGame(
      normalState({ phase: atPhase({ part: 'BATTLE', partGame: 1 }) }),
      input('WATERMELON_STRONG'),
      seqRng([499]),
    );
    expect(win.state.phase).toEqual(
      atPhase({ part: 'BATTLE', partGame: 2, continueConfirmed: true }),
    );
    expect(win.events).toEqual([]);

    // 500 → 漏れ(未確定のまま)
    const lose = advanceGame(
      normalState({ phase: atPhase({ part: 'BATTLE', partGame: 1 }) }),
      input('WATERMELON_STRONG'),
      seqRng([500]),
    );
    expect(lose.state.phase).toEqual(atPhase({ part: 'BATTLE', partGame: 2 }));
  });

  it('バトル中(継続確定済み)の小役は V ストック抽せん(確定 11)', () => {
    const result = advanceGame(
      normalState({ phase: atPhase({ part: 'BATTLE', partGame: 1, continueConfirmed: true }) }),
      input('WATERMELON_STRONG'),
      seqRng([499]),
    );
    expect(result.state.phase).toEqual(
      atPhase({ part: 'BATTLE', partGame: 2, vStock: 1, continueConfirmed: true }),
    );
    expect(result.events).toEqual([
      { type: 'V_STOCK_GAIN', trigger: 'WATERMELON_STRONG', vStock: 1 },
    ]);
  });

  it('バトル 8G 目(継続確定)= セット継続: 連チャン +1 して次セット小役パートへ', () => {
    const result = advanceGame(
      normalState({
        phase: atPhase({ part: 'BATTLE', partGame: 7, renchan: 2, continueConfirmed: true }),
      }),
      input('NONE'),
      seqRng([]),
    );
    expect(result.events).toEqual([{ type: 'AT_SET_CONTINUE', tier: 'NORMAL', renchan: 3 }]);
    // partGame 0 = 次ゲームが次セット小役 1G 目。継続確定フラグはリセット
    expect(result.state.phase).toEqual(atPhase({ renchan: 3 }));
  });

  it('バトル 8G 目の小役で復活(未確定 → 継続抽せん当せん → 同ゲームでセット継続)', () => {
    const result = advanceGame(
      normalState({ phase: atPhase({ part: 'BATTLE', partGame: 7 }) }),
      input('CHERRY_CENTER'),
      seqRng([0]), // 継続獲得率 1000/1000 → 当せん
    );
    expect(result.events).toEqual([{ type: 'AT_SET_CONTINUE', tier: 'NORMAL', renchan: 2 }]);
    expect(result.state.phase).toEqual(atPhase({ renchan: 2 }));
  });

  it('バトル 8G 目(未確定のまま)= 敗北 → AT 終了処理(モード・背景再抽せん + カウンタリセット)', () => {
    const state = normalState({
      background: 'YUGATA',
      phase: atPhase({ part: 'BATTLE', partGame: 7 }),
      backgroundGames: 55,
    });
    // ハズレ(継続抽せんなし)→ 敗北。AT 終了処理: モード 3156 → NORMAL(AT_END テーブル
    // [3156, 3176, 3594, 74])、背景 60 → 静(NORMAL 初期 [50, 25, 25, 0, 0])
    const result = advanceGame(state, input('NONE'), seqRng([3156, 60]));
    expect(result.events).toEqual([
      { type: 'AT_END', reason: 'DEFEAT', mode: 'NORMAL', background: 'SHIZUKA' },
    ]);
    expect(result.state.phase).toEqual({ type: 'NORMAL' });
    expect(result.state.mode).toBe('NORMAL');
    expect(result.state.background).toBe('SHIZUKA');
    expect(result.state.backgroundGames).toBe(0);
    expect(result.state.pendingBackgroundTrigger).toBeNull();
  });
});

describe('advanceGame: 10 連 → エンディング → 上位 AT(確定 12・29〜31)', () => {
  it('連チャン 9 のセット継続で 10 連目へ(AT_SET_CONTINUE renchan 10)', () => {
    const result = advanceGame(
      normalState({
        phase: atPhase({ part: 'BATTLE', partGame: 7, renchan: 9, continueConfirmed: true }),
      }),
      input('NONE'),
      seqRng([]),
    );
    expect(result.events).toEqual([{ type: 'AT_SET_CONTINUE', tier: 'NORMAL', renchan: 10 }]);
    expect(result.state.phase).toEqual(atPhase({ renchan: 10 }));
  });

  it('10 連目のセットもバトル開始の継続処理は通常どおり(必ず移行の特例なし = 確定 30)', () => {
    // V ストックあり → 先に 1 個消費して継続確定(確定 29)
    const withStock = advanceGame(
      normalState({ phase: atPhase({ partGame: 10, renchan: 10, vStock: 2 }) }),
      input('NONE'),
      seqRng([]),
    );
    expect(withStock.state.phase).toEqual(
      atPhase({ part: 'BATTLE', partGame: 1, renchan: 10, vStock: 1, continueConfirmed: true }),
    );
    expect(withStock.events).toEqual([{ type: 'V_STOCK_USE', vStock: 1 }]);

    // V ストックなし → 継続率で抽せん(漏れたら未確定のまま)
    const noStock = advanceGame(
      normalState({ phase: atPhase({ partGame: 10, renchan: 10 }) }),
      input('NONE'),
      seqRng([0.99]),
    );
    expect(noStock.state.phase).toEqual(
      atPhase({ part: 'BATTLE', partGame: 1, renchan: 10 }),
    );
  });

  it('10 連目のバトルも未確定なら敗北 = AT 終了(敗北あり = 確定 30)', () => {
    const result = advanceGame(
      normalState({ phase: atPhase({ part: 'BATTLE', partGame: 7, renchan: 10 }) }),
      input('NONE'),
      seqRng([3156, 60]), // AT 終了処理: モード → NORMAL、背景 → 静
    );
    expect(result.events).toEqual([
      { type: 'AT_END', reason: 'DEFEAT', mode: 'NORMAL', background: 'SHIZUKA' },
    ]);
    expect(result.state.phase).toEqual({ type: 'NORMAL' });
  });

  it('通常 AT 10 連目のバトル勝利 → エンディングへ(after = UPPER_AT・ストック持越し = 確定 29・30)', () => {
    const result = advanceGame(
      normalState({
        phase: atPhase({
          part: 'BATTLE',
          partGame: 7,
          renchan: 10,
          vStock: 1,
          continueConfirmed: true,
        }),
      }),
      input('NONE'),
      seqRng([]),
    );
    expect(result.events).toEqual([{ type: 'ENDING_START', after: 'UPPER_AT' }]);
    expect(result.state.phase).toEqual({ type: 'ENDING', game: 0, after: 'UPPER_AT', vStock: 1 });
  });

  it('エンディング 10G 消化(確定 31)→ 上位 AT 開始(連チャンリセット・93% 固定・ストック持越し)', () => {
    // エンディング 1〜9G 目: 各種抽せんなし = 乱数消費ゼロ
    let state = normalState({
      phase: { type: 'ENDING', game: 0, after: 'UPPER_AT', vStock: 1 },
    });
    for (let g = 1; g <= ENDING_GAMES - 1; g++) {
      const mid = advanceGame(state, input('NONE'), seqRng([]));
      expect(mid.state.phase).toEqual({ type: 'ENDING', game: g, after: 'UPPER_AT', vStock: 1 });
      expect(mid.events).toEqual([]);
      state = mid.state;
    }
    // 最終 G(10G 目): 上位 AT へ(次ゲームが上位 AT 小役 1G 目。乱数消費なし)
    const result = advanceGame(state, input('NONE'), seqRng([]));
    expect(result.events).toEqual([{ type: 'UPPER_AT_ENTER' }]);
    expect(result.state.phase).toEqual(
      atPhase({ tier: 'UPPER', continueRate: UPPER_AT_CONTINUE_RATE, vStock: 1 }),
    );
  });

  it('上位 AT のセット継続とバトル開始は継続率 0.93 を参照する', () => {
    // 0.92 < 0.93 → 当せん
    const start = advanceGame(
      normalState({
        phase: atPhase({ tier: 'UPPER', partGame: 10, continueRate: UPPER_AT_CONTINUE_RATE }),
      }),
      input('NONE'),
      seqRng([0.92]),
    );
    expect(start.state.phase).toEqual(
      atPhase({
        tier: 'UPPER',
        part: 'BATTLE',
        partGame: 1,
        continueRate: UPPER_AT_CONTINUE_RATE,
        continueConfirmed: true,
      }),
    );

    const cont = advanceGame(
      normalState({
        phase: atPhase({
          tier: 'UPPER',
          part: 'BATTLE',
          partGame: 7,
          renchan: 4,
          continueRate: UPPER_AT_CONTINUE_RATE,
          continueConfirmed: true,
        }),
      }),
      input('NONE'),
      seqRng([]),
    );
    expect(cont.events).toEqual([{ type: 'AT_SET_CONTINUE', tier: 'UPPER', renchan: 5 }]);
  });

  it('上位 AT でもバトル敗北は即終了(降格なし = 確定 12)', () => {
    const result = advanceGame(
      normalState({
        phase: atPhase({
          tier: 'UPPER',
          part: 'BATTLE',
          partGame: 7,
          renchan: 5,
          continueRate: UPPER_AT_CONTINUE_RATE,
        }),
      }),
      input('NONE'),
      seqRng([0, 0]), // AT 終了処理: モード 0 → HELL、背景 0 → 義経
    );
    expect(result.events).toEqual([
      { type: 'AT_END', reason: 'DEFEAT', mode: 'HELL', background: 'YOSHITSUNE' },
    ]);
    expect(result.state.phase).toEqual({ type: 'NORMAL' });
  });

  it('上位 AT 10 連目のバトル勝利 → エンディング(after = AT_END)→ 消化後に AT 終了処理', () => {
    const ending = advanceGame(
      normalState({
        phase: atPhase({
          tier: 'UPPER',
          part: 'BATTLE',
          partGame: 7,
          renchan: 10,
          continueRate: UPPER_AT_CONTINUE_RATE,
          continueConfirmed: true,
        }),
      }),
      input('NONE'),
      seqRng([]),
    );
    expect(ending.events).toEqual([{ type: 'ENDING_START', after: 'AT_END' }]);
    expect(ending.state.phase).toEqual({ type: 'ENDING', game: 0, after: 'AT_END', vStock: 0 });

    // エンディング最終 G(10G 目)で AT 終了処理(確定 12: 「AT 終了後」テーブル)
    let state = ending.state;
    for (let g = 1; g <= ENDING_GAMES - 1; g++) {
      state = advanceGame(state, input('NONE'), seqRng([])).state;
    }
    const end = advanceGame(state, input('NONE'), seqRng([3156, 60]));
    expect(end.events).toEqual([
      { type: 'AT_END', reason: 'ENDING', mode: 'NORMAL', background: 'SHIZUKA' },
    ]);
    expect(end.state.phase).toEqual({ type: 'NORMAL' });
    expect(end.state.backgroundGames).toBe(0);
  });
});

describe('advanceGame: AT 終了処理の本前兆リドロー・ナビ・分布', () => {
  it('AT 終了処理で本前兆を引いたら前兆スケジュール済みで通常へ(契機 4 予約なし)', () => {
    // モード 9990 → HONZENCHO(AT_END テーブルの累計 9926 以上)、背景 99 → 前兆
    // (HONZENCHO 初期 [1, 1, 1, 7, 90])、前兆 G 数 0 → 7G、連続演出 90 → C
    const result = advanceGame(
      normalState({ phase: atPhase({ part: 'BATTLE', partGame: 7 }) }),
      input('NONE'),
      seqRng([9990, 99, 0, 90, ...scenarioDraws(7)]),
    );
    expect(result.events).toEqual([
      { type: 'AT_END', reason: 'DEFEAT', mode: 'HONZENCHO', background: 'ZENCHO' },
    ]);
    expect(result.state.mode).toBe('HONZENCHO');
    expect(result.state.background).toBe('ZENCHO');
    expect(result.state.phase).toEqual(omenPhase('REAL', 0, 7, 'C'));
    expect(result.state.pendingBackgroundTrigger).toBeNull();

    // 次ゲームが前兆 1G 目(背景移行の乱数消費なし = 契機 4 予約なしの検証)
    const next = advanceGame(result.state, input('NONE'), seqRng([]));
    expect(next.state.phase).toMatchObject({ type: 'OMEN', kind: 'REAL', game: 1 });
  });

  it('isNaviActive: AT 中(上位含む)+ エンディング中 + AT 導入は true(確定 26・31・37)', () => {
    expect(isNaviActive(normalState())).toBe(false);
    expect(isNaviActive(normalState({ phase: atPhase() }))).toBe(true);
    expect(isNaviActive(normalState({ phase: atPhase({ tier: 'UPPER' }) }))).toBe(true);
    expect(isNaviActive(normalState({ phase: omenPhase('FAKE', 1, 8, 'A') }))).toBe(false);
    expect(
      isNaviActive(normalState({ phase: { type: 'ENDING', game: 0, after: 'AT_END', vStock: 0 } })),
    ).toBe(true);
    expect(isNaviActive(normalState({ phase: { type: 'AT_INTRO' } }))).toBe(true);
    // 赤7待機中はベルが成立しない(REACH_ME 強制)ためナビ対象外
    expect(isNaviActive(normalState({ phase: { type: 'SEVEN_WAIT', game: 1 } }))).toBe(false);
  });

  it('大量試行: 継続率抽せんの振分けが SPEC「7.」(0.5 / 0.3 / 0.1 / 0.1)に収束する', () => {
    const trials = 100000;
    const rng = createRng(20260716);
    const counts: Record<number, number> = { 0.66: 0, 0.79: 0, 0.84: 0, 0.88: 0 };
    // AT 導入ゲーム(確定 37)の消化で継続率が抽せんされる
    for (let i = 0; i < trials; i++) {
      const result = advanceGame(
        normalState({
          mode: 'HONZENCHO',
          phase: { type: 'AT_INTRO' },
        }),
        input('NONE'),
        rng,
      );
      if (result.state.phase.type !== 'AT') throw new Error('AT へ突入していない');
      counts[result.state.phase.continueRate]++;
    }
    for (const [rate, weight] of Object.entries(CONTINUE_RATE_TABLE)) {
      const p = weight / CONTINUE_RATE_DENOM;
      const exp = trials * p;
      const sigma = Math.sqrt(trials * p * (1 - p));
      expect(Math.abs(counts[Number(rate)] - exp), `継続率 ${rate}`).toBeLessThanOrEqual(
        sigma * 4,
      );
    }
  });

  it('大量試行: AT 中の純増が想定 ≒ +6.4 枚/G(確定 16)に収束する(粗い検算)', () => {
    // 粗い検算の前提: 役抽せんは実テーブル(drawRole)、ナビ遵守でベルは全て 13 枚、
    // 取りこぼしなし(displayed = won)。正確な打ち方ポリシー結合のシミュレーションは 2e
    const rng = createRng(20260717);
    const newAt = (): GameState =>
      normalState({
        mode: 'HELL', // AT 中はモード抽せん停止のため何でもよい
        phase: atPhase({ continueRate: [0.66, 0.79, 0.84, 0.88][rng.nextInt(4)] }),
      });
    let state = newAt();
    let games = 0;
    let net = 0;
    const totalGames = 200000;
    while (games < totalGames) {
      const role = drawRole(rng);
      const result = advanceGame(state, { wonRole: role, displayedRole: role }, rng);
      net += result.payout.net;
      games++;
      state = result.state;
      if (state.phase.type !== 'AT' && state.phase.type !== 'ENDING') {
        state = newAt(); // AT 終了 → 次の AT を開始(AT 中のみの純増を計測)
      }
    }
    const perGame = net / games;
    expect(perGame).toBeGreaterThan(6.0);
    expect(perGame).toBeLessThan(6.9);
  });
});
