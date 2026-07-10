import { describe, expect, it } from 'vitest';
import {
  KOMA_COUNT,
  LINE_ROLE_SYMBOL,
  MAX_SLIP,
  PUSH_ORDERS,
  REEL_INDEXES,
  REEL_LAYOUT,
  canReach,
  canReachCenterCherry,
  canReachCleanOnLeft,
  canReachCornerCherry,
  judgeDisplay,
  komaAt,
  resolveSpin,
  windowAt,
  type ReelIndex,
  type StopPositions,
} from './reel';
import { ROLES, type Role } from './roles';

const ALL_POSITIONS = Array.from({ length: KOMA_COUNT }, (_, i) => i);

describe('リール配列(暫定: 旧叩き台配列。Excel 配列への差し替えは次タスク)', () => {
  it('3 リール × 20 コマである', () => {
    expect(REEL_LAYOUT).toHaveLength(3);
    for (const reel of REEL_LAYOUT) expect(reel).toHaveLength(KOMA_COUNT);
  });

  it('ベル・リプレイは全リールで隙間 4 コマ以内(100% 引き込み保証配置)', () => {
    for (const symbol of ['BELL', 'REPLAY'] as const) {
      for (const reel of REEL_INDEXES) {
        const positions = ALL_POSITIONS.filter((p) => komaAt(reel, p) === symbol);
        expect(positions.length).toBeGreaterThan(0);
        for (let i = 0; i < positions.length; i++) {
          const next = positions[(i + 1) % positions.length];
          const gap = (next - positions[i] + KOMA_COUNT) % KOMA_COUNT;
          // 隙間 4 コマ以内 = 次の同図柄まで 5 コマ以内 → 任意の押下位置から 4 コマ以内で引き込める
          expect(gap).toBeLessThanOrEqual(MAX_SLIP + 1);
        }
        for (const p of ALL_POSITIONS) expect(canReach(reel, p, symbol)).toBe(true);
      }
    }
  });

  it('スイカ・チェリーは取りこぼしが発生し得る配置(取りこぼし許容・確定)', () => {
    expect(ALL_POSITIONS.some((p) => !canReach(0, p, 'WATERMELON'))).toBe(true);
    expect(ALL_POSITIONS.some((p) => !canReachCornerCherry(p) && !canReachCenterCherry(p))).toBe(
      true,
    );
  });

  it('チェリーは左リールの角・中段の両方の停止形を作れる', () => {
    expect(ALL_POSITIONS.some((p) => canReachCornerCherry(p))).toBe(true);
    expect(ALL_POSITIONS.some((p) => canReachCenterCherry(p))).toBe(true);
  });
});

describe('表示窓と出目判定', () => {
  it('windowAt は上段・中段・下段の順で返す(停止位置=中段)', () => {
    // 左リール停止位置 3(チェリー): 上段=コマ4(スイカ)、中段=コマ3(チェリー)、下段=コマ2(ベル)
    expect(windowAt(0, 3)).toEqual(['WATERMELON', 'CHERRY', 'BELL']);
    // 位置は mod 20 で循環する
    expect(windowAt(0, 0)).toEqual([komaAt(0, 1), komaAt(0, 0), komaAt(0, 19)]);
  });

  it('中段 3 つ揃いのライン役を判定する', () => {
    // 左2=ベル, 中1=ベル, 右0=ベル
    expect(judgeDisplay([2, 1, 0])).toBe('BELL');
    // 左1=リプレイ, 中0=リプレイ, 右1=リプレイ
    expect(judgeDisplay([1, 0, 1])).toBe('REPLAY');
    // 左0=赤7, 中3=赤7, 右6=赤7 → リーチ目(暫定表現)
    expect(judgeDisplay([0, 3, 6])).toBe('REACH_ME');
    // スイカ揃いは当選役で弱・強を区別: 左4=スイカ, 中2=スイカ, 右3=スイカ
    expect(judgeDisplay([4, 2, 3], 'WATERMELON_WEAK')).toBe('WATERMELON_WEAK');
    expect(judgeDisplay([4, 2, 3], 'WATERMELON_STRONG')).toBe('WATERMELON_STRONG');
  });

  it('左リールのチェリーを角・中段で判定する', () => {
    // 左4: 下段=コマ3(チェリー)= 角チェリー(中段はスイカ、他リールはライン不成立の位置)
    expect(judgeDisplay([4, 0, 1] as StopPositions)).toBe('CHERRY_CORNER');
    // 左3: 中段=コマ3(チェリー)= 中段チェリー
    expect(judgeDisplay([3, 0, 0] as StopPositions)).toBe('CHERRY_CENTER');
  });
});

