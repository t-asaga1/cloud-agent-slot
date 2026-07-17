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

import bgmAtBase from './audio/bgm/bgm_at_base.ogg';
import bgmAtKakutei from './audio/bgm/bgm_at_kakutei.ogg';
import bgmAtUpper from './audio/bgm/bgm_at_upper.ogg';
import bgmZencho from './audio/bgm/bgm_zencho.ogg';

import seBonus from './audio/se/se_bonus.ogg';
import seFail from './audio/se/se_fail.ogg';
import seLeverOn from './audio/se/se_lever_on.ogg';
import sePayout from './audio/se/se_payout.ogg';
import seRare from './audio/se/se_rare.ogg';
import seReelBlackout from './audio/se/se_reel_blackout.ogg';
import seReelStop from './audio/se/se_reel_stop.ogg';
import seTelop from './audio/se/se_telop.ogg';
import seWinCherryCenter from './audio/se/se_win_cherry_center.ogg';
import seWinCherryWeak from './audio/se/se_win_cherry_weak.ogg';
import seWinReplay from './audio/se/se_win_replay.ogg';
import seWinWatermelon from './audio/se/se_win_watermelon.ogg';

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

/**
 * BGM トラック ID(SPEC 確定 38 = 2026-07-14 のユーザー入稿・指示)。
 * 通常時の 4 背景(義経・静・弁慶・夕方)は BGM なし(無音)のためトラックを持たない。
 * - ZENCHO: 「Ashen Gate」= 前兆背景滞在中(連続演出用は別 BGM を用意予定 = 入稿待ち)
 * - AT_BASE: 「Skyfall Trigger」= 下位 AT 中基本(小役・バトル一気通貫)
 * - AT_KAKUTEI: 「頼朝テーマ曲」= 下位 AT 継続確定時に 1/5 でそのセットのみ
 * - AT_UPPER: 「義経テーマ曲」= 上位 AT 中基本(一気通貫)
 */
export type BgmTrackId = 'ZENCHO' | 'AT_BASE' | 'AT_KAKUTEI' | 'AT_UPPER';

/**
 * BGM トラック → ファイル URL(ユーザー入稿素材。差し替えポイント)。
 * ゲーム状態からのトラック解決は `src/ui/bgm.ts` の `bgmTrackForState` を使うこと。
 */
export const BGM_FILES: Record<BgmTrackId, string> = {
  ZENCHO: bgmZencho,
  AT_BASE: bgmAtBase,
  AT_KAKUTEI: bgmAtKakutei,
  AT_UPPER: bgmAtUpper,
};

/** 演出動画 URL */
export const EFFECT_VIDEOS = {
  cutinWeak: effectCutinWeak,
  cutinStrong: effectCutinStrong,
} as const;

