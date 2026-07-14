import type { OmenKind } from './omen';
import type { Rng } from './rng';
import type { Role } from './roles';

/**
 * 演出シナリオ・予告の抽せん(STEP 4b)。docs/DIRECTION_SPEC.md「2.」「3.」準拠
 * (SPEC 確定 28・33・34 = 2026-07-13 の質問リスト Q12〜Q20 回答)。
 *
 * # 予告の 2 系統(確定 34)
 *
 * - **前兆シナリオ予告**(固有 4・5 / 共通 3・4): 前兆当せん時に `drawOmenScenario` で
 *   一括抽せんし(確定 28 = シナリオ方式)、`OmenPhase.scenario` に保持して毎 G 参照する。
 *   通常時(非前兆)には出さない(Q12 =「予告が出た = 前兆中」の法則)。
 *   配線は `state.ts` の `scheduleOmen`(スロット 3。initGameState・AT 終了時の
 *   本前兆リドローを含む)。偽→本書き換え時はシナリオも引き継ぐ(Q16。再抽せんなし)。
 * - **小役示唆予告**(固有 1〜3 / 共通 1・2): 「成立小役が決定した後にどの演出を出すか」
 *   (確定 34)= 毎 G・成立役ベースで `drawKoyakuHint` により独立抽せん。
 *   通常時にも出す(Q12)。表示時の競合規約(シナリオ予告優先など)は DIRECTION_SPEC 2.1。
 *
 * # 乱数の扱い
 *
 * - `drawOmenScenario` は `advanceGame` の乱数列の一部(scheduleOmen 内で消費)。
 *   消費順序: 各 G について「レベル → (L1 以上のとき)スロット」→ 連続演出チャンスアップ 3 つ。
 * - `drawKoyakuHint` / `drawAtYokoku` / `drawBattleRoute` / `drawRevival` は
 *   **`advanceGame` の乱数列を汚さない独立関数**(UI・演出層がレバーオン時などに
 *   別の rng で呼ぶ。DIRECTION_SPEC「6.」)。
 *
 * 振分けの具体数値は仮値(Q14・Q15 =「仮値で OK・実機で見て調整」)。
 * テーブルはすべて分母 100 の整数で持ち、合計 = 100 はテストで検証する。
 */

export const SCENARIO_DENOM = 100;

// ---------------------------------------------------------------------------
// 型定義(DIRECTION_SPEC 2.2)
// ---------------------------------------------------------------------------

/** 前兆シナリオ予告のスロット(確定 34: 固有 4・5 / 共通 3・4 が前兆系) */
export const ZENCHO_YOKOKU_SLOTS = ['KOYU_4', 'KOYU_5', 'KYOTSU_3', 'KYOTSU_4'] as const;
export type ZenchoYokokuSlot = (typeof ZENCHO_YOKOKU_SLOTS)[number];

/** 小役示唆予告のスロット(確定 34: 固有 1〜3 / 共通 1・2 が小役示唆系) */
export const KOYAKU_HINT_SLOTS = ['KOYU_1', 'KOYU_2', 'KOYU_3', 'KYOTSU_1', 'KYOTSU_2'] as const;
export type KoyakuHintSlot = (typeof KOYAKU_HINT_SLOTS)[number];

/**
 * 強度レベル(Q13): 0 = 予告なし / 1 = 弱 / 2 = 強 / 3 = 確定。
 * L3 は本前兆でのみ抽せんされる(= 前兆背景の固有 3「本前兆確定」が自然に成立)。
 * 表示時の解決(4c): 通常 4 背景 = L1 → 弱素材 / L2・L3 → 強素材、
 * 前兆背景 = L1 → 固有 1 / L2 → 固有 2 / L3 → 固有 3(スロット無視)。
 */
export type ScenarioLevel = 0 | 1 | 2 | 3;

/** 前兆 1G 分の演出 */
export interface ScenarioStep {
  level: ScenarioLevel;
  /** level >= 1 のとき使用(前兆背景では無視される) */
  slot?: ZenchoYokokuSlot;
}

/** 連続演出 1G 分のパターン(1〜3G 目。4G 目は成否告知で固定) */
export type RenzokuStepPattern = 'NORMAL' | 'CHANCE';

