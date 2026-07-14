/**
 * 遊技データの収集(STEP 6a)。React 非依存の純ロジック。
 *
 * # 収集するデータ(docs/ROADMAP.md「STEP 6a」)
 *
 * - スランプグラフ用の差枚推移: 毎ゲーム終了時点の差枚(`GameState.netCoins`)を
 *   ゲーム順に記録する(index 0 = 遊技開始時点 = 0 枚)。
 * - AT 履歴: 初当りごとに 1 レコード(初当り G 数 / ハマり G 数 / セット数 /
 *   獲得枚数 / 上位 AT・エンディング到達)。進行中の AT は最終レコードが
 *   `finished: false` のまま毎ゲーム更新される。
 *
 * # 更新タイミング(App 側の配線)
 *
 * 全停止(1G の締め)= `advanceGame` 実行後に `statsOnFinish` を 1 回呼ぶ
 * (`counters.ts` の `meterOnFinish` と同じタイミング・同じ入力)。
 * 一括シミュレーション(大量ゲームの高速消化)では毎ゲームのコピーを避けるため、
 * `cloneStats` で 1 回だけ複製 → `pushGameStats`(mutate)をループ → 最後に
 * その複製を新しい state として使う。
 *
 * # AT 獲得枚数の定義(`counters.ts` の atGained と同一)
 *
 * AT 開始からの純増。加算対象は「ゲーム開始時点のフェーズが AT / ENDING」のゲーム
 * (`wasAtGame`)。AT 突入ゲーム(`AT_START`)自体は連続演出の最終 G のため加算しない。
 * 上位 AT・エンディングを跨いで 1 レコードに合算する。
 */
import type { GameEvent } from '../core/state';

/** AT 履歴 1 件(初当り 1 回 = 上位 AT・エンディングを含む一連の AT) */
export interface AtRecord {
  /** 初当りゲーム(`AT_START` が発生した総ゲーム数 = 連続演出成功 G) */
  hitGame: number;
  /** ハマり G 数 = 前回 AT 終了(または遊技開始)からこの初当りまでのゲーム数 */
  normalGames: number;
  /** セット数(連チャン数)。初当り 1 + セット継続 + 上位 AT 移行の合計(simulate.ts と同定義) */
  sets: number;
  /** 獲得枚数(AT 開始からの純増。進行中は現在値) */
  gained: number;
  /** 上位 AT へ移行したか */
  upper: boolean;
  /** エンディングへ突入したか(通常 AT 10 連 / 上位 AT 10 連の両方) */
  ending: boolean;
  /** AT 終了済みか(false = 進行中) */
  finished: boolean;
}

export interface PlayStats {
  /** 毎ゲーム終了時点の差枚の推移(index 0 = 遊技開始時点 = 0 枚) */
  slump: number[];
  /** AT 履歴(古い順。進行中の AT は末尾で `finished: false`) */
  atRecords: AtRecord[];
  /** 前回 AT 終了時の総ゲーム数(ハマり G 数の起点。初期値 0) */
  lastAtEndGame: number;
}

export function initPlayStats(): PlayStats {
  return { slump: [0], atRecords: [], lastAtEndGame: 0 };
}

/** 1 ゲーム分の入力(`AdvanceResult` のサブセット。counters.ts の FinishInput と同系) */
export interface StatsInput {
  /** このゲーム終了時点の総ゲーム数(`state.totalGames`) */
  game: number;
  /** このゲーム終了時点の差枚(`state.netCoins`) */
  netCoins: number;
  /** このゲームの純増(`payout.net`) */
  net: number;
  /** ゲーム開始時点のフェーズが AT / ENDING だったか(AT 獲得枚数の加算対象) */
  wasAtGame: boolean;
  events: readonly GameEvent[];
}

/** 一括シミュレーション用の複製(配列・レコードとも新しい参照にする) */
export function cloneStats(stats: PlayStats): PlayStats {
  return {
    slump: stats.slump.slice(),
    atRecords: stats.atRecords.map((record) => ({ ...record })),
    lastAtEndGame: stats.lastAtEndGame,
  };
}

/**
 * 1 ゲーム分の統計を追記する(mutate 版。一括シミュレーションのループ用)。
 * React state へ渡すオブジェクトには使わず、`cloneStats` した複製にだけ使うこと。
 */
