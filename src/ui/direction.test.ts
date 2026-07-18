import { describe, expect, it } from 'vitest';
import {
  AT_VIDEOS,
  BATTLE_IMAGES,
  ENDING_IMAGES,
  RENZOKU_VIDEOS,
  SYMBOL_IMAGES,
  YOKOKU_IMAGES,
  YOKOKU_VIDEOS,
} from '../assets';
import type { Background } from '../core/background';
import { RENZOKU_GAMES } from '../core/omen';
import { createRng, type Rng } from '../core/rng';
import type { BattleRoute, OmenScenario, RenzokuChanceUps, ScenarioStep } from '../core/scenario';
import { ENDING_GAMES, type GameEvent, type GameState } from '../core/state';
import {
  AT_BATTLE_SERIFU,
  atIntroAtLeverOn,
  atResultView,
  atVideoUrl,
  atYokokuAllowed,
  atYokokuView,
  BATTLE_TITLES,
  battleGameAtLeverOn,
  battleImageUrl,
  battleView,
  cutinsForEvents,
  drawKaiwaCast,
  endingImageUrl,
  KAIWA_LINES,
  KAIWA_SPEAKER_NAMES,
  koyakuHintAllowed,
  koyakuHintView,
  overlayForState,
  renzokuAtLeverOn,
  renzokuVideoUrl,
  RENZOKU_TITLES,
  resultSoundCue,
  revivalCutin,
  scenarioYokokuAtLeverOn,
  sevenWaitAtLeverOn,
  UAT_BATTLE_SERIFU,
  yokokuImageUrl,
  yokokuVideoUrl,
  type KaiwaCast,
} from './direction';
import { SOUND_CUES, type SoundCueId } from './sound';

