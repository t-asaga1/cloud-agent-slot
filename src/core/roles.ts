/**
 * 役(小役・ボーナス等)の定義。
 * 確率・払い出しの数値は docs/SPEC.md の叩き台に対応する。数値変更は SPEC.md とセットで行うこと。
 */
export const ROLES = [
  'REPLAY',
  'BELL',
  'WATERMELON',
  'CHERRY_WEAK',
  'CHERRY_STRONG',
  'CHANCE_ME',
  'BONUS_BIG',
  'BONUS_REG',
  'NONE',
] as const;

export type Role = (typeof ROLES)[number];

/** レア役(状態遷移の契機になる役) */
export const RARE_ROLES: readonly Role[] = [
  'WATERMELON',
  'CHERRY_WEAK',
  'CHERRY_STRONG',
  'CHANCE_ME',
];

export function isRareRole(role: Role): boolean {
  return RARE_ROLES.includes(role);
}

export type Setting = 1 | 2 | 3 | 4 | 5 | 6;

export const SETTINGS: readonly Setting[] = [1, 2, 3, 4, 5, 6];
