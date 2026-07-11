import type { Role } from './roles';

/**
 * リール配列と停止制御。
 *
 * 【STEP 1a 完了】図柄 8 種 + Excel 仕様の 20 コマ配列(docs/SPEC.md「3.」)へ差し替え済み。
 * 【STEP 1b 完了】表示判定(judgeDisplay / judgeDisplayDetail)を有効ライン 5 本
 * (上段・中段・下段・右下がり・右上がり。SPEC「3.」確定事項)対応へ書き直し済み。
 * 【STEP 1c 完了】停止制御(resolveStop)を 5 ライン対応の新エンジンへ書き直し済み。
 *
 * 【停止制御の方式(STEP 1c で選定)】「探索方式」を採用(役別停止テーブル方式は不採用)。
 * - 各リール停止時にスベリ 0〜4 の 5 候補を評価し、
 *   「その位置に止めたとき、残りリールが【どの押下位置・どの停止順でも】
 *    許容出目に到達できるか」を再帰的に判定して選ぶ(guaranteedQuality。メモ化済み)。
 * - 許容出目の分類(classifyFinal): 当選役の停止形完成(WIN)> 取りこぼし(LOSS)>
 *   禁止出目(ILLEGAL = 非当選図柄の 3 つ揃い / チェリー非当選時の左窓チェリー等)。
 * - テーブル方式にしなかった理由: 20^3 × 役 × 押し順のテーブルは手作成・保守が非現実的で、
 *   探索方式なら配列変更時も網羅テスト(reel.test.ts)の再実行だけで正しさを担保できる。
 * - SPEC「3.」リール挙動表との対応(1c 実装分):
 *   - ハズレ: 5 ラインのいずれにも図柄を揃えず、左リール窓内にチェリーも出さない
 *   - リプレイ: 全押し順・全押下位置から 100% 引き込み(網羅テストで検証)。
 *     1c 時点では左リプレイ最大間隔 6 コマの制約により、左リールを「最後に」止める
 *     押し順([中→右→左]・[右→中→左])で理論限界の取りこぼしが発生していたが、
 *     2026-07-11 のユーザー指示で左リール コマ 14 をブランク → リプレイへ配列変更し
 *     (最大間隔 6 → 5 コマ)、全押し順で 100% 引き込み可能となった
 *   - 押し順ベル: 左第一停止=上段揃い 1 枚 / 中・右第一停止=斜め揃い 13 枚
 *     (第一停止リールは pushOrder 引数の先頭で判定)
 * - レア役(チェリー / スイカ / チャンス目 / リーチ目)は暫定実装
 *   (引き込めれば任意ラインへ引き込み、不可なら取りこぼし。STEP 1d〜1e で挙動を確定)。
 * - 例外として、100% 引き込み役(ベル・リプレイ)の完成形と同時に左窓へチェリーが
 *   見える停止は許容する(代替停止が無い押下位置があるため。表示判定はライン役優先)。
 *   同品質の候補が複数あればチェリー非表示 > スベリ最小で選ぶ。
 * - チェリーは左リール限定で、角(上段・下段)=角チェリー / 中段=中段チェリー。
 * - 回転アニメーションは UI 層の責務。本モジュールは「押下位置 → 停止位置」の純関数のみ持つ。
 */

/** リール図柄 8 種(SPEC「3.」: 赤7 / 黒バー / 白バー / ベル / スイカ / チェリー / リプレイ / ブランク) */
export const REEL_SYMBOLS = [
  'SEVEN_RED',
  'BAR_BLACK',
  'BAR_WHITE',
  'BELL',
  'WATERMELON',
  'CHERRY',
  'REPLAY',
  'BLANK',
] as const;

export type ReelSymbol = (typeof REEL_SYMBOLS)[number];

export const REEL_COUNT = 3;
export const KOMA_COUNT = 20;
/** 最大スベリ(引き込み)コマ数 */
export const MAX_SLIP = 4;

export type ReelIndex = 0 | 1 | 2;
export const REEL_INDEXES: readonly ReelIndex[] = [0, 1, 2];

const R7 = 'SEVEN_RED';
const BB = 'BAR_BLACK';
const WB = 'BAR_WHITE';
const BE = 'BELL';
const WM = 'WATERMELON';
const CH = 'CHERRY';
const RP = 'REPLAY';
const BL = 'BLANK';