/** 指定した値を順に返す rng(消費順・消費数の検証用。scenario.test.ts と同型) */
function seqRng(values: number[]): Rng {
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

function state(phase: GameState['phase'], overrides: Partial<GameState> = {}): GameState {
  return {
    mode: 'NORMAL',
    background: 'YOSHITSUNE',
    backgroundGames: 0,
    phase,
    pendingBackgroundTrigger: null,
    totalGames: 0,
    netCoins: 0,
    replayCarry: false,
    ...overrides,
  };
}

/** 指定ステップ列の前兆シナリオを作る(チャンスアップは固定) */
function scenario(steps: ScenarioStep[]): OmenScenario {
  return { steps, renzokuSteps: ['NORMAL', 'NORMAL', 'NORMAL'] };
}

/** 前兆 gG 目を消化済み(次のレバーオンで g+1 G 目)の OMEN フェーズ state */
function omenState(
  game: number,
  steps: ScenarioStep[],
  background: Background = 'YOSHITSUNE',
): GameState {
  return state(
    {
      type: 'OMEN',
      kind: 'REAL',
      game,
      totalGames: steps.length,
      renzoku: 'A',
      scenario: scenario(steps),
    },
    { background },
  );
}

const AT_PHASE = {
  type: 'AT',
  tier: 'NORMAL',
  part: 'KOYAKU',
  partGame: 3,
  renchan: 1,
  continueRate: 0.66,
  vStock: 0,
  continueConfirmed: false,
} as const;

describe('overlayForState(フェーズ由来の常時表示)', () => {
  it('通常時・前兆中・連続演出中・AT 中は常時表示なし(前兆予告・連続演出はレバーオン演出側 = 4c・4d)', () => {
    const steps: ScenarioStep[] = Array.from({ length: 7 }, () => ({ level: 1, slot: 'KOYU_4' }));
    expect(overlayForState(state({ type: 'NORMAL' }))).toBeUndefined();
    expect(overlayForState(omenState(3, steps))).toBeUndefined();
    expect(overlayForState(state(AT_PHASE))).toBeUndefined();
    expect(
      overlayForState(
        state({
          type: 'RENZOKU',
          kind: 'REAL',
          renzoku: 'A',
          game: 2,
          chanceUps: ['NORMAL', 'NORMAL', 'NORMAL'],
        }),
      ),
    ).toBeUndefined();
  });

  it('下位エンディングは静止画紙芝居(レバーオンで 1 枚目 → 第 2 停止で 2 枚目 = 2026-07-18 指示)', () => {
    const toUpper = overlayForState(
      state({ type: 'ENDING', game: 4, after: 'UPPER_AT', vStock: 2 }),
    );
    expect(toUpper).toEqual({
      kind: 'ENDING',
      game: 4,
      totalGames: ENDING_GAMES,
      after: 'UPPER_AT',
      leverUrl: ENDING_IMAGES['ending_at_1_freeze'],
      stop2Url: ENDING_IMAGES['ending_at_2_goshirakawa'],
    });
  });

  it('上位エンディングはレバーオンの 1 枚目のみ(第 2 停止の切替なし)', () => {
    const complete = overlayForState(
      state({ type: 'ENDING', game: 9, after: 'AT_END', vStock: 0 }),
    );
    expect(complete).toEqual({
      kind: 'ENDING',
      game: 9,
      totalGames: ENDING_GAMES,
      after: 'AT_END',
      leverUrl: ENDING_IMAGES['ending_uat_clear'],
      stop2Url: undefined,
    });
  });
});

describe('YOKOKU_VIDEOS(予告ムービー仮素材の存在検証。DIRECTION_SPEC「4.」の全 51 本)', () => {
  it('全キーが揃っている(通常 40 + 共通 8 + 前兆 3)', () => {
    const expected: string[] = [];
    for (const bg of ['yoshitsune', 'shizuka', 'benkei', 'yugata']) {
      for (let n = 1; n <= 5; n++) {
        expected.push(`yokoku_${bg}_koyu${n}_weak`, `yokoku_${bg}_koyu${n}_strong`);
      }
    }
    for (let n = 1; n <= 4; n++) {
      expected.push(`yokoku_common${n}_weak`, `yokoku_common${n}_strong`);
    }
    expected.push('yokoku_zencho1', 'yokoku_zencho2', 'yokoku_zencho3');

    expect(expected).toHaveLength(51);
    for (const key of expected) {
      expect(YOKOKU_VIDEOS[key], key).toBeTruthy();
      expect(yokokuVideoUrl(key), key).toBe(YOKOKU_VIDEOS[key]);
    }
    expect(Object.keys(YOKOKU_VIDEOS)).toHaveLength(51);
  });

  it('存在しないキーはエラー(仮素材の生成漏れ検知)', () => {
    expect(() => yokokuVideoUrl('yokoku_nazo_koyu9_weak')).toThrow();
  });
});

describe('YOKOKU_IMAGES(紙芝居方式の予告静止画の存在検証。2026-07-17 = 静・弁慶・夕方背景 固有 1 の各 4 枚 + 会話予告 12 枚)', () => {
  it('静・弁慶・夕方背景 固有予告 1 の各 4 枚 + 会話予告(4 キャラ × 3)が揃っている', () => {
    const expected = [
      'yokoku_shizuka_koyu1_still1',
      'yokoku_shizuka_koyu1_still2_weak',
      'yokoku_shizuka_koyu1_still2_strong',
      'yokoku_shizuka_koyu1_still3',
      'yokoku_benkei_koyu1_still1',
      'yokoku_benkei_koyu1_still2_weak',
      'yokoku_benkei_koyu1_still2_strong',
      'yokoku_benkei_koyu1_still3',
      'yokoku_yugata_koyu1_still1',
      'yokoku_yugata_koyu1_still2_weak',
      'yokoku_yugata_koyu1_still2_strong',
      'yokoku_yugata_koyu1_still3',
      // 会話予告(固有 3 = 12.7〜12.9): 4 キャラ × 一言目/二言目/全画面
      ...['yoshitsune', 'yoritomo', 'shizuka', 'benkei'].flatMap((char) => [
        `yokoku_kaiwa_${char}_line1`,
        `yokoku_kaiwa_${char}_line2`,
        `yokoku_kaiwa_${char}_full`,
      ]),
    ];
    for (const key of expected) {
      expect(YOKOKU_IMAGES[key], key).toBeTruthy();
      expect(yokokuImageUrl(key), key).toBe(YOKOKU_IMAGES[key]);
    }
    expect(Object.keys(YOKOKU_IMAGES)).toHaveLength(expected.length);
  });

  it('存在しないキーはエラー(入稿漏れ検知)', () => {
    expect(() => yokokuImageUrl('yokoku_shizuka_koyu9_still1')).toThrow();
  });
});

describe('RENZOKU_VIDEOS(連続演出ムービー仮素材の存在検証。DIRECTION_SPEC「4.」の全 46 本)', () => {
  it('全キーが揃っている(A/B × 5 背景 × 4G = 40 + C 4 + 成否告知 2)', () => {
    const expected: string[] = [];
    for (const kind of ['a', 'b']) {
      for (const bg of ['yoshitsune', 'shizuka', 'benkei', 'yugata', 'zencho']) {
        for (let g = 1; g <= 4; g++) expected.push(`renzoku_${kind}_${bg}_g${g}`);
      }
    }
    for (let g = 1; g <= 4; g++) expected.push(`renzoku_c_g${g}`);
    expected.push('renzoku_result_win', 'renzoku_result_lose');

    expect(expected).toHaveLength(46);
    for (const key of expected) {
      expect(RENZOKU_VIDEOS[key], key).toBeTruthy();
      expect(renzokuVideoUrl(key), key).toBe(RENZOKU_VIDEOS[key]);
    }
    expect(Object.keys(RENZOKU_VIDEOS)).toHaveLength(46);
  });

  it('存在しないキーはエラー(仮素材の生成漏れ検知)', () => {
    expect(() => renzokuVideoUrl('renzoku_z_yoshitsune_g1')).toThrow();
  });
});

describe('renzokuAtLeverOn(連続演出 4G のレバーオン解決 = DIRECTION_SPEC 2.4)', () => {
  const chanceUps: RenzokuChanceUps = ['CHANCE', 'NORMAL', 'CHANCE'];

  /** 連続演出 gG 目を消化済み(次のレバーオンで g+1 G 目)の RENZOKU フェーズ state */
  function renzokuState(
    game: number,
    renzoku: 'A' | 'B' | 'C',
    background: Background = 'YOSHITSUNE',
    kind: 'REAL' | 'FAKE' = 'REAL',
  ): GameState {
    return state({ type: 'RENZOKU', kind, renzoku, game, chanceUps }, { background });
  }

  it('前兆最終 G 消化済み(次が連続演出 1G 目)は G1 導入(チャンスアップはシナリオ参照)', () => {
    const steps: ScenarioStep[] = Array.from({ length: 7 }, () => ({ level: 0 }));
    const omenFinal = state(
      {
        type: 'OMEN',
        kind: 'REAL',
        game: 7,
        totalGames: 7,
        renzoku: 'A',
        scenario: { steps, renzokuSteps: chanceUps },
      },
      { background: 'SHIZUKA' },
    );
    expect(renzokuAtLeverOn(omenFinal)).toEqual({
      renzoku: 'A',
      game: 1,
      totalGames: RENZOKU_GAMES,
      videoUrl: RENZOKU_VIDEOS['renzoku_a_shizuka_g1'],
      title: RENZOKU_TITLES.A,
      stage: '導入',
      chanceUp: true,
      label: '連続演出A G1 導入(チャンス)',
    });
  });

  it('前兆消化中(次も前兆の G)は undefined(予告演出側が担う)', () => {
    const steps: ScenarioStep[] = Array.from({ length: 7 }, () => ({ level: 0 }));
    expect(renzokuAtLeverOn(omenState(3, steps))).toBeUndefined();
  });

  it('連続演出中は次 G の段階(G2 展開 / G3 あおり / G4 決着)。チャンスアップは chanceUps 参照', () => {
    expect(renzokuAtLeverOn(renzokuState(1, 'A'))).toMatchObject({
      game: 2,
      stage: '展開',
      chanceUp: false,
      videoUrl: RENZOKU_VIDEOS['renzoku_a_yoshitsune_g2'],
    });
    expect(renzokuAtLeverOn(renzokuState(2, 'B', 'YUGATA'))).toMatchObject({
      game: 3,
      stage: 'あおり',
      chanceUp: true,
      videoUrl: RENZOKU_VIDEOS['renzoku_b_yugata_g3'],
      title: RENZOKU_TITLES.B,
    });
    // G4 は成否告知の決着 G のためチャンスアップなし
    expect(renzokuAtLeverOn(renzokuState(3, 'B', 'YUGATA'))).toMatchObject({
      game: 4,
      stage: '決着',
      chanceUp: false,
      videoUrl: RENZOKU_VIDEOS['renzoku_b_yugata_g4'],
    });
  });

  it('A/B は前兆背景でも背景固有素材 / C は背景不問で共通素材(Q19)', () => {
    expect(renzokuAtLeverOn(renzokuState(1, 'A', 'ZENCHO'))?.videoUrl).toBe(
      RENZOKU_VIDEOS['renzoku_a_zencho_g2'],
    );
    expect(renzokuAtLeverOn(renzokuState(1, 'C', 'BENKEI'))?.videoUrl).toBe(
      RENZOKU_VIDEOS['renzoku_c_g2'],
    );
    expect(renzokuAtLeverOn(renzokuState(1, 'C', 'ZENCHO'))?.videoUrl).toBe(
      RENZOKU_VIDEOS['renzoku_c_g2'],
    );
  });

  it('見た目は前兆種別(本/偽)に依存しない(偽→本書き換えでも演出継続 = 確定 21(c))', () => {
    expect(renzokuAtLeverOn(renzokuState(2, 'A', 'YOSHITSUNE', 'FAKE'))).toEqual(
      renzokuAtLeverOn(renzokuState(2, 'A', 'YOSHITSUNE', 'REAL')),
    );
  });

  it('連続演出最終 G 消化後・通常時・AT・エンディング中は undefined', () => {
    expect(renzokuAtLeverOn(renzokuState(4, 'A'))).toBeUndefined();
    expect(renzokuAtLeverOn(state({ type: 'NORMAL' }))).toBeUndefined();
    expect(renzokuAtLeverOn(state(AT_PHASE))).toBeUndefined();
    expect(
      renzokuAtLeverOn(state({ type: 'ENDING', game: 1, after: 'UPPER_AT', vStock: 0 })),
    ).toBeUndefined();
  });
});

describe('scenarioYokokuAtLeverOn(前兆シナリオ予告のレバーオン解決 = DIRECTION_SPEC 2.1)', () => {
  // 前兆 7G のシナリオ例: 1G 目 L1 固有4 / 2G 目 L0 / 3G 目 L2 共通3 /
  // 4G 目 L1 共通4 / 5G 目 L3 固有5 / 6G 目 L0 / 7G 目 L2 固有4
  const steps: ScenarioStep[] = [
    { level: 1, slot: 'KOYU_4' },
    { level: 0 },
    { level: 2, slot: 'KYOTSU_3' },
    { level: 1, slot: 'KYOTSU_4' },
    { level: 3, slot: 'KOYU_5' },
    { level: 0 },
    { level: 2, slot: 'KOYU_4' },
  ];

  it('通常時・連続演出・AT・エンディング中は undefined', () => {
    expect(scenarioYokokuAtLeverOn(state({ type: 'NORMAL' }))).toBeUndefined();
    expect(
      scenarioYokokuAtLeverOn(
        state({
          type: 'RENZOKU',
          kind: 'REAL',
          renzoku: 'A',
          game: 1,
          chanceUps: ['NORMAL', 'NORMAL', 'NORMAL'],
        }),
      ),
    ).toBeUndefined();
    expect(scenarioYokokuAtLeverOn(state(AT_PHASE))).toBeUndefined();
    expect(
      scenarioYokokuAtLeverOn(state({ type: 'ENDING', game: 1, after: 'UPPER_AT', vStock: 0 })),
    ).toBeUndefined();
  });

  it('通常 4 背景: L1 = スロットの弱素材 / L2 = 強素材(背景固有は滞在背景の素材)', () => {
    // 当せんゲーム消化直後(game 0)→ 次は 1G 目 = L1 固有4
    const g1 = scenarioYokokuAtLeverOn(omenState(0, steps));
    expect(g1).toEqual({
      videoUrl: YOKOKU_VIDEOS['yokoku_yoshitsune_koyu4_weak'],
      label: '固有予告4(弱)',
      level: 1,
    });
    // 背景が変われば同じスロットでも背景の素材(静背景の固有4)
    expect(scenarioYokokuAtLeverOn(omenState(0, steps, 'SHIZUKA'))?.videoUrl).toBe(
      YOKOKU_VIDEOS['yokoku_shizuka_koyu4_weak'],
    );
    // 4G 目 = L1 共通4 → 共通素材の弱(ムービーあり)
    const g4 = scenarioYokokuAtLeverOn(omenState(3, steps, 'BENKEI'));
    expect(g4).toEqual({
      videoUrl: YOKOKU_VIDEOS['yokoku_common4_weak'],
      label: '共通予告4(弱)',
      level: 1,
    });
    // 5G 目 = L3(確定)→ 通常背景に確定素材はないため強素材で表示
    const g5 = scenarioYokokuAtLeverOn(omenState(4, steps, 'YUGATA'));
    expect(g5).toEqual({
      videoUrl: YOKOKU_VIDEOS['yokoku_yugata_koyu5_strong'],
      label: '固有予告5(強)',
      level: 3,
    });
  });

  it('通常 4 背景の共通 3 = リール消灯演出(確定 39): L1 = 左 / L2 = 左中 / L3 = 全画面消灯', () => {
    const blackoutSteps: ScenarioStep[] = [
      { level: 1, slot: 'KYOTSU_3' },
      { level: 2, slot: 'KYOTSU_3' },
      { level: 3, slot: 'KYOTSU_3' },
    ];
    const g1 = scenarioYokokuAtLeverOn(omenState(0, blackoutSteps));
    expect(g1).toEqual({
      blackoutReels: [0],
      label: '共通予告3 リール消灯(弱)',
      level: 1,
    });
    expect(g1?.videoUrl).toBeUndefined(); // ムービーなし(消灯は停止時から始まる)
    expect(scenarioYokokuAtLeverOn(omenState(1, blackoutSteps, 'BENKEI'))).toEqual({
      blackoutReels: [0, 1],
      label: '共通予告3 リール消灯(強)',
      level: 2,
    });
    expect(scenarioYokokuAtLeverOn(omenState(2, blackoutSteps, 'YUGATA'))).toEqual({
      blackoutReels: [0, 1, 2],
      label: '共通予告3 リール消灯(確定)',
      level: 3,
    });
  });

  it('前兆背景の共通 3 は消灯にならない(スロット無視の期待度ラダーのまま)', () => {
    const blackoutSteps: ScenarioStep[] = [{ level: 2, slot: 'KYOTSU_3' }];
    const view = scenarioYokokuAtLeverOn(omenState(0, blackoutSteps, 'ZENCHO'));
    expect(view?.blackoutReels).toBeUndefined();
    expect(view?.videoUrl).toBe(YOKOKU_VIDEOS['yokoku_zencho2']);
  });

  it('前兆背景: スロットを無視してレベル → 固有 1/2/3 の期待度ラダー(確定 33)', () => {
    const cases: [number, string, string][] = [
      [0, 'yokoku_zencho1', '前兆予告1(期待度弱)'], // 1G 目 = L1
      [2, 'yokoku_zencho2', '前兆予告2(期待度中)'], // 3G 目 = L2
      [4, 'yokoku_zencho3', '前兆予告3(本前兆確定)'], // 5G 目 = L3
    ];
    for (const [game, key, label] of cases) {
      const view = scenarioYokokuAtLeverOn(omenState(game, steps, 'ZENCHO'));
      expect(view, key).toEqual({
        videoUrl: YOKOKU_VIDEOS[key],
        label,
        level: steps[game].level,
      });
    }
  });

  it('L0 の G は予告なし(undefined)', () => {
    expect(scenarioYokokuAtLeverOn(omenState(1, steps))).toBeUndefined(); // 2G 目 = L0
    expect(scenarioYokokuAtLeverOn(omenState(5, steps))).toBeUndefined(); // 6G 目 = L0
  });

  it('前兆最終 G 消化後(次は連続演出 1G 目)は undefined', () => {
    expect(scenarioYokokuAtLeverOn(omenState(7, steps))).toBeUndefined();
  });
});

describe('koyakuHintAllowed / koyakuHintView(小役示唆予告 = 確定 34)', () => {
  const steps: ScenarioStep[] = Array.from({ length: 7 }, () => ({ level: 0 }));

  it('通常時と前兆中(次も前兆の G)は出せる。前兆背景滞在中は出さない', () => {
    expect(koyakuHintAllowed(state({ type: 'NORMAL' }))).toBe(true);
    expect(koyakuHintAllowed(omenState(0, steps))).toBe(true);
    expect(koyakuHintAllowed(omenState(6, steps))).toBe(true);
    expect(koyakuHintAllowed(state({ type: 'NORMAL' }, { background: 'ZENCHO' }))).toBe(false);
    expect(koyakuHintAllowed(omenState(0, steps, 'ZENCHO'))).toBe(false);
  });

  it('前兆最終 G 消化後(次は連続演出)・連続演出・AT・エンディング中は出さない', () => {
    expect(koyakuHintAllowed(omenState(7, steps))).toBe(false);
    expect(
      koyakuHintAllowed(
        state({
          type: 'RENZOKU',
          kind: 'FAKE',
          renzoku: 'B',
          game: 2,
          chanceUps: ['NORMAL', 'NORMAL', 'NORMAL'],
        }),
      ),
    ).toBe(false);
    expect(koyakuHintAllowed(state(AT_PHASE))).toBe(false);
    expect(koyakuHintAllowed(state({ type: 'ENDING', game: 1, after: 'AT_END', vStock: 0 }))).toBe(
      false,
    );
  });

  it('固有 1〜3 は滞在背景の素材 / 共通 1・2 は共通素材へ解決し、成立役の図柄画像が付く', () => {
    const koyu = koyakuHintView({ slot: 'KOYU_2', strong: false }, 'BELL', 'SHIZUKA');
    expect(koyu).toBeDefined();
    expect(koyu?.videoUrl).toBe(YOKOKU_VIDEOS['yokoku_shizuka_koyu2_weak']);
    expect(koyu?.label).toBe('固有予告2(弱)');
    expect(koyu?.strong).toBe(false);
    expect(koyu?.symbolUrl).toBeTruthy();

    const kyotsu = koyakuHintView({ slot: 'KYOTSU_1', strong: true }, 'WATERMELON_STRONG', 'YUGATA');
    expect(kyotsu?.videoUrl).toBe(YOKOKU_VIDEOS['yokoku_common1_strong']);
    expect(kyotsu?.strong).toBe(true);
  });

  it('固有 1 は全画面 + 図柄はムービー終盤(4.6 秒)/ それ以外は小パネル + 1.5 秒(確定 43)', () => {
    const full = koyakuHintView({ slot: 'KOYU_1', strong: false }, 'BELL', 'YOSHITSUNE');
    expect(full?.fullscreen).toBe(true);
    expect(full?.symbolDelayMs).toBe(4600);
    // 固有 3 は会話予告(2026-07-17 指示)のため対象外(別 describe で検証)
    for (const slot of ['KOYU_2', 'KYOTSU_1', 'KYOTSU_2'] as const) {
      const panel = koyakuHintView({ slot, strong: false }, 'BELL', 'YOSHITSUNE');
      expect(panel?.fullscreen).toBe(false);
      expect(panel?.symbolDelayMs).toBe(1500);
    }
  });

  it('図柄画像は成立役に対応する(スイカ系 = スイカ / チェリー系 = チェリー / リーチ目 = 赤7)', () => {
    const at = (role: Parameters<typeof koyakuHintView>[1]) =>
      koyakuHintView({ slot: 'KOYU_1', strong: false }, role, 'YOSHITSUNE')?.symbolUrl;
    expect(at('WATERMELON_WEAK')).toBe(at('WATERMELON_STRONG'));
    expect(at('CHANCE_ME')).toBe(at('WATERMELON_WEAK'));
    expect(at('CHERRY_CORNER')).toBe(at('CHERRY_CENTER'));
    expect(at('REACH_ME')).toBeTruthy();
    expect(at('REACH_ME')).not.toBe(at('BELL'));
    // ハズレの弱はブランク図柄を表示する(確定 39)
    expect(at('NONE')).toBe(SYMBOL_IMAGES.BLANK);
  });

  it('押し順ベル: 揃うベル = ベル図柄 / こぼすベル(bellMiss)= ブランク図柄(確定 39)', () => {
    const aligned = koyakuHintView({ slot: 'KOYU_1', strong: false }, 'BELL', 'YOSHITSUNE', false);
    expect(aligned?.symbolUrl).toBe(SYMBOL_IMAGES.BELL);
    const miss = koyakuHintView({ slot: 'KOYU_1', strong: false }, 'BELL', 'YOSHITSUNE', true);
    expect(miss?.symbolUrl).toBe(SYMBOL_IMAGES.BLANK);
    // bellMiss はベル以外の役では無視される
    const replay = koyakuHintView({ slot: 'KOYU_1', strong: false }, 'REPLAY', 'YOSHITSUNE', true);
    expect(replay?.symbolUrl).toBe(SYMBOL_IMAGES.REPLAY);
  });

  it('前兆背景では解決しない(素材がない)', () => {
    expect(koyakuHintView({ slot: 'KOYU_1', strong: false }, 'BELL', 'ZENCHO')).toBeUndefined();
  });

  it('静背景の固有 1 は紙芝居方式(静止画 3 枚): レバーオン → 第 1 停止(弱強差分)→ 第 3 停止 + 図柄', () => {
    const weak = koyakuHintView({ slot: 'KOYU_1', strong: false }, 'BELL', 'SHIZUKA');
    expect(weak?.videoUrl).toBeUndefined(); // ムービーは使わない
    expect(weak?.stills).toEqual({
      leverOn: YOKOKU_IMAGES['yokoku_shizuka_koyu1_still1'],
      firstStop: YOKOKU_IMAGES['yokoku_shizuka_koyu1_still2_weak'],
      allStop: YOKOKU_IMAGES['yokoku_shizuka_koyu1_still3'],
    });
    expect(weak?.fullscreen).toBe(true); // 全画面(確定 43)のまま
    expect(weak?.symbolUrl).toBe(SYMBOL_IMAGES.BELL);
    expect(weak?.label).toBe('固有予告1(弱)');

    // 弱強の差分は 2 枚目のみ(1 枚目・3 枚目は共通)
    const strong = koyakuHintView({ slot: 'KOYU_1', strong: true }, 'CHERRY_CORNER', 'SHIZUKA');
    expect(strong?.stills?.firstStop).toBe(YOKOKU_IMAGES['yokoku_shizuka_koyu1_still2_strong']);
    expect(strong?.stills?.leverOn).toBe(weak?.stills?.leverOn);
    expect(strong?.stills?.allStop).toBe(weak?.stills?.allStop);
    expect(strong?.strong).toBe(true);
    expect(strong?.symbolUrl).toBe(SYMBOL_IMAGES.CHERRY);
  });

  it('弁慶背景の固有 1 も紙芝居方式(2026-07-17 組込み。弱強差分は 2 枚目のみ)', () => {
    const weak = koyakuHintView({ slot: 'KOYU_1', strong: false }, 'BELL', 'BENKEI');
    expect(weak?.videoUrl).toBeUndefined();
    expect(weak?.stills).toEqual({
      leverOn: YOKOKU_IMAGES['yokoku_benkei_koyu1_still1'],
      firstStop: YOKOKU_IMAGES['yokoku_benkei_koyu1_still2_weak'],
      allStop: YOKOKU_IMAGES['yokoku_benkei_koyu1_still3'],
    });
    expect(weak?.fullscreen).toBe(true);
    expect(weak?.symbolUrl).toBe(SYMBOL_IMAGES.BELL);
    expect(weak?.label).toBe('固有予告1(弱)');

    const strong = koyakuHintView({ slot: 'KOYU_1', strong: true }, 'WATERMELON_STRONG', 'BENKEI');
    expect(strong?.stills?.firstStop).toBe(YOKOKU_IMAGES['yokoku_benkei_koyu1_still2_strong']);
    expect(strong?.stills?.leverOn).toBe(weak?.stills?.leverOn);
    expect(strong?.stills?.allStop).toBe(weak?.stills?.allStop);
    expect(strong?.strong).toBe(true);
    expect(strong?.symbolUrl).toBe(SYMBOL_IMAGES.WATERMELON);
  });

  it('夕方背景の固有 1 も紙芝居方式(2026-07-17 組込み。弱強差分は 2 枚目のみ)', () => {
    const weak = koyakuHintView({ slot: 'KOYU_1', strong: false }, 'BELL', 'YUGATA');
    expect(weak?.videoUrl).toBeUndefined();
    expect(weak?.stills).toEqual({
      leverOn: YOKOKU_IMAGES['yokoku_yugata_koyu1_still1'],
      firstStop: YOKOKU_IMAGES['yokoku_yugata_koyu1_still2_weak'],
      allStop: YOKOKU_IMAGES['yokoku_yugata_koyu1_still3'],
    });
    expect(weak?.fullscreen).toBe(true);
    expect(weak?.symbolUrl).toBe(SYMBOL_IMAGES.BELL);
    expect(weak?.label).toBe('固有予告1(弱)');

    const strong = koyakuHintView({ slot: 'KOYU_1', strong: true }, 'WATERMELON_STRONG', 'YUGATA');
    expect(strong?.stills?.firstStop).toBe(YOKOKU_IMAGES['yokoku_yugata_koyu1_still2_strong']);
    expect(strong?.stills?.leverOn).toBe(weak?.stills?.leverOn);
    expect(strong?.stills?.allStop).toBe(weak?.stills?.allStop);
    expect(strong?.strong).toBe(true);
    expect(strong?.symbolUrl).toBe(SYMBOL_IMAGES.WATERMELON);
  });

  it('静止画未入稿のスロット × 背景は従来のムービー方式のまま(静の固有 2 / 義経の固有 1)', () => {
    const shizukaKoyu2 = koyakuHintView({ slot: 'KOYU_2', strong: false }, 'BELL', 'SHIZUKA');
    expect(shizukaKoyu2?.stills).toBeUndefined();
    expect(shizukaKoyu2?.videoUrl).toBe(YOKOKU_VIDEOS['yokoku_shizuka_koyu2_weak']);
    const yoshitsuneKoyu1 = koyakuHintView({ slot: 'KOYU_1', strong: false }, 'BELL', 'YOSHITSUNE');
    expect(yoshitsuneKoyu1?.stills).toBeUndefined();
    expect(yoshitsuneKoyu1?.videoUrl).toBe(YOKOKU_VIDEOS['yokoku_yoshitsune_koyu1_weak']);
  });
});

describe('会話予告(固有予告 3 = 2026-07-17 指示。drawKaiwaCast + koyakuHintView の kaiwa 解決)', () => {
  const CAST: KaiwaCast = { first: 'YOSHITSUNE', second: 'SHIZUKA', fullscreen: 'YORITOMO' };

  it('義経/静/弁慶背景: 一言目 = 背景キャラ / 二言目 = 他 3 人から抽せん / 全画面 = 背景キャラ or 頼朝', () => {
    // 義経背景: 他 3 人 = [頼朝, 静, 弁慶] の順(KAIWA_SPEAKERS から背景キャラを除いた順)
    expect(drawKaiwaCast(seqRng([0, 0]), 'YOSHITSUNE')).toEqual({
      first: 'YOSHITSUNE',
      second: 'YORITOMO',
      fullscreen: 'YOSHITSUNE',
    });
    expect(drawKaiwaCast(seqRng([1, 1]), 'YOSHITSUNE')).toEqual({
      first: 'YOSHITSUNE',
      second: 'SHIZUKA',
      fullscreen: 'YORITOMO',
    });
    expect(drawKaiwaCast(seqRng([2, 0]), 'SHIZUKA')).toEqual({
      first: 'SHIZUKA',
      second: 'BENKEI',
      fullscreen: 'SHIZUKA',
    });
    expect(drawKaiwaCast(seqRng([0, 1]), 'BENKEI')).toEqual({
      first: 'BENKEI',
      second: 'YOSHITSUNE',
      fullscreen: 'YORITOMO',
    });
  });

  it('夕方背景: 一言目 = 弁慶 or 義経 / 二言目 = 静固定 / 全画面 = 頼朝固定', () => {
    expect(drawKaiwaCast(seqRng([0]), 'YUGATA')).toEqual({
      first: 'BENKEI',
      second: 'SHIZUKA',
      fullscreen: 'YORITOMO',
    });
    expect(drawKaiwaCast(seqRng([1]), 'YUGATA')).toEqual({
      first: 'YOSHITSUNE',
      second: 'SHIZUKA',
      fullscreen: 'YORITOMO',
    });
  });

  it('二言目・全画面の候補は全て出現し、一言目に背景キャラ以外は出ない(実 rng で分布確認)', () => {
    const rng = createRng(20260717);
    const seconds = new Set<string>();
    const fullscreens = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const cast = drawKaiwaCast(rng, 'YOSHITSUNE');
      expect(cast.first).toBe('YOSHITSUNE');
      expect(cast.second).not.toBe('YOSHITSUNE');
      seconds.add(cast.second);
      fullscreens.add(cast.fullscreen);
    }
    expect(seconds).toEqual(new Set(['YORITOMO', 'SHIZUKA', 'BENKEI']));
    expect(fullscreens).toEqual(new Set(['YOSHITSUNE', 'YORITOMO']));
  });

  it('前兆背景ではキャスト抽せんできない(呼び出し側が koyakuHintAllowed で除外する前提)', () => {
    expect(() => drawKaiwaCast(seqRng([]), 'ZENCHO')).toThrow();
  });

  it('弱 + 小役がそろう役(ベル): 一言目 + 二言目まで。全画面は出ない', () => {
    const view = koyakuHintView({ slot: 'KOYU_3', strong: false }, 'BELL', 'YOSHITSUNE', false, CAST);
    expect(view?.videoUrl).toBeUndefined();
    expect(view?.stills).toBeUndefined();
    expect(view?.kaiwa?.first).toEqual({
      imageUrl: YOKOKU_IMAGES['yokoku_kaiwa_yoshitsune_line1'],
      name: KAIWA_SPEAKER_NAMES.YOSHITSUNE,
      text: KAIWA_LINES.YOSHITSUNE.first,
    });
    expect(view?.kaiwa?.second).toEqual({
      imageUrl: YOKOKU_IMAGES['yokoku_kaiwa_shizuka_line2'],
      name: KAIWA_SPEAKER_NAMES.SHIZUKA,
      text: KAIWA_LINES.SHIZUKA.second,
    });
    expect(view?.kaiwa?.fullscreen).toBeUndefined();
    expect(view?.label).toBe('固有予告3 会話予告(弱: 義経→静)');
    expect(view?.symbolUrl).toBe(SYMBOL_IMAGES.BELL);
    expect(view?.strong).toBe(false);
    expect(view?.fullscreen).toBe(false);
    expect(view?.symbolDelayMs).toBe(0);
  });

  it('弱 + そろわない役(ハズレ / ベルこぼし / チャンス目 / リーチ目): 一言目のみ', () => {
    for (const [role, bellMiss] of [
      ['NONE', false],
      ['BELL', true],
      ['CHANCE_ME', false],
      ['REACH_ME', false],
    ] as const) {
      const view = koyakuHintView({ slot: 'KOYU_3', strong: false }, role, 'YOSHITSUNE', bellMiss, CAST);
      expect(view?.kaiwa?.second, `${role} bellMiss=${bellMiss}`).toBeUndefined();
      expect(view?.kaiwa?.fullscreen).toBeUndefined();
      expect(view?.label).toBe('固有予告3 会話予告(弱: 義経)');
    }
    // リプレイ・スイカ・チェリーは揃う役 = 二言目まで行く
    for (const role of ['REPLAY', 'WATERMELON_WEAK', 'CHERRY_CORNER'] as const) {
      const view = koyakuHintView({ slot: 'KOYU_3', strong: false }, role, 'YOSHITSUNE', false, CAST);
      expect(view?.kaiwa?.second, role).toBeDefined();
    }
  });

  it('強: 一言目 → 二言目 → 第 3 停止の全画面(そろわないレア役でも全段階へ行く)', () => {
    const view = koyakuHintView(
      { slot: 'KOYU_3', strong: true },
      'WATERMELON_STRONG',
      'YOSHITSUNE',
      false,
      CAST,
    );
    expect(view?.kaiwa?.second).toBeDefined();
    expect(view?.kaiwa?.fullscreen).toEqual({
      imageUrl: YOKOKU_IMAGES['yokoku_kaiwa_yoritomo_full'],
      name: KAIWA_SPEAKER_NAMES.YORITOMO,
      text: KAIWA_LINES.YORITOMO.full,
    });
    expect(view?.label).toBe('固有予告3 会話予告(強: 義経→静→頼朝)');
    expect(view?.symbolUrl).toBe(SYMBOL_IMAGES.WATERMELON);

    // 強はチャンス目(そろわない)でも二言目 → 全画面まで進む(全画面 = 強区分の見せ場)
    const chance = koyakuHintView({ slot: 'KOYU_3', strong: true }, 'CHANCE_ME', 'BENKEI', false, CAST);
    expect(chance?.kaiwa?.second).toBeDefined();
    expect(chance?.kaiwa?.fullscreen).toBeDefined();
  });

  it('キャストなしの固有 3 はエラー(呼び出し側の drawKaiwaCast 忘れ検知)/ 前兆背景は undefined', () => {
    expect(() => koyakuHintView({ slot: 'KOYU_3', strong: false }, 'BELL', 'YOSHITSUNE')).toThrow();
    expect(
      koyakuHintView({ slot: 'KOYU_3', strong: false }, 'BELL', 'ZENCHO', false, CAST),
    ).toBeUndefined();
  });
});

