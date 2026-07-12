/**
 * 大量試行シミュレーションの実行スクリプト(STEP 2e)。
 * 使い方: npm run sim [-- <ゲーム数> <シード>](デフォルト 1,000,000 G / シード 20260712)
 * 計測結果は docs/SIMULATION_REPORT.md に記録する(確定 26: 設計想定値がない項目は
 * 計測値をユーザーへ報告して妥当性確認)。
 */
import { formatStats, simulate } from '../src/core/simulate';

const games = Number(process.argv[2] ?? 1_000_000);
const seed = Number(process.argv[3] ?? 20260712);

if (!Number.isInteger(games) || games <= 0 || !Number.isInteger(seed)) {
  console.error('使い方: npm run sim [-- <ゲーム数> <シード>]');
  process.exit(1);
}

console.log(`シミュレーション開始: ${games.toLocaleString()} G(シード ${seed})`);
const startedAt = performance.now();
const stats = simulate(games, seed);
const elapsed = (performance.now() - startedAt) / 1000;
console.log(formatStats(stats));
console.log(`実行時間: ${elapsed.toFixed(1)} 秒`);