/** 連続演出 1〜3G 目のチャンスアップ列 */
export type RenzokuChanceUps = readonly [RenzokuStepPattern, RenzokuStepPattern, RenzokuStepPattern];

/** 前兆当せん時に一括抽せんされるシナリオ(確定 28) */
export interface OmenScenario {
  /** 前兆 1G 目〜総 G 数(7〜10)の演出列。steps[g - 1] が前兆 gG 目 */
  steps: readonly ScenarioStep[];
  /** 連続演出 1〜3G 目のチャンスアップ(発展時に RenzokuPhase.chanceUps へ引き継ぐ) */
  renzokuSteps: RenzokuChanceUps;
}

/** 小役示唆予告の抽せん結果(確定 34。なし = null) */
export interface KoyakuHint {
  slot: KoyakuHintSlot;
  /** 強パターンか(弱 / 強の 2 素材 = 確定 33) */
  strong: boolean;
}

// ---------------------------------------------------------------------------
// 前兆シナリオ(DIRECTION_SPEC 3.1〜3.2・3.4)
// ---------------------------------------------------------------------------

/** 前兆 G 位置の区分(序盤 = 1〜3G / 中盤 = 4〜6G / 終盤 = 7G 以降) */
type CurvePosition = 'EARLY' | 'MID' | 'LATE';

function curvePosition(game: number): CurvePosition {
  if (game <= 3) return 'EARLY';
  if (game <= 6) return 'MID';
  return 'LATE';
}

/**
 * 強度カーブ(3.1。Q15 = 仮値で開始)。[L0, L1, L2, L3] の当選個数(100 中)。
 * 偽前兆に L3(確定)はない。
 */
export const SCENARIO_LEVEL_TABLE: Record<
  OmenKind,
  Record<CurvePosition, readonly [number, number, number, number]>
> = {
  FAKE: {
    EARLY: [50, 40, 10, 0],
    MID: [40, 45, 15, 0],
    LATE: [30, 45, 25, 0],
  },
  REAL: {
    EARLY: [40, 40, 20, 0],
    MID: [25, 40, 30, 5],
    LATE: [10, 30, 50, 10],
  },
};

/**
 * 前兆シナリオ予告のスロット振分け(3.2。Q14 = 仮値で OK)。
 * 対象は前兆系スロットのみ(固有 12% : 共通 10% の比率を系統内で正規化)。
 */
export const ZENCHO_SLOT_TABLE: Record<ZenchoYokokuSlot, number> = {
  KOYU_4: 27,
  KOYU_5: 27,
  KYOTSU_3: 23,
  KYOTSU_4: 23,
};

/** 連続演出チャンスアップ(3.4。Q19)。[NORMAL, CHANCE] の当選個数(100 中) */
export const RENZOKU_CHANCE_TABLE: Record<OmenKind, readonly [number, number]> = {
  FAKE: [80, 20],
  REAL: [50, 50],
};

function drawWeighted<K extends string>(rng: Rng, table: Record<K, number>): K {
  const value = rng.nextInt(SCENARIO_DENOM);
  let threshold = 0;
  for (const key of Object.keys(table) as K[]) {
    threshold += table[key];
    if (value < threshold) return key;
  }
  throw new Error(`振分けの合計が ${SCENARIO_DENOM} 未満`);
}

function drawLevel(rng: Rng, kind: OmenKind, game: number): ScenarioLevel {
  const weights = SCENARIO_LEVEL_TABLE[kind][curvePosition(game)];
  const value = rng.nextInt(SCENARIO_DENOM);
  let threshold = 0;
  for (let level = 0; level < weights.length; level++) {
    threshold += weights[level];
    if (value < threshold) return level as ScenarioLevel;
  }
  throw new Error(`強度カーブの合計が ${SCENARIO_DENOM} 未満`);
}

function drawChanceUp(rng: Rng, kind: OmenKind): RenzokuStepPattern {
  const [normal] = RENZOKU_CHANCE_TABLE[kind];
  return rng.nextInt(SCENARIO_DENOM) < normal ? 'NORMAL' : 'CHANCE';
}