describe('AT_VIDEOS(AT・エンディング演出ムービー素材の存在検証。DIRECTION_SPEC「4.」の全 47 本)', () => {
  it('全キーが揃っている(小役予告 6 + AT バトル 20 + 上位バトル 17 + エンディング 2 + AT確定/導入 2)', () => {
    const expected: string[] = [];
    for (const tier of ['at', 'uat']) {
      for (const kind of ['navi', 'rare', 'strong']) expected.push(`${tier}_koyaku_${kind}`);
    }
    for (let no = 1; no <= 20; no++) expected.push(`battle_at_${String(no).padStart(2, '0')}`);
    // 上位 AT は Excel の No 歯抜け(13・15・16・19 なし)のまま採番
    for (const no of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 17, 18, 20, 21]) {
      expected.push(`battle_uat_${String(no).padStart(2, '0')}`);
    }
    expected.push('ending_to_upper', 'ending_complete');
    // 確定 37: AT確定ムービー(ユーザー入稿素材)+ AT 導入ムービー(仮素材)
    expected.push('at_kakutei', 'at_intro');

    expect(expected).toHaveLength(47);
    for (const key of expected) {
      expect(AT_VIDEOS[key], key).toBeTruthy();
      expect(atVideoUrl(key), key).toBe(AT_VIDEOS[key]);
    }
    expect(Object.keys(AT_VIDEOS)).toHaveLength(47);
  });

  it('存在しないキーはエラー(仮素材の生成漏れ検知)', () => {
    expect(() => atVideoUrl('battle_uat_13')).toThrow(); // 歯抜け No
    expect(() => atVideoUrl('at_koyaku_nazo')).toThrow();
  });
});