// 予告ムービー(STEP 4c。51 本あるため glob で一括解決。ビルド時に列挙される)
const yokokuVideoModules = import.meta.glob('./video/yokoku/*.webm', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

/**
 * 予告ムービー URL(仮素材)。キー = ファイル名 stem(拡張子なし)。
 * 命名規約は docs/DIRECTION_SPEC.md「4.」:
 * - 通常背景固有: `yokoku_<bg>_koyu<1-5>_<weak|strong>`(bg = yoshitsune 等 4 種)
 * - 背景共通:     `yokoku_common<1-4>_<weak|strong>`
 * - 前兆背景:     `yokoku_zencho<1-3>`(期待度 弱 / 中 / 本前兆確定)
 * キーからの解決は `src/ui/direction.ts` の `yokokuVideoUrl` を使うこと
 * (存在しないキーを検知できる)。全 51 キーの存在は direction.test.ts で検証する。
 */
export const YOKOKU_VIDEOS: Record<string, string> = Object.fromEntries(
  Object.entries(yokokuVideoModules).map(([path, url]) => [
    path.slice('./video/yokoku/'.length, -'.webm'.length),
    url,
  ]),
);

// 予告の静止画(2026-07-17 方針転換 = 各予告は静止画 3 枚程度の紙芝居方式で制作。
// glob で一括解決。ビルド時に列挙される)
const yokokuImageModules = import.meta.glob('./images/yokoku/*.webp', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

/**
 * 予告の静止画 URL(AI 生成の実素材)。キー = ファイル名 stem(拡張子なし)。
 * 命名規約: `yokoku_<bg>_koyu<n>_still<連番>[_<weak|strong>]`
 * (弱強共通の画像はサフィックスなし。例: 静背景 固有 1 =
 * `yokoku_shizuka_koyu1_still1` / `..._still2_weak` / `..._still2_strong` / `..._still3`)。
 * キーからの解決は `src/ui/direction.ts` の `yokokuImageUrl` を使うこと
 * (存在しないキーを検知できる)。
 */
export const YOKOKU_IMAGES: Record<string, string> = Object.fromEntries(
  Object.entries(yokokuImageModules).map(([path, url]) => [
    path.slice('./images/yokoku/'.length, -'.webp'.length),
    url,
  ]),
);

// 連続演出ムービー(STEP 4d。46 本あるため glob で一括解決。ビルド時に列挙される)
const renzokuVideoModules = import.meta.glob('./video/renzoku/*.webm', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

/**
 * 連続演出ムービー URL(仮素材)。キー = ファイル名 stem(拡張子なし)。
 * 命名規約は docs/DIRECTION_SPEC.md「4.」:
 * - 連続演出 A/B(背景固有): `renzoku_<a|b>_<bg>_g<1-4>`(bg = 前兆背景含む 5 種)
 * - 連続演出 C(背景共通):   `renzoku_c_g<1-4>`
 * - 成否告知:               `renzoku_result_<win|lose>`
 * キーからの解決は `src/ui/direction.ts` の `renzokuVideoUrl` を使うこと
 * (存在しないキーを検知できる)。全 46 キーの存在は direction.test.ts で検証する。
 */
export const RENZOKU_VIDEOS: Record<string, string> = Object.fromEntries(
  Object.entries(renzokuVideoModules).map(([path, url]) => [
    path.slice('./video/renzoku/'.length, -'.webm'.length),
    url,
  ]),
);

// AT・上位 AT・エンディング演出ムービー(STEP 4e。45 本あるため glob で一括解決)
const atVideoModules = import.meta.glob('./video/at/*.webm', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

/**
 * AT・上位 AT・エンディング演出ムービー URL(仮素材)。キー = ファイル名 stem(拡張子なし)。
 * 命名規約は docs/DIRECTION_SPEC.md「4.」:
 * - AT 小役パート予告: `at_koyaku_<navi|rare|strong>` / `uat_koyaku_<...>`(6)
 * - バトルパート(AT): `battle_at_<01-20>`(Excel「AT中」シートのパターン No = 20)
 * - バトルパート(上位): `battle_uat_<no>`(Excel「上位AT中」の No。13・15・16・19 は
 *   歯抜けで 01-12, 14, 17, 18, 20, 21 の 17 本)
 * - エンディング: `ending_<to_upper|complete>`(2)
 * キーからの解決は `src/ui/direction.ts` の `atVideoUrl` を使うこと
 * (存在しないキーを検知できる)。全 45 キーの存在は direction.test.ts で検証する。
 */
export const AT_VIDEOS: Record<string, string> = Object.fromEntries(
  Object.entries(atVideoModules).map(([path, url]) => [
    path.slice('./video/at/'.length, -'.webm'.length),
    url,
  ]),
);

/**
 * 効果音 URL。
 * leverOn / reelStop / reelBlackout / win* はユーザー入稿素材(2026-07-15 = SPEC 確定 40)、
 * それ以外は仮素材。
 * ゲーム中の SE 再生は本テーブルを直接参照せず、`src/ui/sound.ts` の
 * サウンドキュー(用途 ID → SE ファイル)を経由すること。実素材の差し替えは
 * (1) 同名ファイルの置き換え、または (2) sound.ts のキュー表の張り替え、のどちらかで済む。
 */
export const SE = {
  leverOn: seLeverOn,
  reelStop: seReelStop,
  reelBlackout: seReelBlackout,
  winReplay: seWinReplay,
  winWatermelon: seWinWatermelon,
  winCherryWeak: seWinCherryWeak,
  winCherryCenter: seWinCherryCenter,
  payout: sePayout,
  rare: seRare,
  bonus: seBonus,
  telop: seTelop,
  fail: seFail,
} as const;