/**
 * 前兆シナリオの一括抽せん(前兆当せん時 = `scheduleOmen`)。
 * 乱数消費順序: 前兆 1G 目から順に「レベル →(L1 以上のとき)スロット」→
 * 連続演出チャンスアップ 3 つ(1G 目 → 3G 目)。
 * 偽→本書き換え時は再抽せんせずこの結果を引き継ぐ(Q16)。
 */
export function drawOmenScenario(rng: Rng, kind: OmenKind, totalGames: number): OmenScenario {
  const steps: ScenarioStep[] = [];
  for (let game = 1; game <= totalGames; game++) {
    const level = drawLevel(rng, kind, game);
    if (level >= 1) {
      steps.push({ level, slot: drawWeighted(rng, ZENCHO_SLOT_TABLE) });
    } else {
      steps.push({ level });
    }
  }
  const renzokuSteps: RenzokuChanceUps = [
    drawChanceUp(rng, kind),
    drawChanceUp(rng, kind),
    drawChanceUp(rng, kind),
  ];
  return { steps, renzokuSteps };
}

/** 前兆 gG 目(1〜totalGames)のシナリオステップを返す(範囲外 = undefined) */
export function stepAt(scenario: OmenScenario, game: number): ScenarioStep | undefined {
  return scenario.steps[game - 1];
}

// ---------------------------------------------------------------------------
// 小役示唆予告(DIRECTION_SPEC 3.3 = 確定 34。毎 G・成立役ベースの独立抽せん)
// ---------------------------------------------------------------------------

/**
 * 小役示唆予告のテーブル行キー。押し順ベルは「ベルが停止する(揃う)」か
 * 「ハズレ目が停止する(左第一こぼし = 確定 35)」かで振分けを分ける(確定 39)。
 * こぼし判定はレバーオン時の bellMiss フラグ(通常時の想定打ち = 左第一)で行う。
 */
export type KoyakuHintKey = Role | 'BELL_MISS';

/**
 * 小役示唆予告の発生率(3.3 = 確定 39。2026-07-14 調整)。[なし, 弱, 強] の
 * 当選個数(100 中)。「成立小役が決定した後にどの演出を出すか」(確定 34)のため
 * 成立役(+ ベルのこぼし区分)をキーに引く。
 * **強パターンはレア役確定**(ハズレ・リプレイ・ベルの強は 0)。
 * ハズレ時・ベルこぼし時の弱はブランク図柄を表示する(解決は direction.ts)。
 */
export const KOYAKU_HINT_TABLE: Record<KoyakuHintKey, readonly [number, number, number]> = {
  NONE: [95, 5, 0],
  REPLAY: [50, 50, 0],
  /** 押し順ベルのベル停止(揃う。中・右第一 or 左第一 1/13) */
  BELL: [20, 80, 0],
  /** 押し順ベルのハズレ目停止(左第一こぼし 12/13 = 確定 35) */
  BELL_MISS: [95, 5, 0],
  WATERMELON_WEAK: [20, 40, 40],
  WATERMELON_STRONG: [5, 15, 80],
  CHERRY_CORNER: [20, 40, 40],
  CHERRY_CENTER: [5, 15, 80],
  CHANCE_ME: [5, 40, 55],
  REACH_ME: [5, 15, 80],
};

/** 小役示唆予告のスロット振分け(3.3。固有 12% : 共通 10% の比率を系統内で正規化) */
export const KOYAKU_HINT_SLOT_TABLE: Record<KoyakuHintSlot, number> = {
  KOYU_1: 22,
  KOYU_2: 22,
  KOYU_3: 22,
  KYOTSU_1: 17,
  KYOTSU_2: 17,
};

/**
 * 小役示唆予告の抽せん(レバーオン時 = 成立役の決定直後に UI が呼ぶ独立関数)。
 * 押し順ベルは bellMiss(左第一こぼし = 確定 35)で「ベル停止 / ハズレ目停止」の
 * 行を切り替える(確定 39)。発生率 100% なし の行は乱数を消費せず null。
 * 発生時は「強度 → スロット」の順に消費。
 */
export function drawKoyakuHint(rng: Rng, role: Role, bellMiss = false): KoyakuHint | null {
  const key: KoyakuHintKey = role === 'BELL' && bellMiss ? 'BELL_MISS' : role;
  const [none, weak] = KOYAKU_HINT_TABLE[key];
  if (none >= SCENARIO_DENOM) return null;
  const value = rng.nextInt(SCENARIO_DENOM);
  if (value < none) return null;
  const strong = value >= none + weak;
  return { slot: drawWeighted(rng, KOYAKU_HINT_SLOT_TABLE), strong };
}

