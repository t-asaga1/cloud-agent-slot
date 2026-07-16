import { describe, expect, it } from 'vitest';
import { AT_VIDEOS, RENZOKU_VIDEOS, SYMBOL_IMAGES, YOKOKU_VIDEOS } from '../assets';
import type { Background } from '../core/background';
import { RENZOKU_GAMES } from '../core/omen';
import type { BattleRoute, OmenScenario, RenzokuChanceUps, ScenarioStep } from '../core/scenario';
import { ENDING_GAMES, type GameEvent, type GameState } from '../core/state';
import {
  atIntroAtLeverOn,
  atVideoUrl,
  atYokokuAllowed,
  atYokokuView,
  battleGameAtLeverOn,
  battleView,
  cutinsForEvents,
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
  yokokuVideoUrl,
} from './direction';
import { SOUND_CUES, type SoundCueId } from './sound';

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

  it('エンディング中は n/10G バナー + 全画面ムービー(after で描き分け = Q20)', () => {
    const toUpper = overlayForState(
      state({ type: 'ENDING', game: 4, after: 'UPPER_AT', vStock: 2 }),
    );
    expect(toUpper).toEqual({
      kind: 'ENDING',
      game: 4,
      totalGames: ENDING_GAMES,
      after: 'UPPER_AT',
      videoUrl: AT_VIDEOS['ending_to_upper'],
    });
    const complete = overlayForState(
      state({ type: 'ENDING', game: 9, after: 'AT_END', vStock: 0 }),
    );
    expect(complete).toMatchObject({
      after: 'AT_END',
      videoUrl: AT_VIDEOS['ending_complete'],
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
    for (const slot of ['KOYU_2', 'KOYU_3', 'KYOTSU_1', 'KYOTSU_2'] as const) {
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

  it('G1〜3 は通常/チャンスのペア No(チャンスアップはルートへ焼き込み = Q18)', () => {
    const w4 = route('W4', 'WIN', [1, 3]);
    expect(battleView('NORMAL', w4, 1)).toMatchObject({
      videoUrl: AT_VIDEOS['battle_at_02'],
      chanceUp: true,
      stage: '導入',
    });
    expect(battleView('NORMAL', w4, 2)).toMatchObject({
      videoUrl: AT_VIDEOS['battle_at_03'],
      chanceUp: false,
      stage: '義経台詞',
    });
    expect(battleView('NORMAL', w4, 3)).toMatchObject({
      videoUrl: AT_VIDEOS['battle_at_06'],
      chanceUp: true,
      stage: '頼朝台詞',
    });
  });

  it('G4〜8 はルート分岐の No(AT: 義経強 = 桜花繚乱 / 敗北寄り = 復活判定)', () => {
    const w3 = route('W3', 'WIN', []);
    expect([4, 5, 6, 7, 8].map((g) => battleView('NORMAL', w3, g).videoUrl)).toEqual([
      AT_VIDEOS['battle_at_07'], // 攻撃決め 義経攻撃へ
      AT_VIDEOS['battle_at_10'], // 義経強攻撃
      AT_VIDEOS['battle_at_14'], // 桜花繚乱チャンス
      AT_VIDEOS['battle_at_16'], // 頼朝の台詞
      AT_VIDEOS['battle_at_19'], // 継続 次セットへ
    ]);
    const u4 = route('U4', 'LOSE', []);
    expect([4, 5, 6, 7, 8].map((g) => battleView('NORMAL', u4, g).videoUrl)).toEqual([
      AT_VIDEOS['battle_at_08'], // 攻撃決め 頼朝攻撃へ
      AT_VIDEOS['battle_at_12'], // 頼朝強攻撃
      AT_VIDEOS['battle_at_15'], // 義経喰らうか
      AT_VIDEOS['battle_at_18'], // 耐えれない
      AT_VIDEOS['battle_at_20'], // 復活判定
    ]);
  });

  it('上位 AT は歯抜け No(G6 ヒット判定 = 14 / G8 = 20 or 21)へ解決する', () => {
    const w5 = route('W5', 'WIN', []);
    expect([4, 5, 6, 7, 8].map((g) => battleView('UPPER', w5, g).videoUrl)).toEqual([
      AT_VIDEOS['battle_uat_09'], // ダブル攻撃へ
      AT_VIDEOS['battle_uat_12'], // ダブル攻撃
      AT_VIDEOS['battle_uat_14'], // 敵を倒せるか
      AT_VIDEOS['battle_uat_17'], // 倒せる 二人の台詞
      AT_VIDEOS['battle_uat_20'], // 継続
    ]);
    const u1 = route('U1', 'LOSE', []);
    expect(battleView('UPPER', u1, 8).videoUrl).toBe(AT_VIDEOS['battle_uat_21']); // 復活判定
    expect(battleView('UPPER', u1, 8).title).toContain('共闘');
  });

  it('未知のルート ID はエラー(ルート表とのズレ検知)', () => {
    expect(() => battleView('NORMAL', route('W9', 'WIN', []), 4)).toThrow();
    // G1〜3 はルート ID 非依存のためエラーにならない
    expect(() => battleView('NORMAL', route('W9', 'WIN', []), 1)).not.toThrow();
  });
});

describe('revivalCutin(復活告知 = 敗北寄りルート 8G 目の第 3 リール停止)', () => {
  it('復活パターンのラベル付き SPECIAL カットインになる', () => {
    const cutin = revivalCutin({ id: 'R3', label: '静の祈り→復活' });
    expect(cutin).toMatchObject({
      title: '復活!',
      sub: '静の祈り→復活',
      style: 'SPECIAL',
      sound: 'BIG_WIN',
    });
    expect(cutin.durationMs).toBeGreaterThan(0);
    expect(cutin.videoUrl).toBeTruthy();
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
