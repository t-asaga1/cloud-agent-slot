import type { Role } from './roles';

/**
 * リール配列と停止制御(Phase 2)。
 *
 * - データモデル: 20 コマ × 3 リール(docs/SPEC.md「2. リール仕様」の叩き台と一致させること)
 * - 停止制御: テーブル方式ではなく「内部当選役からの引き込み優先度による探索方式」
 *   (docs/DEVELOPMENT_PLAN.md Phase 2 参照)。押下位置から最大 4 コマ先まで(計 5 候補)を探索し、
 *   優先度は「当選役を揃える > 当選役の一部を引き込む > ハズレ目」。
 *   非当選役が揃い得る位置は候補から除外する(蹴飛ばし)。
 * - 回転アニメーションは UI 層の責務。ここは「押下位置 → 停止位置」の純関数のみ持つ。
 *
 * 座標系の規約:
 * - コマ番号は 0〜19。停止位置 p は「中段に見えるコマ番号」。
 * - リールは下方向に回転する(上段のコマが次に中段へ来る)ため、
 *   表示窓は 上段 = (p+1)%20 / 中段 = p / 下段 = (p−1+20)%20、
 *   スベリ k コマの停止位置は (押下位置 + k) % 20 となる。
 *
 * 役と停止形の規約(有効ラインは中段 1 ライン):
 * - リプレイ/ベル/スイカ: 中段に 3 つ揃い。BIG = 赤7 揃い、REG = 白7 揃い。
 * - チェリーは左リール限定。中段チェリー = 強チェリー、角(上段・下段)チェリー = 弱チェリー。
 * - チャンス目は専用出目を未定義(現状はハズレ目と同じ「どの役も揃わない」停止)。確定後に更新する。
 */

export const SYMBOLS = [
  'RED7',
  'WHITE7',
  'BAR',
  'BELL',
  'WATERMELON',
  'CHERRY',
  'REPLAY',
] as const;

export type SymbolId = (typeof SYMBOLS)[number];

export const REEL_COUNT = 3;
export const SYMBOLS_PER_REEL = 20;
/** 最大スベリコマ数(押下位置含め 5 停止候補) */
export const MAX_SLIDE = 4;

/** 0 = 左、1 = 中、2 = 右 */
export type ReelIndex = 0 | 1 | 2;
export const REEL_INDEXES: readonly ReelIndex[] = [0, 1, 2];

/** チェリー役が判定される唯一のリール(SPEC: チェリーは左リール限定) */
export const CHERRY_REEL: ReelIndex = 0;

const R7 = 'RED7';
const W7 = 'WHITE7';
const BAR = 'BAR';
const BEL = 'BELL';
const WM = 'WATERMELON';
const CH = 'CHERRY';
const RP = 'REPLAY';

/**
 * リール配列(docs/SPEC.md「リール配列(叩き台)」と一致させること)。
 * ベル・リプレイは全リールで隙間 4 コマ以内(= 最大スベリで 100% 引き込み可能)。
 */
export const REEL_STRIPS: readonly (readonly SymbolId[])[] = [
  // 左
  [R7, RP, BEL, CH, WM, RP, BEL, BAR, WM, RP, BEL, CH, W7, RP, BEL, WM, RP, BEL, BAR, WM],
  // 中
  [RP, BEL, WM, R7, RP, BEL, CH, BAR, RP, BEL, WM, W7, RP, BEL, CH, BAR, RP, BEL, WM, CH],
  // 右
  [BEL, RP, CH, WM, BEL, RP, R7, WM, BEL, RP, BAR, WM, BEL, RP, W7, WM, BEL, RP, BAR, WM],
] as const;

/** コマ番号を 0〜19 に正規化する */
export function normalizePosition(position: number): number {
  return ((position % SYMBOLS_PER_REEL) + SYMBOLS_PER_REEL) % SYMBOLS_PER_REEL;
}

export function symbolAt(reel: ReelIndex, position: number): SymbolId {
  return REEL_STRIPS[reel][normalizePosition(position)];
}

export interface ReelWindow {
  top: SymbolId;
  middle: SymbolId;
  bottom: SymbolId;
}

