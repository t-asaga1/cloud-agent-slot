import { describe, expect, it } from 'vitest';
import {
  KOMA_COUNT,
  LINE_ROLE_SYMBOL,
  MAX_SLIP,
  PUSH_ORDERS,
  REEL_INDEXES,
  REEL_LAYOUT,
  REEL_SYMBOLS,
  canReach,
  canReachCenterCherry,
  canReachCleanOnLeft,
  canReachCornerCherry,
  judgeDisplay,
  komaAt,
  resolveSpin,
  windowAt,
  type ReelIndex,
  type ReelSymbol,
  type StopPositions,
} from './reel';
import { ROLES, type Role } from './roles';

const ALL_POSITIONS = Array.from({ length: KOMA_COUNT }, (_, i) => i);

/** リール reel 上の図柄 symbol の最大間隔(次の同図柄までの循環距離の最大値)。図柄が無ければ Infinity */
function maxGap(reel: ReelIndex, symbol: ReelSymbol): number {
  const positions = ALL_POSITIONS.filter((p) => komaAt(reel, p) === symbol);
  if (positions.length === 0) return Number.POSITIVE_INFINITY;
  let max = 0;
  for (let i = 0; i < positions.length; i++) {
    const next = positions[(i + 1) % positions.length];
    const gap = (next - positions[i] + KOMA_COUNT) % KOMA_COUNT;
    max = Math.max(max, gap === 0 ? KOMA_COUNT : gap);
  }
  return max;
}

function countSymbol(reel: ReelIndex, symbol: ReelSymbol): number {
  return ALL_POSITIONS.filter((p) => komaAt(reel, p) === symbol).length;
}

