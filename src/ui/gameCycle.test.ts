import { describe, expect, it } from 'vitest';
import {
  KOMA_COUNT,
  LINE_IDS,
  MAX_SLIP,
  PUSH_ORDERS,
  REEL_INDEXES,
  lineSymbols,
  resolveSpin,
  windowAt,
  type PushOrder,
  type ReelSymbol,
  type StopPositions,
} from '../core/reel';
import { ROLES, type Role } from '../core/roles';
import {
  SPIN_MS_PER_KOMA,
  SPIN_MS_PER_REV,
  finishSpin,
  isAllStopped,
  pressStop,
  provisionalPushOrder,
  spinningPosition,
  startSpin,
  type SpinCycle,
} from './gameCycle';

/** 対話式で 1 ゲームを最後まで回す(order = 停止ボタンを押した順) */
function interactiveSpin(
  wonRole: Role,
  pushes: readonly [number, number, number],
  order: PushOrder,
): SpinCycle {
  let cycle = startSpin(wonRole);
  for (const reel of order) {
    cycle = pressStop(cycle, reel, pushes[reel]);
  }
  return cycle;
}

function alignedSymbols(positions: StopPositions): ReelSymbol[] {
  const out: ReelSymbol[] = [];
  for (const line of LINE_IDS) {
    const [a, b, c] = lineSymbols(positions, line);
    if (a === b && b === c) out.push(a);
  }
  return out;
}

const LINE_SYMBOL: Partial<Record<Role, ReelSymbol>> = {
  REPLAY: 'REPLAY',
  BELL: 'BELL',
  WATERMELON_WEAK: 'WATERMELON',
  WATERMELON_STRONG: 'WATERMELON',
  REACH_ME: 'SEVEN_RED',
};

describe('回転の時間モデル(spinningPosition)', () => {
  it('定数: 750ms/周 = 37.5ms/コマ', () => {
    expect(SPIN_MS_PER_REV).toBe(750);
    expect(SPIN_MS_PER_KOMA).toBe(37.5);
  });

  it('経過時間に応じて位置が増加する(下方向回転 = 上段のコマが中段へ降りる)', () => {
    expect(spinningPosition(0, 0)).toBe(0);
    expect(spinningPosition(0, SPIN_MS_PER_KOMA - 0.1)).toBe(0);
    expect(spinningPosition(0, SPIN_MS_PER_KOMA)).toBe(1);
    expect(spinningPosition(5, SPIN_MS_PER_KOMA * 3)).toBe(8);
  });

  it('1 周で元の位置へ戻る(mod 20)', () => {
    expect(spinningPosition(7, SPIN_MS_PER_REV)).toBe(7);
    expect(spinningPosition(19, SPIN_MS_PER_KOMA)).toBe(0);
  });

  it('開始位置の正規化と負経過時間の切り捨て', () => {
    expect(spinningPosition(-1, 0)).toBe(19);
    expect(spinningPosition(25, 0)).toBe(5);
    expect(spinningPosition(3, -100)).toBe(3);
  });
});

describe('遊技サイクルの進行(startSpin / pressStop / finishSpin)', () => {
  it('レバーオン直後は全リール未停止・押し順未確定', () => {
    const cycle = startSpin('BELL');
    expect(cycle.pressed).toEqual([]);
    expect(cycle.stopped).toEqual([undefined, undefined, undefined]);
    expect(isAllStopped(cycle)).toBe(false);
  });

  it('停止ボタンを押した順が押し順として記録される', () => {
    let cycle = startSpin('NONE');
    cycle = pressStop(cycle, 1, 0);
    cycle = pressStop(cycle, 2, 0);
    cycle = pressStop(cycle, 0, 0);
    expect(cycle.pressed).toEqual([1, 2, 0]);
    expect(isAllStopped(cycle)).toBe(true);
  });

  it('停止済みリールへの押下は無視される(状態が変わらない)', () => {
    let cycle = startSpin('NONE');
    cycle = pressStop(cycle, 0, 5);
    const after = pressStop(cycle, 0, 10);
    expect(after).toBe(cycle);
  });

  it('押下位置は mod 20 で正規化される', () => {
    let cycle = startSpin('NONE');
    cycle = pressStop(cycle, 0, 25);
    expect(cycle.pushPositions[0]).toBe(5);
  });

  it('全停止前の finishSpin は例外', () => {
    const cycle = pressStop(startSpin('NONE'), 0, 0);
    expect(() => finishSpin(cycle)).toThrow();
  });

  it('provisionalPushOrder: 押した順 + 未停止リールの左→右昇順', () => {
    expect(provisionalPushOrder([], 0)).toEqual([0, 1, 2]);
    expect(provisionalPushOrder([], 1)).toEqual([1, 0, 2]);
    expect(provisionalPushOrder([], 2)).toEqual([2, 0, 1]);
    expect(provisionalPushOrder([1], 2)).toEqual([1, 2, 0]);
    expect(provisionalPushOrder([2, 1], 0)).toEqual([2, 1, 0]);
  });

  it('仮押し順が実際の押し順と一致する押し順では resolveSpin と完全に同じ出目になる', () => {
    // [左→中→右]・[中→左→右]・[右→左→中] は各停止時点の仮押し順
    // (押した順 + 未停止の左→右昇順)が実際の押し順と一致する
    const matchingOrders: PushOrder[] = [PUSH_ORDERS[0], PUSH_ORDERS[2], PUSH_ORDERS[4]];
    for (const role of ROLES) {
      for (const order of matchingOrders) {
        for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
          for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
            for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
              const pushes: [number, number, number] = [p0, p1, p2];
              const cycle = interactiveSpin(role, pushes, order);
              const expected = resolveSpin(role, pushes, order);
              for (const reel of REEL_INDEXES) {
                if (cycle.stopped[reel] !== expected.positions[reel]) {
                  throw new Error(
                    `resolveSpin と不一致: role=${role} order=${order} pushes=${pushes} interactive=${cycle.stopped} batch=${expected.positions}`,
                  );
                }
              }
            }
          }
        }
      }
    }
  });
});