describe('sevenWaitAtLeverOn / atIntroAtLeverOn(赤7待機・AT 導入 = 確定 37)', () => {
  it('赤7待機 1G 目(AT 確定ゲームの次のレバーオン)は AT確定ムービーを再生する', () => {
    const view = sevenWaitAtLeverOn(state({ type: 'SEVEN_WAIT', game: 0 }));
    expect(view).toMatchObject({
      videoUrl: AT_VIDEOS['at_kakutei'],
      freeze: false,
      sevenUrl: SYMBOL_IMAGES.SEVEN_RED,
      game: 1,
    });
  });

  it('赤7待機 2G 目以降(揃えられなかった)は最終フレーム固定(freeze)で同じ画面のまま', () => {
    for (const game of [1, 2, 5]) {
      const view = sevenWaitAtLeverOn(state({ type: 'SEVEN_WAIT', game }));
      expect(view).toMatchObject({
        videoUrl: AT_VIDEOS['at_kakutei'],
        freeze: true,
        game: game + 1,
      });
    }
  });

  it('赤7待機以外のフェーズでは解決しない', () => {
    expect(sevenWaitAtLeverOn(state({ type: 'NORMAL' }))).toBeUndefined();
    expect(sevenWaitAtLeverOn(state(AT_PHASE))).toBeUndefined();
    expect(sevenWaitAtLeverOn(state({ type: 'AT_INTRO' }))).toBeUndefined();
  });

  it('AT 導入(赤7 揃いの次ゲーム)は AT 導入ムービーへ解決する', () => {
    const view = atIntroAtLeverOn(state({ type: 'AT_INTRO' }));
    expect(view).toMatchObject({ videoUrl: AT_VIDEOS['at_intro'] });
    expect(atIntroAtLeverOn(state({ type: 'NORMAL' }))).toBeUndefined();
    expect(atIntroAtLeverOn(state({ type: 'SEVEN_WAIT', game: 0 }))).toBeUndefined();
  });

  it('赤7待機・AT 導入中は他のレバーオン演出が解決されない(フェーズ排他)', () => {
    for (const phase of [
      { type: 'SEVEN_WAIT', game: 1 },
      { type: 'AT_INTRO' },
    ] as const) {
      const s = state(phase);
      expect(scenarioYokokuAtLeverOn(s)).toBeUndefined();
      expect(renzokuAtLeverOn(s)).toBeUndefined();
      expect(koyakuHintAllowed(s)).toBe(false);
      expect(atYokokuAllowed(s)).toBe(false);
      expect(battleGameAtLeverOn(s)).toBeUndefined();
    }
  });
});

