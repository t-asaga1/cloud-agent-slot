import { describe, expect, it } from 'vitest';
import { BGM_FILES } from '../assets';
import type { Rng } from '../core/rng';
import type { AdvanceResult, AtPhase, GameEvent, GameState, Phase } from '../core/state';
import {
  bgmTrackForState,
  bgmUrlForState,
  drawKakuteiBgm,
  KAKUTEI_BGM_DENOM,
  updateKakuteiBgm,
} from './bgm';

function state(phase: Phase, overrides: Partial<GameState> = {}): GameState {
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

function atPhase(overrides: Partial<AtPhase> = {}): AtPhase {
  return {
    type: 'AT',
    tier: 'NORMAL',
    part: 'KOYAKU',
    partGame: 1,
    renchan: 1,
    continueRate: 0.66,
    vStock: 0,
    continueConfirmed: false,
    ...overrides,
  };
}

/** updateKakuteiBgm の入力(state + events だけ使う) */
function result(phase: Phase, events: GameEvent[] = []): AdvanceResult {
  return {
    state: state(phase),
    events,
    wonRole: 'NONE',
    displayedRole: 'NONE',
    payout: { payout: 0, isReplay: false, net: -3 },
  };
}

/** 指定値列を順に返す固定 rng(使い切ったら throw = 消費数の検証) */
function seqRng(values: number[]): Rng {
  let i = 0;
  const take = (): number => {
    if (i >= values.length) throw new Error('rng exhausted');
    return values[i++];
  };
  return {
    next: () => take() / KAKUTEI_BGM_DENOM,
    nextInt: (max: number) => take() % max,
  };
}

/** 乱数を 1 個も消費してはいけない rng */
const noDrawRng: Rng = {
  next: () => {
    throw new Error('rng must not be consumed');
  },
  nextInt: () => {
    throw new Error('rng must not be consumed');
  },
};

const OMEN_PHASE: Phase = {
  type: 'OMEN',
  kind: 'REAL',
  game: 2,
  totalGames: 7,
  renzoku: 'A',
  scenario: { steps: [], renzokuSteps: ['NORMAL', 'NORMAL', 'NORMAL'] },
};

describe('bgmTrackForState(状態 → BGM トラック = 確定 38)', () => {
  it('通常時の義経・静・弁慶・夕方背景は BGM なし', () => {
    for (const background of ['YOSHITSUNE', 'SHIZUKA', 'BENKEI', 'YUGATA'] as const) {
      expect(bgmTrackForState(state({ type: 'NORMAL' }, { background }), false)).toBeUndefined();
    }
  });

  it('前兆背景滞在中は ZENCHO(通常・前兆・連続演出フェーズとも)', () => {
    expect(bgmTrackForState(state({ type: 'NORMAL' }, { background: 'ZENCHO' }), false)).toBe(
      'ZENCHO',
    );
    expect(bgmTrackForState(state(OMEN_PHASE, { background: 'ZENCHO' }), false)).toBe('ZENCHO');
    expect(
      bgmTrackForState(
        state(
          { type: 'RENZOKU', kind: 'FAKE', renzoku: 'B', game: 2, chanceUps: ['NORMAL', 'NORMAL', 'NORMAL'] },
          { background: 'ZENCHO' },
        ),
        false,
      ),
    ).toBe('ZENCHO');
  });

  it('前兆・連続演出フェーズでも通常背景滞在なら BGM なし', () => {
    expect(bgmTrackForState(state(OMEN_PHASE, { background: 'SHIZUKA' }), false)).toBeUndefined();
  });

  it('赤7待機・AT 導入は無音(実装解釈)', () => {
    expect(bgmTrackForState(state({ type: 'SEVEN_WAIT', game: 1 }), false)).toBeUndefined();
    expect(bgmTrackForState(state({ type: 'AT_INTRO' }), false)).toBeUndefined();
  });

  it('下位 AT 中は小役・バトル一気通貫で AT_BASE(頼朝フラグで AT_KAKUTEI)', () => {
    for (const part of ['KOYAKU', 'BATTLE'] as const) {
      expect(bgmTrackForState(state(atPhase({ part })), false)).toBe('AT_BASE');
      expect(bgmTrackForState(state(atPhase({ part })), true)).toBe('AT_KAKUTEI');
    }
  });

  it('上位 AT 中は一気通貫で AT_UPPER(頼朝フラグは無視)', () => {
    for (const part of ['KOYAKU', 'BATTLE'] as const) {
      expect(bgmTrackForState(state(atPhase({ tier: 'UPPER', part })), false)).toBe('AT_UPPER');
      expect(bgmTrackForState(state(atPhase({ tier: 'UPPER', part })), true)).toBe('AT_UPPER');
    }
  });

  it('エンディングは直前の AT 階層の基本 BGM を継続(実装解釈)', () => {
    expect(
      bgmTrackForState(state({ type: 'ENDING', game: 1, after: 'UPPER_AT', vStock: 0 }), false),
    ).toBe('AT_BASE');
    expect(
      bgmTrackForState(state({ type: 'ENDING', game: 1, after: 'AT_END', vStock: 0 }), false),
    ).toBe('AT_UPPER');
  });

  it('bgmUrlForState はトラックのファイル URL(なし = undefined)を返す', () => {
    expect(bgmUrlForState(state(atPhase()), false)).toBe(BGM_FILES.AT_BASE);
    expect(bgmUrlForState(state({ type: 'NORMAL' }), false)).toBeUndefined();
  });
});

describe('updateKakuteiBgm(頼朝テーマ曲の 1/5 抽せん = 確定 38)', () => {
  it('drawKakuteiBgm は 1/5(nextInt(5) === 0)', () => {
    expect(drawKakuteiBgm(seqRng([0]))).toBe(true);
    expect(drawKakuteiBgm(seqRng([1]))).toBe(false);
    expect(drawKakuteiBgm(seqRng([4]))).toBe(false);
  });

  it('セット開始(AT_SET_CONTINUE)時に V ストックがあれば 1/5 で抽せんする', () => {
    const setStart = (vStock: number): AdvanceResult =>
      result(atPhase({ partGame: 0, renchan: 2, vStock }), [
        { type: 'AT_SET_CONTINUE', tier: 'NORMAL', renchan: 2 },
      ]);
    expect(updateKakuteiBgm(false, setStart(1), seqRng([0]))).toBe(true);
    expect(updateKakuteiBgm(false, setStart(1), seqRng([3]))).toBe(false);
    // V ストックなし = 抽せん自体を行わない(乱数消費 0)
    expect(updateKakuteiBgm(false, setStart(0), noDrawRng)).toBe(false);
  });

  it('セット開始でフラグはリセットされる(前セットの頼朝テーマは持ち越さない)', () => {
    // 前セットで当せん済み(flag = true)でも、新セットの V ストック有無 + 1/5 で引き直す
    const setStart = (vStock: number): AdvanceResult =>
      result(atPhase({ partGame: 0, renchan: 3, vStock }), [
        { type: 'AT_SET_CONTINUE', tier: 'NORMAL', renchan: 3 },
      ]);
    expect(updateKakuteiBgm(true, setStart(0), noDrawRng)).toBe(false);
    expect(updateKakuteiBgm(true, setStart(2), seqRng([1]))).toBe(false);
    expect(updateKakuteiBgm(true, setStart(2), seqRng([0]))).toBe(true);
  });

  it('AT_START(AT 突入)時は V ストック 0 のため抽せんなしで false', () => {
    const start = result(atPhase({ partGame: 0 }), [{ type: 'AT_START', continueRate: 0.66 }]);
    expect(updateKakuteiBgm(false, start, noDrawRng)).toBe(false);
  });

  it('バトル 1G 目に継続確定していたら未当せんの場合のみ 1/5 で抽せんする', () => {
    const battle1 = result(
      atPhase({ part: 'BATTLE', partGame: 1, continueConfirmed: true }),
      [{ type: 'V_STOCK_USE', vStock: 0 }],
    );
    expect(updateKakuteiBgm(false, battle1, seqRng([0]))).toBe(true);
    expect(updateKakuteiBgm(false, battle1, seqRng([2]))).toBe(false);
    // セット開始時に当せん済みなら再抽せんしない(乱数消費 0・true 維持)
    expect(updateKakuteiBgm(true, battle1, noDrawRng)).toBe(true);
  });

  it('バトル 1G 目でも継続未確定なら抽せんしない(2G 目以降の確定でも抽せんしない)', () => {
    const battle1 = result(atPhase({ part: 'BATTLE', partGame: 1, continueConfirmed: false }));
    expect(updateKakuteiBgm(false, battle1, noDrawRng)).toBe(false);
    // バトル 2G 目以降に小役で継続確定 → バトル「開始時」ではないため抽せんなし
    const battle3 = result(atPhase({ part: 'BATTLE', partGame: 3, continueConfirmed: true }));
    expect(updateKakuteiBgm(false, battle3, noDrawRng)).toBe(false);
  });

  it('AT 中の通常ゲームはフラグを維持する(そのセットの間 掛かり続ける)', () => {
    const koyaku5 = result(atPhase({ partGame: 5 }));
    expect(updateKakuteiBgm(true, koyaku5, noDrawRng)).toBe(true);
    expect(updateKakuteiBgm(false, koyaku5, noDrawRng)).toBe(false);
  });

  it('上位 AT・エンディング・通常時では常に false(頼朝テーマは下位 AT のみ)', () => {
    expect(
      updateKakuteiBgm(
        true,
        result(atPhase({ tier: 'UPPER', partGame: 0 }), [{ type: 'UPPER_AT_ENTER' }]),
        noDrawRng,
      ),
    ).toBe(false);
    expect(
      updateKakuteiBgm(
        true,
        result({ type: 'ENDING', game: 0, after: 'UPPER_AT', vStock: 1 }, [
          { type: 'ENDING_START', after: 'UPPER_AT' },
        ]),
        noDrawRng,
      ),
    ).toBe(false);
    expect(updateKakuteiBgm(true, result({ type: 'NORMAL' }), noDrawRng)).toBe(false);
  });

  it('上位 AT のセット継続(AT_SET_CONTINUE tier UPPER)では抽せんしない', () => {
    expect(
      updateKakuteiBgm(
        false,
        result(atPhase({ tier: 'UPPER', partGame: 0, renchan: 2, vStock: 3 }), [
          { type: 'AT_SET_CONTINUE', tier: 'UPPER', renchan: 2 },
        ]),
        noDrawRng,
      ),
    ).toBe(false);
  });
});
