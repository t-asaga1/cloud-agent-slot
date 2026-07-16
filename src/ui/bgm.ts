/**
 * BGM の選曲ロジック(SPEC 確定 38 = 2026-07-14 のユーザー入稿・指示)。React 非依存。
 *
 * # 仕様(確定 38)
 *
 * - 通常時の義経・静・弁慶・夕方背景は BGM なし(無音)。
 * - 前兆背景滞在中は「Ashen Gate」(ZENCHO)。連続演出用は別 BGM を用意予定のため、
 *   入稿されるまでは滞在背景ベースのまま(前兆背景なら Ashen Gate 継続)。
 *   入稿されたら `bgmTrackForState` の RENZOKU 分岐 + トラック追加で差し替える。
 * - 下位 AT 中は小役・バトル一気通貫で「Skyfall Trigger」(AT_BASE)。
 * - セット開始時に V ストックがある場合、またはバトルパート開始時に継続が確定したとき、
 *   1/5(`KAKUTEI_BGM_DENOM`)で「頼朝テーマ曲」(AT_KAKUTEI)が**そのセットのみ**掛かる。
 * - 上位 AT 中は一気通貫で「義経テーマ曲」(AT_UPPER)。頼朝テーマの抽せんは下位 AT のみ。
 *
 * # 実装解釈(仕様に明示のない点。変更指示が来たらここを更新)
 *
 * - 赤7待機(SEVEN_WAIT)・AT 導入(AT_INTRO)は AT確定/導入ムービー主体のため無音。
 * - エンディングは直前の AT 階層の基本 BGM を継続(after = UPPER_AT なら直前は下位 AT =
 *   AT_BASE / AT_END なら直前は上位 AT = AT_UPPER。暫定ステージ表示と同じ導出)。
 *   頼朝テーマはセット単位のためエンディングへは持ち越さない。
 * - 「バトルパート開始時に継続が確定」= バトル 1G 目の消化終了時点で `continueConfirmed`
 *   (V ストック先消化 = 確定 29 / 継続率当せん / バトル 1G 目の小役継続当せんを含む)。
 * - 頼朝テーマの 1/5 抽せんは演出専用 rng(`hintRng`)で行う(出玉に影響する
 *   `advanceGame` の乱数列を汚さない = DIRECTION_SPEC「6.」の規約)。
 *
 * # 呼び出しタイミング
 *
 * - `updateKakuteiBgm` は全停止の 1G 締め(`advanceGame` の結果が出た直後)に毎ゲーム呼ぶ
 *   (`meterOnFinish` と同タイミング)。返り値 = 次ゲーム以降の頼朝テーマ再生フラグ。
 * - 再生する曲は `bgmUrlForState(state, kakuteiBgm)`(なし = undefined → `stopBgm`)。
 */

import { BGM_FILES, type BgmTrackId } from '../assets';
import type { Rng } from '../core/rng';
import type { AdvanceResult, GameState } from '../core/state';

/** 頼朝テーマ曲(継続確定 BGM)の抽せん分母(確定 38 = 1/5) */
export const KAKUTEI_BGM_DENOM = 5;

/**
 * トラック別の再生開始位置(秒)。指定なし = 曲頭(0 秒)から。
 * 頼朝テーマ曲は下位 AT の 1 セット(18G)では歌い出し(約 22.1 秒)まで
 * たどり着かないため、**歌い出し直前の小節頭(21.6 秒)から流し出す**(確定 41)。
 * 値は実素材の波形解析 + 聴感確認で特定(差し替え時はここを更新)。
 */
export const BGM_START_SEC: Partial<Record<BgmTrackId, number>> = {
  AT_KAKUTEI: 21.6,
};

/** トラックの再生開始位置(秒)を返す(`playBgm` の startSec へ渡す) */
export function bgmStartSecForTrack(track: BgmTrackId): number {
  return BGM_START_SEC[track] ?? 0;
}

/** 頼朝テーマ曲の抽せん(1/5)。演出専用 rng で呼ぶこと */
export function drawKakuteiBgm(rng: Rng): boolean {
  return rng.nextInt(KAKUTEI_BGM_DENOM) === 0;
}

/**
 * 頼朝テーマ再生フラグの毎ゲーム更新(全停止の 1G 締めで呼ぶ)。
 * - セット開始(AT_START / 下位 AT_SET_CONTINUE)のゲーム: フラグをリセットし、
 *   開始セットに V ストックがあれば 1/5 で再抽せん(確定 38 の契機 1)。
 * - バトル 1G 目の消化で継続確定していたら、未当せんの場合のみ 1/5 で抽せん(契機 2)。
 * - 下位 AT 以外(通常・上位 AT・エンディング等)では常に false(そのセットのみ掛かる)。
 */
export function updateKakuteiBgm(flag: boolean, result: AdvanceResult, rng: Rng): boolean {
  const { phase } = result.state;
  if (phase.type !== 'AT' || phase.tier !== 'NORMAL') return false;
  const setStart = result.events.some(
    (event) =>
      event.type === 'AT_START' ||
      (event.type === 'AT_SET_CONTINUE' && event.tier === 'NORMAL'),
  );
  if (setStart) {
    // セット開始時に V ストックがあれば 1/5(前セットのフラグは持ち越さない)
    return phase.vStock > 0 && drawKakuteiBgm(rng);
  }
  if (phase.part === 'BATTLE' && phase.partGame === 1 && phase.continueConfirmed && !flag) {
    // バトル開始時に継続確定(V ストック消費・率当せん等)= 未当せんなら 1/5
    return drawKakuteiBgm(rng);
  }
  return flag;
}

/**
 * ゲーム状態 → BGM トラック(なし = undefined)。
 * `kakuteiBgm` = `updateKakuteiBgm` で管理する頼朝テーマ再生フラグ。
 */
export function bgmTrackForState(
  state: GameState,
  kakuteiBgm: boolean,
): BgmTrackId | undefined {
  const { phase } = state;
  switch (phase.type) {
    case 'NORMAL':
    case 'OMEN':
    case 'RENZOKU':
      // 通常時は前兆背景のみ BGM あり(通常 4 背景は無音 = 確定 38)。
      // 連続演出用 BGM は入稿待ち(入稿されたら RENZOKU 分岐を追加)
      return state.background === 'ZENCHO' ? 'ZENCHO' : undefined;
    case 'SEVEN_WAIT':
    case 'AT_INTRO':
      // AT確定・AT導入ムービー主体のため無音(実装解釈)
      return undefined;
    case 'AT':
      if (phase.tier === 'UPPER') return 'AT_UPPER';
      return kakuteiBgm ? 'AT_KAKUTEI' : 'AT_BASE';
    case 'ENDING':
      // 直前の AT 階層の基本 BGM を継続(実装解釈)
      return phase.after === 'UPPER_AT' ? 'AT_BASE' : 'AT_UPPER';
  }
}

/** ゲーム状態 → BGM ファイル URL(なし = undefined → `stopBgm`) */
export function bgmUrlForState(state: GameState, kakuteiBgm: boolean): string | undefined {
  const track = bgmTrackForState(state, kakuteiBgm);
  return track === undefined ? undefined : BGM_FILES[track];
}

/** BGM トラックの表示ラベル(デバッグパネル用) */
export const BGM_LABELS: Record<BgmTrackId, string> = {
  ZENCHO: 'Ashen Gate(前兆背景)',
  AT_BASE: 'Skyfall Trigger(下位AT基本)',
  AT_KAKUTEI: '頼朝テーマ曲(継続確定)',
  AT_UPPER: '義経テーマ曲(上位AT基本)',
};