/**
 * リール配列(Excel 仕様 docs/SPEC.md「3.」の 20 コマ配列)。[左, 中, 右]
 *
 * 【Excel からの変更(2026-07-11 ユーザー指示)】左リール コマ 14: ブランク → リプレイ。
 * 変則押し(左リールを最後に止める押し順)でリプレイを取りこぼす問題への対処で、
 * 左リプレイの最大間隔が 6 → 5 コマになり全押し順で 100% 引き込み可能となる
 * (SPEC「3. 配列分析」参照)。
 *
 * 【コマ番号と配列 index の対応規約】
 * SPEC の表は「コマ番号 20 → 1 の降順」(リール帯を上から見た並び)で記載されている。
 * 本配列は index 0 = コマ番号 1、index 19 = コマ番号 20 の昇順で持つ(index = コマ番号 - 1)。
 * リールは下方向に回転し index 0 → 1 → 2 … の順に中段を通過するため、
 * 停止位置 p の窓は「上段 = index p+1 / 中段 = index p / 下段 = index p-1」となり、
 * SPEC の表の見た目(コマ番号が大きいほど上)と窓の並びが一致する。
 */
export const REEL_LAYOUT: readonly (readonly ReelSymbol[])[] = [
  // 左リール(コマ 1 → 20。コマ 14 はブランク → リプレイへ変更済み)
  [BE, RP, RP, BL, WM, BE, RP, CH, WB, WM, BE, RP, CH, RP, WM, BE, R7, RP, BB, WM],
  // 中リール(コマ 1 → 20)
  [WM, BE, R7, RP, BE, WM, BE, WB, RP, BE, CH, BE, RP, RP, BE, CH, BE, BB, RP, BE],
  // 右リール(コマ 1 → 20)
  [CH, WB, BE, RP, RP, CH, BL, BE, WM, RP, CH, R7, BE, WM, RP, CH, BB, BE, RP, RP],
];

/**
 * 停止位置 = 中段に止まるコマ番号。
 * リールは下方向に回転し、コマ番号は 0 → 1 → 2 … の順に中段を通過する
 * (コマ p+1 が上段、p-1 が下段に見える)。
 * 押下位置 p でスベリ s コマなら停止位置は (p + s) % 20。
 */
export function komaAt(reel: ReelIndex, position: number): ReelSymbol {
  return REEL_LAYOUT[reel][((position % KOMA_COUNT) + KOMA_COUNT) % KOMA_COUNT];
}

/** 表示窓(上段・中段・下段)。停止位置 = 中段のコマ番号 */
export function windowAt(reel: ReelIndex, position: number): [ReelSymbol, ReelSymbol, ReelSymbol] {
  return [komaAt(reel, position + 1), komaAt(reel, position), komaAt(reel, position - 1)];
}

// ---------------------------------------------------------------------------
// 有効ライン(SPEC「3.」確定事項: 横 3 本 + 斜め 2 本の 5 ライン)
// ---------------------------------------------------------------------------

/** 窓の段を停止位置からの相対コマ数で表す(+1 = 上段 / 0 = 中段 / -1 = 下段) */
export type RowOffset = -1 | 0 | 1;

export const LINE_IDS = ['TOP', 'MIDDLE', 'BOTTOM', 'DOWN_RIGHT', 'UP_RIGHT'] as const;

/** 有効ライン ID(上段 / 中段 / 下段 / 右下がり / 右上がり) */
export type LineId = (typeof LINE_IDS)[number];

/**
 * 有効ライン定義: 各ラインの [左, 中, 右] リールの段(RowOffset)。
 * 窓 3 段 × 3 リールの座標系で、停止位置 p の窓は上段 = p+1 / 中段 = p / 下段 = p-1
 * (REEL_LAYOUT のコマ番号規約コメント参照)。
 */
export const LINES: Record<LineId, readonly [RowOffset, RowOffset, RowOffset]> = {
  /** 上段(横) */
  TOP: [1, 1, 1],
  /** 中段(横) */
  MIDDLE: [0, 0, 0],
  /** 下段(横) */
  BOTTOM: [-1, -1, -1],
  /** 右下がり(左上段 → 中中段 → 右下段) */
  DOWN_RIGHT: [1, 0, -1],
  /** 右上がり(左下段 → 中中段 → 右上段) */
  UP_RIGHT: [-1, 0, 1],
};

