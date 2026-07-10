/**
 * 役の定義。docs/SPEC.md「2. 役構成・確率」(= Excel 基本確率シート)準拠。
 * 数値・役構成の変更は SPEC.md とセットで行うこと。
 */
export const ROLES = [
  'REPLAY', // リプレイ
  'BELL', // 押し順ベル
  'CHERRY_CORNER', // 角チェリー
  'CHERRY_CENTER', // 中段チェリー
  'WATERMELON_WEAK', // 弱スイカ
  'WATERMELON_STRONG', // 強スイカ
  'CHANCE_ME', // チャンス目
  'REACH_ME', // リーチ目
  'NONE', // ハズレ
] as const;

export type Role = (typeof ROLES)[number];

/** レア役(モード移行・前兆・V ストック抽せんの主契機) */
export const RARE_ROLES: readonly Role[] = [
  'CHERRY_CORNER',
  'CHERRY_CENTER',
  'WATERMELON_WEAK',
  'WATERMELON_STRONG',
  'CHANCE_ME',
  'REACH_ME',
];

export function isRareRole(role: Role): boolean {
  return RARE_ROLES.includes(role);
}