export function pushGameStats(stats: PlayStats, input: StatsInput): void {
  stats.slump.push(input.netCoins);

  const current = stats.atRecords.at(-1);
  if (input.wasAtGame && current !== undefined && !current.finished) {
    current.gained += input.net;
  }
  for (const event of input.events) {
    switch (event.type) {
      case 'AT_START':
        stats.atRecords.push({
          hitGame: input.game,
          normalGames: input.game - stats.lastAtEndGame,
          sets: 1,
          gained: 0,
          upper: false,
          ending: false,
          finished: false,
        });
        break;
      case 'AT_SET_CONTINUE':
      case 'UPPER_AT_ENTER': {
        const record = stats.atRecords.at(-1);
        if (record !== undefined) {
          record.sets += 1;
          if (event.type === 'UPPER_AT_ENTER') record.upper = true;
        }
        break;
      }
      case 'ENDING_START': {
        const record = stats.atRecords.at(-1);
        if (record !== undefined) record.ending = true;
        break;
      }
      case 'AT_END': {
        const record = stats.atRecords.at(-1);
        if (record !== undefined) record.finished = true;
        stats.lastAtEndGame = input.game;
        break;
      }
      default:
        break;
    }
  }
}

/** 1 ゲーム分の統計を追記した新しい `PlayStats` を返す(純関数。reducer 用) */
export function statsOnFinish(stats: PlayStats, input: StatsInput): PlayStats {
  const next = cloneStats(stats);
  pushGameStats(next, input);
  return next;
}

/** 遊技データのサマリ(データカウンタ風表示用) */
export interface StatsSummary {
  /** 総ゲーム数(= slump.length - 1) */
  totalGames: number;
  /** 現在の差枚 */
  net: number;
  /** AT 初当り回数 */
  atCount: number;
  /** 初当り確率 1/x の x(通常区間ではなく総ゲーム数ベースの簡易表示。0 回なら undefined) */
  hitDenominator: number | undefined;
  /** 現在のハマり G 数(進行中 AT がなければ前回 AT 終了からの経過。AT 中は undefined) */
  currentNormalGames: number | undefined;
  /** 平均セット数(終了済み AT のみ。0 件なら undefined) */
  avgSets: number | undefined;
  /** 平均獲得枚数(終了済み AT のみ。0 件なら undefined) */
  avgGained: number | undefined;
  /** 最高獲得枚数(進行中を含む。0 件なら undefined) */
  maxGained: number | undefined;
}

export function statsSummary(stats: PlayStats): StatsSummary {
  const totalGames = stats.slump.length - 1;
  const net = stats.slump.at(-1) ?? 0;
  const atCount = stats.atRecords.length;
  const finished = stats.atRecords.filter((record) => record.finished);
  const atActive = stats.atRecords.at(-1)?.finished === false;
  return {
    totalGames,
    net,
    atCount,
    hitDenominator: atCount > 0 ? totalGames / atCount : undefined,
    currentNormalGames: atActive ? undefined : totalGames - stats.lastAtEndGame,
    avgSets:
      finished.length > 0
        ? finished.reduce((sum, record) => sum + record.sets, 0) / finished.length
        : undefined,
    avgGained:
      finished.length > 0
        ? finished.reduce((sum, record) => sum + record.gained, 0) / finished.length
        : undefined,
    maxGained:
      atCount > 0 ? Math.max(...stats.atRecords.map((record) => record.gained)) : undefined,
  };
}

/** スランプグラフの描画データ(SVG polyline 用。React 非依存で単体テスト可能) */
export interface SlumpGraphData {
  /** polyline の points 属性値(座標は width × height の viewBox 内) */
  points: string;
  /** 差枚 0 の y 座標(基準線) */
  zeroY: number;
  /** 表示範囲の最大・最小差枚(目盛りラベル用) */
  max: number;
  min: number;
}

/**
 * 差枚推移を SVG polyline の座標列へ変換する。
 * 点数が `maxPoints` を超える場合は等間隔に間引く(最終点は必ず含める)。
 * 縦軸は [min, max](0 を必ず含む)を height に正規化する。
 */
export function slumpGraphData(
  slump: readonly number[],
  width: number,
  height: number,
  maxPoints = 240,
): SlumpGraphData {
  const max = Math.max(0, ...slump);
  const min = Math.min(0, ...slump);
  const range = Math.max(max - min, 1);
  const toY = (value: number): number => ((max - value) / range) * height;

  // 間引き: 先頭から step 間隔で取り、最終点は必ず含める
  const count = slump.length;
  const step = count > maxPoints ? (count - 1) / (maxPoints - 1) : 1;
  const xs: number[] = [];
  for (let i = 0; i < count; i += step) xs.push(Math.round(i));
  if (xs.at(-1) !== count - 1) xs.push(count - 1);

  const denominator = Math.max(count - 1, 1);
  const points = xs
    .map((i) => `${((i / denominator) * width).toFixed(1)},${toY(slump[i]).toFixed(1)}`)
    .join(' ');
  return { points, zeroY: toY(0), max, min };
}