/** 斜めの有効ライン(押し順ベル正解時の停止形 = 13 枚。SPEC「3.」挙動表) */
export const DIAGONAL_LINES: readonly LineId[] = ['DOWN_RIGHT', 'UP_RIGHT'];

/** 停止位置 positions のときにライン line 上へ表示される図柄 [左, 中, 右] */
export function lineSymbols(
  positions: StopPositions,
  line: LineId,
): [ReelSymbol, ReelSymbol, ReelSymbol] {
  const offsets = LINES[line];
  return [
    komaAt(0, positions[0] + offsets[0]),
    komaAt(1, positions[1] + offsets[1]),
    komaAt(2, positions[2] + offsets[2]),
  ];
}

/** 図柄 symbol が 3 つ揃いで表示されている有効ライン(揃いなしなら空配列) */
export function linesWithSymbol(positions: StopPositions, symbol: ReelSymbol): LineId[] {
  return LINE_IDS.filter((line) => lineSymbols(positions, line).every((s) => s === symbol));
}

/** ライン揃いで成立を表現する役 → 構成図柄 */
export const LINE_ROLE_SYMBOL = {
  REPLAY: 'REPLAY',
  BELL: 'BELL',
  WATERMELON_WEAK: 'WATERMELON',
  WATERMELON_STRONG: 'WATERMELON',
  REACH_ME: 'SEVEN_RED',
} as const satisfies Partial<Record<Role, ReelSymbol>>;

type LineRole = keyof typeof LINE_ROLE_SYMBOL;

function isLineRole(role: Role): role is LineRole {
  return role in LINE_ROLE_SYMBOL;
}

/** 左リールの窓内チェリー状態 */
function leftCherryState(position: number): 'none' | 'corner' | 'center' {
  if (komaAt(0, position) === 'CHERRY') return 'center';
  if (komaAt(0, position + 1) === 'CHERRY' || komaAt(0, position - 1) === 'CHERRY') {
    return 'corner';
  }
  return 'none';
}

export type StopPositions = [number, number, number];

/**
 * 押し順ベルの払出区分(payout.ts の bellSuccess)との対応。
 * - 押し順正解(中・右第一停止)= 斜めライン揃い = 13 枚(bellSuccess: true)
 * - 押し順不正解(左第一停止)= 上段(横)揃い = 1 枚(bellSuccess: false)
 * 停止形の作り分けと payout への実配線は STEP 1c(SPEC「3.」挙動表)。
 */
export function bellSuccessFromLines(lines: readonly LineId[]): boolean {
  return lines.some((line) => DIAGONAL_LINES.includes(line));
}

/** 表示役の判定結果(揃ったラインつき) */
export interface DisplayJudge {
  /** 表示役(取りこぼし・ハズレは NONE) */
  role: Role;
  /** role がライン役のとき、その図柄が揃った有効ライン(複数同時揃いあり)。それ以外は空 */
  lines: LineId[];
  /**
   * 押し順ベルの払出区分(role が BELL のときのみ意味を持つ)。
   * 斜め揃い = 押し順正解 13 枚 / 横揃い(上段等)= 不正解 1 枚(bellSuccessFromLines 参照)
   */
  bellSuccess: boolean;
}

/**
 * ライン役の判定優先順位(当選役の図柄を除く固定順)。
 * 複数役が別ラインで同時に揃った場合も表示役は 1 役のみ(払出は 1 役分)で、
 * 内部当選役の図柄 > リーチ目(7 揃い)> リプレイ > ベル の順に採用する。
 * 停止制御(1c〜1e)は非当選役の揃いを蹴飛ばすため、通常この優先順位は
 * 同一役の複数ライン揃いのみで働くが、判定の決定性のため順序を定義しておく。
 */
const LINE_JUDGE_PRIORITY = ['REACH_ME', 'REPLAY', 'BELL'] as const;

