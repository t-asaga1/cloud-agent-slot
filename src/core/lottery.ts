import type { Rng } from './rng';
import type { Role } from './roles';

/**
 * 役抽選。docs/SPEC.md「2. 役構成・確率」(= Excel 基本確率シート)準拠。
 * 分母は 65536(16bit 抽選)。値は「当選個数」。設定差なし(単一テーブル・確定)。
 */
export const LOTTERY_DENOM = 65536;

export type RoleWeights = Record<Exclude<Role, 'NONE'>, number>;

/** 役別の当選個数(65536 中)。ハズレは残り(9384 個) */
export const ROLE_WEIGHTS: RoleWeights = {
  REPLAY: 8970,
  BELL: 45000,
  CHERRY_CORNER: 600,
  CHERRY_CENTER: 344,
  WATERMELON_WEAK: 667,
  WATERMELON_STRONG: 194,
  CHANCE_ME: 369,
  REACH_ME: 8,
};

/** ハズレの個数(検算用: 全役 + ハズレ = 65536) */
export const NONE_WEIGHT = 9384;

/** 抽選順(テーブルの並び)。合計が分母以下であることは単体テストで保証する */
const DRAW_ORDER: readonly (keyof RoleWeights)[] = [
  'REPLAY',
  'BELL',
  'CHERRY_CORNER',
  'CHERRY_CENTER',
  'WATERMELON_WEAK',
  'WATERMELON_STRONG',
  'CHANCE_ME',
  'REACH_ME',
];

/** 1 ゲーム分の役抽選を行う。ハズレは 'NONE' */
export function drawRole(rng: Rng): Role {
  const value = rng.nextInt(LOTTERY_DENOM);
  let threshold = 0;
  for (const role of DRAW_ORDER) {
    threshold += ROLE_WEIGHTS[role];
    if (value < threshold) return role;
  }
  return 'NONE';
}

/** 役の理論当選確率(1/x の x を返す)。シミュレーションテスト・表示用 */
export function theoreticalDenominator(role: Exclude<Role, 'NONE'>): number {
  return LOTTERY_DENOM / ROLE_WEIGHTS[role];
}