describe('対話式停止の網羅検証(全役 × 全押し順 6 通り × 全 20^3 押下位置)', () => {
  // 第一停止時点では残り 2 リールの停止順が未確定のため仮押し順で resolveStop を
  // 呼ぶ(gameCycle.ts ヘッダー参照)。resolveSpin(全順序既知)と評価の量化子が
  // 異なるため、出目の合法性・引き込み保証が保たれることをここで全域検証する。
  const missCounts: Partial<Record<Role, number>> = {};

  it.each(ROLES.map((role) => [role] as const))(
    '当選役 %s: スベリ 4 コマ以内・非当選図柄を揃えない・取りこぼしはクリーン',
    (wonRole) => {
      const wonSymbol = LINE_SYMBOL[wonRole];
      let miss = 0;
      for (const order of PUSH_ORDERS) {
        for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
          for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
            for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
              const pushes: [number, number, number] = [p0, p1, p2];
              const cycle = interactiveSpin(wonRole, pushes, order);
              const result = finishSpin(cycle);
              const positions = result.positions;
              for (const reel of REEL_INDEXES) {
                const slip = (positions[reel] - pushes[reel] + KOMA_COUNT) % KOMA_COUNT;
                if (slip > MAX_SLIP) {
                  throw new Error(
                    `スベリ超過: order=${order} pushes=${pushes} reel=${reel} slip=${slip}`,
                  );
                }
              }
              const aligned = alignedSymbols(positions);
              if (aligned.some((s) => s !== wonSymbol)) {
                throw new Error(
                  `非当選図柄が揃った: order=${order} pushes=${pushes} positions=${positions} aligned=${aligned}`,
                );
              }
              if (wonRole === 'REPLAY' && result.displayed !== 'REPLAY') {
                throw new Error(`リプレイ取りこぼし: order=${order} pushes=${pushes}`);
              }
              if (wonRole === 'BELL') {
                if (result.displayed !== 'BELL') {
                  throw new Error(`ベル取りこぼし: order=${order} pushes=${pushes}`);
                }
                // 押し順ベルの停止形は第一停止のリールで決まる(左第一=上段 1 枚 / 中・右第一=斜め 13 枚)
                if (result.bellSuccess !== (order[0] !== 0)) {
                  throw new Error(
                    `ベル停止形不一致: order=${order} pushes=${pushes} positions=${positions}`,
                  );
                }
              }
              if (result.displayed === 'NONE') {
                miss++;
                if (
                  wonRole !== 'CHERRY_CORNER' &&
                  wonRole !== 'CHERRY_CENTER' &&
                  windowAt(0, positions[0]).includes('CHERRY')
                ) {
                  throw new Error(
                    `取りこぼしで左窓チェリー: order=${order} pushes=${pushes} positions=${positions}`,
                  );
                }
              }
            }
          }
        }
      }
      missCounts[wonRole] = miss;
    },
  );

  it('取りこぼし数の固定値(回帰検出用。resolveSpin 網羅テストと同水準)', () => {
    // 全 6 押し順 × 8000 押下位置 = 48000 ゲームあたりの表示役 NONE の数
    expect(missCounts).toEqual({
      REPLAY: 0,
      BELL: 0,
      CHERRY_CORNER: 19200,
      CHERRY_CENTER: 24000,
      WATERMELON_WEAK: 33580,
      WATERMELON_STRONG: 33700,
      CHANCE_ME: 8450,
      REACH_ME: 46790,
      NONE: 48000,
    });
  });
});
