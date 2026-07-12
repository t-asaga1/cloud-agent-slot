import { describe, expect, it } from 'vitest';
import { RENZOKU_GAMES } from '../core/omen';
import { ENDING_GAMES, type GameEvent, type GameState } from '../core/state';
import {
  cutinsForEvents,
  overlayForState,
  RENZOKU_PRESENTATION,
  resultSoundCue,
  TELOP_TEXTS,
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

describe('overlayForState(フェーズ由来の常時表示)', () => {
  it('通常時・AT 中は演出なし', () => {
    expect(overlayForState(state({ type: 'NORMAL' }))).toBeUndefined();
    expect(
      overlayForState(
        state({
          type: 'AT',
          tier: 'NORMAL',
          part: 'KOYAKU',
          partGame: 3,
          renchan: 1,
          continueRate: 0.66,
          vStock: 0,
          continueConfirmed: false,
        }),
      ),
    ).toBeUndefined();
  });

  it('前兆中(偽・本共通)はテロップ。文言は経過 G でローテーションし種別を悟らせない', () => {
    for (const kind of ['FAKE', 'REAL'] as const) {
      for (let game = 0; game <= 9; game++) {
        const overlay = overlayForState(
          state({ type: 'OMEN', kind, game, totalGames: 9, renzoku: 'A' }),
        );
        expect(overlay).toEqual({ kind: 'TELOP', text: TELOP_TEXTS[game % TELOP_TEXTS.length] });
      }
    }
  });

  it('連続演出中は種別・経過 G 付きの全画面表示', () => {
    for (const renzoku of ['A', 'B', 'C'] as const) {
      const overlay = overlayForState(
        state({ type: 'RENZOKU', kind: 'REAL', renzoku, game: 2 }),
      );
      expect(overlay).toEqual({
        kind: 'RENZOKU',
        renzoku,
        game: 2,
        totalGames: RENZOKU_GAMES,
        title: RENZOKU_PRESENTATION[renzoku].title,
        text: RENZOKU_PRESENTATION[renzoku].text,
      });
    }
  });

  it('エンディング中は n/10G バナー(行き先付き)', () => {
    const overlay = overlayForState(state({ type: 'ENDING', game: 4, after: 'UPPER_AT', vStock: 2 }));
    expect(overlay).toEqual({ kind: 'ENDING', game: 4, totalGames: ENDING_GAMES, after: 'UPPER_AT' });
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

  it('連続演出の成否告知(成功 = WIN + 成功音 / 失敗 = LOSE + 失敗音)', () => {
    const success = cutinsForEvents([
      { type: 'RENZOKU_RESULT', kind: 'REAL', renzoku: 'C', success: true },
    ]);
    expect(success).toHaveLength(1);
    expect(success[0]).toMatchObject({ title: '勝利!', style: 'WIN', sound: 'RENZOKU_SUCCESS' });

    const fail = cutinsForEvents([
      { type: 'RENZOKU_RESULT', kind: 'FAKE', renzoku: 'A', success: false },
    ]);
    expect(fail).toHaveLength(1);
    expect(fail[0]).toMatchObject({ title: '敗北…', style: 'LOSE', sound: 'RENZOKU_FAIL' });
    expect(fail[0].videoUrl).toBeUndefined();
  });

  it('AT 系イベントのカットイン(突入・継続・V ストック・上位・エンディング・終了)', () => {
    const table: [GameEvent, { title: string; style: string; sound?: SoundCueId }][] = [
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
});

describe('resultSoundCue(1G の締めの基本 SE)', () => {
  it('レア役成立(リーチ目含む)> 払出あり > なし の優先で 1 つ選ぶ', () => {
    expect(resultSoundCue('CHERRY_CORNER', 2)).toBe('RARE');
    expect(resultSoundCue('REACH_ME', 0)).toBe('RARE');
    expect(resultSoundCue('BELL', 13)).toBe('PAYOUT');
    expect(resultSoundCue('REPLAY', 0)).toBeUndefined();
    expect(resultSoundCue('NONE', 0)).toBeUndefined();
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
