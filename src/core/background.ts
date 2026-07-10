import type { Mode } from './mode';
import type { Rng } from './rng';

/**
 * 背景と背景移行抽せん。docs/SPEC.md「5. 背景と背景移行抽せん」準拠。
 * 数値は Excel(背景移行抽せんシート)+ 2026-07-10 ユーザー回答の訂正
 * (本前兆移行時テーブルの静・弁慶行は自背景 0.25 が正)。
 * 振分けは分母 100 の整数で持つ。行合計 = 100 はテストで保証。
 * AT/上位 AT 中の背景は各パート固定のため本モジュールでは扱わない
 * (AT 中は背景移行抽せん停止・確定・回答 11)。
 */
export const BACKGROUNDS = ['YOSHITSUNE', 'SHIZUKA', 'BENKEI', 'YUGATA', 'ZENCHO'] as const;

export type Background = (typeof BACKGROUNDS)[number];

export const BACKGROUND_DENOM = 100;

/** [義経, 静, 弁慶, 夕方, 前兆] の当選個数(100 中)。自背景の値は「維持」の意味 */
export type BackgroundWeights = readonly [number, number, number, number, number];

export type BackgroundTable = Record<Background, BackgroundWeights>;

/** 背景移行の契機 */
export const BACKGROUND_TRIGGERS = [
  'ELAPSED_30G', // 同一背景で 30 ゲーム経過
  'FAKE_OMEN_NEXT', // 偽前兆演出に当せんした次のゲーム
  'FAKE_OMEN_FAIL', // 偽前兆演出後、連続演出に失敗した後のゲーム
  'HONZENCHO_NEXT', // 本前兆にモード移行した次のゲーム
] as const;

export type BackgroundTrigger = (typeof BACKGROUND_TRIGGERS)[number];

/** ゲーム開始時 / AT 終了後の背景初期設定(両者同一テーブル)。滞在モード別 */
export const BACKGROUND_INITIAL: Record<Mode, BackgroundWeights> = {
  HELL: [50, 25, 25, 0, 0],
  NORMAL: [50, 25, 25, 0, 0],
  HEAVEN: [10, 40, 10, 40, 0],
  HONZENCHO: [1, 1, 1, 7, 90],
};

/**
 * 本前兆にモード移行した次のゲーム(全モード共通)。
 * 静・弁慶行の自背景は Excel の 0.5 でなく 0.25 が正(確定・回答 2)。
 */
const HONZENCHO_NEXT_TABLE: BackgroundTable = {
  YOSHITSUNE: [25, 0, 0, 25, 50],
  SHIZUKA: [0, 25, 0, 25, 50],
  BENKEI: [0, 0, 25, 25, 50],
  YUGATA: [0, 0, 0, 25, 75],
  ZENCHO: [0, 0, 0, 0, 100],
};

/** 地獄・通常モード滞在(両モード同一テーブル) */
const HELL_NORMAL_TABLES: Record<BackgroundTrigger, BackgroundTable> = {
  ELAPSED_30G: {
    YOSHITSUNE: [0, 100, 0, 0, 0],
    SHIZUKA: [0, 0, 100, 0, 0],
    BENKEI: [100, 0, 0, 0, 0],
    YUGATA: [25, 25, 25, 25, 0],
    ZENCHO: [25, 25, 25, 25, 0],
  },
  FAKE_OMEN_NEXT: {
    YOSHITSUNE: [50, 0, 0, 25, 25],
    SHIZUKA: [0, 50, 0, 25, 25],
    BENKEI: [0, 0, 50, 25, 25],
    YUGATA: [0, 0, 0, 50, 50],
    ZENCHO: [0, 0, 0, 0, 100],
  },
  FAKE_OMEN_FAIL: {
    YOSHITSUNE: [0, 100, 0, 0, 0],
    SHIZUKA: [0, 0, 100, 0, 0],
    BENKEI: [100, 0, 0, 0, 0],
    YUGATA: [33, 34, 33, 0, 0],
    ZENCHO: [33, 34, 33, 0, 0],
  },
  HONZENCHO_NEXT: HONZENCHO_NEXT_TABLE,
};

/** 天国モード滞在(30G 経過と連続演出失敗後は同一テーブル) */
const HEAVEN_30G_TABLE: BackgroundTable = {
  YOSHITSUNE: [0, 50, 0, 50, 0],
  SHIZUKA: [0, 0, 50, 50, 0],
  BENKEI: [50, 0, 0, 50, 0],
  YUGATA: [5, 5, 5, 85, 0],
  ZENCHO: [5, 5, 5, 85, 0],
};

const HEAVEN_TABLES: Record<BackgroundTrigger, BackgroundTable> = {
  ELAPSED_30G: HEAVEN_30G_TABLE,
  FAKE_OMEN_NEXT: {
    YOSHITSUNE: [25, 0, 0, 50, 25],
    SHIZUKA: [0, 25, 0, 50, 25],
    BENKEI: [0, 0, 25, 50, 25],
    YUGATA: [0, 0, 0, 50, 50],
    ZENCHO: [0, 0, 0, 0, 100],
  },
  FAKE_OMEN_FAIL: HEAVEN_30G_TABLE,
  HONZENCHO_NEXT: HONZENCHO_NEXT_TABLE,
};

/** 滞在モード × 移行契機 → 「現在の背景 → 移行先」テーブル */
export const BACKGROUND_TRANSITION: Record<
  Exclude<Mode, 'HONZENCHO'>,
  Record<BackgroundTrigger, BackgroundTable>
> = {
  HELL: HELL_NORMAL_TABLES,
  NORMAL: HELL_NORMAL_TABLES,
  HEAVEN: HEAVEN_TABLES,
};

function drawFromWeights(rng: Rng, weights: BackgroundWeights): Background {
  const value = rng.nextInt(BACKGROUND_DENOM);
  let threshold = 0;
  for (let i = 0; i < BACKGROUNDS.length; i++) {
    threshold += weights[i];
    if (value < threshold) return BACKGROUNDS[i];
  }
  throw new Error(`背景振分けの合計が ${BACKGROUND_DENOM} 未満: ${weights}`);
}

/** ゲーム開始時 / AT 終了後の背景初期抽せん */
export function drawInitialBackground(rng: Rng, mode: Mode): Background {
  return drawFromWeights(rng, BACKGROUND_INITIAL[mode]);
}

/**
 * 背景移行抽せん。
 * HONZENCHO_NEXT は全モード共通テーブル(本前兆モードへ移行済みの次ゲームで参照される)。
 * それ以外の契機は本前兆モード滞在中には発生しない(モード移行抽せん停止のため)。
 */
export function drawBackgroundTransition(
  rng: Rng,
  mode: Mode,
  trigger: BackgroundTrigger,
  current: Background,
): Background {
  const table =
    trigger === 'HONZENCHO_NEXT'
      ? HONZENCHO_NEXT_TABLE
      : mode === 'HONZENCHO'
        ? undefined
        : BACKGROUND_TRANSITION[mode][trigger];
  if (table === undefined) return current;
  return drawFromWeights(rng, table[current]);
}