/**
 * 全リール停止後の表示役の判定(有効 5 ライン)。
 * - 5 ラインを走査してリプレイ / ベル / スイカ / 赤7(リーチ目)の 3 つ揃いを判定する。
 * - スイカ揃いは弱・強で同一図柄のため、内部当選役(wonRole)で弱・強を区別する。
 *   スイカ非当選時のスイカ揃いは表示役にしない(蹴飛ばしで発生しない前提)。
 * - チェリーはライン非依存で、左リール窓内のチェリーを判定する
 *   (中段=中段チェリー / 上下段=角チェリー)。ライン役が揃っていればそちらが優先。
 * - チャンス目は特定の停止形を持たない(暫定)ため、本関数は返さない。
 *   成立役としてのチャンス目は内部当選(drawRole の結果)側で扱う。
 */
export function judgeDisplayDetail(positions: StopPositions, wonRole: Role = 'NONE'): DisplayJudge {
  // 内部当選役がライン役なら、その図柄の揃いを最優先で採用する(弱・強スイカもここで確定)
  if (isLineRole(wonRole)) {
    const lines = linesWithSymbol(positions, LINE_ROLE_SYMBOL[wonRole]);
    if (lines.length > 0) {
      return {
        role: wonRole,
        lines,
        bellSuccess: wonRole === 'BELL' && bellSuccessFromLines(lines),
      };
    }
  }
  // 非当選図柄の揃い(固定優先順位。スイカは弱・強を区別できないため対象外)
  for (const role of LINE_JUDGE_PRIORITY) {
    if (role === wonRole) continue;
    const lines = linesWithSymbol(positions, LINE_ROLE_SYMBOL[role]);
    if (lines.length > 0) {
      return { role, lines, bellSuccess: role === 'BELL' && bellSuccessFromLines(lines) };
    }
  }
  // ライン役なし → 左リール窓内のチェリー(ライン非依存)
  const cherry = leftCherryState(positions[0]);
  if (cherry === 'center') return { role: 'CHERRY_CENTER', lines: [], bellSuccess: false };
  if (cherry === 'corner') return { role: 'CHERRY_CORNER', lines: [], bellSuccess: false };
  return { role: 'NONE', lines: [], bellSuccess: false };
}

/** 全リール停止後の表示役のみを返す(詳細は judgeDisplayDetail) */
export function judgeDisplay(positions: StopPositions, wonRole: Role = 'NONE'): Role {
  return judgeDisplayDetail(positions, wonRole).role;
}

/** 押下位置から MAX_SLIP コマ以内で図柄 symbol を中段に引き込めるか */
export function canReach(reel: ReelIndex, pushPosition: number, symbol: ReelSymbol): boolean {
  for (let s = 0; s <= MAX_SLIP; s++) {
    if (komaAt(reel, pushPosition + s) === symbol) return true;
  }
  return false;
}

/**
 * 左リールでライン役の図柄を「窓内にチェリーを出さずに」中段へ引き込めるか。
 * 100% 引き込み役(ベル・リプレイ)以外のライン役はチェリー同時表示を蹴飛ばすため、
 * 実際に揃えられるかはこちらで判定する。
 */
export function canReachCleanOnLeft(pushPosition: number, symbol: ReelSymbol): boolean {
  for (let s = 0; s <= MAX_SLIP; s++) {
    const pos = pushPosition + s;
    if (komaAt(0, pos) === symbol && leftCherryState(pos) === 'none') return true;
  }
  return false;
}

/** 左リールで角チェリー(中段チェリーでない)を引き込めるか */
export function canReachCornerCherry(pushPosition: number): boolean {
  for (let s = 0; s <= MAX_SLIP; s++) {
    if (leftCherryState(pushPosition + s) === 'corner') return true;
  }
  return false;
}

/** 左リールで中段チェリーを引き込めるか */
export function canReachCenterCherry(pushPosition: number): boolean {
  for (let s = 0; s <= MAX_SLIP; s++) {
    if (leftCherryState(pushPosition + s) === 'center') return true;
  }
  return false;
}

/** 当選役 role がライン揃いで使う図柄(ライン役でなければ undefined) */
function roleLineSymbol(role: Role): ReelSymbol | undefined {
  return isLineRole(role) ? LINE_ROLE_SYMBOL[role] : undefined;
}

