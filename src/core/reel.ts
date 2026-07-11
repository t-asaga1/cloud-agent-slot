import type { Role } from './roles';

/**
 * リール配列と停止制御。
 *
 * 【STEP 1a 完了】図柄 8 種 + Excel 仕様の 20 コマ配列(docs/SPEC.md「3.」)へ差し替え済み。
 *
 * 【注意・暫定】停止制御(resolveStop / judgeDisplay)は旧叩き台の
 * 中段 1 ライン方式のまま(STEP 1b〜1e で 5 ライン対応へ書き直す。docs/ROADMAP.md 参照)。
 * このため新配列では以下が成立しない:
 * - 左リールのリプレイは最大間隔 6 コマで、中段 1 ラインでは 100% 引き込み不可
 *   (5 ライン(上下段・斜め)併用で 100% になる。SPEC「3.」確定事項)
 * - 押し順ベルの停止形(左=上段 1 枚 / 正解=斜め 13 枚)は 5 ライン判定が前提
 * 旧配列前提の停止制御網羅テストは reel.test.ts で一時 skip している(1c〜1e で置換)。
 *
 * - 停止制御は「引き込み優先度による探索方式」:
 *   押下位置から最大 4 コマ先まで(計 5 候補)を探索し、
 *   当選役を揃える > 蹴飛ばし(非当選役を揃えない)の優先度で停止位置を決める。
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
 * 【コマ番号と配列 index の対応規約】
 * SPEC の表は「コマ番号 20 → 1 の降順」(リール帯を上から見た並び)で記載されている。
 * 本配列は index 0 = コマ番号 1、index 19 = コマ番号 20 の昇順で持つ(index = コマ番号 - 1)。
 * リールは下方向に回転し index 0 → 1 → 2 … の順に中段を通過するため、
 * 停止位置 p の窓は「上段 = index p+1 / 中段 = index p / 下段 = index p-1」となり、
 * SPEC の表の見た目(コマ番号が大きいほど上)と窓の並びが一致する。
 */
