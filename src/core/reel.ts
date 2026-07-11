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
 *
 * 【STEP 1d 完了】レア役(チェリー / スイカ / チャンス目)の停止制御を確定。
 * - 角チェリー: 左リール上段 or 下段のチェリー停止(中段は禁止出目)。引き込めなければ取りこぼし
 * - 中段チェリー: 左リール中段のチェリー停止(角は禁止出目)。引き込めなければ取りこぼし
 * - 弱スイカ: 斜め優先で揃える(困難時は平行=横ライン)。取りこぼし許容
 * - 強スイカ: 平行(横)優先で揃える(困難時は斜め)。取りこぼし許容
 * - チャンス目: スイカをテンパイさせた上で揃えない「テンパイはずし目」を作る
 *   (スイカの 3 つ揃いは禁止出目。テンパイを作れない押下位置はクリーンなハズレ目 = 取りこぼし)
 * 【STEP 1e 完了】リーチ目(7 揃い)の停止制御と DDT(左リール黒バー狙い)を確定。
 * - リーチ目: 「狙えば揃う」= 3 リールすべて赤7 を中段へ引き込める押下位置
 *   (赤7 の 0〜4 コマ手前 = 各リール 5/20 箇所。isSevenAimedPush)で押せば、
 *   必ずいずれかの有効ラインに 7 揃い(網羅テストで全 5^3 × 押し順 6 通りを検証)。
 *   実現方法: 候補評価に「目押し保証ランク(aimedRank)」を追加(pickBestPosition 参照)。
 *   残りリールが「狙って」押される前提での最悪ケースを評価し、先に止まるリールが
 *   7 を後続リールとライン構成できない段へ置いてしまう選択を防ぐ。
 * - 目押しを外した(引き込めない位置で押した)場合は取りこぼし
 *   (代替リーチ目停止なし・払出なし = クリーンなハズレ目。SPEC 回答 14)。
 * - DDT(左リール黒バー狙い。SPEC「3.」確定事項): 到達保証・目押し保証・期待ランクが
 *   同値の候補間で「黒バーを窓内のできるだけ下段寄りに止める」選好(ddtScore)を追加。
 *   ハズレ・リプレイ・取りこぼし時は黒バー狙い(押下位置 14〜19)で黒バーが下段付近に
 *   停止し、スイカ成立時はスイカ(コマ 15・20 = 黒バー周辺)を引き込んで揃うため察知できる。
 *   チェリー成立時は、チェリー(コマ 13)を窓内へ引き込める押下位置(≦ 13)なら
 *   チェリー停止で察知できる。※ 押下位置 14〜19 では左チェリーが物理的に窓内へ
 *   届かないため取りこぼし(= 黒バー停止のまま)になる(最大 4 コマスベリの制約)。
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

/**
 * スイカがいずれかの有効ラインでテンパイしているか
 * (ライン上の 3 コマ中ちょうど 2 コマがスイカ = あと 1 図柄で揃う形)。
 * チャンス目の停止形(スイカテンパイはずし目。SPEC「3.」挙動表)の判定に使う。
 */
