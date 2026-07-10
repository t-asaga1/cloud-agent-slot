import type { Rng } from './rng';
import type { Role } from './roles';

/**
 * AT / 上位 AT 抽せん。docs/SPEC.md「7. AT」「8. 上位 AT」準拠。
 * 確定事項(2026-07-10 回答 11・12):
 * - V ストックは複数ストック可能。
 * - バトルパート中: 継続未確定なら小役で継続抽選 / 継続確定済みなら V ストック抽選。
 * - 10 連は初回セット = 1 連目。AT 10 連で上位 AT へ移行(連チャン数リセット)。
 * - 上位 AT で再度 10 連するとエンディング → 「AT 終了後」テーブルで通常時へ。
 * - バトル敗北時は上位 AT でも即終了。
 * - AT 中(上位含む)はモード・背景移行抽せん停止。
 */
export const KOYAKU_PART_GAMES = 10;
export const BATTLE_PART_GAMES = 8;

/** 10 連(初回 = 1 連目)で AT → 上位 AT、上位 AT → エンディング */
export const RENCHAN_LIMIT = 10;

/** 上位 AT の継続率は 93% で確定 */
export const UPPER_AT_CONTINUE_RATE = 0.93;

export const CONTINUE_RATE_DENOM = 10;

/** AT 移行時の継続率振分け(継続率 → 当選個数/10) */
export const CONTINUE_RATE_TABLE: Record<number, number> = {
  0.66: 5,
  0.79: 3,
  0.84: 1,
  0.88: 1,
};

/** AT 移行時の継続率抽せん */
export function drawContinueRate(rng: Rng): number {
  const value = rng.nextInt(CONTINUE_RATE_DENOM);
  let threshold = 0;
  for (const key of Object.keys(CONTINUE_RATE_TABLE)) {
    threshold += CONTINUE_RATE_TABLE[Number(key)];
    if (value < threshold) return Number(key);
  }
  throw new Error(`継続率振分けの合計が ${CONTINUE_RATE_DENOM} 未満`);
}

export const STOCK_DENOM = 1000;

/**
 * 小役パートの V ストック獲得率 / バトルパートの小役継続獲得率(当選個数/1000)。
 * 両テーブルは同一値(AT・上位 AT 共通)。
 */
export const V_STOCK_WEIGHTS: Partial<Record<Role, number>> = {
  REPLAY: 1,
  BELL: 1,
  WATERMELON_WEAK: 50,
  WATERMELON_STRONG: 500,
  CHERRY_CORNER: 50,
  CHERRY_CENTER: 1000,
  CHANCE_ME: 150,
  REACH_ME: 1000,
};

/** 小役パート中の V ストック抽せん / バトルパート中(継続確定済み)の V ストック抽せん */
export function drawVStock(rng: Rng, trigger: Role): boolean {
  const weight = V_STOCK_WEIGHTS[trigger];
  if (weight === undefined) return false;
  return rng.nextInt(STOCK_DENOM) < weight;
}

/** バトルパート中(継続未確定)の小役による継続抽せん。テーブルは V ストックと同一 */
export function drawBattleContinue(rng: Rng, trigger: Role): boolean {
  return drawVStock(rng, trigger);
}

/** バトルパート開始時の継続率による継続抽せん */
export function drawSetContinue(rng: Rng, continueRate: number): boolean {
  return rng.next() < continueRate;
}
