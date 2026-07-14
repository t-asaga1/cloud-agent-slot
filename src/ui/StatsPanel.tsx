/**
 * 遊技データパネル(STEP 6a): スランプグラフ + AT 履歴 + サマリ(データカウンタ風)。
 * 表示専用コンポーネント。データの収集・集計は `playStats.ts`(純ロジック)が担う。
 * 通常プレイ視点に置く折りたたみ(デフォルト閉)で、summary 行に総 G / AT 回数 / 差枚を
 * 常時表示する(閉じたままでもデータカウンタとして機能する)。
 */
import { slumpGraphData, statsSummary, type PlayStats } from './playStats';

/** スランプグラフの viewBox サイズ(表示は CSS で width 100% に伸縮) */
const GRAPH_W = 560;
const GRAPH_H = 180;

function SlumpGraph({ slump }: { slump: readonly number[] }) {
  const data = slumpGraphData(slump, GRAPH_W, GRAPH_H);
  return (
    <div className="slump-graph-wrap">
      <svg
        className="slump-graph"
        viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="スランプグラフ(差枚推移)"
      >
        <line className="slump-zero" x1={0} y1={data.zeroY} x2={GRAPH_W} y2={data.zeroY} />
        <polyline className="slump-line" points={data.points} fill="none" />
      </svg>
      <span className="slump-scale slump-scale-max">+{data.max}</span>
      <span className="slump-scale slump-scale-min">{data.min}</span>
    </div>
  );
}

export function StatsPanel({ stats }: { stats: PlayStats }) {
  const summary = statsSummary(stats);
  // AT 履歴は新しい順に直近 10 件表示
  const records = stats.atRecords.slice(-10).reverse();
  return (
    <details className="stats">
      <summary>
        遊技データ
        <span className="stats-digest">
          総 {summary.totalGames}G / AT {summary.atCount}回 /{' '}
          <span className={summary.net >= 0 ? 'plus' : 'minus'}>
            {summary.net >= 0 ? '+' : ''}
            {summary.net}
          </span>{' '}
          枚
        </span>
      </summary>
      <div className="stats-body">
        <div className="stats-summary">
          <div>
            初当り:{' '}
            <strong>
              {summary.atCount}回
              {summary.hitDenominator !== undefined &&
                `(1/${summary.hitDenominator.toFixed(1)})`}
            </strong>
          </div>
          <div>
            現在:{' '}
            <strong>
              {summary.currentNormalGames !== undefined
                ? `${summary.currentNormalGames}G ハマり`
                : 'AT 中'}
            </strong>
          </div>
          <div>
            平均セット:{' '}
            <strong>{summary.avgSets !== undefined ? summary.avgSets.toFixed(1) : '-'}</strong>
          </div>
          <div>
            平均獲得:{' '}
            <strong>
              {summary.avgGained !== undefined ? `${Math.round(summary.avgGained)}枚` : '-'}
            </strong>
          </div>
          <div>
            最高獲得:{' '}
            <strong>{summary.maxGained !== undefined ? `${summary.maxGained}枚` : '-'}</strong>
          </div>
        </div>

        <h3>スランプグラフ(差枚推移)</h3>
        <SlumpGraph slump={stats.slump} />

        <h3>AT 履歴(新しい順・直近 10 件)</h3>
        <table className="at-history">
          <thead>
            <tr>
              <th>#</th>
              <th>初当りG</th>
              <th>ハマりG</th>
              <th>セット数</th>
              <th>獲得枚数</th>
              <th>到達</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record, i) => (
              <tr key={record.hitGame} className={record.finished ? undefined : 'at-active'}>
                <td>{stats.atRecords.length - i}</td>
                <td>{record.hitGame}</td>
                <td>{record.normalGames}</td>
                <td>{record.sets}</td>
                <td>{record.gained >= 0 ? `+${record.gained}` : record.gained}</td>
                <td>
                  {record.upper && <span className="badge badge-upper">上位</span>}
                  {record.ending && <span className="badge badge-ending">ED</span>}
                  {!record.finished && <span className="badge badge-active">進行中</span>}
                  {record.finished && !record.upper && !record.ending && '-'}
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={6}>まだ AT 初当りなし</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}