/** 停止位置 p(中段コマ番号)から表示窓(上・中・下段)を導出する */
export function windowFor(reel: ReelIndex, stopPosition: number): ReelWindow {
  return {
    top: symbolAt(reel, stopPosition + 1),
    middle: symbolAt(reel, stopPosition),
    bottom: symbolAt(reel, stopPosition - 1),
  };
}

/** 中段ライン揃いの図柄 → 役の対応(揃っても役にならない図柄は undefined) */
const LINE_ROLE: Partial<Record<SymbolId, Role>> = {
  BELL: 'BELL',
  REPLAY: 'REPLAY',
  WATERMELON: 'WATERMELON',
  RED7: 'BONUS_BIG',
  WHITE7: 'BONUS_REG',
};

/** 中段ラインで当該役を構成する図柄(ライン役でない役は undefined) */
const ROLE_LINE_SYMBOL: Partial<Record<Role, SymbolId>> = {
  BELL: 'BELL',
  REPLAY: 'REPLAY',
  WATERMELON: 'WATERMELON',
  BONUS_BIG: 'RED7',
  BONUS_REG: 'WHITE7',
};

/**
 * 配列設計上 100% 引き込みが保証されている役(隙間 4 コマ以内配置)。
 * 保証はテスト(reel.test.ts)で静的に検証している。
 */
export const GUARANTEED_ROLES: readonly Role[] = ['BELL', 'REPLAY'];

function isCherryRole(role: Role): boolean {
  return role === 'CHERRY_WEAK' || role === 'CHERRY_STRONG';
}

function windowHasCherry(reel: ReelIndex, position: number): boolean {
  const w = windowFor(reel, position);
  return w.top === CH || w.middle === CH || w.bottom === CH;
}

/**
 * このリール単独で見た「当選役の目標停止形」を満たすか。
 * 目標が定義されないリール(チェリー役の中・右リール、チャンス目・ハズレ)は null を返す。
 */
function achievesTarget(role: Role, reel: ReelIndex, position: number): boolean | null {
  const lineSymbol = ROLE_LINE_SYMBOL[role];
  if (lineSymbol !== undefined) return symbolAt(reel, position) === lineSymbol;
  if (isCherryRole(role) && reel === CHERRY_REEL) {
    const w = windowFor(reel, position);
    if (role === 'CHERRY_STRONG') {
      return w.middle === CH;
    }
    // CHERRY_WEAK: 角(上段 or 下段)にチェリー、かつ中段は強チェリー形にならないこと
    return (w.top === CH || w.bottom === CH) && w.middle !== CH;
  }
  return null;
}

export interface StopInput {
  reel: ReelIndex;
  /** 押下時に中段にあったコマ番号 */
  position: number;
}

/**
 * 1 リール分の停止制御(純関数)。
 *
 * @param role 内部当選役
 * @param reel 停止するリール
 * @param pressPosition 押下時に中段にあったコマ番号
 * @param stopped 既に停止済みのリールの停止位置(押し順対応。未停止は undefined)
 * @returns 停止位置(中段コマ番号)
 *
 * 探索: スベリ 0〜4 の 5 候補を以下で評価する。
 * - 除外(蹴飛ばし):
 *   - 最終停止リールで「非当選役のライン揃い」または「役にならない図柄の揃い(BAR 等)」が完成する位置
 *   - 左リールで当選役と無関係にチェリーが表示窓に入る位置
 *     (弱・強チェリーは正しい停止形のみ許可。ベル・リプレイは 100% 引き込みでラインが必ず完成するため、
 *      目標達成候補に限りチェリー同時視認を許容する)
 * - 優先度(小さいほど優先):
 *   1. 当選役の目標停止形を達成する(当選役を揃える/一部を引き込む)
 *   2. 非当選役のラインを生かしたままにしない(先に停止したリールと中段図柄を重ねない)
 *   3. スベリコマ数が少ない
 */
