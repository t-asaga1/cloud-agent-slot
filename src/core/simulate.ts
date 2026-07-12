import { BET_PER_GAME } from './payout';
import { playGame } from './play';
import { createRng } from './rng';
import { ROLES, type Role } from './roles';
import { initGameState, type GameState } from './state';

/**
 * 大量試行シミュレーション(STEP 2e)。
 * ヘッドレス 1G 実行(`play.ts`)を回して機械割・初当り・純増・コイン持ち等を計測する。
 * 回帰検出テスト(`simulate.test.ts`)と計測レポート(`scripts/run_simulation.ts` →
 * `docs/SIMULATION_REPORT.md`)で共用。
 *
 * # 区間の分類(ゲーム開始時点のフェーズで分類)
 *
 * - 通常区間 = NORMAL / OMEN / RENZOKU(前兆・連続演出は通常時の一部。
 *   連続演出成功 = AT_START のゲームまでが通常区間で、次ゲームから AT 区間)
 * - AT 区間 = AT / ENDING(エンディングは AT 区間に含める)
 *
 * # 指標の定義
 *
 * - 機械割 = 総払出 ÷ 総投入(リプレイは投入 0・払出 0 で計算に含む)
 * - 初当り確率 1/x の x = 通常区間ゲーム数 ÷ AT 初当り回数(`AT_START` イベント数)
 * - 純増/G = (払出 − 投入) ÷ ゲーム数(区間別)
 * - コイン持ち = 通常区間で 50 枚あたり回せるゲーム数 = 50 ÷ (通常区間の純減枚数/G)
 * - AT 平均セット数(連チャン数) = 総セット数 ÷ 初当り回数。
 *   総セット数 = 小役パートを開始した回数 = AT_START + AT_SET_CONTINUE + UPPER_AT_ENTER
 *   (上位 AT 移行も新しいセットの開始として数える)
 */

/** 区間別の集計(通常区間 / AT 区間) */
export interface SectionStats {
  games: number;
  /** 投入(BET)枚数の合計。リプレイの次ゲームは 0 */
  coinsIn: number;
  /** 払出枚数の合計 */
  coinsOut: number;
  /** 純増(払出 − 投入)。通常区間は負が想定 */
  net: number;
  /** 純増/G */
  netPerGame: number;
}

export interface SimulationStats {
  seed: number;
  games: number;
  /** 総投入・総払出・機械割(= 総払出 ÷ 総投入) */
  coinsIn: number;
  coinsOut: number;
  payoutRate: number;
  /** 通常区間(NORMAL / OMEN / RENZOKU) */
  normal: SectionStats;
  /** AT 区間(AT / ENDING) */
  at: SectionStats;
  /** コイン持ち(通常区間で 50 枚あたりのゲーム数) */
  coinHold50: number;
  /** AT 初当り回数(AT_START イベント数)と初当り確率 1/x の x */
  atCount: number;
  hitDenominator: number;
  /** 総セット数と AT 平均セット数(連チャン数) */
  totalSets: number;
  avgSets: number;
  /** AT 1 回(初当り)あたりの平均純増(AT 区間の純増 ÷ 初当り回数) */
  avgAtNet: number;
  /** 上位 AT 移行回数(UPPER_AT_ENTER = エンディング経由 = 確定 29・30) */
  upperAtCount: number;
  /** エンディング突入回数(ENDING_START。通常 AT 10 連 + 上位 AT 10 連の両方) */
  endingCount: number;
  /** うち上位 AT 10 連の完走(ENDING_START after = AT_END) */
  endingCompleteCount: number;
  /** V ストック獲得回数 */
  vStockGains: number;
  /** 役別の内部当選回数(役抽せんの検算用) */
  roleWon: Record<Role, number>;
  /** 内部当選役がそのまま表示役になった回数(取りこぼし率の検算用。NONE は対象外) */
  roleDisplayed: Record<Role, number>;
  /** シミュレーション終了時点の状態(継続実行・デバッグ用) */
  finalState: GameState;
}

function emptySection(): SectionStats {
  return { games: 0, coinsIn: 0, coinsOut: 0, net: 0, netPerGame: 0 };
}

function emptyRoleCount(): Record<Role, number> {
  return Object.fromEntries(ROLES.map((role) => [role, 0])) as Record<Role, number>;
}

/**
 * `games` ゲームをヘッドレスで消化して統計を返す(固定シードで完全再現可能)。
 * 打ち方は確定 26(通常時 = 左第一・適当押し / AT 中 = ナビ遵守)。
 */