// ---------------------------------------------------------------------------
// AT 中(小役パート)予告(DIRECTION_SPEC 2.3・3.5 = Q17。毎 G・成立役ベース)
// ---------------------------------------------------------------------------

/** AT 小役パート予告の種別(確定 33)。AT_RARE の最終表示は具体的な図柄画像(Q17) */
export type AtYokoku = 'AT_NAVI' | 'AT_RARE' | 'AT_STRONG';

/** AT 小役パート予告の振分け(3.5)。[なし, AT_NAVI, AT_RARE, AT_STRONG](100 中) */
export const AT_YOKOKU_TABLE: Record<Role, readonly [number, number, number, number]> = {
  NONE: [100, 0, 0, 0],
  REPLAY: [100, 0, 0, 0],
  BELL: [0, 100, 0, 0],
  WATERMELON_WEAK: [0, 0, 90, 10],
  WATERMELON_STRONG: [0, 0, 40, 60],
  CHERRY_CORNER: [0, 0, 90, 10],
  CHERRY_CENTER: [0, 0, 0, 100],
  CHANCE_ME: [0, 0, 70, 30],
  REACH_ME: [0, 0, 0, 100],
};

/**
 * AT 小役パート予告の抽せん(レバーオン時に UI が呼ぶ独立関数)。
 * 振分けが一意(100)の役は乱数を消費しない。バトルパート中は呼ばない(バトル演出優先)。
 */
export function drawAtYokoku(rng: Rng, role: Role): AtYokoku | null {
  const weights = AT_YOKOKU_TABLE[role];
  const kinds: (AtYokoku | null)[] = [null, 'AT_NAVI', 'AT_RARE', 'AT_STRONG'];
  const fixed = weights.findIndex((w) => w >= SCENARIO_DENOM);
  if (fixed >= 0) return kinds[fixed];
  const value = rng.nextInt(SCENARIO_DENOM);
  let threshold = 0;
  for (let i = 0; i < weights.length; i++) {
    threshold += weights[i];
    if (value < threshold) return kinds[i];
  }
  throw new Error(`AT 予告振分けの合計が ${SCENARIO_DENOM} 未満`);
}

// ---------------------------------------------------------------------------
// バトルパートのルート(DIRECTION_SPEC 2.5・3.6 = Q18 回答)
// ---------------------------------------------------------------------------

/** AT の階層(state.ts の AtTier と同値。循環 import 回避のためローカル定義) */
export type BattleTier = 'NORMAL' | 'UPPER';

/**
 * バトルルート定義。チャンスアップは G1〜3 のどこで出るかをルートへ焼き込み
 * (= ルート自体がバリエーションを持つ。Q18 の「各分岐にそって約 20 ルート」)。
 */
export interface BattleRoute {
  id: string;
  /** WIN = 開始時継続確定の勝利ルート / LOSE = 未確定の敗北寄りルート(8G 目復活判定) */
  outcome: 'WIN' | 'LOSE';
  /** G4〜G8 の分岐ラベル(4e の表示・仮素材の解決に使う) */
  label: string;
  /** チャンスアップが出る G(1〜3) */
  chanceUps: readonly number[];
}

/** 継続率別の振分けを持つルート行(Q18 =「継続率でそれぞれ振分けを持つ」) */
interface BattleRouteRow extends BattleRoute {
  /** 継続率(RATES の並び順)ごとの当選個数(各列合計 = 100) */
  weights: readonly number[];
}

/** AT の継続率列(振分け列の並び順)。上位 AT は 0.93 固定の 1 列 */
export const AT_BATTLE_RATES = [0.66, 0.79, 0.84, 0.88] as const;
export const UPPER_BATTLE_RATES = [0.93] as const;

