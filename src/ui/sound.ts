/**
 * サウンドキュー(STEP 3d)= 「ゲーム中の音の用途 ID → 音声ファイル」の差し替えレイヤー。
 *
 * # 差し替え方針(BGM / SE は後から実素材へ差し替え可能にする)
 *
 * - ゲームコード(App / DirectionLayer / direction.ts)は SE ファイルを直接参照せず、
 *   必ず本モジュールの `SoundCueId`(用途 ID)経由で鳴らす(`playCue`)。
 * - 実素材が入稿されたら、次のどちらかだけで差し替えられる(呼び出し側の変更は不要):
 *   1. `src/assets/audio/se/` の同名ファイルを置き換える(`scripts/import_incoming_assets.py`)
 *   2. 専用ファイルを追加して `SOUND_CUES` の対応(キュー → ファイル)を張り替える
 * - 仮素材が不足しているキューは既存 SE を流用している(下記の「仮流用」コメント)。
 *   実素材では用途ごとの専用 SE に差し替える想定。
 * - BGM はステージ単位のまま `src/assets/index.ts` の `STAGE_BGMS`(ステージ ID → ファイル)が
 *   差し替えポイント。切替は `src/platform/audio.ts` の `playBgm`(クロスフェード付き)を使う。
 */
import { SE } from '../assets';
import { playSe } from '../platform/audio';

/** ゲーム中の音の用途 ID(演出マッピング層 `direction.ts` が参照する) */
export type SoundCueId =
  /** レバーオン */
  | 'LEVER_ON'
  /** リール停止ボタン */
  | 'REEL_STOP'
  /** 払出(小役揃い) */
  | 'PAYOUT'
  /** レア役成立(リーチ目含む) */
  | 'RARE'
  /** 前兆テロップ表示(予告音) */
  | 'TELOP'
  /** 連続演出 成功告知 */
  | 'RENZOKU_SUCCESS'
  /** 連続演出 失敗告知 / AT バトル敗北 */
  | 'RENZOKU_FAIL'
  /** AT セット継続・V ストック獲得 */
  | 'AT_CONTINUE'
  /** 大当り級の告知(AT 突入・上位 AT・エンディング) */
  | 'BIG_WIN';

/** キュー → SE ファイル URL の対応表(差し替えポイント) */
export const SOUND_CUES: Record<SoundCueId, string> = {
  LEVER_ON: SE.leverOn,
  REEL_STOP: SE.reelStop,
  PAYOUT: SE.payout,
  RARE: SE.rare,
  TELOP: SE.telop,
  RENZOKU_SUCCESS: SE.bonus, // 仮流用(ボーナス告知 SE)
  RENZOKU_FAIL: SE.fail,
  AT_CONTINUE: SE.payout, // 仮流用(払出 SE)
  BIG_WIN: SE.bonus, // 仮流用(ボーナス告知 SE)
};

/** サウンドキューを鳴らす(SE 再生の唯一の入口) */
export function playCue(cue: SoundCueId): void {
  playSe(SOUND_CUES[cue]);
}
