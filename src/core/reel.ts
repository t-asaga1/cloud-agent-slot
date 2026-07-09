import type { Role } from './roles';

/**
 * リール配列と停止制御(Phase 2)。
 *
 * - 各リール 20 コマ × 3 本。配列は docs/SPEC.md「2. リール仕様」の叩き台と一致させること。
 * - 停止制御は「引き込み優先度による探索方式」(docs/DEVELOPMENT_PLAN.md Phase 2):
 *   押下位置から最大 4 コマ先まで(計 5 候補)を探索し、
 *   当選役を揃える > 蹴飛ばし(非当選役を揃えない)の優先度で停止位置を決める。
 * - 有効ラインは中段 1 ライン。チェリーは左リール限定で、
 *   角(上段・下段)=弱チェリー / 中段=強チェリー の停止形で区別する。
 * - 回転アニメーションは UI 層の責務。本モジュールは「押下位置 → 停止位置」の純関数のみ持つ。
 */

export const REEL_SYMBOLS = [
  'SEVEN_RED',
  'SEVEN_WHITE',
  'BAR',
  'BELL',
  'WATERMELON',
  'CHERRY',
  'REPLAY',
] as const;

export type ReelSymbol = (typeof REEL_SYMBOLS)[number];

export const REEL_COUNT = 3;
export const KOMA_COUNT = 20;
/** 最大スベリ(引き込み)コマ数 */
export const MAX_SLIP = 4;

export type ReelIndex = 0 | 1 | 2;
export const REEL_INDEXES: readonly ReelIndex[] = [0, 1, 2];

const R7 = 'SEVEN_RED';
const W7 = 'SEVEN_WHITE';
const BAR = 'BAR';
const BE = 'BELL';
const WM = 'WATERMELON';
const CH = 'CHERRY';
const RP = 'REPLAY';

/**
 * リール配列(コマ番号 0〜19)。docs/SPEC.md のリール配列叩き台と一致。
 * [左, 中, 右]
 */
export const REEL_LAYOUT: readonly (readonly ReelSymbol[])[] = [
  [R7, RP, BE, CH, WM, RP, BE, BAR, WM, RP, BE, CH, W7, RP, BE, WM, RP, BE, BAR, WM],
  [RP, BE, WM, R7, RP, BE, CH, BAR, RP, BE, WM, W7, RP, BE, CH, BAR, RP, BE, WM, CH],
  [BE, RP, CH, WM, BE, RP, R7, WM, BE, RP, BAR, WM, BE, RP, W7, WM, BE, RP, BAR, WM],
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

/** 中段ライン(有効ライン)で揃うと成立扱いになる役 → 構成図柄 */
export const LINE_ROLE_SYMBOL = {
  REPLAY: 'REPLAY',
  BELL: 'BELL',
  WATERMELON: 'WATERMELON',
  BONUS_BIG: 'SEVEN_RED',
  BONUS_REG: 'BAR',
} as const satisfies Partial<Record<Role, ReelSymbol>>;

type LineRole = keyof typeof LINE_ROLE_SYMBOL;

/** 中段に同一図柄が 3 つ並んだときの役(該当なしは undefined) */
const SYMBOL_LINE_ROLE: Partial<Record<ReelSymbol, LineRole>> = {
  REPLAY: 'REPLAY',
  BELL: 'BELL',
  WATERMELON: 'WATERMELON',
  SEVEN_RED: 'BONUS_BIG',
  BAR: 'BONUS_REG',
  // SEVEN_WHITE・CHERRY の 3 つ揃いはどの役でもない「禁止出目」として常に蹴飛ばす
};

/**
 * 100% 引き込みが保証されるライン役(配列側で全リール 4 コマ以内配置。テストで保証)。
 * これらは必ず 3 つ揃うため、左リールで窓内にチェリーが同時に見える停止位置も許容する
 * (表示判定はライン役が優先されるため誤ってチェリー入賞にはならない)。
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
 * - ライン役がなければ左リールのチェリー(中段=強 / 角=弱)を判定する。
 * - チャンス目は特定の停止形を持たない(Phase 2 叩き台)ため、本関数は返さない。
 *   成立役としてのチャンス目は内部当選(drawRole の結果)側で扱う。
 */
export function judgeDisplay(positions: StopPositions): Role {
  const line = REEL_INDEXES.map((r) => komaAt(r, positions[r]));
  if (line[0] === line[1] && line[1] === line[2]) {
    const role = SYMBOL_LINE_ROLE[line[0]];
    if (role) return role;
  }
  const cherry = leftCherryState(positions[0]);
  if (cherry === 'center') return 'CHERRY_STRONG';
  if (cherry === 'corner') return 'CHERRY_WEAK';
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

/** 左リールで弱チェリー(角チェリーかつ中段チェリーでない)を引き込めるか */
export function canReachWeakCherry(pushPosition: number): boolean {
  for (let s = 0; s <= MAX_SLIP; s++) {
    if (leftCherryState(pushPosition + s) === 'corner') return true;
  }
  return false;
}

/** 左リールで強チェリー(中段チェリー)を引き込めるか */
export function canReachStrongCherry(pushPosition: number): boolean {
  for (let s = 0; s <= MAX_SLIP; s++) {
    if (leftCherryState(pushPosition + s) === 'center') return true;
  }
  return false;
}

/**
 * この停止位置が、停止済みリールと合わせて中段 3 つ揃いを完成させてしまうか。
 * 未停止リールが残っていれば後続の蹴飛ばしで回避できるため false。
 * SEVEN_WHITE・CHERRY 揃いはどの役でもない禁止出目として、当選役に関わらず違法扱い。
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
  const lineRole = SYMBOL_LINE_ROLE[symbol];
  if (lineRole === undefined) return true;
  return lineRole !== wonRole;
}

/**
 * 1 リール分の停止位置を決定する(引き込み優先度探索)。
 *
 * 優先度: 当選役を引き込める位置 > それ以外(蹴飛ばし後) > スベリ最小。
 * 蹴飛ばし(除外)ルール:
 * - 非当選のライン役・禁止出目(白7/チェリー揃い)を完成させる位置
 * - 左リール: チェリー非当選時にチェリーが窓内に見える位置
 *   (ただし 100% 引き込み役の当選図柄を引き込む場合は許容)
 * - 左リール: 弱チェリー当選時の中段チェリー / 強チェリー当選時の角チェリー
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
  const lineSymbol = isLineRole(wonRole) ? LINE_ROLE_SYMBOL[wonRole] : undefined;
  const cherryWon = wonRole === 'CHERRY_WEAK' || wonRole === 'CHERRY_STRONG';

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
    } else if (reel === 0 && wonRole === 'CHERRY_WEAK') {
      wins = cherry === 'corner';
    } else if (reel === 0 && wonRole === 'CHERRY_STRONG') {
      wins = cherry === 'center';
    }

    // --- 蹴飛ばし(除外)判定 ---
    if (reel === 0 && cherry !== 'none') {
      if (cherryWon) {
        if (wonRole === 'CHERRY_WEAK' && cherry === 'center') continue;
        if (wonRole === 'CHERRY_STRONG' && cherry === 'corner') continue;
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
  return { positions, displayed: judgeDisplay(positions) };
}
