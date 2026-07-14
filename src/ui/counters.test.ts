import { describe, expect, it } from 'vitest';
import { calcPayout } from '../core/payout';
import type { GameEvent } from '../core/state';
import {
  INITIAL_CREDIT,
  REFILL_COINS,
  initMeter,
  meterOnFinish,
  meterOnLever,
  type MeterState,
} from './counters';

const AT_START_EVENT: GameEvent = { type: 'AT_START', continueRate: 0.79 };

describe('メーター管理(クレジット・払出・AT 獲得枚数。STEP 3c)', () => {
  it('初期状態: クレジット 50・払出 0・獲得 0', () => {
    expect(initMeter()).toEqual({
      credit: INITIAL_CREDIT,
      payout: 0,
      autoBet: false,
      atGained: 0,
    });
  });

  it('レバーオン: 3 枚掛け固定で BET を徴収し、払出表示を 0 へ戻す', () => {
    const meter: MeterState = { credit: 50, payout: 13, autoBet: false, atGained: 0 };
    expect(meterOnLever(meter, false)).toEqual({
      credit: 47,
      payout: 0,
      autoBet: false,
      atGained: 0,
    });
  });

  it('リプレイの次ゲームは自動 BET(クレジットを減らさない)', () => {
    const meter: MeterState = { credit: 47, payout: 0, autoBet: false, atGained: 0 };
    expect(meterOnLever(meter, true)).toEqual({
      credit: 47,
      payout: 0,
      autoBet: true,
      atGained: 0,
    });
  });

  it('クレジット不足(< 3 枚)はレバーオン時に 50 枚単位で自動補充してから徴収する', () => {
    const meter: MeterState = { credit: 2, payout: 0, autoBet: false, atGained: 0 };
    expect(meterOnLever(meter, false).credit).toBe(2 + REFILL_COINS - 3);
    // 0 枚でも補充 1 回で足りる
    expect(meterOnLever({ ...meter, credit: 0 }, false).credit).toBe(REFILL_COINS - 3);
    // リプレイなら不足でも補充しない(BET 不要のため)
    expect(meterOnLever(meter, true).credit).toBe(2);
  });

  it('全停止: 払出をクレジットへ加算し、払出枚数を表示する', () => {
    const meter: MeterState = { credit: 47, payout: 0, autoBet: false, atGained: 0 };
    const result = { events: [], payout: calcPayout('BELL', true) };
    expect(meterOnFinish(meter, false, result)).toEqual({
      credit: 60,
      payout: 13,
      autoBet: false,
      atGained: 0,
    });
  });

  it('AT_START イベントで獲得枚数を 0 へリセットする(突入ゲームの純増は加算しない)', () => {
    const meter: MeterState = { credit: 100, payout: 0, autoBet: false, atGained: 42 };
    const result = { events: [AT_START_EVENT], payout: calcPayout('NONE', true) };
    expect(meterOnFinish(meter, false, result).atGained).toBe(0);
  });

  it('AT 中(ゲーム開始時点のフェーズが AT / ENDING)のゲームは純増を獲得枚数へ加算する', () => {
    const meter: MeterState = { credit: 100, payout: 0, autoBet: false, atGained: 10 };
    // ベル揃い 13 枚 − BET 3 枚 = +10
    const bell = meterOnFinish(meter, true, { events: [], payout: calcPayout('BELL', true) });
    expect(bell.atGained).toBe(20);
    // ハズレ = −3
    const none = meterOnFinish(meter, true, { events: [], payout: calcPayout('NONE', true) });
    expect(none.atGained).toBe(7);
    // リプレイ(自動 BET)= ±0
    const replay = meterOnFinish(meter, true, {
      events: [],
      payout: calcPayout('REPLAY', false),
    });
    expect(replay.atGained).toBe(10);
  });

  it('通常時のゲームは獲得枚数を変えない(AT 終了後は最終値のまま凍結)', () => {
    const meter: MeterState = { credit: 100, payout: 0, autoBet: false, atGained: 123 };
    const result = { events: [], payout: calcPayout('BELL', true) };
    expect(meterOnFinish(meter, false, result).atGained).toBe(123);
  });

  it('通しの整合: レバーオン → 全停止 を繰り返してもクレジット収支 = 純増合計と一致する', () => {
    let meter = initMeter();
    let replayCarry = false;
    let expectedNet = 0;
    const games = [
      calcPayout('NONE', true),
      calcPayout('REPLAY', true),
      calcPayout('BELL', false), // リプレイ持越しで BET 不要
      calcPayout('WATERMELON_STRONG', true),
    ];
    for (const payout of games) {
      meter = meterOnLever(meter, replayCarry);
      meter = meterOnFinish(meter, false, { events: [], payout });
      expectedNet += payout.net;
      replayCarry = payout.isReplay;
    }
    expect(meter.credit).toBe(INITIAL_CREDIT + expectedNet);
  });
});