describe('atYokokuAllowed / atYokokuView(AT 小役パート予告 = DIRECTION_SPEC 2.3)', () => {
  it('次が AT 小役パートの G のときのみ許可(バトル・エンディング・通常時は不可)', () => {
    expect(atYokokuAllowed(state(AT_PHASE))).toBe(true); // KOYAKU partGame 3 → 次は 4G 目
    expect(atYokokuAllowed(state({ ...AT_PHASE, partGame: 0 }))).toBe(true);
    // 小役 10G 消化済み = 次はバトル 1G 目 → 小役予告は出さない
    expect(atYokokuAllowed(state({ ...AT_PHASE, partGame: 10 }))).toBe(false);
    expect(atYokokuAllowed(state({ ...AT_PHASE, part: 'BATTLE', partGame: 2 }))).toBe(false);
    expect(
      atYokokuAllowed(state({ type: 'ENDING', game: 1, after: 'UPPER_AT', vStock: 0 })),
    ).toBe(false);
    expect(atYokokuAllowed(state({ type: 'NORMAL' }))).toBe(false);
  });

  it('AT_NAVI = ベル図柄 + 押し順テキスト(このゲームのナビ押し順と一致 = 確定 36)', () => {
    const view = atYokokuView('AT_NAVI', 'BELL', 'NORMAL', [1, 0, 2]);
    expect(view).toEqual({
      kind: 'AT_NAVI',
      videoUrl: AT_VIDEOS['at_koyaku_navi'],
      symbolUrl: SYMBOL_IMAGES.BELL,
      naviText: '中→左→右',
      strong: false,
      label: 'AT予告 ベルナビ',
    });
    // 正解 4 通りのナビ押し順がそれぞれのテキストへ解決される
    expect(atYokokuView('AT_NAVI', 'BELL', 'NORMAL', [1, 2, 0]).naviText).toBe('中→右→左');
    expect(atYokokuView('AT_NAVI', 'BELL', 'NORMAL', [2, 0, 1]).naviText).toBe('右→左→中');
    expect(atYokokuView('AT_NAVI', 'BELL', 'NORMAL', [2, 1, 0]).naviText).toBe('右→中→左');
  });

  it('AT_RARE = 成立役の図柄画像(目押し補助 = Q17)/ AT_STRONG = 図柄なし + 強調', () => {
    const rare = atYokokuView('AT_RARE', 'WATERMELON_STRONG', 'NORMAL');
    expect(rare.videoUrl).toBe(AT_VIDEOS['at_koyaku_rare']);
    expect(rare.symbolUrl).toBe(SYMBOL_IMAGES.WATERMELON);
    expect(rare.naviText).toBeUndefined();
    expect(rare.strong).toBe(false);

    const cherry = atYokokuView('AT_RARE', 'CHERRY_CORNER', 'NORMAL');
    expect(cherry.symbolUrl).toBe(SYMBOL_IMAGES.CHERRY);

    const strong = atYokokuView('AT_STRONG', 'CHERRY_CENTER', 'NORMAL');
    expect(strong.videoUrl).toBe(AT_VIDEOS['at_koyaku_strong']);
    expect(strong.symbolUrl).toBeUndefined();
    expect(strong.strong).toBe(true);
  });

  it('上位 AT は専用ムービー(uat_koyaku_*)へ解決する', () => {
    expect(atYokokuView('AT_NAVI', 'BELL', 'UPPER').videoUrl).toBe(AT_VIDEOS['uat_koyaku_navi']);
    expect(atYokokuView('AT_STRONG', 'REACH_ME', 'UPPER').videoUrl).toBe(
      AT_VIDEOS['uat_koyaku_strong'],
    );
  });
});