// ---------------------------------------------------------------------------
// 停止制御(STEP 1c: 探索方式 + 到達保証の再帰評価)
// ---------------------------------------------------------------------------

/**
 * 押し順ベルの目標停止形。
 * 左第一停止 = 'TOP'(上段揃い 1 枚)/ 中・右第一停止 = 'DIAGONAL'(斜め揃い 13 枚)。
 * SPEC「3.」リール挙動表。
 */
type BellTarget = 'TOP' | 'DIAGONAL';

/** 全停止形の評価ランク(小さいほど良い。RANK_ILLEGAL は禁止出目) */
const RANK_WIN = 0;
/** 当選形完成だが左窓に非当選チェリーが同時表示(100% 引き込み役のみ許容) */
const RANK_WIN_WITH_CHERRY = 1;
/** 取りこぼし(何も揃えず左窓チェリーなしのクリーンなハズレ目) */
const RANK_LOSS = 50;
const RANK_ILLEGAL = Number.POSITIVE_INFINITY;

/**
 * 全リール停止後の出目を当選役に照らして評価する。
 * - 非当選図柄の 3 つ揃い(どの有効ラインでも)は常に禁止出目(RANK_ILLEGAL)。
 * - チェリー非当選時の左窓チェリーは、100% 引き込み役(ベル・リプレイ)の
 *   完成形と同時のときのみ許容(RANK_WIN_WITH_CHERRY。表示判定はライン役優先)。
 * - 押し順ベルは bellTarget の停止形(上段 or 斜め)以外での揃いを禁止出目とする。
 * - レア役(スイカ / リーチ目 / チェリー)は「引き込めれば任意の有効ラインで WIN /
 *   不可なら RANK_LOSS(取りこぼし)」の暫定実装(STEP 1d〜1e で挙動を確定)。
 * - チャンス目は特定の停止形を持たない暫定のため、ハズレと同じクリーンなハズレ目を要求する。
 */
function classifyFinal(positions: StopPositions, wonRole: Role, bellTarget?: BellTarget): number {
  const wonSymbol = roleLineSymbol(wonRole);
  const cherry = leftCherryState(positions[0]);

  const wonLines: LineId[] = [];
  for (const line of LINE_IDS) {
    const [a, b, c] = lineSymbols(positions, line);
    if (a !== b || b !== c) continue;
    if (a !== wonSymbol) return RANK_ILLEGAL;
    wonLines.push(line);
  }

  if (wonSymbol !== undefined) {
    if (wonLines.length === 0) {
      // 取りこぼし: 何も揃えず左窓にチェリーも出さない
      return cherry === 'none' ? RANK_LOSS : RANK_ILLEGAL;
    }
    if (wonRole === 'BELL') {
      const ok =
        bellTarget === 'DIAGONAL'
          ? wonLines.every((line) => DIAGONAL_LINES.includes(line))
          : wonLines.length === 1 && wonLines[0] === 'TOP';
      if (!ok) return RANK_ILLEGAL;
    }
    if (cherry === 'none') return RANK_WIN;
    return wonRole === 'BELL' || wonRole === 'REPLAY' ? RANK_WIN_WITH_CHERRY : RANK_ILLEGAL;
  }

  // ライン役以外(チェリー / ハズレ / チャンス目)。ライン揃いなしは確認済み
  if (wonRole === 'CHERRY_CORNER') {
    if (cherry === 'corner') return RANK_WIN;
    return cherry === 'none' ? RANK_LOSS : RANK_ILLEGAL;
  }
  if (wonRole === 'CHERRY_CENTER') {
    if (cherry === 'center') return RANK_WIN;
    return cherry === 'none' ? RANK_LOSS : RANK_ILLEGAL;
  }
  // ハズレ / チャンス目(暫定): クリーンなハズレ目のみ許容
  return cherry === 'none' ? RANK_WIN : RANK_ILLEGAL;
}

function memoKey(
  stopped: readonly (number | undefined)[],
  remaining: readonly ReelIndex[],
  wonRole: Role,
  bellTarget: BellTarget | undefined,
): string {
  return `${wonRole}|${bellTarget ?? '-'}|${stopped.map((p) => p ?? 'x').join(',')}|${remaining.join('')}`;
}

