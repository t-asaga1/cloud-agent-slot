/**
 * リール回転アニメーション(STEP 3b): 連続スクロール描画のための React 非依存の純ロジック。
 *
 * # 時間モデル(gameCycle.ts の離散モデルとの整合)
 *
 * 描画は連続位置(小数コマ)`continuousPosition` で行い、押下位置の判定は 3a の
 * 離散モデル `spinningPosition`(gameCycle.ts)で行う。両者は
 * `Math.floor(continuousPosition(s, t)) === spinningPosition(s, t)` が常に成り立つ
 * (reelAnimation.test.ts で検証)ため、**描画で中段を最後に通過したコマ = 押下位置**となり、
 * 見た目と停止制御ロジックの押下位置が一致する(目押しの正確性)。
 * 描画と押下判定は同一の時計(`performance.now()` − 回転開始時刻)を使うこと。
 *
 * # 連続位置の意味
 *
 * 連続位置 c(小数。mod 20)は「c = k(整数)のときコマ k がちょうど中段中央」。
 * リールは下方向回転(c は時間とともに増加)のため、c = k + frac(0 ≤ frac < 1)は
 * コマ k が中段中央から frac コマ分だけ下へ進んだ状態を表す。
 *
 * # スベリの視覚化(planSlip / slipPosition)
 *
 * 停止ボタン押下時に `resolveStop` が停止位置を返したら、`planSlip` で
 * 「押下瞬間の連続位置 → 停止位置」のアニメーション計画を作る:
 * - スベリ 1〜4 コマ: 同じ回転速度のまま前進を継続し、停止コマが中段中央へ来た瞬間に停止
 *   (travel = スベリ − frac ∈ (0, 4]。所要 ≤ 150ms)
 * - スベリ 0 コマ(ビタ止まり): 押下瞬間のコマは既に中央を frac だけ過ぎているため、
 *   1 コマ未満だけ逆方向へ戻して中央へ収める(実機の停止時の戻り挙動に相当。所要 < 37.5ms)
 */
import { KOMA_COUNT, komaAt, type ReelIndex, type ReelSymbol } from '../core/reel';
import { SPIN_MS_PER_KOMA } from './gameCycle';

/** 位置を [0, KOMA_COUNT) へ正規化(小数対応) */
function normalize(position: number): number {
  return ((position % KOMA_COUNT) + KOMA_COUNT) % KOMA_COUNT;
}

/**
 * 回転開始位置と経過時間から連続位置(小数コマ。[0, 20))を求める。
 * `Math.floor` すると gameCycle.ts の `spinningPosition`(押下位置の判定)と一致する。
 */
export function continuousPosition(startPosition: number, elapsedMs: number): number {
  return normalize(normalize(startPosition) + Math.max(0, elapsedMs) / SPIN_MS_PER_KOMA);
}

/** 押下位置から停止位置までのスベリコマ数(0〜4。前進方向) */
export function slipKoma(pushPosition: number, stopPosition: number): number {
  return normalize(stopPosition - pushPosition);
}

/** 停止ボタン押下 → 停止までのアニメーション計画 */
export interface SlipAnim {
  /** 押下瞬間の連続位置([0, 20)) */
  readonly fromPosition: number;
  /** 停止位置(整数。中段のコマ番号) */
  readonly stopPosition: number;
  /**
   * 移動量(コマ)。正 = 前進(スベリ 1〜4)/ 0 以下 = 1 コマ未満の戻り(スベリ 0)。
   * fromPosition + travelKoma ≡ stopPosition(mod 20)
   */
  readonly travelKoma: number;
  /** アニメーション所要時間(ms)。回転速度と同じ 37.5ms/コマ */
  readonly durationMs: number;
}

/**
 * スベリのアニメーション計画を作る。
 * fromContinuous は押下瞬間の連続位置、stopPosition は `resolveStop` の停止位置。
 * スベリコマ数は floor(fromContinuous) を押下位置として求める(0〜4 が前提)。
 */
export function planSlip(fromContinuous: number, stopPosition: number): SlipAnim {
  const from = normalize(fromContinuous);
  const push = Math.floor(from);
  const frac = from - push;
  const slip = slipKoma(push, stopPosition);
  // スベリ 0 はコマ中央への戻り(-frac)、1 以上は前進の残り(slip - frac)
  const travelKoma = slip - frac;
  return {
    fromPosition: from,
    stopPosition: normalize(stopPosition),
    travelKoma,
    durationMs: Math.abs(travelKoma) * SPIN_MS_PER_KOMA,
  };
}

/** スベリアニメーション中の連続位置(押下からの経過時間 → [0, 20))。完了後は停止位置 */
export function slipPosition(anim: SlipAnim, elapsedMs: number): number {
  if (elapsedMs >= anim.durationMs) return anim.stopPosition;
  const progress = anim.durationMs === 0 ? 1 : Math.max(0, elapsedMs) / anim.durationMs;
  return normalize(anim.fromPosition + anim.travelKoma * progress);
}

/** スベリアニメーションが完了したか */
export function isSlipDone(anim: SlipAnim, elapsedMs: number): boolean {
  return elapsedMs >= anim.durationMs;
}

/** コマ帯ビューの表示コマ数(窓 3 コマ + 上下のはみ出し各 1 コマ) */
export const STRIP_KOMA = 5;

/** コマ帯ビュー: 窓の描画に使う 5 コマ(上 → 下)と、帯の下方向オフセット(コマ単位の小数) */
export interface ReelStrip {
  /** 上から順に komaAt(floor(c) + 2) 〜 komaAt(floor(c) − 2) の 5 コマ */
  readonly symbols: readonly ReelSymbol[];
  /** 帯を下へずらす量(0 ≤ offset < 1。1 コマ = 帯高さの 1/5) */
  readonly offset: number;
}

/**
 * 連続位置 c からコマ帯ビューを作る。
 * offset = 0 のとき symbols[1]〜[3] がそのまま窓の上段・中段・下段
 * (`windowAt(reel, c)` と一致)。c の増加とともに帯が下へ流れ、
 * コマ境界(c = 整数 + 1)で次の floor の帯(offset 0)と表示が連続する。
 */
export function reelStrip(reel: ReelIndex, position: number): ReelStrip {
  const c = normalize(position);
  const base = Math.floor(c);
  const symbols = [
    komaAt(reel, base + 2),
    komaAt(reel, base + 1),
    komaAt(reel, base),
    komaAt(reel, base - 1),
    komaAt(reel, base - 2),
  ];
  return { symbols, offset: c - base };
}