describe('リール配列(Excel 仕様 SPEC「3.」の 20 コマ配列の検算)', () => {
  it('図柄は 8 種、3 リール × 20 コマである', () => {
    expect(REEL_SYMBOLS).toHaveLength(8);
    expect(REEL_LAYOUT).toHaveLength(3);
    for (const reel of REEL_LAYOUT) expect(reel).toHaveLength(KOMA_COUNT);
  });

  it('SPEC「3.」の配列表(コマ番号 20 → 1 の降順)と一致する(index = コマ番号 - 1)', () => {
    const R7 = 'SEVEN_RED';
    const BB = 'BAR_BLACK';
    const WB = 'BAR_WHITE';
    const BE = 'BELL';
    const WM = 'WATERMELON';
    const CH = 'CHERRY';
    const RP = 'REPLAY';
    const BL = 'BLANK';
    // SPEC の表の転記: 各行 = [コマ番号, 左, 中, 右](コマ 20 → 1 の降順)
    const specTable: readonly [number, ReelSymbol, ReelSymbol, ReelSymbol][] = [
      [20, WM, BE, RP],
      [19, BB, RP, RP],
      [18, RP, BB, BE],
      [17, R7, BE, BB],
      [16, BE, CH, CH],
      [15, WM, BE, RP],
      [14, BL, RP, WM],
      [13, CH, RP, BE],
      [12, RP, BE, R7],
      [11, BE, CH, CH],
      [10, WM, BE, RP],
      [9, WB, RP, WM],
      [8, CH, WB, BE],
      [7, RP, BE, BL],
      [6, BE, WM, CH],
      [5, WM, BE, RP],
      [4, BL, RP, RP],
      [3, RP, R7, BE],
      [2, RP, BE, WB],
      [1, BE, WM, CH],
    ];
    expect(specTable).toHaveLength(KOMA_COUNT);
    for (const [koma, left, middle, right] of specTable) {
      const index = koma - 1;
      expect(REEL_LAYOUT[0][index], `左リール コマ ${koma}`).toBe(left);
      expect(REEL_LAYOUT[1][index], `中リール コマ ${koma}`).toBe(middle);
      expect(REEL_LAYOUT[2][index], `右リール コマ ${koma}`).toBe(right);
    }
  });

  it('各リールの図柄個数が SPEC と一致する', () => {
    const expected: Record<ReelSymbol, [number, number, number]> = {
      SEVEN_RED: [1, 1, 1],
      BAR_BLACK: [1, 1, 1],
      BAR_WHITE: [1, 1, 1],
      BELL: [4, 8, 4],
      WATERMELON: [4, 2, 2],
      CHERRY: [2, 2, 4],
      REPLAY: [5, 5, 6],
      BLANK: [2, 0, 1],
    };
    for (const symbol of REEL_SYMBOLS) {
      for (const reel of REEL_INDEXES) {
        expect(countSymbol(reel, symbol), `${symbol} × リール ${reel}`).toBe(
          expected[symbol][reel],
        );
      }
    }
  });

  it('赤7・黒バー・白バーは各リール 1 個、ブランクは左 2・中 0・右 1(SPEC 配列分析)', () => {
    for (const symbol of ['SEVEN_RED', 'BAR_BLACK', 'BAR_WHITE'] as const) {
      for (const reel of REEL_INDEXES) expect(countSymbol(reel, symbol)).toBe(1);
    }
    expect(countSymbol(0, 'BLANK')).toBe(2);
    expect(countSymbol(1, 'BLANK')).toBe(0);
    expect(countSymbol(2, 'BLANK')).toBe(1);
  });

  it('ベルは全リールで最大間隔 5 コマ以内(全押下位置から 100% 中段引き込み可)', () => {
    for (const reel of REEL_INDEXES) {
      expect(maxGap(reel, 'BELL')).toBeLessThanOrEqual(MAX_SLIP + 1);
      for (const p of ALL_POSITIONS) expect(canReach(reel, p, 'BELL')).toBe(true);
    }
  });

  it('左スイカ・中リプレイ・右リプレイ・右チェリーも 100% 中段引き込み可(SPEC 配列分析)', () => {
    expect(maxGap(0, 'WATERMELON')).toBeLessThanOrEqual(MAX_SLIP + 1);
    expect(maxGap(1, 'REPLAY')).toBeLessThanOrEqual(MAX_SLIP + 1);
    expect(maxGap(2, 'REPLAY')).toBeLessThanOrEqual(MAX_SLIP + 1);
    expect(maxGap(2, 'CHERRY')).toBeLessThanOrEqual(MAX_SLIP + 1);
  });

  it('左リプレイの最大間隔は 6 コマ(コマ 12 ⇔ 18)= 中段 1 ラインのみでは 100% 引き込み不可', () => {
    expect(maxGap(0, 'REPLAY')).toBe(6);
    // コマ 12(index 11)の次のリプレイはコマ 18(index 17)
    expect(komaAt(0, 11)).toBe('REPLAY');
    for (let i = 12; i < 17; i++) expect(komaAt(0, i)).not.toBe('REPLAY');
    expect(komaAt(0, 17)).toBe('REPLAY');
    // 中段のみでは引き込めない押下位置が存在する
    expect(ALL_POSITIONS.some((p) => !canReach(0, p, 'REPLAY'))).toBe(true);
    // 窓内表示(上・中・下段の 7 コマ範囲)なら全押下位置から到達可能(5 ライン併用の前提)
    for (const p of ALL_POSITIONS) {
      const windowReachable = Array.from(
        { length: MAX_SLIP + 3 }, // スベリ 0〜4 の停止位置それぞれの上・中・下段 = p-1 〜 p+5 の 7 コマ
        (_, i) => komaAt(0, p - 1 + i),
      ).includes('REPLAY');
      expect(windowReachable, `押下位置 ${p}`).toBe(true);
    }
  });

  it('中・右スイカ / 左チェリー / 中チェリーは取りこぼしが発生し得る配置(取りこぼし許容・確定)', () => {
    expect(maxGap(1, 'WATERMELON')).toBeGreaterThan(MAX_SLIP + 1);
    expect(maxGap(2, 'WATERMELON')).toBeGreaterThan(MAX_SLIP + 1);
    expect(maxGap(0, 'CHERRY')).toBeGreaterThan(MAX_SLIP + 1);
    expect(maxGap(1, 'CHERRY')).toBeGreaterThan(MAX_SLIP + 1);
    expect(ALL_POSITIONS.some((p) => !canReach(1, p, 'WATERMELON'))).toBe(true);
    expect(ALL_POSITIONS.some((p) => !canReach(2, p, 'WATERMELON'))).toBe(true);
    expect(ALL_POSITIONS.some((p) => !canReachCornerCherry(p) && !canReachCenterCherry(p))).toBe(
      true,
    );
  });

  it('チェリーは左リールの角・中段の両方の停止形を作れる', () => {
    expect(ALL_POSITIONS.some((p) => canReachCornerCherry(p))).toBe(true);
    expect(ALL_POSITIONS.some((p) => canReachCenterCherry(p))).toBe(true);
  });
});

