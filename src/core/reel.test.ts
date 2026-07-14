import { describe, expect, it } from 'vitest';
import {
  DIAGONAL_LINES,
  KOMA_COUNT,
  LINES,
  LINE_IDS,
  LINE_ROLE_SYMBOL,
  MAX_SLIP,
  PUSH_ORDERS,
  REEL_INDEXES,
  REEL_LAYOUT,
  REEL_SYMBOLS,
  canReach,
  canReachCenterCherry,
  canReachCornerCherry,
  isSevenAimedPush,
  judgeDisplay,
  judgeDisplayDetail,
  komaAt,
  lineSymbols,
  linesWithSymbol,
  resolveSpin,
  watermelonTenpai,
  windowAt,
  type ReelIndex,
  type ReelSymbol,
  type StopPositions,
} from './reel';
import { calcPayout } from './payout';
import { ROLES, type Role } from './roles';
import type { LineId } from './reel';

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
    // SPEC の表の転記: 各行 = [コマ番号, 左, 中, 右](コマ 20 → 1 の降順)。
    // 左コマ 14 は Excel のブランクからリプレイへ変更済み(2026-07-11 ユーザー指示。
    // 変則押しのリプレイ取りこぼし対処。SPEC「3.」参照)
    const specTable: readonly [number, ReelSymbol, ReelSymbol, ReelSymbol][] = [
      [20, WM, BE, RP],
      [19, BB, RP, RP],
      [18, RP, BB, BE],
      [17, R7, BE, BB],
      [16, BE, CH, CH],
      [15, WM, BE, RP],
      [14, RP, RP, WM],
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
      REPLAY: [6, 5, 6],
      BLANK: [1, 0, 1],
    };
    for (const symbol of REEL_SYMBOLS) {
      for (const reel of REEL_INDEXES) {
        expect(countSymbol(reel, symbol), `${symbol} × リール ${reel}`).toBe(
          expected[symbol][reel],
        );
      }
    }
  });

  it('赤7・黒バー・白バーは各リール 1 個、ブランクは左 1・中 0・右 1(SPEC 配列分析)', () => {
    for (const symbol of ['SEVEN_RED', 'BAR_BLACK', 'BAR_WHITE'] as const) {
      for (const reel of REEL_INDEXES) expect(countSymbol(reel, symbol)).toBe(1);
    }
    expect(countSymbol(0, 'BLANK')).toBe(1);
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

  it('左リプレイの最大間隔は 5 コマ = 全押下位置から 100% 中段引き込み可(コマ 14 変更後)', () => {
    // 2026-07-11 ユーザー指示: 左コマ 14 をブランク → リプレイへ変更
    // (変更前は最大間隔 6(コマ 12 ⇔ 18)で、左を最後に止める変則押しで取りこぼしが発生していた)
    expect(komaAt(0, 13)).toBe('REPLAY'); // 左コマ 14
    expect(maxGap(0, 'REPLAY')).toBe(MAX_SLIP + 1);
    for (const p of ALL_POSITIONS) {
      expect(canReach(0, p, 'REPLAY'), `押下位置 ${p}`).toBe(true);
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

describe('表示窓と有効ライン定義(横 3 + 斜め 2 の 5 ライン。SPEC「3.」確定事項)', () => {
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

  it('有効ラインは 5 本(上段・中段・下段・右下がり・右上がり)で座標定義が正しい', () => {
    expect(LINE_IDS).toHaveLength(5);
    expect(LINES.TOP).toEqual([1, 1, 1]);
    expect(LINES.MIDDLE).toEqual([0, 0, 0]);
    expect(LINES.BOTTOM).toEqual([-1, -1, -1]);
    expect(LINES.DOWN_RIGHT).toEqual([1, 0, -1]); // 左上段 → 中中段 → 右下段
    expect(LINES.UP_RIGHT).toEqual([-1, 0, 1]); // 左下段 → 中中段 → 右上段
    expect(DIAGONAL_LINES).toEqual(['DOWN_RIGHT', 'UP_RIGHT']);
  });

  it('lineSymbols は各ライン上の図柄 [左, 中, 右] を返す', () => {
    // 停止位置 [4, 3, 1]: 窓は 左[BE/WM/BL] 中[BE/RP/R7] 右[BE/WB/CH](上段/中段/下段)
    const positions: StopPositions = [4, 3, 1];
    expect(lineSymbols(positions, 'TOP')).toEqual(['BELL', 'BELL', 'BELL']);
    expect(lineSymbols(positions, 'MIDDLE')).toEqual(['WATERMELON', 'REPLAY', 'BAR_WHITE']);
    expect(lineSymbols(positions, 'BOTTOM')).toEqual(['BLANK', 'SEVEN_RED', 'CHERRY']);
    expect(lineSymbols(positions, 'DOWN_RIGHT')).toEqual(['BELL', 'REPLAY', 'CHERRY']);
    expect(lineSymbols(positions, 'UP_RIGHT')).toEqual(['BLANK', 'REPLAY', 'BELL']);
    // 位置は mod 20 で循環する(下段 = 停止位置 0 の index 19)
    expect(lineSymbols([0, 0, 0], 'BOTTOM')).toEqual([komaAt(0, 19), komaAt(1, 19), komaAt(2, 19)]);
  });

  it('linesWithSymbol は図柄が 3 つ揃いになっている有効ラインを列挙する', () => {
    expect(linesWithSymbol([4, 3, 1], 'BELL')).toEqual(['TOP']);
    expect(linesWithSymbol([4, 3, 1], 'REPLAY')).toEqual([]);
    // 停止位置 [1, 12, 3]: リプレイが上段 + 中段の 2 ライン同時揃い
    expect(linesWithSymbol([1, 12, 3], 'REPLAY')).toEqual(['TOP', 'MIDDLE']);
  });
});

describe('出目判定 judgeDisplay / judgeDisplayDetail(5 ライン。新配列の実座標)', () => {
  it('横ライン(上段・中段・下段)の 3 つ揃いを判定する', () => {
    // 上段ベル: 左コマ6・中コマ5・右コマ3 が上段(停止位置 = 中段のコマ番号 - 1)
    expect(judgeDisplayDetail([4, 3, 1], 'BELL')).toEqual({
      role: 'BELL',
      lines: ['TOP'],
    });
    // 中段ベル: 左コマ1・中コマ2・右コマ3
    expect(judgeDisplayDetail([0, 1, 2], 'BELL')).toEqual({
      role: 'BELL',
      lines: ['MIDDLE'],
    });
    // 中段リプレイ: 左コマ2・中コマ4・右コマ4
    expect(judgeDisplay([1, 3, 3])).toBe('REPLAY');
    // 下段リプレイ: 左コマ2・中コマ4・右コマ5 が下段(停止位置 index = 下段のコマ番号)
    expect(judgeDisplayDetail([2, 4, 5], 'REPLAY')).toEqual({
      role: 'REPLAY',
      lines: ['BOTTOM'],
    });
  });

  it('斜めライン(右下がり・右上がり)の 3 つ揃いを判定する', () => {
    // 右下がりベル: 左上段コマ11・中中段コマ7・右下段コマ8
    expect(judgeDisplayDetail([9, 6, 8], 'BELL')).toEqual({
      role: 'BELL',
      lines: ['DOWN_RIGHT'],
    });
    // 右上がりベル: 左下段コマ1・中中段コマ5・右上段コマ3
    expect(judgeDisplayDetail([1, 4, 1], 'BELL')).toEqual({
      role: 'BELL',
      lines: ['UP_RIGHT'],
    });
    // 右上がりスイカ: 左下段コマ5・中中段コマ1・右上段コマ9(弱・強は当選役で区別)
    expect(judgeDisplay([5, 0, 7], 'WATERMELON_WEAK')).toBe('WATERMELON_WEAK');
    expect(judgeDisplay([5, 0, 7], 'WATERMELON_STRONG')).toBe('WATERMELON_STRONG');
    // 右下がり 7 揃い: 左上段コマ17・中中段コマ3・右下段コマ12 → リーチ目
    expect(judgeDisplayDetail([15, 2, 12], 'REACH_ME')).toEqual({
      role: 'REACH_ME',
      lines: ['DOWN_RIGHT'],
    });
  });

  it('中段 7 揃い(左コマ17・中コマ3・右コマ12)はリーチ目', () => {
    expect(judgeDisplay([16, 2, 11], 'REACH_ME')).toBe('REACH_ME');
    // 非当選でも 7 揃いはリーチ目扱い(停止制御が非当選時の 7 揃いを蹴飛ばす前提)
    expect(judgeDisplay([16, 2, 11])).toBe('REACH_ME');
  });

  it('中段スイカ揃い(左コマ5・中コマ1・右コマ9)は当選役で弱・強を区別する', () => {
    expect(judgeDisplay([4, 0, 8], 'WATERMELON_WEAK')).toBe('WATERMELON_WEAK');
    expect(judgeDisplay([4, 0, 8], 'WATERMELON_STRONG')).toBe('WATERMELON_STRONG');
    // スイカ非当選時のスイカ揃いは表示役にしない(蹴飛ばしで発生しない前提)
    expect(judgeDisplay([4, 0, 8])).toBe('NONE');
  });

  it('同一役の複数ライン同時揃いは全ラインを列挙する(表示役・払出は 1 役分)', () => {
    // 停止位置 [1, 12, 3]: リプレイが上段 + 中段の 2 ライン同時揃い(下段にはベルも揃う)
    expect(judgeDisplayDetail([1, 12, 3], 'REPLAY')).toEqual({
      role: 'REPLAY',
      lines: ['TOP', 'MIDDLE'],
    });
  });

  it('複数役が別ラインで同時に揃った場合は 当選役 > リーチ目 > リプレイ > ベル の優先順位', () => {
    // 停止位置 [16, 2, 3]: 上段リプレイ + 下段ベルの同時揃い(実配列で構成可能な出目)
    expect(lineSymbols([16, 2, 3], 'TOP')).toEqual(['REPLAY', 'REPLAY', 'REPLAY']);
    expect(lineSymbols([16, 2, 3], 'BOTTOM')).toEqual(['BELL', 'BELL', 'BELL']);
    // 当選役の図柄を最優先で採用する
    expect(judgeDisplay([16, 2, 3], 'REPLAY')).toBe('REPLAY');
    expect(judgeDisplayDetail([16, 2, 3], 'BELL')).toEqual({
      role: 'BELL',
      lines: ['BOTTOM'],
    });
    // 当選役の図柄がなければ固定優先順位(リプレイ > ベル)
    expect(judgeDisplay([16, 2, 3])).toBe('REPLAY');
    expect(judgeDisplay([16, 2, 3], 'CHANCE_ME')).toBe('REPLAY');
  });

  it('左リールのチェリーはライン非依存で判定する(中段=中段チェリー / 上下段=角チェリー)', () => {
    // 左コマ8=チェリーが中段 → 中段チェリー(他リールはライン不成立の位置)
    expect(judgeDisplayDetail([7, 0, 2], 'CHERRY_CENTER')).toEqual({
      role: 'CHERRY_CENTER',
      lines: [],
    });
    // 左停止位置 8(中段=コマ9 白バー)の下段=コマ8(チェリー)→ 角チェリー
    expect(judgeDisplay([8, 0, 2] as StopPositions)).toBe('CHERRY_CORNER');
    // 左停止位置 6(中段=コマ7 リプレイ)の上段=コマ8(チェリー)→ 角チェリー
    expect(judgeDisplay([6, 0, 2] as StopPositions)).toBe('CHERRY_CORNER');
  });

  it('ライン役が揃っていれば左リール窓内のチェリーより優先する', () => {
    // 停止位置 [6, 3, 4]: 中段リプレイ揃い + 左リール上段にチェリー(コマ8)
    expect(windowAt(0, 6)[0]).toBe('CHERRY');
    expect(judgeDisplayDetail([6, 3, 4], 'REPLAY')).toEqual({
      role: 'REPLAY',
      lines: ['MIDDLE'],
    });
    expect(judgeDisplay([6, 3, 4])).toBe('REPLAY');
  });

  it('どのラインにも揃いがなく左リールにチェリーもなければ NONE', () => {
    // 停止位置 [3, 6, 6]: 窓は 左[WM/BL/RP] 中[WB/BE/WM] 右[BE/BL/CH]で全ライン不揃い
    expect(judgeDisplayDetail([3, 6, 6])).toEqual({ role: 'NONE', lines: [] });
  });

  it('watermelonTenpai はライン上のスイカがちょうど 2 個の形を検出する', () => {
    // 停止位置 [0, 0, 3]: 右上がりライン(左下段コマ20・中中段コマ1)にスイカ 2 個 = テンパイ
    expect(lineSymbols([0, 0, 3], 'UP_RIGHT')).toEqual(['WATERMELON', 'WATERMELON', 'REPLAY']);
    expect(watermelonTenpai([0, 0, 3])).toBe(true);
    // 停止位置 [3, 6, 6]: どのラインもスイカ 1 個以下
    expect(watermelonTenpai([3, 6, 6])).toBe(false);
    // 3 つ揃い(スイカが 3 個)はテンパイではない(中段スイカ揃いの [4, 0, 8])
    expect(watermelonTenpai([4, 0, 8])).toBe(false);
  });

  it('チャンス目は内部当選時のみ、スイカテンパイはずし目を CHANCE_ME として表示する', () => {
    // テンパイはずし目([0, 0, 3])は当選役がチャンス目のときだけ CHANCE_ME
    expect(judgeDisplayDetail([0, 0, 3], 'CHANCE_ME')).toEqual({
      role: 'CHANCE_ME',
      lines: [],
    });
    expect(judgeDisplay([0, 0, 3])).toBe('NONE');
    expect(judgeDisplay([0, 0, 3], 'WATERMELON_WEAK')).toBe('NONE'); // スイカ取りこぼし目
    // テンパイしていない出目はチャンス目当選でも NONE(取りこぼし)
    expect(judgeDisplay([3, 6, 6], 'CHANCE_ME')).toBe('NONE');
    // ライン役の揃いが優先される(上段リプレイ + 下段ベルの [16, 2, 3])
    expect(judgeDisplay([16, 2, 3], 'CHANCE_ME')).toBe('REPLAY');
  });

  it('全停止位置で judgeDisplay と judgeDisplayDetail の役が一致する(整合性)', () => {
    for (const wonRole of ['NONE', 'REPLAY', 'BELL', 'WATERMELON_WEAK', 'CHANCE_ME'] as const) {
      for (const p0 of ALL_POSITIONS) {
        for (const p1 of ALL_POSITIONS) {
          for (const p2 of ALL_POSITIONS) {
            const positions: StopPositions = [p0, p1, p2];
            const detail = judgeDisplayDetail(positions, wonRole);
            expect(judgeDisplay(positions, wonRole)).toBe(detail.role);
            // ライン役なら lines が空でない・チェリー/チャンス目/NONE なら空
            const isLineRole =
              detail.role !== 'NONE' &&
              detail.role !== 'CHERRY_CORNER' &&
              detail.role !== 'CHERRY_CENTER' &&
              detail.role !== 'CHANCE_ME';
            expect(detail.lines.length > 0).toBe(isLineRole);
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 停止制御 I(STEP 1c: ハズレ / リプレイ / 押し順ベルの網羅検証)
// ---------------------------------------------------------------------------

/** positions の出目で 3 つ揃いになっている [ライン, 図柄] を全列挙する */
function alignedLines(positions: StopPositions): [LineId, ReelSymbol][] {
  const out: [LineId, ReelSymbol][] = [];
  for (const line of LINE_IDS) {
    const [a, b, c] = lineSymbols(positions, line);
    if (a === b && b === c) out.push([line, a]);
  }
  return out;
}

/** 全リールのスベリが MAX_SLIP 以内であることを検証(超過時は詳細つきで throw) */
function assertSlipWithinLimit(
  wonRole: Role,
  order: (typeof PUSH_ORDERS)[number],
  pushes: readonly [number, number, number],
  positions: StopPositions,
): void {
  for (const reel of REEL_INDEXES) {
    const slip = (positions[reel] - pushes[reel] + KOMA_COUNT) % KOMA_COUNT;
    if (slip > MAX_SLIP) {
      throw new Error(
        `スベリ超過: role=${wonRole} order=${order} pushes=${pushes} reel=${reel} slip=${slip}`,
      );
    }
  }
}

describe('停止制御 I(STEP 1c: 基本役 × 全 20^3 押下位置 × 押し順 6 通りの網羅検証)', () => {
  it('ハズレ: 全押下位置・全押し順で 5 ラインの蹴飛ばしが可能(何も揃わず左窓チェリーも出ない)', () => {
    // ROADMAP 記載のリスク早期検証: 最大スベリ 4 コマで 5 ライン全ての蹴飛ばしが
    // 全押下位置で可能かは配列依存。不可能な押下位置があればここで検出される。
    for (const order of PUSH_ORDERS) {
      for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
        for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
          for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
            const pushes: [number, number, number] = [p0, p1, p2];
            const { positions, displayed } = resolveSpin('NONE', pushes, order);
            assertSlipWithinLimit('NONE', order, pushes, positions);
            const aligned = alignedLines(positions);
            if (aligned.length > 0) {
              throw new Error(
                `ハズレで図柄が揃った: order=${order} pushes=${pushes} positions=${positions} aligned=${JSON.stringify(aligned)}`,
              );
            }
            if (windowAt(0, positions[0]).includes('CHERRY')) {
              throw new Error(
                `ハズレで左窓にチェリー: order=${order} pushes=${pushes} positions=${positions}`,
              );
            }
            if (displayed !== 'NONE') {
              throw new Error(
                `ハズレの表示役不一致: order=${order} pushes=${pushes} displayed=${displayed}`,
              );
            }
          }
        }
      }
    }
  });

  // 【1c 時点の理論限界は配列変更で解消済み(2026-07-11)】
  // 左リプレイの最大間隔が 6 コマだった 1c 時点は、左リールを「最後に」止める押し順
  // ([中→右→左]・[右→中→左])で理論最小 134〜135 / 8000 の取りこぼしが避けられなかった。
  // 左コマ 14 をブランク → リプレイへ変更して最大間隔 5 コマ(全押下位置から中段引き込み可)
  // となり、全押し順・全押下位置で 100% 引き込みできるようになった。
  it('リプレイ: 全押し順・全押下位置で 100% 引き込み(左コマ 14 の配列変更後)', () => {
    for (const order of PUSH_ORDERS) {
      const leftFirst = order[0] === 0;
      for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
        for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
          for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
            const pushes: [number, number, number] = [p0, p1, p2];
            const result = resolveSpin('REPLAY', pushes, order);
            assertSlipWithinLimit('REPLAY', order, pushes, result.positions);
            // リプレイ以外の図柄が同時に揃う禁止出目がない
            const others = alignedLines(result.positions).filter(([, s]) => s !== 'REPLAY');
            if (others.length > 0) {
              throw new Error(
                `リプレイと同時に他図柄が揃った: order=${order} pushes=${pushes} positions=${result.positions} aligned=${JSON.stringify(others)}`,
              );
            }
            if (result.displayed !== 'REPLAY' || result.lines.length === 0) {
              throw new Error(
                `リプレイ引き込み失敗: order=${order} pushes=${pushes} positions=${result.positions} displayed=${result.displayed}`,
              );
            }
            // 左窓チェリーとの同時表示は、チェリーを出さずにリプレイを窓内へ
            // 引き込める代替停止位置が無い押下位置に限る(左第一停止時のみ判定可能)
            if (leftFirst && windowAt(0, result.positions[0]).includes('CHERRY')) {
              for (let slip = 0; slip <= MAX_SLIP; slip++) {
                const pos = (p0 + slip) % KOMA_COUNT;
                const window = windowAt(0, pos);
                if (!window.includes('CHERRY') && window.includes('REPLAY')) {
                  throw new Error(
                    `不要なチェリー同時表示: order=${order} pushes=${pushes} positions=${result.positions}(代替停止 ${pos} あり)`,
                  );
                }
              }
            }
          }
        }
      }
    }
  });

  it('押し順ベル(揃い): 左第一停止=上段揃い / 中・右第一停止=斜め揃い(全押下位置・全押し順)', () => {
    // bellMiss = false(左第一の 1/13 揃い側。中・右第一では bellMiss は効かない)
    for (const order of PUSH_ORDERS) {
      const leftFirst = order[0] === 0;
      for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
        for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
          for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
            const pushes: [number, number, number] = [p0, p1, p2];
            const result = resolveSpin('BELL', pushes, order);
            assertSlipWithinLimit('BELL', order, pushes, result.positions);
            if (result.displayed !== 'BELL') {
              throw new Error(
                `ベル引き込み失敗: order=${order} pushes=${pushes} positions=${result.positions} displayed=${result.displayed}`,
              );
            }
            const others = alignedLines(result.positions).filter(([, s]) => s !== 'BELL');
            if (others.length > 0) {
              throw new Error(
                `ベルと同時に他図柄が揃った: order=${order} pushes=${pushes} positions=${result.positions} aligned=${JSON.stringify(others)}`,
              );
            }
            const shapeOk = leftFirst
              ? result.lines.length === 1 && result.lines[0] === 'TOP'
              : result.lines.length === 1 && DIAGONAL_LINES.includes(result.lines[0]);
            if (!shapeOk) {
              throw new Error(
                `ベルの停止形不一致: order=${order}(${leftFirst ? '左第一' : '変則押し'}) pushes=${pushes} positions=${result.positions} lines=${result.lines}`,
              );
            }
          }
        }
      }
    }
  });

  it('押し順ベル(こぼし = 確定 35): 左第一停止はクリーンなハズレ目、中・右第一停止は斜め揃いのまま(全押下位置・全押し順)', () => {
    // bellMiss = true(左第一の 12/13 こぼし側)
    for (const order of PUSH_ORDERS) {
      const leftFirst = order[0] === 0;
      for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
        for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
          for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
            const pushes: [number, number, number] = [p0, p1, p2];
            const result = resolveSpin('BELL', pushes, order, true);
            assertSlipWithinLimit('BELL', order, pushes, result.positions);
            if (leftFirst) {
              // こぼし: 何も揃わず左窓チェリーも出ないハズレ目・払出 0
              if (result.displayed !== 'NONE' || !isCleanMiss(result.positions)) {
                throw new Error(
                  `ベルこぼしの出目不正: order=${order} pushes=${pushes} positions=${result.positions} displayed=${result.displayed}`,
                );
              }
            } else if (
              result.displayed !== 'BELL' ||
              result.lines.length !== 1 ||
              !DIAGONAL_LINES.includes(result.lines[0])
            ) {
              // ナビ遵守(中・右第一)は bellMiss に依らず斜め揃い 13 枚
              throw new Error(
                `変則押しベルの停止形不一致: order=${order} pushes=${pushes} positions=${result.positions} lines=${result.lines}`,
              );
            }
          }
        }
      }
    }
  });

  it('押し順ベルのこぼしはハズレと同一の蹴飛ばしになる(左第一・全押下位置で出目一致)', () => {
    // classifyFinal 上 MISS はハズレと同一分類のため、停止位置も完全一致する
    // (DDT 黒バー狙い時の黒バー下段停止などもハズレ時と同じ挙動 = 実機的な「こぼし目」)
    for (const order of LEFT_FIRST_ORDERS) {
      for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
        for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
          for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
            const pushes: [number, number, number] = [p0, p1, p2];
            const miss = resolveSpin('BELL', pushes, order, true);
            const hazure = resolveSpin('NONE', pushes, order);
            if (
              miss.positions[0] !== hazure.positions[0] ||
              miss.positions[1] !== hazure.positions[1] ||
              miss.positions[2] !== hazure.positions[2]
            ) {
              throw new Error(
                `こぼし目とハズレ目の不一致: order=${order} pushes=${pushes} miss=${miss.positions} hazure=${hazure.positions}`,
              );
            }
          }
        }
      }
    }
  });

  it('表示役ベルは停止形に依らず calcPayout で 13 枚、こぼしは 0 枚(確定 35)', () => {
    // 左第一停止(順押し)+ 揃い(1/13)= 上段ベル 13 枚
    const top = resolveSpin('BELL', [0, 0, 0], [0, 1, 2]);
    expect(top.lines).toEqual(['TOP']);
    expect(calcPayout(top.displayed, true).payout).toBe(13);
    // 左第一停止 + こぼし(12/13)= ハズレ目 0 枚
    const miss = resolveSpin('BELL', [0, 0, 0], [0, 1, 2], true);
    expect(miss.displayed).toBe('NONE');
    expect(calcPayout(miss.displayed, true).payout).toBe(0);
    // 中・右第一停止(押し順正解)= 斜めベル 13 枚
    for (const order of PUSH_ORDERS.filter((o) => o[0] !== 0)) {
      const success = resolveSpin('BELL', [0, 0, 0], order);
      expect(DIAGONAL_LINES.includes(success.lines[0])).toBe(true);
      expect(calcPayout(success.displayed, true).payout).toBe(13);
    }
  });

  it('resolveSpin の lines は judgeDisplayDetail と一致する', () => {
    for (const wonRole of ['NONE', 'REPLAY', 'BELL'] as const) {
      for (const order of PUSH_ORDERS) {
        for (let p = 0; p < KOMA_COUNT; p++) {
          const result = resolveSpin(wonRole, [p, (p + 7) % 20, (p + 13) % 20], order);
          const detail = judgeDisplayDetail(result.positions, wonRole);
          expect(result.displayed).toBe(detail.role);
          expect(result.lines).toEqual(detail.lines);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 停止制御 II(STEP 1d: レア役 = チェリー / スイカ / チャンス目の網羅検証)
// ---------------------------------------------------------------------------

/** 出目が「クリーン」か(どのラインにも 3 つ揃いがなく、左リール窓内にチェリーもない) */
function isCleanMiss(positions: StopPositions): boolean {
  return alignedLines(positions).length === 0 && !windowAt(0, positions[0]).includes('CHERRY');
}

/**
 * positions がスイカの合法な当選形か(スイカのみが揃い、左窓チェリーなし)。
 * 揃いは常に 1 ラインのみ(配列上、窓内にスイカが 2 個表示されるリールがないため)。
 * 戻り値は揃ったライン(合法でなければ undefined)
 */
function watermelonWinLine(positions: StopPositions): LineId | undefined {
  const aligned = alignedLines(positions);
  if (aligned.length !== 1 || aligned[0][1] !== 'WATERMELON') return undefined;
  if (windowAt(0, positions[0]).includes('CHERRY')) return undefined;
  return aligned[0][0];
}

/** チャンス目の停止形(スイカテンパイはずし目)か */
function isTenpaiHazushi(positions: StopPositions): boolean {
  return watermelonTenpai(positions) && isCleanMiss(positions);
}

/** 最終停止リールの押下位置から MAX_SLIP 以内の各停止候補で作れる出目を列挙する */
function lastReelCandidates(
  positions: StopPositions,
  lastReel: ReelIndex,
  lastPush: number,
): StopPositions[] {
  const out: StopPositions[] = [];
  for (let slip = 0; slip <= MAX_SLIP; slip++) {
    const candidate = positions.slice() as StopPositions;
    candidate[lastReel] = (lastPush + slip) % KOMA_COUNT;
    out.push(candidate);
  }
  return out;
}

describe('停止制御 II(STEP 1d: レア役 × 全 20^3 押下位置 × 押し順 6 通りの網羅検証)', () => {
  it('角チェリー: 引き込める押下位置では必ず左リール上段 or 下段に停止し、不可なら取りこぼし', () => {
    for (const order of PUSH_ORDERS) {
      for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
        const reachable = canReachCornerCherry(p0);
        for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
          for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
            const pushes: [number, number, number] = [p0, p1, p2];
            const result = resolveSpin('CHERRY_CORNER', pushes, order);
            assertSlipWithinLimit('CHERRY_CORNER', order, pushes, result.positions);
            // チェリーはライン役でないため、どの図柄の 3 つ揃いも禁止出目
            if (alignedLines(result.positions).length > 0) {
              throw new Error(
                `角チェリーで図柄が揃った: order=${order} pushes=${pushes} positions=${result.positions}`,
              );
            }
            const window = windowAt(0, result.positions[0]);
            if (reachable) {
              // 上段 or 下段にチェリー(中段チェリーは禁止出目)
              if (result.displayed !== 'CHERRY_CORNER' || window[1] === 'CHERRY') {
                throw new Error(
                  `角チェリー引き込み失敗: order=${order} pushes=${pushes} positions=${result.positions} displayed=${result.displayed} window=${window}`,
                );
              }
              expect(window[0] === 'CHERRY' || window[2] === 'CHERRY').toBe(true);
            } else if (result.displayed !== 'NONE' || window.includes('CHERRY')) {
              throw new Error(
                `角チェリー取りこぼし時の出目不正: order=${order} pushes=${pushes} positions=${result.positions} displayed=${result.displayed}`,
              );
            }
          }
        }
      }
    }
  });

  it('中段チェリー: 引き込める押下位置では必ず左リール中段に停止し、不可なら取りこぼし', () => {
    for (const order of PUSH_ORDERS) {
      for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
        const reachable = canReachCenterCherry(p0);
        for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
          for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
            const pushes: [number, number, number] = [p0, p1, p2];
            const result = resolveSpin('CHERRY_CENTER', pushes, order);
            assertSlipWithinLimit('CHERRY_CENTER', order, pushes, result.positions);
            if (alignedLines(result.positions).length > 0) {
              throw new Error(
                `中段チェリーで図柄が揃った: order=${order} pushes=${pushes} positions=${result.positions}`,
              );
            }
            const window = windowAt(0, result.positions[0]);
            if (reachable) {
              // 中段にチェリー(角チェリーは禁止出目)
              if (result.displayed !== 'CHERRY_CENTER' || window[1] !== 'CHERRY') {
                throw new Error(
                  `中段チェリー引き込み失敗: order=${order} pushes=${pushes} positions=${result.positions} displayed=${result.displayed} window=${window}`,
                );
              }
            } else if (result.displayed !== 'NONE' || window.includes('CHERRY')) {
              throw new Error(
                `中段チェリー取りこぼし時の出目不正: order=${order} pushes=${pushes} positions=${result.positions} displayed=${result.displayed}`,
              );
            }
          }
        }
      }
    }
  });

  // スイカの揃い方向(弱=斜め優先 / 強=平行優先)は、最終停止リールの押下時点で
  // 「優先方向に揃えられるのに劣後方向へ揃えた / 揃えられるのに取りこぼした」が
  // 起きないことを全域で検証する(第一・第二停止時点の最適性は expectedRank の
  // 方策評価が担い、押し順別の成功数・方向内訳の固定値テストで回帰を検出する)。
  for (const [role, preferDiagonal] of [
    ['WATERMELON_WEAK', true],
    ['WATERMELON_STRONG', false],
  ] as const) {
    const label = role === 'WATERMELON_WEAK' ? '弱スイカ(斜め優先)' : '強スイカ(平行優先)';
    it(`${label}: 全域で出目が合法、最終停止で優先方向・引き込みを最大化する`, () => {
      for (const order of PUSH_ORDERS) {
        const lastReel = order[2];
        for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
          for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
            for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
              const pushes: [number, number, number] = [p0, p1, p2];
              const result = resolveSpin(role, pushes, order);
              assertSlipWithinLimit(role, order, pushes, result.positions);
              const winLine = watermelonWinLine(result.positions);
              if (result.displayed === role) {
                if (winLine === undefined) {
                  throw new Error(
                    `スイカ当選形が不正: role=${role} order=${order} pushes=${pushes} positions=${result.positions}`,
                  );
                }
              } else if (result.displayed !== 'NONE' || !isCleanMiss(result.positions)) {
                throw new Error(
                  `スイカ取りこぼし時の出目不正: role=${role} order=${order} pushes=${pushes} positions=${result.positions} displayed=${result.displayed}`,
                );
              }
              // 最終停止リールの押下位置に対する局所最適性
              const candidates = lastReelCandidates(
                result.positions,
                lastReel,
                pushes[lastReel],
              );
              const canWin = (diagonal: boolean) =>
                candidates.some((c) => {
                  const line = watermelonWinLine(c);
                  return line !== undefined && DIAGONAL_LINES.includes(line) === diagonal;
                });
              if (winLine === undefined) {
                if (canWin(true) || canWin(false)) {
                  throw new Error(
                    `最終停止で揃えられるのに取りこぼした: role=${role} order=${order} pushes=${pushes} positions=${result.positions}`,
                  );
                }
              } else if (
                DIAGONAL_LINES.includes(winLine) !== preferDiagonal &&
                canWin(preferDiagonal)
              ) {
                throw new Error(
                  `最終停止で優先方向に揃えられるのに劣後方向へ揃えた: role=${role} order=${order} pushes=${pushes} positions=${result.positions} line=${winLine}`,
                );
              }
            }
          }
        }
      }
    });
  }

  it('スイカの押し順別の成功数と揃い方向の内訳(全 8000 押下位置。回帰検出用の固定値)', () => {
    // 弱・強とも成功数は同じ(優先方向にこだわって取りこぼすことはない)で、
    // 方向の内訳だけが入れ替わる。中・右スイカは最大間隔 15 コマのため取りこぼしが残る
    // (取りこぼし許容。SPEC「3.」確定事項)
    const counts = (role: Role) => {
      const out: Record<string, [number, number, number]> = {};
      for (const order of PUSH_ORDERS) {
        let win = 0;
        let diagonal = 0;
        let parallel = 0;
        for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
          for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
            for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
              const result = resolveSpin(role, [p0, p1, p2], order);
              if (result.displayed !== role) continue;
              win++;
              if (DIAGONAL_LINES.includes(result.lines[0])) diagonal++;
              else parallel++;
            }
          }
        }
        out[order.join('')] = [win, diagonal, parallel];
      }
      return out;
    };
    expect(counts('WATERMELON_WEAK')).toEqual({
      '012': [2200, 2000, 200],
      '021': [2400, 2000, 400],
      '102': [2300, 2000, 300],
      '120': [2600, 2100, 500],
      '201': [2400, 2200, 200],
      '210': [2520, 2020, 500],
    });
    expect(counts('WATERMELON_STRONG')).toEqual({
      '012': [2200, 200, 2000],
      '021': [2400, 400, 2000],
      '102': [2300, 0, 2300],
      '120': [2600, 300, 2300],
      '201': [2400, 100, 2300],
      '210': [2520, 500, 2020],
    });
  });

  it('チャンス目: スイカテンパイはずし目を作り、テンパイを作れない押下位置はクリーンな取りこぼし', () => {
    for (const order of PUSH_ORDERS) {
      const lastReel = order[2];
      for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
        for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
          for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
            const pushes: [number, number, number] = [p0, p1, p2];
            const result = resolveSpin('CHANCE_ME', pushes, order);
            assertSlipWithinLimit('CHANCE_ME', order, pushes, result.positions);
            // スイカ含めどの図柄も揃えない・左窓チェリーも出さない(全域で不変)
            if (!isCleanMiss(result.positions)) {
              throw new Error(
                `チャンス目で禁止出目: order=${order} pushes=${pushes} positions=${result.positions}`,
              );
            }
            const tenpai = watermelonTenpai(result.positions);
            if (result.displayed !== (tenpai ? 'CHANCE_ME' : 'NONE')) {
              throw new Error(
                `チャンス目の表示役不一致: order=${order} pushes=${pushes} positions=${result.positions} displayed=${result.displayed} tenpai=${tenpai}`,
              );
            }
            // 最終停止でテンパイを作れるのに作らなかった取りこぼしがない(局所最適性)
            if (
              !tenpai &&
              lastReelCandidates(result.positions, lastReel, pushes[lastReel]).some(
                isTenpaiHazushi,
              )
            ) {
              throw new Error(
                `最終停止でテンパイを作れるのに取りこぼした: order=${order} pushes=${pushes} positions=${result.positions}`,
              );
            }
          }
        }
      }
    }
  });

  it('チャンス目: スイカを揃えられる押下位置では必ずテンパイはずし目になる(引き込める位置でも引き込まない)', () => {
    // 「スイカを引き込める状態だが引き込まない」(SPEC「3.」挙動表)の全域検証:
    // 同じ押下位置・押し順で弱 or 強スイカ当選なら揃う押下位置は、
    // チャンス目当選ではテンパイはずし目(CHANCE_ME 表示)になる
    for (const order of PUSH_ORDERS) {
      for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
        for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
          for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
            const pushes: [number, number, number] = [p0, p1, p2];
            const weakWin =
              resolveSpin('WATERMELON_WEAK', pushes, order).displayed === 'WATERMELON_WEAK';
            const strongWin =
              resolveSpin('WATERMELON_STRONG', pushes, order).displayed === 'WATERMELON_STRONG';
            if (!weakWin && !strongWin) continue;
            const chance = resolveSpin('CHANCE_ME', pushes, order);
            if (chance.displayed !== 'CHANCE_ME') {
              throw new Error(
                `スイカを揃えられる押下位置でチャンス目がテンパイはずしにならない: order=${order} pushes=${pushes} positions=${chance.positions}`,
              );
            }
          }
        }
      }
    }
  });

  it('チャンス目の押し順別のテンパイはずし成功数(全 8000 押下位置。回帰検出用の固定値)', () => {
    const counts: Record<string, number> = {};
    for (const order of PUSH_ORDERS) {
      let win = 0;
      for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
        for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
          for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
            if (resolveSpin('CHANCE_ME', [p0, p1, p2], order).displayed === 'CHANCE_ME') win++;
          }
        }
      }
      counts[order.join('')] = win;
    }
    expect(counts).toEqual({
      '012': 6560,
      '021': 6560,
      '102': 6620,
      '120': 6640,
      '201': 6560,
      '210': 6640,
    });
  });

  it('代表例: 同一押下位置で弱=斜め / 強=平行に作り分ける(順押し [0, 0, 5])', () => {
    const weak = resolveSpin('WATERMELON_WEAK', [0, 0, 5], [0, 1, 2]);
    expect(weak.displayed).toBe('WATERMELON_WEAK');
    expect(weak.positions).toEqual([0, 0, 7]);
    expect(weak.lines).toEqual(['UP_RIGHT']); // 斜め(右上がり)
    const strong = resolveSpin('WATERMELON_STRONG', [0, 0, 5], [0, 1, 2]);
    expect(strong.displayed).toBe('WATERMELON_STRONG');
    expect(strong.positions).toEqual([0, 1, 9]);
    expect(strong.lines).toEqual(['BOTTOM']); // 平行(下段)
  });

  it('代表例: チェリーの停止段の作り分け(左押下位置 3)と payout 配線', () => {
    // 角チェリー: 左停止位置 6 = コマ 8 のチェリーが上段(窓 [チェリー, リプレイ, ベル])
    const corner = resolveSpin('CHERRY_CORNER', [3, 0, 0], [0, 1, 2]);
    expect(corner.displayed).toBe('CHERRY_CORNER');
    expect(corner.positions[0]).toBe(6);
    expect(windowAt(0, 6)).toEqual(['CHERRY', 'REPLAY', 'BELL']);
    expect(calcPayout(corner.displayed, true).payout).toBe(2);
    // 中段チェリー: 同じ押下位置でも左停止位置 7 = コマ 8 のチェリーが中段
    const center = resolveSpin('CHERRY_CENTER', [3, 0, 0], [0, 1, 2]);
    expect(center.displayed).toBe('CHERRY_CENTER');
    expect(center.positions[0]).toBe(7);
    expect(komaAt(0, 7)).toBe('CHERRY');
    expect(calcPayout(center.displayed, true).payout).toBe(2);
    // 取りこぼし(左押下位置 15 はチェリー到達不可)
    expect(canReachCornerCherry(15)).toBe(false);
    const miss = resolveSpin('CHERRY_CORNER', [15, 0, 0], [0, 1, 2]);
    expect(miss.displayed).toBe('NONE');
    expect(calcPayout(miss.displayed, true).payout).toBe(0);
  });

  it('代表例: チャンス目のテンパイはずし目と payout 配線(順押し [0, 0, 3])', () => {
    const chance = resolveSpin('CHANCE_ME', [0, 0, 3], [0, 1, 2]);
    expect(chance.displayed).toBe('CHANCE_ME');
    expect(chance.positions).toEqual([0, 0, 3]);
    expect(watermelonTenpai(chance.positions)).toBe(true);
    expect(linesWithSymbol(chance.positions, 'WATERMELON')).toEqual([]);
    expect(calcPayout(chance.displayed, true).payout).toBe(3);
    // 同じ出目でも内部当選がチャンス目でなければ表示役は NONE(判定は当選役ゲート)
    expect(judgeDisplay(chance.positions)).toBe('NONE');
    // スイカ払出との整合(弱・強スイカ揃い時は 3 枚)
    const weak = resolveSpin('WATERMELON_WEAK', [0, 0, 3], [0, 1, 2]);
    expect(weak.displayed).toBe('WATERMELON_WEAK');
    expect(calcPayout(weak.displayed, true).payout).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 停止制御 III(STEP 1e: リーチ目 7 揃い + DDT + 総合網羅検証)
// ---------------------------------------------------------------------------

/**
 * positions がリーチ目の合法な当選形か(赤7 のみが揃い、左窓チェリーなし)。
 * 戻り値は揃ったライン(合法でなければ undefined)
 */
function reachWinLine(positions: StopPositions): LineId | undefined {
  const aligned = alignedLines(positions);
  if (aligned.length !== 1 || aligned[0][1] !== 'SEVEN_RED') return undefined;
  if (windowAt(0, positions[0]).includes('CHERRY')) return undefined;
  return aligned[0][0];
}

describe('停止制御 III(STEP 1e: リーチ目 × 全 20^3 押下位置 × 押し順 6 通りの網羅検証)', () => {
  it('リーチ目: 3 リールとも赤7 を狙えば(目押し成功)必ずいずれかの有効ラインに 7 揃い', () => {
    // 「狙えば揃う」(SPEC「3.」挙動表・回答 14)の全域検証。
    // 狙った押下位置 = 赤7 を中段へ引き込める位置(各リール 5 箇所)× 押し順 6 通り
    const aims = REEL_INDEXES.map((reel) =>
      ALL_POSITIONS.filter((p) => isSevenAimedPush(reel, p)),
    );
    for (const reel of REEL_INDEXES) expect(aims[reel]).toHaveLength(MAX_SLIP + 1);
    for (const order of PUSH_ORDERS) {
      for (const p0 of aims[0]) {
        for (const p1 of aims[1]) {
          for (const p2 of aims[2]) {
            const pushes: [number, number, number] = [p0, p1, p2];
            const result = resolveSpin('REACH_ME', pushes, order);
            if (result.displayed !== 'REACH_ME' || result.lines.length === 0) {
              throw new Error(
                `目押し成功なのに 7 揃いしない: order=${order} pushes=${pushes} positions=${result.positions} displayed=${result.displayed}`,
              );
            }
          }
        }
      }
    }
  });

  it('リーチ目: 全域で出目が合法、引き込めない押下位置は取りこぼし(代替リーチ目停止なし)', () => {
    for (const order of PUSH_ORDERS) {
      const lastReel = order[2];
      for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
        for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
          for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
            const pushes: [number, number, number] = [p0, p1, p2];
            const result = resolveSpin('REACH_ME', pushes, order);
            assertSlipWithinLimit('REACH_ME', order, pushes, result.positions);
            if (result.displayed === 'REACH_ME') {
              if (reachWinLine(result.positions) === undefined) {
                throw new Error(
                  `リーチ目当選形が不正: order=${order} pushes=${pushes} positions=${result.positions}`,
                );
              }
            } else if (result.displayed !== 'NONE' || !isCleanMiss(result.positions)) {
              // 取りこぼし = クリーンなハズレ目(代替リーチ目停止・チェリー等の代用出目なし)
              throw new Error(
                `リーチ目取りこぼし時の出目不正: order=${order} pushes=${pushes} positions=${result.positions} displayed=${result.displayed}`,
              );
            }
            // 最終停止リールで 7 揃いを完成できるのに取りこぼさない(局所最適性)
            if (
              result.displayed === 'NONE' &&
              lastReelCandidates(result.positions, lastReel, pushes[lastReel]).some(
                (c) => reachWinLine(c) !== undefined,
              )
            ) {
              throw new Error(
                `最終停止で 7 揃いを完成できるのに取りこぼした: order=${order} pushes=${pushes} positions=${result.positions}`,
              );
            }
          }
        }
      }
    }
  });

  it('リーチ目の押し順別の成功数(全 8000 押下位置。回帰検出用の固定値)', () => {
    // 赤7 は各リール 1 個(最大間隔 20 コマ)のため、狙わない限りほぼ取りこぼす。
    // 成功数 > 5^3 = 125 なのは、中段引き込み不可でも上下段経由で有効ラインに
    // 引き込める押下位置があるため(「引き込めない位置で押した場合」のみ取りこぼし)
    const counts: Record<string, number> = {};
    for (const order of PUSH_ORDERS) {
      let win = 0;
      for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
        for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
          for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
            if (resolveSpin('REACH_ME', [p0, p1, p2], order).displayed === 'REACH_ME') win++;
          }
        }
      }
      counts[order.join('')] = win;
    }
    expect(counts).toEqual({
      '012': 185,
      '021': 195,
      '102': 225,
      '120': 225,
      '201': 195,
      '210': 185,
    });
  });

  it('代表例: 目押し成功で 7 揃い 3 枚、外すと取りこぼし 0 枚(payout 配線)', () => {
    // 目押し成功(順押し): 全リール中段に赤7(左コマ17・中コマ3・右コマ12)
    const win = resolveSpin('REACH_ME', [14, 0, 9], [0, 1, 2]);
    expect(win.displayed).toBe('REACH_ME');
    expect(win.positions).toEqual([16, 2, 11]);
    expect(win.lines).toEqual(['MIDDLE']);
    expect(calcPayout(win.displayed, true).payout).toBe(3);
    // 押し順が変わっても目押し成功なら揃う(逆押し)
    const winReverse = resolveSpin('REACH_ME', [16, 2, 11], [2, 1, 0]);
    expect(winReverse.displayed).toBe('REACH_ME');
    // 目押し外し(押下位置 [0, 0, 0] はどのリールも赤7 に届かない)
    expect(isSevenAimedPush(0, 0)).toBe(false);
    const miss = resolveSpin('REACH_ME', [0, 0, 0], [0, 1, 2]);
    expect(miss.displayed).toBe('NONE');
    expect(isCleanMiss(miss.positions)).toBe(true);
    expect(calcPayout(miss.displayed, true).payout).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// DDT(左リール黒バー狙い。STEP 1e。SPEC「3.」確定事項・回答 6)
// ---------------------------------------------------------------------------

/**
 * 左第一停止の押し順(順押し・ハサミ押し)。
 * DDT は左リールへ黒バーを狙う打法のため、強い保証(黒バーが必ず窓内・下段付近)は
 * 左第一停止に限って検証する。左リールを後に止める押し順では、停止済みリールとの
 * 蹴飛ばし制約(非当選図柄を揃えない)が優先され、黒バー停止候補が禁止出目になる
 * 押下位置が存在する(DDT 選好は蹴飛ばし・引き込みより弱い評価キーのため正しい挙動)。
 */
const LEFT_FIRST_ORDERS = PUSH_ORDERS.filter((order) => order[0] === 0);

describe('DDT(左リール黒バー狙い = チェリー・スイカ察知打法。STEP 1e)', () => {
  // 黒バーは左リール 1 個(コマ 19 = index 18)。「黒バー狙い」= 黒バーを窓内へ
  // 引き込める押下位置 14〜18(index)。窓内の停止段は 停止位置 17=上段 / 18=中段 / 19=下段
  it('ハズレ: 黒バー狙い(押下位置 15〜18)では黒バーが下段に停止する(左第一停止・全押下位置)', () => {
    for (const order of LEFT_FIRST_ORDERS) {
      for (let p0 = 15; p0 <= 18; p0++) {
        for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
          for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
            const result = resolveSpin('NONE', [p0, p1, p2], order);
            if (result.positions[0] !== 19) {
              throw new Error(
                `ハズレの黒バー下段停止でない: order=${order} p0=${p0} p1=${p1} p2=${p2} positions=${result.positions}`,
              );
            }
          }
        }
      }
    }
    expect(windowAt(0, 19)).toEqual(['BELL', 'WATERMELON', 'BAR_BLACK']);
  });

  it('ハズレ・リプレイ: 黒バーを窓内へ引き込める押下位置(14〜18)では黒バーが窓内に表示される(左第一停止)', () => {
    for (const role of ['NONE', 'REPLAY'] as const) {
      for (const order of LEFT_FIRST_ORDERS) {
        for (let p0 = 14; p0 <= 18; p0++) {
          for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
            for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
              const result = resolveSpin(role, [p0, p1, p2], order);
              if (!windowAt(0, result.positions[0]).includes('BAR_BLACK')) {
                throw new Error(
                  `黒バーが窓外: role=${role} order=${order} p0=${p0} p1=${p1} p2=${p2} positions=${result.positions}`,
                );
              }
            }
          }
        }
      }
    }
  });

  it('チェリー成立時: チェリーを窓内へ引き込める押下位置(12・13)ではチェリー停止で察知できる', () => {
    // 黒バー狙いの少し手前(押下位置 12・13)ならチェリー(コマ 13)を窓内へ引き込める。
    // 押下位置 14 以降は左チェリーが物理的に届かないため取りこぼし(黒バー停止のまま)
    expect(resolveSpin('CHERRY_CORNER', [13, 0, 0], [0, 1, 2]).displayed).toBe('CHERRY_CORNER');
    expect(resolveSpin('CHERRY_CENTER', [12, 0, 0], [0, 1, 2]).displayed).toBe('CHERRY_CENTER');
    // 取りこぼし側(押下位置 15)は黒バー下段停止のまま
    const missCorner = resolveSpin('CHERRY_CORNER', [15, 0, 0], [0, 1, 2]);
    expect(missCorner.displayed).toBe('NONE');
    expect(missCorner.positions[0]).toBe(19);
  });

  it('スイカ成立時: 黒バー狙い(押下位置 14〜18)ではスイカが窓内へスベって察知できる(左第一停止)', () => {
    // 左リールはスイカ 100% 引き込み配置(コマ 15・20 が黒バー周辺)のため、
    // 黒バー狙いでもスイカ成立時は必ず左窓内にスイカが表示される
    for (const role of ['WATERMELON_WEAK', 'WATERMELON_STRONG'] as const) {
      for (const order of LEFT_FIRST_ORDERS) {
        for (let p0 = 14; p0 <= 18; p0++) {
          for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
            for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
              const result = resolveSpin(role, [p0, p1, p2], order);
              if (!windowAt(0, result.positions[0]).includes('WATERMELON')) {
                throw new Error(
                  `スイカが左窓外: role=${role} order=${order} p0=${p0} p1=${p1} p2=${p2} positions=${result.positions}`,
                );
              }
            }
          }
        }
      }
    }
  });

  it('黒バー狙いでない押下位置では選好が働かない(ハズレはスベリ最小で停止)', () => {
    // 押下位置 0(黒バーに届かない)のハズレ: 停止位置 0(スベリ 0)のまま
    const result = resolveSpin('NONE', [0, 0, 0], [0, 1, 2]);
    expect(result.positions[0]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 総合網羅検証(STEP 1e 総仕上げ: 全役共通の不変条件)
// ---------------------------------------------------------------------------

describe('停止制御 総合(全役 × 全 20^3 押下位置 × 押し順 6 通りの共通不変条件)', () => {
  // 役別の停止形の正しさは 1c〜1e の各 describe が担う。ここでは全役横断で
  // 「スベリ 4 コマ以内」「非当選図柄をどの有効ラインにも揃えない」
  // 「取りこぼし・ハズレはクリーンなハズレ目」を検証する(旧・skip テストの置換)
  for (const wonRole of ROLES) {
    it(`当選役 ${wonRole}: スベリ 4 コマ以内・非当選図柄を揃えない・取りこぼしはクリーン`, () => {
      const wonSymbol =
        wonRole in LINE_ROLE_SYMBOL ? LINE_ROLE_SYMBOL[wonRole as LineRoleKey] : undefined;
      for (const order of PUSH_ORDERS) {
        for (let p0 = 0; p0 < KOMA_COUNT; p0++) {
          for (let p1 = 0; p1 < KOMA_COUNT; p1++) {
            for (let p2 = 0; p2 < KOMA_COUNT; p2++) {
              const pushes: [number, number, number] = [p0, p1, p2];
              const { positions, displayed } = resolveSpin(wonRole, pushes, order);
              assertSlipWithinLimit(wonRole, order, pushes, positions);
              // 非当選図柄の 3 つ揃いはどの有効ラインにも出ない
              const badAligned = alignedLines(positions).filter(([, s]) => s !== wonSymbol);
              if (badAligned.length > 0) {
                throw new Error(
                  `非当選図柄が揃った: role=${wonRole} order=${order} pushes=${pushes} positions=${positions} aligned=${JSON.stringify(badAligned)}`,
                );
              }
              // 取りこぼし・ハズレ(表示役 NONE)はクリーンなハズレ目
              if (displayed === 'NONE' && !isCleanMiss(positions)) {
                throw new Error(
                  `取りこぼし時の出目が不正: role=${wonRole} order=${order} pushes=${pushes} positions=${positions}`,
                );
              }
              // チェリー非当選時に左窓へチェリーが見えるのは 100% 引き込み役の完成形と同時のみ
              if (
                wonRole !== 'CHERRY_CORNER' &&
                wonRole !== 'CHERRY_CENTER' &&
                windowAt(0, positions[0]).includes('CHERRY') &&
                !(displayed === wonRole && (wonRole === 'BELL' || wonRole === 'REPLAY'))
              ) {
                throw new Error(
                  `チェリー非当選時に左窓チェリー: role=${wonRole} order=${order} pushes=${pushes} positions=${positions} displayed=${displayed}`,
                );
              }
            }
          }
        }
      }
    });
  }
});

type LineRoleKey = keyof typeof LINE_ROLE_SYMBOL;

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
