/**
 * 演出マッピング層(STEP 3d 新設 / STEP 4c でシナリオテーブル → 演出の解決へ置換)。
 * React 非依存の純ロジック。
 *
 * # 構造
 *
 * - 出力は宣言的データのみ:
 *   - `StateOverlay` = フェーズ由来の常時表示(連続演出画面 / エンディングバナー)。
 *     毎ゲーム `overlayForState(state)` で導出する(状態が変われば自然に消える)。
 *   - `LeverDirection` = レバーオン時に決定する 1G 分の予告演出(STEP 4c):
 *     前兆シナリオ予告(`scenarioYokokuAtLeverOn`)+ 小役示唆予告(`drawKoyakuHint` の
 *     結果を `koyakuHintView` で見た目へ解決)。UI 側はレバーオンごとに差し替えて
 *     次のレバーオンまで表示する(実機の「予告はレバーオンから始まる」に対応)。
 *   - `Cutin` = イベント由来のワンショット表示(AT 突入・セット継続・成否告知 等)。
 *     1G の締め(全停止後)に `cutinsForEvents(result.events)` で列挙し、UI 側
 *     (`DirectionLayer`)がキューに積んで順番に表示・SE 再生する。
 * - 描画(`DirectionLayer.tsx`)はこの宣言的データを表示するだけで、演出の中身を知らない。
 * - SE はサウンドキュー ID(`src/ui/sound.ts`)で参照し、音声ファイルへ直接依存しない
 *   (BGM / SE の実素材差し替えは sound.ts / assets 側で完結する)。
 *
 * # 予告の解決規約(STEP 4c。docs/DIRECTION_SPEC.md「2.1」= 確定 33・34)
 *
 * - **前兆シナリオ予告**(固有 4・5 / 共通 3・4): `OmenPhase.scenario` の
 *   「これから回すゲーム」のステップ(`stepAt(scenario, phase.game + 1)`)を
 *   レバーオン時に「現在の背景 × スロット × レベル」で具体ムービーへ解決する。
 *   - 通常 4 背景: L1 → スロットの弱素材 / L2・L3 → 強素材。
 *   - 前兆背景: スロットを無視し L1 → 固有 1(弱)/ L2 → 固有 2(中)/ L3 → 固有 3(確定)。
 *   - 表示タイミングの解釈: シナリオの gG 目のステップは「gG 目のレバーオン〜次レバーオン」
 *     に表示する(小役示唆予告と同じ時点で決定・競合判定できる)。背景はレバーオン時点の
 *     滞在背景で解決する(前兆 1G 目の契機 2/4 の背景移行はそのゲームの終了時に反映される
 *     ため、表示中のステージ動画と常に一致する)。
 * - **小役示唆予告**(固有 1〜3 / 共通 1・2): レバーオン時に成立役から `drawKoyakuHint`
 *   (scenario.ts の独立関数。advanceGame の乱数列を汚さない別 rng で呼ぶ)で抽せんし、
 *   `koyakuHintView` でムービー + 成立役の図柄画像(確定 33)へ解決する。通常時も出す(Q12)。
 * - **競合規約**: 同一 G にシナリオ予告(L1 以上)がある場合はシナリオ予告を優先し
 *   小役示唆予告は出さない(UI 側は `scenarioYokokuAtLeverOn` が undefined のときだけ
 *   `koyakuHintAllowed` を確認して `drawKoyakuHint` を呼ぶ)。前兆背景滞在中は
 *   小役示唆予告なし(前兆背景の固有 1〜3 は期待度ラダー専用)。連続演出・AT・
 *   エンディング中も出さない(AT 中の予告は 4e の `drawAtYokoku` が担う)。
 */
import { EFFECT_VIDEOS, SYMBOL_IMAGES, YOKOKU_VIDEOS } from '../assets';
import type { Background } from '../core/background';
import { RENZOKU_GAMES, type RenzokuKind } from '../core/omen';
import type { ReelSymbol } from '../core/reel';
import { isRareRole, type Role } from '../core/roles';
import {
  stepAt,
  type KoyakuHint,
  type ScenarioLevel,
  type ZenchoYokokuSlot,
} from '../core/scenario';
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

/** フェーズ由来の常時表示(毎ゲーム state から導出) */
export type StateOverlay =
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