describe('battleGameAtLeverOn / battleView(バトルパート 8G = DIRECTION_SPEC 2.5・3.6)', () => {
  it('バトル 1G 目 = 小役 10G 消化済み / 2〜8G 目 = BATTLE フェーズ(消化済み +1)', () => {
    expect(battleGameAtLeverOn(state({ ...AT_PHASE, partGame: 10 }))).toBe(1);
    expect(battleGameAtLeverOn(state({ ...AT_PHASE, part: 'BATTLE', partGame: 1 }))).toBe(2);
    expect(battleGameAtLeverOn(state({ ...AT_PHASE, part: 'BATTLE', partGame: 7 }))).toBe(8);
    // 小役パート中・通常時・エンディング中はバトルではない
    expect(battleGameAtLeverOn(state(AT_PHASE))).toBeUndefined();
    expect(battleGameAtLeverOn(state({ type: 'NORMAL' }))).toBeUndefined();
    expect(
      battleGameAtLeverOn(state({ type: 'ENDING', game: 1, after: 'AT_END', vStock: 0 })),
    ).toBeUndefined();
  });

  const route = (id: string, outcome: 'WIN' | 'LOSE', chanceUps: number[]): BattleRoute => ({
    id,
    outcome,
    label: '',
    chanceUps,
  });

  it('下位 AT G1〜3(静止画紙芝居 = 2026-07-18): 導入 = 月(通常 青 / チャンス 赤)/ 台詞 2 種', () => {
    const w4 = route('W4', 'WIN', [1, 3]);
    // G1 チャンス = 赤い月
    const g1 = battleView('NORMAL', w4, 1);
    expect(g1).toMatchObject({ chanceUp: true, stage: '導入' });
    expect(g1.still).toEqual({ leverUrl: BATTLE_IMAGES['battle_at_g1_chance'] });
    // G1 通常 = 青い月
    expect(battleView('NORMAL', route('W1', 'WIN', []), 1).still?.leverUrl).toBe(
      BATTLE_IMAGES['battle_at_g1_normal'],
    );
    // G2 = 義経セリフ(通常。台詞はアプリ側テキスト = AT_BATTLE_SERIFU)
    expect(battleView('NORMAL', w4, 2).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_at_g2_yoshitsune_serifu'],
      leverText: { kind: 'SERIFU', ...AT_BATTLE_SERIFU.g2Normal },
    });
    // G3 = 頼朝セリフ(チャンスアップ G は台詞が変わる)
    expect(battleView('NORMAL', w4, 3).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_at_g3_yoritomo_serifu'],
      leverText: { kind: 'SERIFU', ...AT_BATTLE_SERIFU.g3Chance },
    });
  });

  it('下位 AT G4〜8(義経強 = 桜花繚乱チャレンジ / 技名はアプリ側テキスト)', () => {
    const w3 = route('W3', 'WIN', []); // 義経強攻撃 → 桜花繚乱 → 継続
    // G4 = 対峙 → 第 3 停止で義経の顔アップ
    expect(battleView('NORMAL', w3, 4).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_at_g4_lever_taiji'],
      stop3Url: BATTLE_IMAGES['battle_at_g4_stop3_yoshitsune_up'],
    });
    // G5 義経強 = レバオンで技名「桜花繚乱」→ 第 3 停止で決めカット(pptx スライド 6)
    expect(battleView('NORMAL', w3, 5).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_at_g5_yoshitsune_strong_lever'],
      leverText: { kind: 'WAZA', text: '桜花繚乱' },
      stop3Url: BATTLE_IMAGES['battle_at_g5_yoshitsune_strong_stop3'],
    });
    // G6〜8 = 桜花繚乱チャレンジ(G8 第 3 停止で継続)
    expect(battleView('NORMAL', w3, 6).still?.leverUrl).toBe(
      BATTLE_IMAGES['battle_at_g6_ouka_challenge'],
    );
    expect(battleView('NORMAL', w3, 7).still?.leverText).toEqual({
      kind: 'CHALLENGE',
      text: '桜花繚乱チャレンジ',
    });
    expect(battleView('NORMAL', w3, 8).still).toMatchObject({
      leverUrl: BATTLE_IMAGES['battle_at_g6_ouka_challenge'],
      stop3Url: BATTLE_IMAGES['battle_at_g7_yoshitsune_atk_keizoku'],
      stop3Text: { kind: 'KEIZOKU', text: '継続' },
    });
  });

  it('下位 AT G4〜8(義経弱 = 頼朝防御 → 余裕 → 継続 / 技名 穿炎刃)', () => {
    const w1 = route('W1', 'WIN', []);
    expect(battleView('NORMAL', w1, 4).still?.stop3Url).toBe(
      BATTLE_IMAGES['battle_at_g4_stop3_yoshitsune_up'],
    );
    expect(battleView('NORMAL', w1, 5).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_at_g5_yoshitsune_weak_lever'],
      stop3Url: BATTLE_IMAGES['battle_at_g5_yoshitsune_weak_stop3'],
      stop3Text: { kind: 'WAZA', text: '穿炎刃' },
    });
    expect(battleView('NORMAL', w1, 6).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_at_g6_yoshitsune_atk_lever'],
      stop3Url: BATTLE_IMAGES['battle_at_g6_yoshitsune_atk_stop3'],
    });
    expect(battleView('NORMAL', w1, 7).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_at_g7_yoshitsune_atk_keizoku'],
      leverText: { kind: 'KEIZOKU', text: '継続' },
    });
    expect(battleView('NORMAL', w1, 8).still?.leverText).toEqual({ kind: 'KEIZOKU', text: '継続' });
  });

  it('下位 AT G4〜8(頼朝攻撃: 勝利 = 耐える / 敗北寄り = 敗北 → 復活判定)', () => {
    // W5 = 頼朝弱攻撃 → 耐える → 継続
    const w5 = route('W5', 'WIN', []);
    expect(battleView('NORMAL', w5, 4).still?.stop3Url).toBe(
      BATTLE_IMAGES['battle_at_g4_stop3_yoritomo_up'],
    );
    expect(battleView('NORMAL', w5, 5).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_at_g5_yoritomo_weak_lever'],
      stop3Url: BATTLE_IMAGES['battle_at_g5_yoritomo_weak_stop3'],
      stop3Text: { kind: 'WAZA', text: '雷獄刃' },
    });
    expect(battleView('NORMAL', w5, 6).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_at_g6_yoritomo_atk_lever'],
    });
    expect(battleView('NORMAL', w5, 7).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_at_g7_yoritomo_atk_lever'],
      stop3Url: BATTLE_IMAGES['battle_at_g7_stop3_taeru'],
      stop3Text: undefined,
    });
    // U4 = 頼朝強攻撃 → 耐えれない → 敗北(復活の成否は全停止後の revivalCutin)
    const u4 = route('U4', 'LOSE', []);
    expect(battleView('NORMAL', u4, 5).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_at_g5_yoritomo_strong_lever'],
      stop3Url: BATTLE_IMAGES['battle_at_g5_yoritomo_strong_stop3'],
      stop3Text: { kind: 'WAZA', text: '御雷天昇' },
    });
    expect(battleView('NORMAL', u4, 7).still).toMatchObject({
      leverUrl: BATTLE_IMAGES['battle_at_g7_yoritomo_atk_lever'],
      stop3Url: BATTLE_IMAGES['battle_at_g7_stop3_haiboku'],
      stop3Text: { kind: 'HAIBOKU', text: '敗北' },
    });
    expect(battleView('NORMAL', u4, 8).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_at_g8_lever_down'],
      leverText: { kind: 'HAIBOKU', text: '敗北' },
    });
  });

  it('上位 AT G1〜3(静止画紙芝居 = 2026-07-18): 雪原の月(通常 青 / チャンス 赤)/ 台詞 2 種', () => {
    const w6 = route('W6', 'WIN', [1, 3]); // ダブル攻撃(チャンスアップ G1・G3)
    const g1 = battleView('UPPER', w6, 1);
    expect(g1).toMatchObject({ chanceUp: true, title: BATTLE_TITLES.UPPER });
    expect(g1.title).toContain('後白河法皇'); // Q40 = タイトル変更
    expect(g1.still).toEqual({ leverUrl: BATTLE_IMAGES['battle_uat_g1_chance'] });
    expect(battleView('UPPER', route('W1', 'WIN', []), 1).still.leverUrl).toBe(
      BATTLE_IMAGES['battle_uat_g1_normal'],
    );
    // G2 = 義経セリフ(通常。台詞はアプリ側テキスト = UAT_BATTLE_SERIFU)
    expect(battleView('UPPER', w6, 2).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_uat_g2_yoshitsune_serifu'],
      leverText: { kind: 'SERIFU', ...UAT_BATTLE_SERIFU.g2Normal },
    });
    // G3 = 頼朝セリフ(チャンスアップ G は台詞が変わる)
    expect(battleView('UPPER', w6, 3).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_uat_g3_yoritomo_serifu'],
      leverText: { kind: 'SERIFU', ...UAT_BATTLE_SERIFU.g3Chance },
    });
  });

  it('上位 AT G4〜8(義経攻撃・勝ち = W1・W2: 障壁砕け → 後白河崩れる → 継続)', () => {
    const w1 = route('W1', 'WIN', []);
    expect(battleView('UPPER', w1, 4).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_uat_g4_lever_taiji'],
      stop3Url: BATTLE_IMAGES['battle_uat_g4_stop3_yoshitsune_up'],
    });
    expect(battleView('UPPER', w1, 5).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_uat_g5_yoshitsune_lever'],
      stop3Url: BATTLE_IMAGES['battle_uat_g5_yoshitsune_stop3'],
      stop3Text: { kind: 'WAZA', text: '蒼炎一閃' },
    });
    expect(battleView('UPPER', w1, 6).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_uat_g6_lever_shouheki'],
      stop3Url: BATTLE_IMAGES['battle_uat_g6_stop3_hit'],
    });
    expect(battleView('UPPER', w1, 7).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_uat_g7_win_kuzureru'],
    });
    expect(battleView('UPPER', w1, 8).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_uat_g8_win_keizoku'],
      leverText: { kind: 'KEIZOKU', text: '継続' },
    });
  });

  it('上位 AT G4〜8(ダブル攻撃 = W5〜W7: 勝利確定の専用カット)', () => {
    const w5 = route('W5', 'WIN', []);
    expect(battleView('UPPER', w5, 4).still.stop3Url).toBe(
      BATTLE_IMAGES['battle_uat_g4_stop3_double_up'],
    );
    expect(battleView('UPPER', w5, 5).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_uat_g5_double_lever'],
      stop3Url: BATTLE_IMAGES['battle_uat_g5_double_stop3'],
      stop3Text: { kind: 'WAZA', text: '炎雷共鳴' },
    });
    expect(battleView('UPPER', w5, 6).still.stop3Url).toBe(
      BATTLE_IMAGES['battle_uat_g6_stop3_double_hit'],
    );
    expect(battleView('UPPER', w5, 7).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_uat_g7_double_tobu'],
    });
    expect(battleView('UPPER', w5, 8).still.leverText).toEqual({ kind: 'KEIZOKU', text: '継続' });
  });

  it('上位 AT G4〜8(頼朝攻撃・負け寄り = U3〜U5: 防がれる → 反撃・被弾 → 敗北)', () => {
    const u4 = route('U4', 'LOSE', []);
    expect(battleView('UPPER', u4, 4).still.stop3Url).toBe(
      BATTLE_IMAGES['battle_uat_g4_stop3_yoritomo_up'],
    );
    expect(battleView('UPPER', u4, 5).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_uat_g5_yoritomo_lever'],
      stop3Url: BATTLE_IMAGES['battle_uat_g5_yoritomo_stop3'],
      stop3Text: { kind: 'WAZA', text: '紫電轟雷' },
    });
    expect(battleView('UPPER', u4, 6).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_uat_g6_lever_shouheki'],
      stop3Url: BATTLE_IMAGES['battle_uat_g6_stop3_guard'],
    });
    expect(battleView('UPPER', u4, 7).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_uat_g7_lose_hangeki_lever'],
      stop3Url: BATTLE_IMAGES['battle_uat_g7_lose_hangeki_stop3'],
    });
    expect(battleView('UPPER', u4, 8).still).toEqual({
      leverUrl: BATTLE_IMAGES['battle_uat_g8_lever_down'],
      leverText: { kind: 'HAIBOKU', text: '敗北' },
    });
    // 義経攻撃・負け寄り(U1・U2)は攻撃側だけ義経になる
    const u1 = route('U1', 'LOSE', []);
    expect(battleView('UPPER', u1, 5).still.leverUrl).toBe(
      BATTLE_IMAGES['battle_uat_g5_yoshitsune_lever'],
    );
    expect(battleView('UPPER', u1, 6).still.stop3Url).toBe(
      BATTLE_IMAGES['battle_uat_g6_stop3_guard'],
    );
  });

  it('今のゲームの注記(gameNote = 2026-07-18 指示。例: 1G目 通常パターン / 4G目 義経攻撃へ)', () => {
    // 下位 AT
    expect(battleView('NORMAL', route('W1', 'WIN', []), 1).gameNote).toBe(
      '1G目 通常パターン(青い月)',
    );
    expect(battleView('NORMAL', route('W2', 'WIN', [2]), 2).gameNote).toBe(
      '2G目 義経セリフ(チャンス)',
    );
    expect(battleView('NORMAL', route('W1', 'WIN', []), 4).gameNote).toBe('4G目 義経弱攻撃へ');
    expect(battleView('NORMAL', route('W3', 'WIN', []), 6).gameNote).toBe(
      '6G目 桜花繚乱チャレンジ',
    );
    expect(battleView('NORMAL', route('U4', 'LOSE', []), 8).gameNote).toBe(
      '8G目 敗北(復活判定)',
    );
    // 上位 AT
    expect(battleView('UPPER', route('W6', 'WIN', [1, 3]), 1).gameNote).toBe(
      '1G目 チャンスパターン(赤い月)',
    );
    expect(battleView('UPPER', route('W1', 'WIN', []), 4).gameNote).toBe('4G目 義経攻撃へ');
    expect(battleView('UPPER', route('W5', 'WIN', []), 4).gameNote).toBe(
      '4G目 ダブル攻撃へ(勝利確定)',
    );
    expect(battleView('UPPER', route('U4', 'LOSE', []), 5).gameNote).toBe(
      '5G目 頼朝攻撃(紫電轟雷)',
    );
    expect(battleView('UPPER', route('W1', 'WIN', []), 8).gameNote).toBe('8G目 継続');
  });

  it('未知のルート ID はエラー(ルート表とのズレ検知)', () => {
    expect(() => battleView('NORMAL', route('W9', 'WIN', []), 4)).toThrow();
    expect(() => battleView('UPPER', route('W9', 'WIN', []), 4)).toThrow();
    // G1〜3 はルート ID 非依存のためエラーにならない
    expect(() => battleView('NORMAL', route('W9', 'WIN', []), 1)).not.toThrow();
    expect(() => battleView('UPPER', route('W9', 'WIN', []), 1)).not.toThrow();
  });
});

