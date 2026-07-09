/**
 * 素材の ID → URL 解決。素材参照は必ず本モジュール経由で行うこと
 * (Vite の import で解決させ、ビルド時に存在チェックが効くようにする)。
 * 出所・ライセンスは manifest.json を参照。
 */

import type { ReelSymbol } from '../core/reel';

import cabinetFrame from './images/cabinet/cabinet_frame.webp';
import lcdBgFallback from './images/lcd/lcd_bg_fallback.webp';

import symbolBar from './images/reels/symbol_bar.webp';
import symbolBell from './images/reels/symbol_bell.webp';
import symbolCherry from './images/reels/symbol_cherry.webp';
import symbolReplay from './images/reels/symbol_replay.webp';
import symbolSevenRed from './images/reels/symbol_seven_red.webp';
import symbolSevenWhite from './images/reels/symbol_seven_white.webp';
import symbolWatermelon from './images/reels/symbol_watermelon.webp';

import stageAtEnding from './video/stage/stage_at_ending.webm';
import stageAtExtend from './video/stage/stage_at_extend.webm';
import stageAtMain from './video/stage/stage_at_main.webm';
import stageAtUpper from './video/stage/stage_at_upper.webm';
import stageBonusBig from './video/stage/stage_bonus_big.webm';
import stageBonusReg from './video/stage/stage_bonus_reg.webm';
import stageCzHigh from './video/stage/stage_cz_high.webm';
import stageCzLow from './video/stage/stage_cz_low.webm';
import stageNormalA from './video/stage/stage_normal_a.webm';
import stageNormalB from './video/stage/stage_normal_b.webm';
import stageNormalC from './video/stage/stage_normal_c.webm';
import stageOmen from './video/stage/stage_omen.webm';

import effectCutinStrong from './video/effect/effect_cutin_strong.webm';
import effectCutinWeak from './video/effect/effect_cutin_weak.webm';

import bgmAtEnding from './audio/bgm/bgm_at_ending.ogg';
import bgmAtExtend from './audio/bgm/bgm_at_extend.ogg';
import bgmAtMain from './audio/bgm/bgm_at_main.ogg';
import bgmAtUpper from './audio/bgm/bgm_at_upper.ogg';
import bgmBonusBig from './audio/bgm/bgm_bonus_big.ogg';
import bgmBonusReg from './audio/bgm/bgm_bonus_reg.ogg';
import bgmCzHigh from './audio/bgm/bgm_cz_high.ogg';
import bgmCzLow from './audio/bgm/bgm_cz_low.ogg';
import bgmNormalA from './audio/bgm/bgm_normal_a.ogg';
import bgmNormalB from './audio/bgm/bgm_normal_b.ogg';
import bgmNormalC from './audio/bgm/bgm_normal_c.ogg';
import bgmOmen from './audio/bgm/bgm_omen.ogg';

import seBonus from './audio/se/se_bonus.ogg';
import seLeverOn from './audio/se/se_lever_on.ogg';
import sePayout from './audio/se/se_payout.ogg';
import seRare from './audio/se/se_rare.ogg';
import seReelStop from './audio/se/se_reel_stop.ogg';

export const CABINET_FRAME_URL = cabinetFrame;
export const LCD_BG_FALLBACK_URL = lcdBgFallback;

/** リール図柄 → 画像 URL */
export const SYMBOL_IMAGES: Record<ReelSymbol, string> = {
  SEVEN_RED: symbolSevenRed,
  SEVEN_WHITE: symbolSevenWhite,
  BAR: symbolBar,
  BELL: symbolBell,
  WATERMELON: symbolWatermelon,
  CHERRY: symbolCherry,
  REPLAY: symbolReplay,
};

/** 演出ステージ ID(docs/SPEC.md「4. 演出状態」) */
export const STAGE_IDS = [
  'STAGE_NORMAL_A',
  'STAGE_NORMAL_B',
  'STAGE_NORMAL_C',
  'STAGE_CZ_LOW',
  'STAGE_CZ_HIGH',
  'STAGE_OMEN',
  'STAGE_BONUS_BIG',
  'STAGE_BONUS_REG',
  'STAGE_AT_MAIN',
  'STAGE_AT_UPPER',
  'STAGE_AT_EXTEND',
  'STAGE_AT_ENDING',
] as const;

export type StageId = (typeof STAGE_IDS)[number];

export const STAGE_LABELS: Record<StageId, string> = {
  STAGE_NORMAL_A: '通常ステージA',
  STAGE_NORMAL_B: '通常ステージB',
  STAGE_NORMAL_C: '通常ステージC',
  STAGE_CZ_LOW: 'チャンスゾーン(低)',
  STAGE_CZ_HIGH: 'チャンスゾーン(高)',
  STAGE_OMEN: '前兆ステージ',
  STAGE_BONUS_BIG: 'BIGボーナス中',
  STAGE_BONUS_REG: 'REGボーナス中',
  STAGE_AT_MAIN: 'AT本編',
  STAGE_AT_UPPER: '上位AT',
  STAGE_AT_EXTEND: '継続バトル',
  STAGE_AT_ENDING: 'エンディング',
};

/** ステージ → ループ背景動画 URL */
export const STAGE_VIDEOS: Record<StageId, string> = {
  STAGE_NORMAL_A: stageNormalA,
  STAGE_NORMAL_B: stageNormalB,
  STAGE_NORMAL_C: stageNormalC,
  STAGE_CZ_LOW: stageCzLow,
  STAGE_CZ_HIGH: stageCzHigh,
  STAGE_OMEN: stageOmen,
  STAGE_BONUS_BIG: stageBonusBig,
  STAGE_BONUS_REG: stageBonusReg,
  STAGE_AT_MAIN: stageAtMain,
  STAGE_AT_UPPER: stageAtUpper,
  STAGE_AT_EXTEND: stageAtExtend,
  STAGE_AT_ENDING: stageAtEnding,
};

/** ステージ → BGM URL */
export const STAGE_BGMS: Record<StageId, string> = {
  STAGE_NORMAL_A: bgmNormalA,
  STAGE_NORMAL_B: bgmNormalB,
  STAGE_NORMAL_C: bgmNormalC,
  STAGE_CZ_LOW: bgmCzLow,
  STAGE_CZ_HIGH: bgmCzHigh,
  STAGE_OMEN: bgmOmen,
  STAGE_BONUS_BIG: bgmBonusBig,
  STAGE_BONUS_REG: bgmBonusReg,
  STAGE_AT_MAIN: bgmAtMain,
  STAGE_AT_UPPER: bgmAtUpper,
  STAGE_AT_EXTEND: bgmAtExtend,
  STAGE_AT_ENDING: bgmAtEnding,
};

/** 演出動画 URL */
export const EFFECT_VIDEOS = {
  cutinWeak: effectCutinWeak,
  cutinStrong: effectCutinStrong,
} as const;

/** 効果音 URL */
export const SE = {
  leverOn: seLeverOn,
  reelStop: seReelStop,
  payout: sePayout,
  rare: seRare,
  bonus: seBonus,
} as const;