/** 連続演出の仮タイトルとあおりテキスト(4d で 4G 構成の実演出へ差し替え) */
export const RENZOKU_PRESENTATION: Record<RenzokuKind, { title: string; text: string }> = {
  A: { title: '連続演出A「追走」', text: '義経、賊を追う…!' },
  B: { title: '連続演出B「一騎打ち」', text: '弁慶との一騎打ち…!' },
  C: { title: '連続演出C「決戦」', text: '宿命の決戦、開幕…!' },
};

/**
 * 現在のフェーズから常時表示の演出を導出する(通常時・前兆中・AT 中は undefined)。
 * 前兆中の予告は 4c からシナリオ由来のレバーオン演出(`scenarioYokokuAtLeverOn`)が担い、
 * 常時表示は出さない(予告のない G は静かに進む = 予告が出た時だけ前兆を匂わせる)。
 */
export function overlayForState(state: GameState): StateOverlay | undefined {
  const { phase } = state;
  switch (phase.type) {
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
// レバーオン時の予告演出(STEP 4c = シナリオテーブル → 演出の解決)
// ---------------------------------------------------------------------------

/** 予告ムービーのファイル名 stem 用の背景キー(DIRECTION_SPEC「4.」の bg) */
const BACKGROUND_KEYS: Record<Background, string> = {
  YOSHITSUNE: 'yoshitsune',
  SHIZUKA: 'shizuka',
  BENKEI: 'benkei',
  YUGATA: 'yugata',
  ZENCHO: 'zencho',
};

/** 予告ムービー URL をキーから解決する(存在しないキーは仮素材の生成漏れ = 即エラー) */
export function yokokuVideoUrl(key: string): string {
  const url = YOKOKU_VIDEOS[key];
  if (url === undefined) throw new Error(`予告ムービーがありません: ${key}`);
  return url;
}

/** 前兆背景の期待度ラダー表示名(確定 33: 固有 1 = 弱 / 2 = 中 / 3 = 本前兆確定) */
const ZENCHO_LADDER_LABELS = ['', '期待度弱', '期待度中', '本前兆確定'] as const;

const ZENCHO_SLOT_LABELS: Record<ZenchoYokokuSlot, string> = {
  KOYU_4: '固有予告4',
  KOYU_5: '固有予告5',
  KYOTSU_3: '共通予告3',
  KYOTSU_4: '共通予告4',
};

/** 前兆シナリオ予告の表示データ(レバーオン時に解決し、次のレバーオンまで表示) */
export interface ScenarioYokokuView {
  videoUrl: string;
  /** デバッグ・テスト用(画面には出さない。仮素材ムービー自体に文言が入っている) */
  label: string;
  level: ScenarioLevel;
}

/** スロット × レベル × 背景 → 具体ムービーの解決(DIRECTION_SPEC 2.1) */
function resolveScenarioYokoku(
  background: Background,
  slot: ZenchoYokokuSlot,
  level: ScenarioLevel,
): ScenarioYokokuView {
  if (background === 'ZENCHO') {
    // 前兆背景はスロットを無視してレベル → 固有 1/2/3 の期待度ラダー
    return {
      videoUrl: yokokuVideoUrl(`yokoku_zencho${level}`),
      label: `前兆予告${level}(${ZENCHO_LADDER_LABELS[level]})`,
      level,
    };
  }
  const variant = level >= 2 ? 'strong' : 'weak';
  const slotNo = Number(slot.slice(-1));
  const key = slot.startsWith('KYOTSU')
    ? `yokoku_common${slotNo}_${variant}`
    : `yokoku_${BACKGROUND_KEYS[background]}_koyu${slotNo}_${variant}`;
  return {
    videoUrl: yokokuVideoUrl(key),
    label: `${ZENCHO_SLOT_LABELS[slot]}(${level >= 2 ? '強' : '弱'})`,
    level,
  };
}

/**
 * これから回すゲームの前兆シナリオ予告(レバーオン時に UI が呼ぶ)。
 * 前兆中(フェーズ OMEN)のとき、次に消化するゲーム = 前兆 (phase.game + 1)G 目の
 * ステップを解決する。予告なし(L0)・前兆以外・次が連続演出のときは undefined。
 */
export function scenarioYokokuAtLeverOn(state: GameState): ScenarioYokokuView | undefined {
  const { phase } = state;
  if (phase.type !== 'OMEN') return undefined;
  const game = phase.game + 1;
  if (game > phase.totalGames) return undefined; // 次ゲームは連続演出 1G 目
  const step = stepAt(phase.scenario, game);
  if (step === undefined || step.level === 0 || step.slot === undefined) return undefined;
  return resolveScenarioYokoku(state.background, step.slot, step.level);
}

/**
 * 小役示唆予告を出せる状況か(競合規約 = DIRECTION_SPEC 2.1)。
 * - 前兆背景滞在中は出さない(前兆背景の固有 1〜3 は期待度ラダー専用)
 * - 通常時と前兆中(次ゲームも前兆の G)は出せる。連続演出・AT・エンディング中は出さない
 * - 同一 G のシナリオ予告優先は UI 側で担保する
 *   (`scenarioYokokuAtLeverOn` が undefined のときだけ抽せんする)
 */
export function koyakuHintAllowed(state: GameState): boolean {
  if (state.background === 'ZENCHO') return false;
  const { phase } = state;
  if (phase.type === 'NORMAL') return true;
  if (phase.type === 'OMEN') return phase.game < phase.totalGames;
  return false;
}

/** 成立役 → 最終表示する図柄画像(確定 33「小役示唆系は図柄画像を表示」)の対応 */
const HINT_SYMBOLS: Partial<Record<Role, ReelSymbol>> = {
  REPLAY: 'REPLAY',
  BELL: 'BELL',
  WATERMELON_WEAK: 'WATERMELON',
  WATERMELON_STRONG: 'WATERMELON',
  CHERRY_CORNER: 'CHERRY',
  CHERRY_CENTER: 'CHERRY',
  // チャンス目はスイカテンパイはずし出目のためスイカ図柄で示唆
  CHANCE_ME: 'WATERMELON',
  REACH_ME: 'SEVEN_RED',
};

const HINT_SLOT_LABELS: Record<KoyakuHint['slot'], string> = {
  KOYU_1: '固有予告1',
  KOYU_2: '固有予告2',
  KOYU_3: '固有予告3',
  KYOTSU_1: '共通予告1',
  KYOTSU_2: '共通予告2',
};

/** 小役示唆予告の表示データ(ムービー + ムービー後に出す成立役の図柄画像) */
export interface KoyakuHintView {
  videoUrl: string;
  /** デバッグ・テスト用(画面には出さない) */
  label: string;
  /** ムービー再生後に画面表示する成立役の図柄画像(確定 33) */
  symbolUrl: string;
  strong: boolean;
}

/**
 * 小役示唆予告(`drawKoyakuHint` の結果)を見た目へ解決する。
 * 固有 1〜3 は現在の背景の素材 / 共通 1・2 は 4 背景共通の素材(確定 34)。
 * 前兆背景には小役示唆の素材がない(呼び出し側が `koyakuHintAllowed` で除外)。
 */
export function koyakuHintView(
  hint: KoyakuHint,
  role: Role,
  background: Background,
): KoyakuHintView | undefined {
  const symbol = HINT_SYMBOLS[role];
  if (symbol === undefined || background === 'ZENCHO') return undefined;
  const variant = hint.strong ? 'strong' : 'weak';
  const slotNo = Number(hint.slot.slice(-1));
  const key = hint.slot.startsWith('KYOTSU')
    ? `yokoku_common${slotNo}_${variant}`
    : `yokoku_${BACKGROUND_KEYS[background]}_koyu${slotNo}_${variant}`;
  return {
    videoUrl: yokokuVideoUrl(key),
    label: `${HINT_SLOT_LABELS[hint.slot]}(${hint.strong ? '強' : '弱'})`,
    symbolUrl: SYMBOL_IMAGES[symbol],
    strong: hint.strong,
  };
}

/** レバーオン時に決定する 1G 分の予告演出(seq = レバーオンの通し番号) */
export interface LeverDirection {
  seq: number;
  /** 前兆シナリオ予告(優先。あるとき hint は undefined) */
  yokoku?: ScenarioYokokuView;
  /** 小役示唆予告 */
  hint?: KoyakuHintView;
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