describe('BATTLE_IMAGES(バトル静止画素材の存在検証。下位 25 枚 + 上位 25 枚 = 2026-07-18 の実素材)', () => {
  it('全 50 キーが揃っている(gen_battle_images.mjs の JOBS / UAT_JOBS と同一の jobId)', () => {
    const atJobIds = [
      'g1_normal', 'g1_chance',
      'g2_yoshitsune_serifu', 'g3_yoritomo_serifu',
      'g4_lever_taiji', 'g4_stop3_yoshitsune_up', 'g4_stop3_yoritomo_up',
      'g5_yoshitsune_weak_lever', 'g5_yoshitsune_weak_stop3',
      'g5_yoshitsune_strong_lever', 'g5_yoshitsune_strong_stop3',
      'g5_yoritomo_weak_lever', 'g5_yoritomo_weak_stop3',
      'g5_yoritomo_strong_lever', 'g5_yoritomo_strong_stop3',
      'g6_yoshitsune_atk_lever', 'g6_yoshitsune_atk_stop3',
      'g6_yoritomo_atk_lever', 'g6_ouka_challenge',
      'g7_yoritomo_atk_lever', 'g7_stop3_taeru', 'g7_stop3_haiboku',
      'g7_yoshitsune_atk_keizoku',
      'g8_lever_down', 'g8_stop3_shizuka_cutin',
    ];
    const uatJobIds = [
      'uat_g1_normal', 'uat_g1_chance',
      'uat_g2_yoshitsune_serifu', 'uat_g3_yoritomo_serifu',
      'uat_g4_lever_taiji', 'uat_g4_stop3_yoshitsune_up', 'uat_g4_stop3_yoritomo_up',
      'uat_g4_stop3_double_up',
      'uat_g5_yoshitsune_lever', 'uat_g5_yoshitsune_stop3',
      'uat_g5_yoritomo_lever', 'uat_g5_yoritomo_stop3',
      'uat_g5_double_lever', 'uat_g5_double_stop3',
      'uat_g6_lever_shouheki', 'uat_g6_stop3_hit', 'uat_g6_stop3_guard',
      'uat_g6_stop3_double_hit',
      'uat_g7_win_kuzureru', 'uat_g7_double_tobu',
      'uat_g7_lose_hangeki_lever', 'uat_g7_lose_hangeki_stop3',
      'uat_g8_win_keizoku', 'uat_g8_lever_down', 'uat_g8_stop3_fukkatsu_cutin',
    ];
    expect(atJobIds).toHaveLength(25);
    expect(uatJobIds).toHaveLength(25);
    for (const jobId of atJobIds) {
      const key = `battle_at_${jobId}`;
      expect(BATTLE_IMAGES[key], key).toBeTruthy();
      expect(battleImageUrl(key), key).toBe(BATTLE_IMAGES[key]);
    }
    for (const jobId of uatJobIds) {
      const key = `battle_${jobId}`;
      expect(BATTLE_IMAGES[key], key).toBeTruthy();
      expect(battleImageUrl(key), key).toBe(BATTLE_IMAGES[key]);
    }
    expect(Object.keys(BATTLE_IMAGES)).toHaveLength(50);
  });

  it('存在しないキーはエラー(入稿漏れ検知)', () => {
    expect(() => battleImageUrl('battle_at_g9_nazo')).toThrow();
    expect(() => battleImageUrl('battle_uat_g9_nazo')).toThrow();
  });
});

describe('ENDING_IMAGES(エンディング・リザルト静止画素材の存在検証。2026-07-18 の実素材 4 枚)', () => {
  it('全 4 キーが揃っている(gen_battle_images.mjs の ENDING_JOBS と同一の jobId)', () => {
    const keys = [
      'ending_at_1_freeze',
      'ending_at_2_goshirakawa',
      'ending_uat_clear',
      'ending_result_all',
    ];
    for (const key of keys) {
      expect(ENDING_IMAGES[key], key).toBeTruthy();
      expect(endingImageUrl(key), key).toBe(ENDING_IMAGES[key]);
    }
    expect(Object.keys(ENDING_IMAGES)).toHaveLength(4);
  });

  it('存在しないキーはエラー(入稿漏れ検知)', () => {
    expect(() => endingImageUrl('ending_nazo')).toThrow();
  });
});

describe('revivalCutin(復活告知 = 敗北寄りルート 8G 目の第 3 リール停止)', () => {
  it('下位 AT は静のカットイン静止画(pptx 8G「静のカットイン発生で復活」)', () => {
    const cutin = revivalCutin({ id: 'R3', label: '静の祈り→復活' }, 'NORMAL');
    expect(cutin).toMatchObject({
      title: '復活!',
      sub: '静の祈り→復活',
      style: 'SPECIAL',
      sound: 'BIG_WIN',
      imageUrl: BATTLE_IMAGES['battle_at_g8_stop3_shizuka_cutin'],
    });
    expect(cutin.durationMs).toBeGreaterThan(0);
    expect(cutin.videoUrl).toBeUndefined();
  });

  it('上位 AT は「二人が共に立ち上がる」カットイン静止画(Q39 = 2026-07-18 承認)', () => {
    const cutin = revivalCutin({ id: 'R2', label: '義経の一太刀' }, 'UPPER');
    expect(cutin).toMatchObject({
      title: '復活!',
      style: 'SPECIAL',
      sound: 'BIG_WIN',
      imageUrl: BATTLE_IMAGES['battle_uat_g8_stop3_fukkatsu_cutin'],
    });
    expect(cutin.videoUrl).toBeUndefined();
  });
});