/** AT 勝利ルート(開始時継続確定。継続率が高いほど強い攻め寄り) */
export const AT_BATTLE_WIN_ROUTES: readonly BattleRouteRow[] = [
  { id: 'W1', outcome: 'WIN', label: '義経弱攻撃→ヒット→継続', chanceUps: [], weights: [24, 20, 16, 12] },
  { id: 'W2', outcome: 'WIN', label: '義経弱攻撃→ヒット→継続', chanceUps: [2], weights: [12, 12, 12, 12] },
  { id: 'W3', outcome: 'WIN', label: '義経強攻撃→桜花繚乱→継続', chanceUps: [], weights: [10, 12, 14, 16] },
  { id: 'W4', outcome: 'WIN', label: '義経強攻撃→桜花繚乱→継続', chanceUps: [1, 3], weights: [6, 8, 10, 12] },
  { id: 'W5', outcome: 'WIN', label: '頼朝弱攻撃→耐える→継続', chanceUps: [], weights: [22, 20, 18, 16] },
  { id: 'W6', outcome: 'WIN', label: '頼朝弱攻撃→耐える→継続', chanceUps: [3], weights: [10, 10, 10, 10] },
  { id: 'W7', outcome: 'WIN', label: '頼朝強攻撃→耐える→継続', chanceUps: [], weights: [12, 12, 12, 12] },
  { id: 'W8', outcome: 'WIN', label: '頼朝強攻撃→耐える→継続', chanceUps: [1, 2, 3], weights: [4, 6, 8, 10] },
];

/** AT 敗北寄りルート(開始時未確定。8G 目の第 3 リール停止で復活判定) */
export const AT_BATTLE_LOSE_ROUTES: readonly BattleRouteRow[] = [
  { id: 'U1', outcome: 'LOSE', label: '頼朝弱攻撃→耐えれない→復活判定', chanceUps: [], weights: [40, 36, 32, 28] },
  { id: 'U2', outcome: 'LOSE', label: '頼朝弱攻撃→耐えれない→復活判定', chanceUps: [2], weights: [15, 16, 17, 18] },
  { id: 'U3', outcome: 'LOSE', label: '頼朝弱攻撃→耐えれない→復活判定', chanceUps: [1, 3], weights: [5, 6, 7, 8] },
  { id: 'U4', outcome: 'LOSE', label: '頼朝強攻撃→耐えれない→復活判定', chanceUps: [], weights: [25, 26, 27, 28] },
  { id: 'U5', outcome: 'LOSE', label: '頼朝強攻撃→耐えれない→復活判定', chanceUps: [3], weights: [10, 11, 11, 12] },
  { id: 'U6', outcome: 'LOSE', label: '頼朝強攻撃→耐えれない→復活判定', chanceUps: [1, 2, 3], weights: [5, 5, 6, 6] },
];

/** 上位 AT 勝利ルート(共闘版。ダブル攻撃あり。0.93 固定の 1 列) */
export const UPPER_BATTLE_WIN_ROUTES: readonly BattleRouteRow[] = [
  { id: 'W1', outcome: 'WIN', label: '義経攻撃→倒せる→継続', chanceUps: [], weights: [20] },
  { id: 'W2', outcome: 'WIN', label: '義経攻撃→倒せる→継続', chanceUps: [2], weights: [12] },
  { id: 'W3', outcome: 'WIN', label: '頼朝攻撃→倒せる→継続', chanceUps: [], weights: [20] },
  { id: 'W4', outcome: 'WIN', label: '頼朝攻撃→倒せる→継続', chanceUps: [3], weights: [12] },
  { id: 'W5', outcome: 'WIN', label: 'ダブル攻撃→倒せる→継続', chanceUps: [], weights: [16] },
  { id: 'W6', outcome: 'WIN', label: 'ダブル攻撃→倒せる→継続', chanceUps: [1, 3], weights: [12] },
  { id: 'W7', outcome: 'WIN', label: 'ダブル攻撃→倒せる→継続', chanceUps: [1, 2, 3], weights: [8] },
];