export const REEL_LAYOUT: readonly (readonly ReelSymbol[])[] = [
  // 左リール(コマ 1 → 20)
  [BE, RP, RP, BL, WM, BE, RP, CH, WB, WM, BE, RP, CH, BL, WM, BE, R7, RP, BB, WM],
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

/** ライン揃いで成立を表現する役 → 構成図柄(暫定: 中段 1 ライン) */
export const LINE_ROLE_SYMBOL = {
  REPLAY: 'REPLAY',
  BELL: 'BELL',
  WATERMELON_WEAK: 'WATERMELON',
  WATERMELON_STRONG: 'WATERMELON',
  REACH_ME: 'SEVEN_RED',
} as const satisfies Partial<Record<Role, ReelSymbol>>;

type LineRole = keyof typeof LINE_ROLE_SYMBOL;

/**
 * 100% 引き込みが保証されるライン役。
 * これらは必ず 3 つ揃うため、左リールで窓内にチェリーが同時に見える停止位置も許容する
 * (表示判定はライン役が優先されるため誤ってチェリー入賞にはならない)。
 *
 * TODO(STEP 1c): 新配列では左リプレイの最大間隔が 6 コマのため、中段 1 ラインでは
 * リプレイの 100% 引き込みが成立しない(5 ライン併用が前提。SPEC「3.」確定事項)。
 * 5 ライン対応の停止制御書き直し時に前提ごと再設計する。
 */
const GUARANTEED_LINE_ROLES: readonly LineRole[] = ['BELL', 'REPLAY'];

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
 * 全リール停止後の表示役の判定。
 * - 中段ラインの 3 つ揃いを最優先で判定する。
 * - スイカ揃いは弱・強で同一図柄のため、内部当選役(wonRole)で弱・強を区別する。
 * - ライン役がなければ左リールのチェリー(中段=中段チェリー / 角=角チェリー)を判定する。
 * - チャンス目は特定の停止形を持たない(暫定)ため、本関数は返さない。
 *   成立役としてのチャンス目は内部当選(drawRole の結果)側で扱う。
 */
export function judgeDisplay(positions: StopPositions, wonRole: Role = 'NONE'): Role {
  const line = REEL_INDEXES.map((r) => komaAt(r, positions[r]));
  if (line[0] === line[1] && line[1] === line[2]) {
    const symbol = line[0];
    if (symbol === 'REPLAY') return 'REPLAY';
    if (symbol === 'BELL') return 'BELL';
    if (symbol === 'SEVEN_RED') return 'REACH_ME';
    if (symbol === 'WATERMELON') {
      // 弱・強は同一図柄。当選役側で区別する(非当選時の揃いは蹴飛ばしで発生しない)
      if (wonRole === 'WATERMELON_WEAK' || wonRole === 'WATERMELON_STRONG') return wonRole;
    }
  }
  const cherry = leftCherryState(positions[0]);
  if (cherry === 'center') return 'CHERRY_CENTER';
  if (cherry === 'corner') return 'CHERRY_CORNER';
  return 'NONE';
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

/**
 * この停止位置が、停止済みリールと合わせて中段 3 つ揃いを完成させてしまうか。
 * 未停止リールが残っていれば後続の蹴飛ばしで回避できるため false。
 * 当選役の図柄以外の 3 つ揃い(他役・チェリー/バー/ブランク等の禁止出目)は違法扱い。
 */
function completesIllegalLine(
  reel: ReelIndex,
  position: number,
  wonRole: Role,
  stopped: readonly (number | undefined)[],
): boolean {
  const symbol = komaAt(reel, position);
  for (const other of REEL_INDEXES) {
    if (other === reel) continue;
    const pos = stopped[other];
    if (pos === undefined) return false;
    if (komaAt(other, pos) !== symbol) return false;
  }
  return symbol !== roleLineSymbol(wonRole);
}

/**
 * 1 リール分の停止位置を決定する(引き込み優先度探索)。
 *
 * 優先度: 当選役を引き込める位置 > それ以外(蹴飛ばし後) > スベリ最小。
 * 蹴飛ばし(除外)ルール:
 * - 非当選のライン役・禁止出目(チェリー/バー/ブランク揃い)を完成させる位置
 * - 左リール: チェリー非当選時にチェリーが窓内に見える位置
 *   (ただし 100% 引き込み役の当選図柄を引き込む場合は許容)
 * - 左リール: 角チェリー当選時の中段チェリー / 中段チェリー当選時の角チェリー
 * - 中・右リール: 左リールが最後に残る場合、非当選図柄の中段テンパイを作る位置。
 *   左リールはチェリー排除と併用するため蹴飛ばしの自由度が低く、テンパイを許すと
 *   蹴飛ばせない押下位置が生じる(例: リプレイテンパイ + 左押下位置 1)
 *
 * @param reel 停止するリール(0=左, 1=中, 2=右)
 * @param pushPosition 押下位置(押下瞬間に中段にあるコマ番号)
 * @param wonRole 内部当選役(取りこぼし判定は judgeDisplay で行う)
 * @param stopped 停止済みリールの停止位置([左, 中, 右]、未停止は undefined)
 * @returns 停止位置(中段のコマ番号)
 */
export function resolveStop(
  reel: ReelIndex,
  pushPosition: number,
  wonRole: Role,
  stopped: readonly (number | undefined)[] = [undefined, undefined, undefined],
): number {
  const push = ((pushPosition % KOMA_COUNT) + KOMA_COUNT) % KOMA_COUNT;
  const lineSymbol = roleLineSymbol(wonRole);
  const cherryWon = wonRole === 'CHERRY_CORNER' || wonRole === 'CHERRY_CENTER';

  // 左リール停止前に中・右で非当選図柄の中段テンパイを作らない(上記コメント参照)
  let tenpaiAvoid: ReelSymbol | undefined;
  if (reel !== 0 && stopped[0] === undefined) {
    const other: ReelIndex = reel === 1 ? 2 : 1;
    const otherPos = stopped[other];
    if (otherPos !== undefined) {
      const otherSymbol = komaAt(other, otherPos);
      if (otherSymbol !== lineSymbol) tenpaiAvoid = otherSymbol;
    }
  }

  let bestPosition: number | undefined;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let slip = 0; slip <= MAX_SLIP; slip++) {
    const position = (push + slip) % KOMA_COUNT;
    const symbol = komaAt(reel, position);
    const cherry = reel === 0 ? leftCherryState(position) : 'none';

    // --- 当選役を引き込める候補か ---
    let wins = false;
    if (lineSymbol !== undefined) {
      wins = symbol === lineSymbol;
    } else if (reel === 0 && wonRole === 'CHERRY_CORNER') {
      wins = cherry === 'corner';
    } else if (reel === 0 && wonRole === 'CHERRY_CENTER') {
      wins = cherry === 'center';
    }

    // --- 蹴飛ばし(除外)判定 ---
    if (reel === 0 && cherry !== 'none') {
      if (cherryWon) {
        if (wonRole === 'CHERRY_CORNER' && cherry === 'center') continue;
        if (wonRole === 'CHERRY_CENTER' && cherry === 'corner') continue;
      } else if (
        !(wins && GUARANTEED_LINE_ROLES.includes(wonRole as LineRole))
      ) {
        // チェリー非当選時は原則チェリーを窓内に出さない。
        // 例外: ベル・リプレイ当選図柄の引き込み(ライン役が必ず完成し表示判定で優先される)
        continue;
      }
    }
    if (tenpaiAvoid !== undefined && symbol === tenpaiAvoid) continue;
    // 当選ライン役の完成は合法なのでチェック不要。それ以外は違法完成を蹴飛ばす
    if (!(wins && lineSymbol !== undefined) && completesIllegalLine(reel, position, wonRole, stopped)) {
      continue;
    }

    // --- 優先度スコア(小さいほど良い): 当選引き込み > 余計なチェリー非表示 > スベリ最小 ---
    const score = (wins ? 0 : 100) + (wins && cherry !== 'none' ? 10 : 0) + slip;
    if (score < bestScore) {
      bestScore = score;
      bestPosition = position;
    }
  }

  // 探索方式では全候補除外は起こらない設計(網羅テストで保証)だが、
  // 万一に備えビタ止まり(スベリ 0)にフォールバックする
  return bestPosition !== undefined ? bestPosition : push;
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
    stopped[reel] = resolveStop(reel, pushPositions[reel], wonRole, stopped);
  }
  const positions = stopped as StopPositions;
  return { positions, displayed: judgeDisplay(positions, wonRole) };
}