export function watermelonTenpai(positions: StopPositions): boolean {
  return LINE_IDS.some(
    (line) => lineSymbols(positions, line).filter((s) => s === 'WATERMELON').length === 2,
  );
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
 * - チャンス目の停止形は「スイカテンパイはずし目」(SPEC「3.」挙動表)。同型の出目は
 *   ハズレ等でも出現し得るため、内部当選がチャンス目のときのみ CHANCE_ME を返す
 *   (テンパイを作れなかった場合は NONE = 取りこぼし)。
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
  // ライン役なし → チャンス目(内部当選時のみ。スイカテンパイはずし目が停止形)
  if (wonRole === 'CHANCE_ME' && watermelonTenpai(positions)) {
    return { role: 'CHANCE_ME', lines: [], bellSuccess: false };
  }
  // 左リール窓内のチェリー(ライン非依存)
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

/**
 * 各リールで赤7 を中段へ引き込める「狙った」押下位置(赤7 の 0〜4 コマ手前)。
 * 赤7 は各リール 1 個のため各リールちょうど 5 箇所。
 * リーチ目の「狙えば揃う」保証(SPEC「3.」挙動表・回答 14)の前提となる押下位置。
 */
const SEVEN_AIMED_PUSHES: readonly (readonly number[])[] = [0, 1, 2].map((reel) =>
  Array.from({ length: KOMA_COUNT }, (_, p) => p).filter((p) =>
    canReach(reel as ReelIndex, p, 'SEVEN_RED'),
  ),
);

/** 押下位置が「赤7 を狙った」(目押し成功の)位置か。外れなら取りこぼし許容(SPEC 回答 14) */
export function isSevenAimedPush(reel: ReelIndex, pushPosition: number): boolean {
  const p = ((pushPosition % KOMA_COUNT) + KOMA_COUNT) % KOMA_COUNT;
  return SEVEN_AIMED_PUSHES[reel].includes(p);
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
/**
 * 当選形完成だが優先方向でない揃い(スイカの弱=斜め優先 / 強=平行優先。SPEC「3.」挙動表)。
 * 取りこぼし(RANK_LOSS)よりは十分良い値にして、
 * 「優先方向にこだわって取りこぼす」選択が起きないようにする。
 */
const RANK_WIN_FALLBACK = 2;
/** 取りこぼし(何も揃えず左窓チェリーなしのクリーンなハズレ目) */
const RANK_LOSS = 50;
const RANK_ILLEGAL = Number.POSITIVE_INFINITY;

/**
 * 全リール停止後の出目を当選役に照らして評価する。
 * - 非当選図柄の 3 つ揃い(どの有効ラインでも)は常に禁止出目(RANK_ILLEGAL)。
 * - チェリー非当選時の左窓チェリーは、100% 引き込み役(ベル・リプレイ)の
 *   完成形と同時のときのみ許容(RANK_WIN_WITH_CHERRY。表示判定はライン役優先)。
 * - 押し順ベルは bellTarget の停止形(上段 or 斜め)以外での揃いを禁止出目とする。
 * - スイカは弱=斜め優先 / 強=平行(横)優先(SPEC「3.」挙動表)。優先方向でない揃いは
 *   RANK_WIN_FALLBACK として「揃えられるなら方向不問で揃える(取りこぼしよりよい)」を表す。
 *   引き込めない押下位置は RANK_LOSS(取りこぼし許容)。
 * - チェリーは左リール窓内の停止段で角(上・下段)/ 中段を作り分ける。当選した方の
 *   停止段のみ WIN(もう一方の段は禁止出目)。引き込めない押下位置は RANK_LOSS。
 * - チャンス目は「スイカテンパイはずし目」(スイカがテンパイし、かつ 3 つ揃いしない。
 *   SPEC「3.」挙動表)を WIN とする。スイカの 3 つ揃いは非当選図柄として常に禁止のため
 *   「引き込める位置でも引き込まない」は自動的に満たされる。テンパイを作れない
 *   押下位置はクリーンなハズレ目(RANK_LOSS = 取りこぼし)。
 * - リーチ目は「引き込めればいずれかの有効ラインで 7 揃い = WIN / 不可なら
 *   RANK_LOSS(取りこぼし = クリーンなハズレ目。代替リーチ目停止なし。SPEC 回答 14)」。
 *   「狙えば揃う」の保証は aimedRank(目押し保証ランク)が担う(STEP 1e)。
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
    if (wonRole === 'WATERMELON_WEAK' || wonRole === 'WATERMELON_STRONG') {
      // スイカの複数ライン同時揃いは配列上あり得ない(各リールのスイカ間隔 ≥ 2 のため
      // 窓内に 2 個表示されない)= wonLines は常に 1 本
      if (cherry !== 'none') return RANK_ILLEGAL;
      const diagonal = DIAGONAL_LINES.includes(wonLines[0]);
      const preferred = wonRole === 'WATERMELON_WEAK' ? diagonal : !diagonal;
      return preferred ? RANK_WIN : RANK_WIN_FALLBACK;
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
  if (wonRole === 'CHANCE_ME') {
    // スイカテンパイはずし目(揃いなしは確認済み)。テンパイ不可なら取りこぼし
    if (cherry !== 'none') return RANK_ILLEGAL;
    return watermelonTenpai(positions) ? RANK_WIN : RANK_LOSS;
  }
  // ハズレ: クリーンなハズレ目のみ許容
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

const aimedRankMemo = new Map<string, number>();

/**
 * リーチ目の「狙えば揃う」保証(STEP 1e。SPEC「3.」挙動表・回答 14)。
 * guaranteedRank の亜種で、残りリールの押下位置を「全 20 箇所」ではなく
 * 「赤7 を狙った位置(SEVEN_AIMED_PUSHES = 各リール 5 箇所)」に限った最悪ケース評価。
 *
 * リーチ目はどのリールも赤7 が 1 個しかなく全押下位置からの引き込みが不可能なため、
 * guaranteedRank は候補間で差がつかない(常に取りこぼしが最悪ケース)。
 * 一方で「プレイヤーが 3 リールとも赤7 を狙う」前提なら、先に止まるリールが
 * 7 を適切な段へ置けば必ずいずれかの有効ラインで 7 揃いにできる。
 * この保証を候補選択(pickBestPosition)の第 2 キーとして担うのが本関数。
 *
 * 再帰中の候補は、guaranteedRank が禁止出目(RANK_ILLEGAL)になる停止位置を除外する
 * (実際の停止方策は guaranteedRank を最優先で選ぶため、その挙動と整合させる)。
 */
function aimedRank(
  stopped: readonly (number | undefined)[],
  remaining: readonly ReelIndex[],
  wonRole: Role,
): number {
  const key = memoKey(stopped, remaining, wonRole, undefined);
  const cached = aimedRankMemo.get(key);
  if (cached !== undefined) return cached;

  let result: number;
  if (remaining.length === 0) {
    result = classifyFinal(stopped as StopPositions, wonRole, undefined);
  } else {
    const next = remaining[0];
    const rest = remaining.slice(1);
    let worst = 0;
    for (const push of SEVEN_AIMED_PUSHES[next]) {
      if (worst === RANK_ILLEGAL) break;
      let best = RANK_ILLEGAL;
      for (let slip = 0; slip <= MAX_SLIP && best !== RANK_WIN; slip++) {
        const nextStopped = stopped.slice();
        nextStopped[next] = (push + slip) % KOMA_COUNT;
        if (guaranteedRank(nextStopped, rest, wonRole, undefined) === RANK_ILLEGAL) continue;
        best = Math.min(best, aimedRank(nextStopped, rest, wonRole));
      }
      worst = Math.max(worst, best);
    }
    result = worst;
  }
  aimedRankMemo.set(key, result);
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
 * DDT(左リール黒バー狙い。SPEC「3.」確定事項)の停止位置選好スコア(小さいほど良い)。
 * 左リールの停止候補について「黒バーを窓内のできるだけ下段寄りに表示する」を表す:
 * 下段 = 0 / 中段 = 1 / 上段 = 2 / 窓外 = 3。
 * 黒バーは左リール 1 個(コマ 19)のため、黒バー狙い(押下位置がコマ 19 の手前付近)の
 * ときだけ候補間で差がつき、それ以外の押下位置では全候補が同値(= 選好は働かない)。
 * 上位の評価(到達保証・目押し保証・期待ランク)が同値の候補間でのみ働くため、
 * 引き込み・蹴飛ばしの正しさには影響しない(網羅テストの固定値で回帰検証)。
 */
function ddtScore(reel: ReelIndex, position: number): number {
  if (reel !== 0) return 0;
  if (komaAt(0, position - 1) === 'BAR_BLACK') return 0; // 下段
  if (komaAt(0, position) === 'BAR_BLACK') return 1; // 中段
  if (komaAt(0, position + 1) === 'BAR_BLACK') return 2; // 上段
  return 3;
}

/**
 * リール reel を押下位置 push で止めるときの停止位置を選ぶ(停止方策の本体)。
 * スベリ 0〜4 の 5 候補を次の優先度で評価する(小さいほど良い辞書式比較):
 * 1. 到達保証ランク(guaranteedRank): 残りリールがどの押下位置でも禁止出目を回避でき、
 *    可能なら当選形を完成できることの保証(最悪ケース評価)
 * 2. 目押し保証ランク(aimedRank。リーチ目のみ): 残りリールが赤7 を狙って押される
 *    前提での最悪ケース評価(「狙えば揃う」の保証。SPEC 回答 14)
 * 3. 期待ランク(expectedRank): 上位が同値なら、実際の押下位置で
 *    当選形を完成できる率が高い位置(テンパイ形の維持・引き込み優先)
 * 4. DDT 選好(ddtScore): 左リールの黒バーをできるだけ下段寄りに表示
 * 5. スベリコマ数最小
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
  let bestKey: [number, number, number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  for (let slip = 0; slip <= MAX_SLIP; slip++) {
    const position = (push + slip) % KOMA_COUNT;
    const nextStopped = stopped.slice();
    nextStopped[reel] = position;
    const guaranteed = guaranteedRank(nextStopped, remaining, wonRole, bellTarget);
    const key: [number, number, number, number] = [
      guaranteed,
      wonRole === 'REACH_ME' && guaranteed !== RANK_ILLEGAL
        ? aimedRank(nextStopped, remaining, wonRole)
        : 0,
      expectedRank(nextStopped, remaining, wonRole, bellTarget),
      ddtScore(reel, position),
    ];
    if (
      key[0] < bestKey[0] ||
      (key[0] === bestKey[0] &&
        (key[1] < bestKey[1] ||
          (key[1] === bestKey[1] &&
            (key[2] < bestKey[2] || (key[2] === bestKey[2] && key[3] < bestKey[3])))))
    ) {
      bestKey = key;
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
