/**
 * 素材の ID → URL 解決。素材参照は必ず本モジュール経由で行うこと
 * (Vite の import で解決させ、ビルド時に存在チェックが効くようにする)。
 * 出所・ライセンスは manifest.json を参照。
 */

import type { Background } from '../core/background';
import type { ReelSymbol } from '../core/reel';

import cabinetFrame from './images/cabinet/cabinet_frame.webp';
import lcdBgFallback from './images/lcd/lcd_bg_fallback.webp';

import symbolBarBlack from './images/reels/symbol_bar_black.webp';
import symbolBarWhite from './images/reels/symbol_bar_white.webp';
import symbolBell from './images/reels/symbol_bell.webp';
import symbolBlank from './images/reels/symbol_blank.webp';
import symbolCherry from './images/reels/symbol_cherry.webp';
import symbolReplay from './images/reels/symbol_replay.webp';
import symbolSevenRed from './images/reels/symbol_seven_red.webp';
import symbolWatermelon from './images/reels/symbol_watermelon.webp';

import stageAtBg from './video/stage/stage_at_bg.webm';
import stageBgBenkei from './video/stage/stage_bg_benkei.webm';
import stageBgShizuka from './video/stage/stage_bg_shizuka.webm';
import stageBgYoshitsune from './video/stage/stage_bg_yoshitsune.webm';
import stageBgYugata from './video/stage/stage_bg_yugata.webm';
import stageBgZencho from './video/stage/stage_bg_zencho.webm';
import stageUpperAtBg from './video/stage/stage_upper_at_bg.webm';

import effectCutinStrong from './video/effect/effect_cutin_strong.webm';
import effectCutinWeak from './video/effect/effect_cutin_weak.webm';

import bgmAtEnding from './audio/bgm/bgm_at_ending.ogg';
import bgmAtExtend from './audio/bgm/bgm_at_extend.ogg';
import bgmAtMain from './audio/bgm/bgm_at_main.ogg';
import bgmAtUpper from './audio/bgm/bgm_at_upper.ogg';
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

/** リール図柄 → 画像 URL(全 8 種。実素材=ユーザー入稿。docs/SPEC.md「3.」) */
export const SYMBOL_IMAGES: Record<ReelSymbol, string> = {
  SEVEN_RED: symbolSevenRed,
  BAR_BLACK: symbolBarBlack,
  BAR_WHITE: symbolBarWhite,
  BELL: symbolBell,
  WATERMELON: symbolWatermelon,
  CHERRY: symbolCherry,
  REPLAY: symbolReplay,
  BLANK: symbolBlank,
};

/**
 * 演出ステージ ID(docs/SPEC.md「5. 背景」の 9 種)。
 * 通常 5 背景 + AT 2(小役/バトル)+ 上位 AT 2(小役/バトル)。
 */
export const STAGE_IDS = [
  'BG_YOSHITSUNE',
  'BG_SHIZUKA',
  'BG_BENKEI',
  'BG_YUGATA',
  'BG_ZENCHO',
  'AT_KOYAKU',
  'AT_BATTLE',
  'UPPER_AT_KOYAKU',
  'UPPER_AT_BATTLE',
] as const;

export type StageId = (typeof STAGE_IDS)[number];

export const STAGE_LABELS: Record<StageId, string> = {
  BG_YOSHITSUNE: '義経背景',
  BG_SHIZUKA: '静背景',
  BG_BENKEI: '弁慶背景',
  BG_YUGATA: '夕方背景',
  BG_ZENCHO: '前兆背景',
  AT_KOYAKU: 'AT中(小役パート)',
  AT_BATTLE: 'AT中(バトルパート)',
  UPPER_AT_KOYAKU: '上位AT中(小役パート)',
  UPPER_AT_BATTLE: '上位AT中(バトルパート)',
};

/** 通常時の背景(core/background.ts の Background)→ ステージ ID */
export const STAGE_FOR_BACKGROUND: Record<Background, StageId> = {
  YOSHITSUNE: 'BG_YOSHITSUNE',
  SHIZUKA: 'BG_SHIZUKA',
  BENKEI: 'BG_BENKEI',
  YUGATA: 'BG_YUGATA',
  ZENCHO: 'BG_ZENCHO',
};

/**
 * ステージ → ループ背景動画 URL。
 * AT / 上位 AT は小役・バトルの各パート専用動画が未入稿のため、
 * 入稿済みの AT 背景 1 本を両パートで共用している(入稿され次第差し替え)。
 */
export const STAGE_VIDEOS: Record<StageId, string> = {
  BG_YOSHITSUNE: stageBgYoshitsune,
  BG_SHIZUKA: stageBgShizuka,
  BG_BENKEI: stageBgBenkei,
  BG_YUGATA: stageBgYugata,
  BG_ZENCHO: stageBgZencho,
  AT_KOYAKU: stageAtBg,
  AT_BATTLE: stageAtBg,
  UPPER_AT_KOYAKU: stageUpperAtBg,
  UPPER_AT_BATTLE: stageUpperAtBg,
};

/** ステージ → BGM URL(BGM は全て仮素材のまま。実素材入稿で差し替え) */
export const STAGE_BGMS: Record<StageId, string> = {
  BG_YOSHITSUNE: bgmNormalA,
  BG_SHIZUKA: bgmNormalB,
  BG_BENKEI: bgmNormalC,
  BG_YUGATA: bgmCzLow,
  BG_ZENCHO: bgmOmen,
  AT_KOYAKU: bgmAtMain,
  AT_BATTLE: bgmAtExtend,
  UPPER_AT_KOYAKU: bgmAtUpper,
  UPPER_AT_BATTLE: bgmAtEnding,
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