describe('atResultView(AT 終了画面 = 2026-07-18 指示。バトル回数 + 獲得枚数)', () => {
  const AT_END_EVENT: GameEvent = {
    type: 'AT_END',
    reason: 'DEFEAT',
    mode: 'NORMAL',
    background: 'YOSHITSUNE',
  };

  it('AT_END がないゲームでは解決しない', () => {
    expect(atResultView({ type: 'NORMAL' }, [], 100)).toBeUndefined();
    expect(
      atResultView(state(AT_PHASE).phase, [{ type: 'AT_SET_CONTINUE', tier: 'NORMAL', renchan: 2 }], 100),
    ).toBeUndefined();
  });

  it('下位 AT のバトル敗北: バトル回数 = renchan / 獲得枚数 = atGained', () => {
    const view = atResultView(
      { ...AT_PHASE, part: 'BATTLE', partGame: 7, renchan: 3 },
      [AT_END_EVENT],
      412,
    );
    expect(view).toMatchObject({
      imageUrl: ENDING_IMAGES['ending_result_all'],
      battles: 3,
      gained: 412,
      reason: 'DEFEAT',
    });
  });

  it('上位 AT のバトル敗北: バトル回数 = 下位 10 + renchan', () => {
    const view = atResultView(
      { ...AT_PHASE, tier: 'UPPER', part: 'BATTLE', partGame: 7, renchan: 4 },
      [AT_END_EVENT],
      1800,
    );
    expect(view).toMatchObject({ battles: 14, gained: 1800, reason: 'DEFEAT' });
  });

  it('上位エンディング到達(完全制覇): バトル回数 = 20(下位 10 + 上位 10)', () => {
    const view = atResultView(
      { type: 'ENDING', game: 9, after: 'AT_END', vStock: 0 },
      [{ type: 'AT_END', reason: 'ENDING', mode: 'HEAVEN', background: 'SHIZUKA' }],
      3456,
    );
    expect(view).toMatchObject({
      imageUrl: ENDING_IMAGES['ending_result_all'],
      battles: 20,
      gained: 3456,
      reason: 'ENDING',
    });
  });

  it('AT・エンディング以外のフェーズからの AT_END はエラー(発行元の不整合検知)', () => {
    expect(() => atResultView({ type: 'NORMAL' }, [AT_END_EVENT], 0)).toThrow();
  });
});

describe('cutinsForEvents(イベント由来のワンショット表示)', () => {
  it('内部情報のイベント(モード移行・前兆突入・書き換え・演出開始・背景移行)は演出なし', () => {
    const hidden: GameEvent[] = [
      { type: 'MODE_CHANGE', from: 'NORMAL', to: 'HEAVEN', trigger: 'WATERMELON_WEAK' },
      { type: 'HONZENCHO_ENTER', trigger: 'CHERRY_CENTER' },
      { type: 'FAKE_OMEN_ENTER', trigger: 'CHERRY_CORNER', totalGames: 8, renzoku: 'A' },
      { type: 'OMEN_REWRITE', trigger: 'CHANCE_ME' },
      { type: 'RENZOKU_START', kind: 'REAL', renzoku: 'C' },
      { type: 'BACKGROUND_CHANGE', trigger: 'ELAPSED', from: 'YOSHITSUNE', to: 'SHIZUKA' },
    ];
    expect(cutinsForEvents(hidden)).toEqual([]);
  });

  it('連続演出の成否告知(成功 = WIN + 専用ムービー + 成功音 / 失敗 = LOSE + 専用ムービー + 失敗音)', () => {
    const success = cutinsForEvents([
      { type: 'RENZOKU_RESULT', kind: 'REAL', renzoku: 'C', success: true },
    ]);
    expect(success).toHaveLength(1);
    expect(success[0]).toMatchObject({
      title: '勝利!',
      style: 'WIN',
      sound: 'RENZOKU_SUCCESS',
      videoUrl: RENZOKU_VIDEOS['renzoku_result_win'],
    });

    const fail = cutinsForEvents([
      { type: 'RENZOKU_RESULT', kind: 'FAKE', renzoku: 'A', success: false },
    ]);
    expect(fail).toHaveLength(1);
    expect(fail[0]).toMatchObject({
      title: '敗北…',
      style: 'LOSE',
      sound: 'RENZOKU_FAIL',
      videoUrl: RENZOKU_VIDEOS['renzoku_result_lose'],
    });
  });

  it('AT 系イベントのカットイン(突入・継続・V ストック・上位・エンディング・終了)', () => {
    const table: [GameEvent, { title: string; style: string; sound?: SoundCueId }][] = [
      [{ type: 'SEVEN_ALIGNED' }, { title: '赤7揃い!', style: 'WIN', sound: 'BIG_WIN' }],
      [{ type: 'AT_START', continueRate: 0.79 }, { title: 'AT突入!', style: 'WIN', sound: 'BIG_WIN' }],
      [
        { type: 'AT_SET_CONTINUE', tier: 'NORMAL', renchan: 3 },
        { title: '3連目 継続!', style: 'WIN', sound: 'AT_CONTINUE' },
      ],
      [
        { type: 'V_STOCK_GAIN', trigger: 'WATERMELON_STRONG', vStock: 2 },
        { title: 'Vストック獲得!', style: 'INFO', sound: 'AT_CONTINUE' },
      ],
      [{ type: 'V_STOCK_USE', vStock: 1 }, { title: 'Vストック発動', style: 'INFO' }],
      [{ type: 'UPPER_AT_ENTER' }, { title: '上位AT突入!', style: 'SPECIAL', sound: 'BIG_WIN' }],
      [
        { type: 'ENDING_START', after: 'UPPER_AT' },
        { title: 'エンディング!', style: 'SPECIAL', sound: 'BIG_WIN' },
      ],
      [
        {
          type: 'AT_END',
          reason: 'DEFEAT',
          mode: 'NORMAL',
          background: 'YUGATA',
        },
        { title: 'バトル敗北…', style: 'LOSE', sound: 'RENZOKU_FAIL' },
      ],
      [
        { type: 'AT_END', reason: 'ENDING', mode: 'HEAVEN', background: 'SHIZUKA' },
        { title: '完走!', style: 'WIN' },
      ],
    ];
    for (const [event, expected] of table) {
      const cutins = cutinsForEvents([event]);
      expect(cutins, event.type).toHaveLength(1);
      expect(cutins[0], event.type).toMatchObject(expected);
      expect(cutins[0].durationMs, event.type).toBeGreaterThan(0);
    }
  });

  it('AT_START の継続率がサブテキストに入る', () => {
    const [cutin] = cutinsForEvents([{ type: 'AT_START', continueRate: 0.88 }]);
    expect(cutin.sub).toBe('継続率 88%');
  });

  it('複数イベントは発行順のままカットイン列になる(成功告知 → AT 突入)', () => {
    const cutins = cutinsForEvents([
      { type: 'RENZOKU_RESULT', kind: 'REAL', renzoku: 'B', success: true },
      { type: 'AT_START', continueRate: 0.66 },
    ]);
    expect(cutins.map((c) => c.title)).toEqual(['勝利!', 'AT突入!']);
  });

  it('SEVEN_ALIGNED(赤7 揃い = 確定 37)のサブテキストは次ゲーム AT 導入の案内', () => {
    const [cutin] = cutinsForEvents([{ type: 'SEVEN_ALIGNED' }]);
    expect(cutin.sub).toBe('次ゲームからATへ');
  });
});

describe('resultSoundCue(1G の締めの基本 SE)', () => {
  it('入賞音(表示役 = 確定 40)は対応する役が実際に揃ったときだけ選ばれる', () => {
    expect(resultSoundCue('REPLAY', 'REPLAY', 0)).toBe('WIN_REPLAY');
    expect(resultSoundCue('WATERMELON_WEAK', 'WATERMELON_WEAK', 3)).toBe('WIN_WATERMELON');
    expect(resultSoundCue('WATERMELON_STRONG', 'WATERMELON_STRONG', 3)).toBe('WIN_WATERMELON');
    expect(resultSoundCue('CHERRY_CORNER', 'CHERRY_CORNER', 2)).toBe('WIN_CHERRY_WEAK');
    expect(resultSoundCue('CHERRY_CENTER', 'CHERRY_CENTER', 2)).toBe('WIN_CHERRY_CENTER');
  });

  it('取りこぼし(表示役ハズレ)は入賞音ではなくレア役成立音', () => {
    expect(resultSoundCue('CHERRY_CORNER', 'NONE', 0)).toBe('RARE');
    expect(resultSoundCue('WATERMELON_STRONG', 'NONE', 0)).toBe('RARE');
    expect(resultSoundCue('REACH_ME', 'NONE', 0)).toBe('RARE');
  });

  it('専用入賞音のない役は従来の レア役 > 払出 > なし の優先', () => {
    expect(resultSoundCue('REACH_ME', 'REACH_ME', 3)).toBe('RARE');
    expect(resultSoundCue('CHANCE_ME', 'CHANCE_ME', 3)).toBe('RARE');
    expect(resultSoundCue('BELL', 'BELL', 13)).toBe('PAYOUT');
    expect(resultSoundCue('BELL', 'NONE', 0)).toBeUndefined(); // ベルこぼし(確定 35)
    expect(resultSoundCue('NONE', 'NONE', 0)).toBeUndefined();
  });
});

describe('SOUND_CUES(サウンドキュー表 = SE 差し替えレイヤー)', () => {
  it('全キューに音声ファイル URL が割り当てられている', () => {
    for (const [cue, url] of Object.entries(SOUND_CUES)) {
      expect(url, cue).toBeTruthy();
      expect(typeof url, cue).toBe('string');
    }
  });

  it('カットインが参照するサウンドキューはすべて表に存在する', () => {
    const events: GameEvent[] = [
      { type: 'RENZOKU_RESULT', kind: 'REAL', renzoku: 'A', success: true },
      { type: 'RENZOKU_RESULT', kind: 'FAKE', renzoku: 'A', success: false },
      { type: 'AT_START', continueRate: 0.66 },
      { type: 'AT_SET_CONTINUE', tier: 'NORMAL', renchan: 2 },
      { type: 'V_STOCK_GAIN', trigger: 'CHANCE_ME', vStock: 1 },
      { type: 'V_STOCK_USE', vStock: 0 },
      { type: 'UPPER_AT_ENTER' },
      { type: 'ENDING_START', after: 'AT_END' },
      { type: 'AT_END', reason: 'DEFEAT', mode: 'NORMAL', background: 'YOSHITSUNE' },
    ];
    for (const cutin of cutinsForEvents(events)) {
      if (cutin.sound !== undefined) {
        expect(SOUND_CUES[cutin.sound], cutin.title).toBeTruthy();
      }
    }
  });
});
