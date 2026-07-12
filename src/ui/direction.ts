/**
 * 演出マッピング層(STEP 3d)= `GameEvent` / `GameState` → 画面演出(仮)の対応表。
 * React 非依存の純ロジック。
 *
 * # 構造(STEP 4 のシナリオテーブルへ差し替え可能にする)
 *
 * - 出力は宣言的データのみ:
 *   - `StateOverlay` = フェーズ由来の常時表示(前兆テロップ / 連続演出画面 / エンディング)。
 *     毎ゲーム `overlayForState(state)` で導出する(状態が変われば自然に消える)。
 *   - `Cutin` = イベント由来のワンショット表示(AT 突入・セット継続・成否告知 等)。
 *     1G の締め(全停止後)に `cutinsForEvents(result.events)` で列挙し、UI 側
 *     (`DirectionLayer`)がキューに積んで順番に表示・SE 再生する。
 * - 描画(`DirectionLayer.tsx`)はこの宣言的データを表示するだけで、演出の中身を知らない。
 * - STEP 4 でシナリオ方式(確定 28 = 前兆当せん時にシナリオ一括決定)へ移行するときは、
 *   本モジュールの「イベント → 仮演出」対応表を「シナリオテーブル → 演出」の解決へ
 *   置き換えるだけでよい(`StateOverlay` / `Cutin` の型と描画側は変えない)。
 * - SE はサウンドキュー ID(`src/ui/sound.ts`)で参照し、音声ファイルへ直接依存しない
 *   (BGM / SE の実素材差し替えは sound.ts / assets 側で完結する)。
 */
import { EFFECT_VIDEOS } from '../assets';
import { RENZOKU_GAMES, type RenzokuKind } from '../core/omen';
import { isRareRole, type Role } from '../core/roles';
import {
  ENDING_GAMES,
  type EndingAfter,
  type GameEvent,
  type GameState,
} from '../core/state';
import type { SoundCueId } from './sound';

// ---------------------------------------------------------------------------
// フェーズ由来の常時表示(StateOverlay)
// ---------------------------------------------------------------------------

/** フェーズ由来の常時表示(毎ゲーム state から導出。仮演出) */
export type StateOverlay =
  | {
      /** 前兆中(偽・本共通)の画面下テロップ。演出内容は見せず「何か起きそう」だけ示す */
      kind: 'TELOP';
      text: string;
    }
  | {
      /** 連続演出 4G の全画面表示(種別 A/B/C・n/4G。成否告知はカットイン側) */
      kind: 'RENZOKU';
      renzoku: RenzokuKind;
      /** 何 G 目か(1〜totalGames) */
      game: number;
      totalGames: number;
      title: string;
      text: string;
    }
  | {
      /** エンディング中のバナー(n/10G) */
      kind: 'ENDING';
      game: number;
      totalGames: number;
      after: EndingAfter;
    };

/**
 * 前兆中の仮テロップ(経過 G でローテーション)。
 * 偽・本で内容を変えない(前兆種別を悟らせない)。STEP 4 でシナリオ別のセリフへ差し替え。
 */
export const TELOP_TEXTS: readonly string[] = [
  '…殺気を感じる…',
  '風が騒がしい…',
  '遠くに馬蹄の音…',
  '胸騒ぎがする…',
];

/** 連続演出の仮タイトルとあおりテキスト(STEP 4 で実演出へ差し替え) */
export const RENZOKU_PRESENTATION: Record<RenzokuKind, { title: string; text: string }> = {
  A: { title: '連続演出A「追走」', text: '義経、賊を追う…!' },
  B: { title: '連続演出B「一騎打ち」', text: '弁慶との一騎打ち…!' },
  C: { title: '連続演出C「決戦」', text: '宿命の決戦、開幕…!' },
};