describe('表示窓と出目判定(中段 1 ライン。5 ライン化は STEP 1b)', () => {
  it('windowAt は上段・中段・下段の順で返す(停止位置=中段、index p+1 が上段)', () => {
    // 左リール停止位置 3(コマ4=ブランク): 上段=コマ5(スイカ)、中段=コマ4(ブランク)、下段=コマ3(リプレイ)
    expect(windowAt(0, 3)).toEqual(['WATERMELON', 'BLANK', 'REPLAY']);
    // 位置は mod 20 で循環する
    expect(windowAt(0, 0)).toEqual([komaAt(0, 1), komaAt(0, 0), komaAt(0, 19)]);
  });

  it('コマ番号と index の対応規約(index = コマ番号 - 1)', () => {
    expect(komaAt(0, 0)).toBe('BELL'); // 左コマ 1
    expect(komaAt(0, 19)).toBe('WATERMELON'); // 左コマ 20
    expect(komaAt(1, 2)).toBe('SEVEN_RED'); // 中コマ 3
    expect(komaAt(2, 11)).toBe('SEVEN_RED'); // 右コマ 12
  });

  it('中段 3 つ揃いのライン役を判定する', () => {
    // 左コマ1=ベル, 中コマ2=ベル, 右コマ3=ベル
    expect(judgeDisplay([0, 1, 2])).toBe('BELL');
    // 左コマ2=リプレイ, 中コマ4=リプレイ, 右コマ4=リプレイ
    expect(judgeDisplay([1, 3, 3])).toBe('REPLAY');
    // 左コマ17=赤7, 中コマ3=赤7, 右コマ12=赤7 → リーチ目(暫定表現)
    expect(judgeDisplay([16, 2, 11])).toBe('REACH_ME');
    // スイカ揃いは当選役で弱・強を区別: 左コマ5, 中コマ1, 右コマ9
    expect(judgeDisplay([4, 0, 8], 'WATERMELON_WEAK')).toBe('WATERMELON_WEAK');
    expect(judgeDisplay([4, 0, 8], 'WATERMELON_STRONG')).toBe('WATERMELON_STRONG');
  });

  it('左リールのチェリーを角・中段で判定する', () => {
    // 左コマ8=チェリーが中段 → 中段チェリー(他リールはライン不成立の位置)
    expect(judgeDisplay([7, 0, 2] as StopPositions)).toBe('CHERRY_CENTER');
    // 左停止位置 8(中段=コマ9 白バー)の下段=コマ8(チェリー)→ 角チェリー
    expect(judgeDisplay([8, 0, 2] as StopPositions)).toBe('CHERRY_CORNER');
  });
});

/** テスト側で独立に計算した「期待される表示役」(旧・中段 1 ライン前提) */
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

// TODO(STEP 1c〜1e): 旧・中段 1 ライン前提の停止制御網羅テスト。
// Excel の新配列では前提(左リプレイの中段 100% 引き込み等)が成立しないため一時 skip。
// 5 ライン対応の停止制御書き直し(1c: 基本役 / 1d: レア役 / 1e: リーチ目 + DDT)で
// 新しい網羅テストへ置換し、1e で skip 残ゼロにすること(docs/ROADMAP.md 参照)。
describe.skip('停止制御(全役 × 全 20^3 押下位置 × 全押し順の網羅検証)【旧 1 ライン前提・1c〜1e で置換】', () => {
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