const guaranteedRankMemo = new Map<string, number>();

/**
 * 「残りリールがどの押下位置で押されても(最悪ケース)、スベリ 0〜4 の選択(最善ケース)で
 * 到達できる出目ランク」を再帰的に求める。タイミング目押しありのため、
 * 未停止リールの押下位置は制御できない前提で蹴飛ばし可能性を保証する。
 *
 * @param stopped 各リールの停止位置(未停止は undefined)
 * @param remaining 未停止リールの停止順
 */
function guaranteedRank(
  stopped: readonly (number | undefined)[],
  remaining: readonly ReelIndex[],
  wonRole: Role,
  bellTarget: BellTarget | undefined,
): number {
  const key = memoKey(stopped, remaining, wonRole, bellTarget);
  const cached = guaranteedRankMemo.get(key);
  if (cached !== undefined) return cached;

  let result: number;
  if (remaining.length === 0) {
    result = classifyFinal(stopped as StopPositions, wonRole, bellTarget);
  } else {
    const next = remaining[0];
    const rest = remaining.slice(1);
    let worst = 0;
    for (let push = 0; push < KOMA_COUNT && worst !== RANK_ILLEGAL; push++) {
      let best = RANK_ILLEGAL;
      for (let slip = 0; slip <= MAX_SLIP && best !== RANK_WIN; slip++) {
        const nextStopped = stopped.slice();
        nextStopped[next] = (push + slip) % KOMA_COUNT;
        best = Math.min(best, guaranteedRank(nextStopped, rest, wonRole, bellTarget));
      }
      worst = Math.max(worst, best);
    }
    result = worst;
  }
  guaranteedRankMemo.set(key, result);
  return result;
}

const expectedRankMemo = new Map<string, number>();

/**
 * 「残りリールの押下位置が一様ランダムで、以降の停止も本エンジンの方策
 * (pickBestPosition)で選ばれる」と仮定したときの最終出目ランクの期待値(方策評価)。
 * 到達保証ランク(最悪ケース)が同値の候補の優先付けに使う。
 * 最悪ケースが同値の候補間で、実際の押下位置で当選形を完成できる率が高い
 * 停止位置(テンパイ形の維持)を選ぶために用いる。
 * 取りこぼし許容役(スイカ / リーチ目 / チェリー)の引き込み優先もこの評価が担う。
 */
function expectedRank(
  stopped: readonly (number | undefined)[],
  remaining: readonly ReelIndex[],
  wonRole: Role,
  bellTarget: BellTarget | undefined,
): number {
  const key = memoKey(stopped, remaining, wonRole, bellTarget);
  const cached = expectedRankMemo.get(key);
  if (cached !== undefined) return cached;

  let result: number;
  if (remaining.length === 0) {
    result = classifyFinal(stopped as StopPositions, wonRole, bellTarget);
  } else {
    const next = remaining[0];
    const rest = remaining.slice(1);
    let sum = 0;
    for (let push = 0; push < KOMA_COUNT; push++) {
      const position = pickBestPosition(stopped, next, push, rest, wonRole, bellTarget);
      const nextStopped = stopped.slice();
      nextStopped[next] = position;
      sum += expectedRank(nextStopped, rest, wonRole, bellTarget);
    }
    result = sum / KOMA_COUNT;
  }
  expectedRankMemo.set(key, result);
  return result;
}

/**
 * リール reel を押下位置 push で止めるときの停止位置を選ぶ(停止方策の本体)。
 * スベリ 0〜4 の 5 候補を次の優先度で評価する(小さいほど良い辞書式比較):
 * 1. 到達保証ランク(guaranteedRank): 残りリールがどの押下位置でも禁止出目を回避でき、
 *    可能なら当選形を完成できることの保証(最悪ケース評価)
 * 2. 期待ランク(expectedRank): 最悪ケースが同値なら、実際の押下位置で
 *    当選形を完成できる率が高い位置(テンパイ形の維持・引き込み優先)
 * 3. スベリコマ数最小
 */