export function simulate(games: number, seed: number): SimulationStats {
  const rng = createRng(seed);
  let state = initGameState(rng);

  const normal = emptySection();
  const at = emptySection();
  const roleWon = emptyRoleCount();
  const roleDisplayed = emptyRoleCount();
  let atCount = 0;
  let totalSets = 0;
  let upperAtCount = 0;
  let endingCount = 0;
  let endingCompleteCount = 0;
  let vStockGains = 0;

  for (let i = 0; i < games; i++) {
    const startPhase = state.phase.type;
    const result = playGame(state, rng);
    state = result.state;

    const section = startPhase === 'AT' || startPhase === 'ENDING' ? at : normal;
    const bet = result.payout.payout - result.payout.net; // 0(リプレイ持越し)or BET_PER_GAME
    section.games += 1;
    section.coinsIn += bet;
    section.coinsOut += result.payout.payout;

    roleWon[result.wonRole] += 1;
    if (result.wonRole !== 'NONE' && result.displayedRole === result.wonRole) {
      roleDisplayed[result.wonRole] += 1;
    }

    for (const event of result.events) {
      switch (event.type) {
        case 'AT_START':
          atCount += 1;
          totalSets += 1;
          break;
        case 'AT_SET_CONTINUE':
          totalSets += 1;
          break;
        case 'UPPER_AT_ENTER':
          upperAtCount += 1;
          totalSets += 1;
          break;
        case 'ENDING_START':
          endingCount += 1;
          if (event.after === 'AT_END') endingCompleteCount += 1;
          break;
        case 'V_STOCK_GAIN':
          vStockGains += 1;
          break;
        default:
          break;
      }
    }
  }

  for (const section of [normal, at]) {
    section.net = section.coinsOut - section.coinsIn;
    section.netPerGame = section.games > 0 ? section.net / section.games : 0;
  }
  const coinsIn = normal.coinsIn + at.coinsIn;
  const coinsOut = normal.coinsOut + at.coinsOut;

  return {
    seed,
    games,
    coinsIn,
    coinsOut,
    payoutRate: coinsIn > 0 ? coinsOut / coinsIn : 0,
    normal,
    at,
    coinHold50: normal.netPerGame < 0 ? 50 / -normal.netPerGame : Infinity,
    atCount,
    hitDenominator: atCount > 0 ? normal.games / atCount : Infinity,
    totalSets,
    avgSets: atCount > 0 ? totalSets / atCount : 0,
    avgAtNet: atCount > 0 ? at.net / atCount : 0,
    upperAtCount,
    endingCount,
    endingCompleteCount,
    vStockGains,
    roleWon,
    roleDisplayed,
    finalState: state,
  };
}

/** 計測レポート・コンソール出力用の整形(`scripts/run_simulation.ts` から使用) */
export function formatStats(stats: SimulationStats): string {
  const f = (n: number, digits = 4): string => n.toFixed(digits);
  const lines = [
    `シード: ${stats.seed} / 総ゲーム数: ${stats.games}`,
    `総投入: ${stats.coinsIn} 枚 / 総払出: ${stats.coinsOut} 枚 / 機械割: ${f(stats.payoutRate * 100, 2)}%`,
    `通常区間: ${stats.normal.games}G / 純増 ${f(stats.normal.netPerGame)} 枚/G(想定 -1.8)`,
    `AT 区間: ${stats.at.games}G / 純増 ${f(stats.at.netPerGame)} 枚/G(想定 +6.4)`,
    `コイン持ち: ${f(stats.coinHold50, 1)} G/50枚(想定 約 27G)`,
    `AT 初当り: ${stats.atCount} 回 / 1/${f(stats.hitDenominator, 1)}(通常区間 ${stats.normal.games}G)`,
    `AT 平均セット数(連チャン): ${f(stats.avgSets, 2)}(総セット ${stats.totalSets})`,
    `AT 平均純増: ${f(stats.avgAtNet, 1)} 枚/回`,
    `上位 AT 移行: ${stats.upperAtCount} 回 / エンディング突入: ${stats.endingCount} 回(うち上位 10 連完走: ${stats.endingCompleteCount} 回)/ V ストック獲得: ${stats.vStockGains} 回`,
    `BET/G(通常区間): ${f(stats.normal.coinsIn / stats.normal.games, 3)}(最大 ${BET_PER_GAME})`,
  ];
  return lines.join('\n');
}