/** テスト側で独立に計算した「期待される表示役」 */
function expectedDisplay(wonRole: Role, pushes: readonly [number, number, number]): Role {
  if (wonRole === 'BELL' || wonRole === 'REPLAY') return wonRole; // 100% 引き込み
  if (
    wonRole === 'WATERMELON_WEAK' ||
    wonRole === 'WATERMELON_STRONG' ||
    wonRole === 'REACH_ME'
  ) {
    const symbol = LINE_ROLE_SYMBOL[wonRole];
    const ok =
      canReachCleanOnLeft(pushes[0], symbol) &&
      canReach(1, pushes[1], symbol) &&
      canReach(2, pushes[2], symbol);
    return ok ? wonRole : 'NONE';
  }
  if (wonRole === 'CHERRY_CORNER') return canReachCornerCherry(pushes[0]) ? wonRole : 'NONE';
  if (wonRole === 'CHERRY_CENTER') return canReachCenterCherry(pushes[0]) ? wonRole : 'NONE';
  return 'NONE'; // ハズレ・チャンス目は何も揃わない
}

describe('停止制御(全役 × 全 20^3 押下位置 × 全押し順の網羅検証)', () => {
  for (const wonRole of ROLES) {
    it(`当選役 ${wonRole}: スベリ 4 コマ以内で、期待どおりの表示役に停止する`, () => {
      for (const order of PUSH_ORDERS) {
        for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
          for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
            for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
              const pushes: [number, number, number] = [p0, p1, p2];
              const { positions, displayed } = resolveSpin(wonRole, pushes, order);
              for (const reel of REEL_INDEXES) {
                const slip = (positions[reel] - pushes[reel] + KOMA_COUNT) % KOMA_COUNT;
                if (slip > MAX_SLIP) {
                  throw new Error(
                    `スベリ超過: role=${wonRole} order=${order} pushes=${pushes} reel=${reel} slip=${slip}`,
                  );
                }
              }
              const expected = expectedDisplay(wonRole, pushes);
              if (displayed !== expected) {
                throw new Error(
                  `表示役不一致: role=${wonRole} order=${order} pushes=${pushes} positions=${positions} displayed=${displayed} expected=${expected}`,
                );
              }
            }
          }
        }
      }
    });
  }

  it('チェリー非当選時は左リールの窓内にチェリーが表示されない(ベル・リプレイの引き込み時を除く)', () => {
    const nonCherryRoles = ROLES.filter((r) => r !== 'CHERRY_CORNER' && r !== 'CHERRY_CENTER');
    for (const wonRole of nonCherryRoles) {
      for (const order of PUSH_ORDERS) {
        for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
          const { positions, displayed } = resolveSpin(wonRole, [p0, 0, 0], order);
          const window = windowAt(0, positions[0]);
          if (window.includes('CHERRY')) {
            // チェリーが見えてよいのは、当選ライン役が実際に揃っている場合のみ
            expect(displayed).toBe(wonRole);
            expect(wonRole === 'BELL' || wonRole === 'REPLAY').toBe(true);
          }
        }
      }
    }
  });
});

describe('resolveSpin の押下位置正規化', () => {
  it('負数・20 以上の押下位置も mod 20 で扱う', () => {
    const a = resolveSpin('BELL', [21, -1, 40]);
    const b = resolveSpin('BELL', [1, 19, 0]);
    expect(a.positions).toEqual(b.positions);
  });
});

// ReelIndex 型が 0/1/2 のみを許すことのコンパイル時チェック用
const _reelIndexCheck: ReelIndex[] = [0, 1, 2];
void _reelIndexCheck;