/** 上位 AT 敗北寄りルート */
export const UPPER_BATTLE_LOSE_ROUTES: readonly BattleRouteRow[] = [
  { id: 'U1', outcome: 'LOSE', label: '義経攻撃→倒せない→反撃→復活判定', chanceUps: [], weights: [30] },
  { id: 'U2', outcome: 'LOSE', label: '義経攻撃→倒せない→反撃→復活判定', chanceUps: [2], weights: [25] },
  { id: 'U3', outcome: 'LOSE', label: '頼朝攻撃→倒せない→反撃→復活判定', chanceUps: [], weights: [20] },
  { id: 'U4', outcome: 'LOSE', label: '頼朝攻撃→倒せない→反撃→復活判定', chanceUps: [3], weights: [15] },
  { id: 'U5', outcome: 'LOSE', label: '頼朝攻撃→倒せない→反撃→復活判定', chanceUps: [1, 2, 3], weights: [10] },
];

/** バトルルートのテーブルを引く(テスト・表示用に公開) */
export function battleRouteTable(tier: BattleTier, confirmed: boolean): readonly BattleRouteRow[] {
  if (tier === 'NORMAL') return confirmed ? AT_BATTLE_WIN_ROUTES : AT_BATTLE_LOSE_ROUTES;
  return confirmed ? UPPER_BATTLE_WIN_ROUTES : UPPER_BATTLE_LOSE_ROUTES;
}

function rateIndex(tier: BattleTier, continueRate: number): number {
  const rates: readonly number[] = tier === 'NORMAL' ? AT_BATTLE_RATES : UPPER_BATTLE_RATES;
  const index = rates.indexOf(continueRate);
  if (index < 0) throw new Error(`未知の継続率: ${continueRate}(tier = ${tier})`);
  return index;
}

/**
 * バトルルートの一括抽せん(バトル 1G 目の開始検出時に UI が呼ぶ独立関数)。
 * 開始時の継続確定状態(確定 29 の V ストック先消化・継続率抽せん後)と継続率で
 * 振分けが変わる(Q18 =「勝利時・敗北時および継続率でそれぞれ振分けを持つ」)。
 */
export function drawBattleRoute(
  rng: Rng,
  tier: BattleTier,
  confirmed: boolean,
  continueRate: number,
): BattleRoute {
  const rows = battleRouteTable(tier, confirmed);
  const column = rateIndex(tier, continueRate);
  const value = rng.nextInt(SCENARIO_DENOM);
  let threshold = 0;
  for (const row of rows) {
    threshold += row.weights[column];
    if (value < threshold) {
      const { weights: _weights, ...route } = row;
      return route;
    }
  }
  throw new Error(`バトルルート振分けの合計が ${SCENARIO_DENOM} 未満`);
}

/** 復活告知パターン(敗北寄りルートの 8G 目に継続確定していた場合。復活時振分け = Q18) */
export interface RevivalPattern {
  id: string;
  label: string;
}

interface RevivalRow extends RevivalPattern {
  weight: number;
}

export const AT_REVIVAL_PATTERNS: readonly RevivalRow[] = [
  { id: 'R1', label: '義経、立ち上がる(弱)', weight: 30 },
  { id: 'R2', label: '義経、立ち上がる(強)', weight: 20 },
  { id: 'R3', label: '静の祈り→復活', weight: 20 },
  { id: 'R4', label: '弁慶の加勢→復活', weight: 10 },
  { id: 'R5', label: '逆転斬り', weight: 15 },
  { id: 'R6', label: '桜花繚乱・復活', weight: 5 },
];

export const UPPER_REVIVAL_PATTERNS: readonly RevivalRow[] = [
  { id: 'R1', label: '共闘・立ち上がる', weight: 30 },
  { id: 'R2', label: '義経の一太刀', weight: 25 },
  { id: 'R3', label: '頼朝の援護', weight: 20 },
  { id: 'R4', label: 'ダブル攻撃・復活', weight: 15 },
  { id: 'R5', label: '雪原の奇跡', weight: 10 },
];

/** 復活告知の抽せん(8G 目の第 3 リール停止 = 復活が確定した時点で UI が呼ぶ独立関数) */
export function drawRevival(rng: Rng, tier: BattleTier): RevivalPattern {
  const rows = tier === 'NORMAL' ? AT_REVIVAL_PATTERNS : UPPER_REVIVAL_PATTERNS;
  const value = rng.nextInt(SCENARIO_DENOM);
  let threshold = 0;
  for (const row of rows) {
    threshold += row.weight;
    if (value < threshold) return { id: row.id, label: row.label };
  }
  throw new Error(`復活告知振分けの合計が ${SCENARIO_DENOM} 未満`);
}