/** 現在のフェーズから常時表示の演出を導出する(通常時・AT 中は undefined) */
export function overlayForState(state: GameState): StateOverlay | undefined {
  const { phase } = state;
  switch (phase.type) {
    case 'OMEN':
      // 当せんゲーム(game 0)からテロップを出す(次ゲームが前兆 1G 目 = 確定 18)
      return { kind: 'TELOP', text: TELOP_TEXTS[phase.game % TELOP_TEXTS.length] };
    case 'RENZOKU': {
      const { title, text } = RENZOKU_PRESENTATION[phase.renzoku];
      return {
        kind: 'RENZOKU',
        renzoku: phase.renzoku,
        game: phase.game,
        totalGames: RENZOKU_GAMES,
        title,
        text,
      };
    }
    case 'ENDING':
      return { kind: 'ENDING', game: phase.game, totalGames: ENDING_GAMES, after: phase.after };
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// イベント由来のワンショット表示(Cutin)
// ---------------------------------------------------------------------------

/** カットインの見た目の区分(色・装飾は DirectionLayer / CSS 側で解決) */
export type CutinStyle = 'WIN' | 'LOSE' | 'SPECIAL' | 'INFO';

/** ワンショットのカットイン演出(仮)。UI 側がキューに積んで durationMs ずつ順に表示する */
export interface Cutin {
  title: string;
  sub?: string;
  style: CutinStyle;
  /** 背景の演出動画(`EFFECT_VIDEOS` の URL。省略時はテキストのみ) */
  videoUrl?: string;
  /** 表示開始時に鳴らすサウンドキュー(省略時は無音) */
  sound?: SoundCueId;
  durationMs: number;
}

/**
 * イベント → カットインの対応表(仮演出)。
 * 内部状態を悟らせるイベント(モード移行・偽前兆突入・書き換え・背景移行)は演出にしない。
 * 発行順のまま表示キューへ積まれる(例: RENZOKU_RESULT 成功 → AT_START の 2 連続)。
 */
export function cutinsForEvents(events: readonly GameEvent[]): Cutin[] {
  const cutins: Cutin[] = [];
  for (const event of events) {
    switch (event.type) {
      case 'RENZOKU_RESULT':
        cutins.push(
          event.success
            ? {
                title: '勝利!',
                sub: `連続演出${event.renzoku} 成功`,
                style: 'WIN',
                videoUrl: EFFECT_VIDEOS.cutinStrong,
                sound: 'RENZOKU_SUCCESS',
                durationMs: 2000,
              }
            : {
                title: '敗北…',
                sub: `連続演出${event.renzoku} 失敗`,
                style: 'LOSE',
                sound: 'RENZOKU_FAIL',
                durationMs: 1800,
              },
        );
        break;
      case 'AT_START':
        cutins.push({
          title: 'AT突入!',
          sub: `継続率 ${Math.round(event.continueRate * 100)}%`,
          style: 'WIN',
          videoUrl: EFFECT_VIDEOS.cutinStrong,
          sound: 'BIG_WIN',
          durationMs: 2400,
        });
        break;
      case 'AT_SET_CONTINUE':
        cutins.push({
          title: `${event.renchan}連目 継続!`,
          style: 'WIN',
          videoUrl: EFFECT_VIDEOS.cutinWeak,
          sound: 'AT_CONTINUE',
          durationMs: 1400,
        });
        break;
      case 'V_STOCK_GAIN':
        cutins.push({
          title: 'Vストック獲得!',
          sub: `計 ${event.vStock} 個`,
          style: 'INFO',
          sound: 'AT_CONTINUE',
          durationMs: 1200,
        });
        break;
      case 'V_STOCK_USE':
        cutins.push({
          title: 'Vストック発動',
          sub: '継続確定!',
          style: 'INFO',
          durationMs: 1200,
        });
        break;
      case 'UPPER_AT_ENTER':
        cutins.push({
          title: '上位AT突入!',
          sub: '継続率 93%',
          style: 'SPECIAL',
          videoUrl: EFFECT_VIDEOS.cutinStrong,
          sound: 'BIG_WIN',
          durationMs: 2400,
        });
        break;
      case 'ENDING_START':
        cutins.push({
          title: 'エンディング!',
          sub: event.after === 'UPPER_AT' ? '10連達成' : '完全制覇へ',
          style: 'SPECIAL',
          videoUrl: EFFECT_VIDEOS.cutinStrong,
          sound: 'BIG_WIN',
          durationMs: 2400,
        });
        break;
      case 'AT_END':
        cutins.push(
          event.reason === 'DEFEAT'
            ? { title: 'バトル敗北…', sub: 'AT終了', style: 'LOSE', sound: 'RENZOKU_FAIL', durationMs: 1800 }
            : { title: '完走!', sub: 'AT終了', style: 'WIN', durationMs: 1800 },
        );
        break;
      default:
        // MODE_CHANGE / HONZENCHO_ENTER / FAKE_OMEN_ENTER / OMEN_REWRITE /
        // RENZOKU_START / BACKGROUND_CHANGE は内部情報のため演出なし
        break;
    }
  }
  return cutins;
}

// ---------------------------------------------------------------------------
// ゲーム結果の基本 SE(カットインとは独立の毎ゲーム音)
// ---------------------------------------------------------------------------

/**
 * 1G の締め(全停止後)の基本 SE を 1 つ選ぶ(なければ undefined)。
 * レア役成立 > 払出あり、の優先(カットインの告知音とは独立に鳴る)。
 */
export function resultSoundCue(wonRole: Role, payout: number): SoundCueId | undefined {
  if (isRareRole(wonRole)) return 'RARE';
  if (payout > 0) return 'PAYOUT';
  return undefined;
}
