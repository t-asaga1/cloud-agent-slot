import type { Rng } from './rng';
import type { Role } from './roles';

/**
 * モードとモード移行抽せん。docs/SPEC.md「4. モードとモード移行抽せん」準拠。
 * 数値は Excel(モード移行抽せんシート)+ 2026-07-10 ユーザー回答の訂正
 * (AT 終了後の残り 0.0001 は地獄へ加算)。
 * 振分けは分母 10000 の整数(当選個数)で持つ。行合計 = 10000 はテストで保証。
 */
export const MODES = ['HELL', 'NORMAL', 'HEAVEN', 'HONZENCHO'] as const;

export type Mode = (typeof MODES)[number];

export const MODE_DENOM = 10000;

/** [地獄, 通常, 天国, 本前兆] の当選個数(10000 中) */
export type ModeWeights = readonly [number, number, number, number];

type TransitionTable = Partial<Record<Role, ModeWeights>>;

/**
 * 滞在モード × 契機役 → 移行先振分け。
 * 記載のない役(ハズレ)は移行なし=現状維持(確定・回答 8)。
 * 本前兆滞在中はモード移行抽せん停止(確定・回答 9)のためテーブルなし。
 */
export const MODE_TRANSITION: Record<Exclude<Mode, 'HONZENCHO'>, TransitionTable> = {
  HELL: {
    REPLAY: [10000, 0, 0, 0],
    BELL: [10000, 0, 0, 0],
    WATERMELON_WEAK: [5392, 4069, 271, 268],
    WATERMELON_STRONG: [0, 6593, 2500, 907],
    CHERRY_CORNER: [9082, 792, 18, 108],
    CHERRY_CENTER: [0, 6875, 625, 2500],
    CHANCE_ME: [7176, 2131, 19, 674],
    REACH_ME: [0, 0, 0, 10000],
  },
  NORMAL: {
    REPLAY: [800, 9200, 0, 0],
    BELL: [0, 10000, 0, 0],
    WATERMELON_WEAK: [0, 5388, 4009, 603],
    WATERMELON_STRONG: [0, 0, 8984, 1016],
    CHERRY_CORNER: [0, 9112, 497, 391],
    CHERRY_CENTER: [0, 6250, 1250, 2500],
    CHANCE_ME: [0, 7372, 2342, 286],
    REACH_ME: [0, 0, 0, 10000],
  },
  HEAVEN: {
    REPLAY: [0, 800, 9200, 0],
    BELL: [0, 0, 10000, 0],
    WATERMELON_WEAK: [0, 0, 8084, 1916],
    WATERMELON_STRONG: [0, 0, 5000, 5000],
    CHERRY_CORNER: [0, 0, 9286, 714],
    CHERRY_CENTER: [0, 0, 0, 10000],
    CHANCE_ME: [0, 0, 7500, 2500],
    REACH_ME: [0, 0, 0, 10000],
  },
};

/**
 * モード初期設定。AT 終了後は Excel 値(地獄 3155)の合計が 9999 のため、
 * 残り 1 を地獄へ加算(確定・回答 1)。
 */
export const MODE_INITIAL: Record<'GAME_START' | 'AT_END', ModeWeights> = {
  GAME_START: [3001, 4075, 2792, 132],
  AT_END: [3156, 3176, 3594, 74],
};

function drawFromWeights(rng: Rng, weights: ModeWeights): Mode {
  const value = rng.nextInt(MODE_DENOM);
  let threshold = 0;
  for (let i = 0; i < MODES.length; i++) {
    threshold += weights[i];
    if (value < threshold) return MODES[i];
  }
  throw new Error(`モード振分けの合計が ${MODE_DENOM} 未満: ${weights}`);
}

/** ゲーム開始時 / AT 終了後のモード初期抽せん */
export function drawInitialMode(rng: Rng, timing: 'GAME_START' | 'AT_END'): Mode {
  return drawFromWeights(rng, MODE_INITIAL[timing]);
}

/**
 * モード移行抽せん。
 * - 本前兆滞在中は抽せん停止(現状維持)。
 * - テーブルにない契機(ハズレ等)は現状維持。
 */
export function drawModeTransition(rng: Rng, current: Mode, trigger: Role): Mode {
  if (current === 'HONZENCHO') return current;
  const weights = MODE_TRANSITION[current][trigger];
  if (weights === undefined) return current;
  return drawFromWeights(rng, weights);
}

/** 弱スイカ・角チェリー・チャンス目の偽前兆突入率 = 1/10(確定・回答 3) */
export const FAKE_OMEN_RATE_DENOM = 10;

/** 偽前兆突入契機となるレア役(1/10 グループ) */
const FAKE_OMEN_ONE_TENTH: readonly Role[] = ['WATERMELON_WEAK', 'CHERRY_CORNER', 'CHANCE_ME'];

/** 本前兆に移行しなかった場合に 100% 偽前兆となるレア役 */
const FAKE_OMEN_ALWAYS: readonly Role[] = ['WATERMELON_STRONG', 'CHERRY_CENTER'];

/**
 * 偽前兆突入抽せん(モード移行抽せんシートが正・確定・回答 3)。
 * @param trigger 契機役
 * @param movedToHonzencho この契機のモード移行抽せんで本前兆へ移行したか
 */
export function drawFakeOmen(rng: Rng, trigger: Role, movedToHonzencho: boolean): boolean {
  if (movedToHonzencho) return false;
  if (FAKE_OMEN_ALWAYS.includes(trigger)) return true;
  if (FAKE_OMEN_ONE_TENTH.includes(trigger)) {
    return rng.nextInt(FAKE_OMEN_RATE_DENOM) === 0;
  }
  return false;
}