export function stopReel(
  role: Role,
  reel: ReelIndex,
  pressPosition: number,
  stopped: Partial<Record<ReelIndex, number>> = {},
): number {
  const press = normalizePosition(pressPosition);
  const otherStopped = REEL_INDEXES.filter((r) => r !== reel && stopped[r] !== undefined);
  const isLastReel = otherStopped.length === REEL_COUNT - 1;

  let best: { position: number; score: readonly [number, number, number] } | null = null;

  for (let slide = 0; slide <= MAX_SLIDE; slide++) {
    const position = normalizePosition(press + slide);
    const middle = symbolAt(reel, position);
    const target = achievesTarget(role, reel, position);
    const lineAlive =
      otherStopped.length > 0 &&
      otherStopped.every((r) => symbolAt(r, stopped[r] as number) === middle);

    // --- 蹴飛ばし(除外)判定 ---
    if (isLastReel && lineAlive && LINE_ROLE[middle] !== role) {
      // 非当選役の揃い(役にならない図柄の 3 つ揃い含む)を完成させる位置は除外
      continue;
    }
    if (reel === CHERRY_REEL && windowHasCherry(reel, position)) {
      if (isCherryRole(role)) {
        // 当選チェリーの正しい停止形以外でチェリーを見せない(弱当選時の中段チェリー等を防ぐ)
        if (target !== true) continue;
      } else if (GUARANTEED_ROLES.includes(role)) {
        // ベル・リプレイはラインが必ず完成する(=ライン役表示が優先される)ため目標達成時のみ許容
        if (target !== true) continue;
      } else if (!(isLastReel && lineAlive && LINE_ROLE[middle] === role)) {
        // スイカ・BIG・REG は他リールの完成が保証されないため、ライン未確定でチェリーを
        // 同時視認させると取りこぼし時に「誤ったチェリー出目」になる。最終停止かつ
        // この位置でライン完成が確定する場合のみ許容し、それ以外は蹴飛ばす。
        // (例: 左リールの白7=12 番は下段にチェリー=11 番が入るため、REG は左を最後に押した
        //  ときだけ揃えられる)
        continue;
      }
    }

    // --- 優先度スコア ---
    const pullTier = target === true ? 0 : 1;
    const riskTier = !isLastReel && lineAlive && LINE_ROLE[middle] !== role ? 1 : 0;
    const score = [pullTier, riskTier, slide] as const;

    if (
      best === null ||
      score[0] < best.score[0] ||
      (score[0] === best.score[0] &&
        (score[1] < best.score[1] || (score[1] === best.score[1] && score[2] < best.score[2])))
    ) {
      best = { position, score };
    }
  }

  if (best === null) {
    // 配列設計上ここには到達しない(除外は最大でも 5 候補中 3 + 2 未満)。テストで保証する。
    throw new Error(`停止候補がありません: role=${role} reel=${reel} press=${press}`);
  }
  return best.position;
}

/**
 * 3 リールを指定押し順で停止させる(押し順・押下位置対応)。
 *
 * @param role 内部当選役
 * @param presses 停止操作の列(押した順)。各リールをちょうど 1 回ずつ含むこと
 * @returns 各リールの停止位置 [左, 中, 右]
 */
export function stopAll(
  role: Role,
  presses: readonly [StopInput, StopInput, StopInput],
): [number, number, number] {
  const reels = presses.map((p) => p.reel);
  if (new Set(reels).size !== REEL_COUNT) {
    throw new Error(`押し順が不正です(各リール 1 回ずつ): ${reels.join(',')}`);
  }
  const stopped: Partial<Record<ReelIndex, number>> = {};
  for (const press of presses) {
    stopped[press.reel] = stopReel(role, press.reel, press.position, stopped);
  }
  return [stopped[0] as number, stopped[1] as number, stopped[2] as number];
}

/**
 * 停止結果の表示窓から「揃っている役(表示役)」を判定する。
 * 取りこぼし・ハズレ・チャンス目は 'NONE'。
 *
 * 判定順序:
 * 1. 中段ラインの 3 つ揃い(ベル/リプレイ/スイカ/赤7=BIG/白7=REG)
 * 2. 左リールのチェリー(中段 = 強、角 = 弱)。ライン役成立時は判定しない
 */
export function judgeDisplay(stops: readonly [number, number, number]): Role {
  const line = REEL_INDEXES.map((r) => symbolAt(r, stops[r]));
  if (line[0] === line[1] && line[1] === line[2]) {
    const lineRole = LINE_ROLE[line[0]];
    if (lineRole !== undefined) return lineRole;
  }
  const left = windowFor(CHERRY_REEL, stops[CHERRY_REEL]);
  if (left.middle === CH) return 'CHERRY_STRONG';
  if (left.top === CH || left.bottom === CH) return 'CHERRY_WEAK';
  return 'NONE';
}
