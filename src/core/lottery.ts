import type { Rng } from './rng';
import type { Role, Setting } from './roles';

/**
 * 役抽選。設定別の確率テーブルをデータ駆動で持つ。
 * 分母は 65536(実機と同じ 16bit 抽選)。値は「当選個数」。
 * 数値は docs/SPEC.md「5. 役構成・確率」の叩き台と一致させること。
 */
export const LOTTERY_DENOM = 65536;

type RoleWeights = Record<Exclude<Role, 'NONE'>, number>;

/** 設定別・役別の当選個数(65536 中) */
export const ROLE_WEIGHTS: Record<Setting, RoleWeights> = {
  //          リプレイ  ベル  スイカ 弱チェ 強チェ チャンス目 BIG  REG
  1: withRoles(8978, 10082, 1092, 874, 218, 328, 66, 44),
  2: withRoles(8978, 10193, 1105, 887, 218, 332, 68, 47),
  3: withRoles(8978, 10307, 1130, 899, 222, 337, 71, 51),
  4: withRoles(8978, 10422, 1170, 912, 226, 344, 75, 56),
  5: withRoles(8978, 10539, 1213, 925, 230, 352, 79, 61),
  6: withRoles(8978, 10658, 1260, 938, 234, 361, 84, 67),
};

function withRoles(
  replay: number,
  bell: number,
  watermelon: number,
  cherryWeak: number,
  cherryStrong: number,
  chanceMe: number,
  bonusBig: number,
  bonusReg: number,
): RoleWeights {
  return {
    REPLAY: replay,
    BELL: bell,
    WATERMELON: watermelon,
    CHERRY_WEAK: cherryWeak,
    CHERRY_STRONG: cherryStrong,
    CHANCE_ME: chanceMe,
    BONUS_BIG: bonusBig,
    BONUS_REG: bonusReg,
  };
}

/** 抽選順(テーブルの並び)。合計が分母以下であることは単体テストで保証する */
const DRAW_ORDER: readonly (keyof RoleWeights)[] = [
  'REPLAY',
  'BELL',
  'WATERMELON',
  'CHERRY_WEAK',
  'CHERRY_STRONG',
  'CHANCE_ME',
  'BONUS_BIG',
  'BONUS_REG',
];

/** 1 ゲーム分の役抽選を行う。ハズレは 'NONE' */
export function drawRole(rng: Rng, setting: Setting): Role {
  const weights = ROLE_WEIGHTS[setting];
  const value = rng.nextInt(LOTTERY_DENOM);
  let threshold = 0;
  for (const role of DRAW_ORDER) {
    threshold += weights[role];
    if (value < threshold) return role;
  }
  return 'NONE';
}

/** 役の理論当選確率(1/x の x を返す)。シミュレーションテスト・表示用 */
export function theoreticalDenominator(role: Exclude<Role, 'NONE'>, setting: Setting): number {
  return LOTTERY_DENOM / ROLE_WEIGHTS[setting][role];
}
