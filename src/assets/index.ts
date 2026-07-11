/**
 * 素材の ID → URL 解決。素材参照は必ず本モジュール経由で行うこと
 * (Vite の import で解決させ、ビルド時に存在チェックが効くようにする)。
 * 出所・ライセンスは manifest.json を参照。
 */

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

import stageAt from './video/stage/stage_at.webm';
import stageAtUpper from './video/stage/stage_at_upper.webm';
import stageBenkei from './video/stage/stage_benkei.webm';
import stageShizuka from './video/stage/stage_shizuka.webm';
import stageYoshitsune from './video/stage/stage_yoshitsune.webm';
import stageYugata from './video/stage/stage_yugata.webm';
import stageZencho from './video/stage/stage_zencho.webm';

import effectCutinStrong from './video/effect/effect_cutin_strong.webm';
import effectCutinWeak from './video/effect/effect_cutin_weak.webm';

import bgmAtBattle from './audio/bgm/bgm_at_battle.ogg';
import bgmAtKoyaku from './audio/bgm/bgm_at_koyaku.ogg';
import bgmAtUpperBattle from './audio/bgm/bgm_at_upper_battle.ogg';
import bgmAtUpperKoyaku from './audio/bgm/bgm_at_upper_koyaku.ogg';
import bgmBenkei from './audio/bgm/bgm_benkei.ogg';
import bgmShizuka from './audio/bgm/bgm_shizuka.ogg';
import bgmYoshitsune from './audio/bgm/bgm_yoshitsune.ogg';
import bgmYugata from './audio/bgm/bgm_yugata.ogg';
import bgmZencho from './audio/bgm/bgm_zencho.ogg';

import seBonus from './audio/se/se_bonus.ogg';
import seLeverOn from './audio/se/se_lever_on.ogg';
import sePayout from './audio/se/se_payout.ogg';
import seRare from './audio/se/se_rare.ogg';
import seReelStop from './audio/se/se_reel_stop.ogg';

export const CABINET_FRAME_URL = cabinetFrame;
export const LCD_BG_FALLBACK_URL = lcdBgFallback;

/** リール図柄 8 種 → 画像 URL(ユーザー入稿素材。図柄 ID は SPEC「3.」の 8 種と 1:1 対応) */
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

/** 演出ステージ(背景)ID。docs/SPEC.md「5.」の背景 9 種と一致 */
export const STAGE_IDS = [
  'STAGE_YOSHITSUNE',
  'STAGE_SHIZUKA',
  'STAGE_BENKEI',
  'STAGE_YUGATA',
  'STAGE_ZENCHO',
  'STAGE_AT_KOYAKU',
  'STAGE_AT_BATTLE',
  'STAGE_AT_UPPER_KOYAKU',
  'STAGE_AT_UPPER_BATTLE',
] as const;

export type StageId = (typeof STAGE_IDS)[number];

export const STAGE_LABELS: Record<StageId, string> = {
  STAGE_YOSHITSUNE: '義経背景',
  STAGE_SHIZUKA: '静背景',
  STAGE_BENKEI: '弁慶背景',
  STAGE_YUGATA: '夕方背景',
  STAGE_ZENCHO: '前兆背景',
  STAGE_AT_KOYAKU: 'AT(小役パート)',
  STAGE_AT_BATTLE: 'AT(バトルパート)',
  STAGE_AT_UPPER_KOYAKU: '上位AT(小役パート)',
  STAGE_AT_UPPER_BATTLE: '上位AT(バトルパート)',
};

/**
 * ステージ → ループ背景動画 URL(ユーザー入稿素材)。
 * AT / 上位 AT は小役・バトル各パート専用素材が未入稿のため、当面共用。
 */
export const STAGE_VIDEOS: Record<StageId, string> = {
  STAGE_YOSHITSUNE: stageYoshitsune,
  STAGE_SHIZUKA: stageShizuka,
  STAGE_BENKEI: stageBenkei,
  STAGE_YUGATA: stageYugata,
  STAGE_ZENCHO: stageZencho,
  STAGE_AT_KOYAKU: stageAt,
  STAGE_AT_BATTLE: stageAt,
  STAGE_AT_UPPER_KOYAKU: stageAtUpper,
  STAGE_AT_UPPER_BATTLE: stageAtUpper,
};

/** ステージ → BGM URL(仮素材) */
export const STAGE_BGMS: Record<StageId, string> = {
  STAGE_YOSHITSUNE: bgmYoshitsune,
  STAGE_SHIZUKA: bgmShizuka,
  STAGE_BENKEI: bgmBenkei,
  STAGE_YUGATA: bgmYugata,
  STAGE_ZENCHO: bgmZencho,
  STAGE_AT_KOYAKU: bgmAtKoyaku,
  STAGE_AT_BATTLE: bgmAtBattle,
  STAGE_AT_UPPER_KOYAKU: bgmAtUpperKoyaku,
  STAGE_AT_UPPER_BATTLE: bgmAtUpperBattle,
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