function pickBestPosition(
  stopped: readonly (number | undefined)[],
  reel: ReelIndex,
  push: number,
  remaining: readonly ReelIndex[],
  wonRole: Role,
  bellTarget: BellTarget | undefined,
): number {
  let bestPosition = push;
  let bestGuaranteed = Number.POSITIVE_INFINITY;
  let bestExpected = Number.POSITIVE_INFINITY;
  for (let slip = 0; slip <= MAX_SLIP; slip++) {
    const position = (push + slip) % KOMA_COUNT;
    const nextStopped = stopped.slice();
    nextStopped[reel] = position;
    const guaranteed = guaranteedRank(nextStopped, remaining, wonRole, bellTarget);
    const expected = expectedRank(nextStopped, remaining, wonRole, bellTarget);
    if (
      guaranteed < bestGuaranteed ||
      (guaranteed === bestGuaranteed && expected < bestExpected)
    ) {
      bestGuaranteed = guaranteed;
      bestExpected = expected;
      bestPosition = position;
    }
  }
  return bestPosition;
}

function bellTargetFor(wonRole: Role, pushOrder: PushOrder): BellTarget | undefined {
  if (wonRole !== 'BELL') return undefined;
  return pushOrder[0] === 0 ? 'TOP' : 'DIAGONAL';
}

/**
 * 1 リール分の停止位置を決定する(引き込み優先度探索)。
 * 候補評価の優先度は pickBestPosition 参照
 * (到達保証ランク > 期待ランク > スベリコマ数最小)。
 *
 * @param reel 停止するリール(0=左, 1=中, 2=右)
 * @param pushPosition 押下位置(押下瞬間に中段にあるコマ番号)
 * @param wonRole 内部当選役(取りこぼし判定は judgeDisplay で行う)
 * @param stopped 停止済みリールの停止位置([左, 中, 右]、未停止は undefined)
 * @param pushOrder 押し順(押し順ベルの停止形と残りリールの停止順の決定に使う)
 * @returns 停止位置(中段のコマ番号)
 */
export function resolveStop(
  reel: ReelIndex,
  pushPosition: number,
  wonRole: Role,
  stopped: readonly (number | undefined)[] = [undefined, undefined, undefined],
  pushOrder: PushOrder = PUSH_ORDERS[0],
): number {
  const push = ((pushPosition % KOMA_COUNT) + KOMA_COUNT) % KOMA_COUNT;
  const remaining = pushOrder.filter(
    (r): r is ReelIndex => r !== reel && stopped[r] === undefined,
  );
  return pickBestPosition(stopped, reel, push, remaining, wonRole, bellTargetFor(wonRole, pushOrder));
}

export type PushOrder = readonly [ReelIndex, ReelIndex, ReelIndex];

/** 押し順の全パターン(順押し・ハサミ・中押し・逆押し等) */
export const PUSH_ORDERS: readonly PushOrder[] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

export interface SpinResult {
  /** 各リールの停止位置([左, 中, 右]、中段のコマ番号) */
  positions: StopPositions;
  /** 停止後の表示役(取りこぼし時は NONE) */
  displayed: Role;
  /** 表示役が揃った有効ライン(ライン役以外は空) */
  lines: LineId[];
  /**
   * 押し順ベルの払出区分(displayed が BELL のときのみ意味を持つ)。
   * 斜め揃い = 押し順正解 13 枚 / 上段(横)揃い = 不正解 1 枚。
   * calcPayout(displayed, betPaid, bellSuccess) へそのまま渡す。
   */
  bellSuccess: boolean;
}

/**
 * 1 ゲーム分の全リール停止を解決する。
 *
 * @param wonRole 内部当選役
 * @param pushPositions 各リールの押下位置([左, 中, 右])
 * @param pushOrder 押し順(デフォルトは順押し)
 */
export function resolveSpin(
  wonRole: Role,
  pushPositions: readonly [number, number, number],
  pushOrder: PushOrder = PUSH_ORDERS[0],
): SpinResult {
  const stopped: (number | undefined)[] = [undefined, undefined, undefined];
  for (const reel of pushOrder) {
    stopped[reel] = resolveStop(reel, pushPositions[reel], wonRole, stopped, pushOrder);
  }
  const positions = stopped as StopPositions;
  const detail = judgeDisplayDetail(positions, wonRole);
  return {
    positions,
    displayed: detail.role,
    lines: detail.lines,
    bellSuccess: detail.bellSuccess,
  };
}
