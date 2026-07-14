import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import './App.css';
import {
  CABINET_FRAME_URL,
  STAGE_BGMS,
  STAGE_IDS,
  STAGE_LABELS,
  STAGE_VIDEOS,
  SYMBOL_IMAGES,
  type StageId,
} from './assets';
import { CABINET_SIZE, LCD_RECT, REEL_WINDOW_RECTS, rectToPercent } from './assets/layout';
import { BATTLE_PART_GAMES, KOYAKU_PART_GAMES } from './core/at';
import type { Background, BackgroundTrigger } from './core/background';
import { drawBellMiss, drawRole } from './core/lottery';
import type { Mode } from './core/mode';
import { RENZOKU_GAMES } from './core/omen';
import { NAVI_PUSH_ORDER, NORMAL_PUSH_ORDER, playGame } from './core/play';
import {
  drawAtYokoku,
  drawBattleRoute,
  drawKoyakuHint,
  drawRevival,
  type BattleRoute,
  type BattleTier,
  type OmenScenario,
  type RenzokuChanceUps,
  type ZenchoYokokuSlot,
} from './core/scenario';
import {
  DIAGONAL_LINES,
  KOMA_COUNT,
  LINES,
  PUSH_ORDERS,
  REEL_LAYOUT,
  windowAt,
  type LineId,
  type PushOrder,
  type ReelIndex,
  type SpinResult,
  type StopPositions,
} from './core/reel';
import { createRng, randomSeed, type Rng } from './core/rng';
import { ROLES, type Role } from './core/roles';
import {
  advanceGame,
  ENDING_GAMES,
  initGameState,
  isNaviActive,
  type AdvanceResult,
  type GameEvent,
  type GameState,
  type Phase,
} from './core/state';
import { isBgmPlaying, playBgm, stopBgm } from './platform/audio';
import { initMeter, meterOnFinish, meterOnLever, type MeterState } from './ui/counters';
import {
  cloneStats,
  initPlayStats,
  pushGameStats,
  statsOnFinish,
  type PlayStats,
} from './ui/playStats';
import { StatsPanel } from './ui/StatsPanel';
import {
  atYokokuAllowed,
  atYokokuView,
  battleGameAtLeverOn,
  battleView,
  cutinsForEvents,
  koyakuHintAllowed,
  koyakuHintView,
  overlayForState,
  renzokuAtLeverOn,
  resultSoundCue,
  revivalCutin,
  scenarioYokokuAtLeverOn,
  type Cutin,
  type LeverDirection,
} from './ui/direction';
import { DirectionLayer, type CutinFrame } from './ui/DirectionLayer';
import { playCue } from './ui/sound';
import {
  finishSpin,
  isAllStopped,
  pressStop,
  startSpin,
  type SpinCycle,
} from './ui/gameCycle';
import {
  continuousPosition,
  isSlipDone,
  planSlip,
  reelStrip,
  slipPosition,
  STRIP_KOMA,
  type SlipAnim,
} from './ui/reelAnimation';

const ROLE_LABELS: Record<Role, string> = {
  REPLAY: 'リプレイ',
  BELL: '押し順ベル',
  CHERRY_CORNER: '角チェリー',
  CHERRY_CENTER: '中段チェリー',
  WATERMELON_WEAK: '弱スイカ',
  WATERMELON_STRONG: '強スイカ',
  CHANCE_ME: 'チャンス目',
  REACH_ME: 'リーチ目',
  NONE: 'ハズレ',
};

const LINE_LABELS: Record<LineId, string> = {
  TOP: '上段',
  MIDDLE: '中段',
  BOTTOM: '下段',
  DOWN_RIGHT: '右下がり',
  UP_RIGHT: '右上がり',
};

const MODE_LABELS: Record<Mode, string> = {
  HELL: '地獄',
  NORMAL: '通常',
  HEAVEN: '天国',
  HONZENCHO: '本前兆',
};

const BACKGROUND_LABELS: Record<Background, string> = {
  YOSHITSUNE: '義経',
  SHIZUKA: '静',
  BENKEI: '弁慶',
  YUGATA: '夕方',
  ZENCHO: '前兆',
};

const TRIGGER_LABELS: Record<BackgroundTrigger, string> = {
  ELAPSED: '30G経過',
  FAKE_OMEN_NEXT: '偽前兆当せん',
  FAKE_OMEN_FAIL: '演出失敗後',
  HONZENCHO_NEXT: '本前兆移行',
};

const REEL_NAMES = ['左', '中', '右'] as const;
const STOP_KEY_NAMES = ['Z', 'X', 'C'] as const;

const PUSH_ORDER_LABELS = PUSH_ORDERS.map((order) =>
  order.map((reel) => REEL_NAMES[reel]).join('→'),
);

/** 通常時の背景 → 表示ステージの対応(AT・エンディング中はフェーズから導出) */
const STAGE_FOR_BACKGROUND: Record<Background, StageId> = {
  YOSHITSUNE: 'STAGE_YOSHITSUNE',
  SHIZUKA: 'STAGE_SHIZUKA',
  BENKEI: 'STAGE_BENKEI',
  YUGATA: 'STAGE_YUGATA',
  ZENCHO: 'STAGE_ZENCHO',
};

/**
 * ゲーム状態 → 表示ステージ(背景動画)の自動切替(STEP 2f)。
 * AT 中はパート別の AT ステージ、エンディングは専用素材未入稿のため暫定で
 * 「直前の AT 階層のバトルステージ」を継続表示(after = UPPER_AT なら通常 AT 10 連 =
 * AT バトル / AT_END なら上位 AT 10 連 = 上位バトル)。エンディング演出は STEP 4。
 */
function stageForState(state: GameState): StageId {
  const { phase } = state;
  if (phase.type === 'AT') {
    if (phase.tier === 'UPPER') {
      return phase.part === 'KOYAKU' ? 'STAGE_AT_UPPER_KOYAKU' : 'STAGE_AT_UPPER_BATTLE';
    }
    return phase.part === 'KOYAKU' ? 'STAGE_AT_KOYAKU' : 'STAGE_AT_BATTLE';
  }
  if (phase.type === 'ENDING') {
    return phase.after === 'UPPER_AT' ? 'STAGE_AT_BATTLE' : 'STAGE_AT_UPPER_BATTLE';
  }
  return STAGE_FOR_BACKGROUND[state.background];
}

/** フェーズの 1 行表示(デバッグパネル・履歴用) */
function phaseLabel(phase: Phase): string {
  switch (phase.type) {
    case 'NORMAL':
      return '通常';
    case 'OMEN':
      return `${phase.kind === 'REAL' ? '本' : '偽'}前兆 ${phase.game}/${phase.totalGames}G(演出${phase.renzoku}へ)`;
    case 'RENZOKU':
      return `連続演出${phase.renzoku} ${phase.game}/${RENZOKU_GAMES}G(${phase.kind === 'REAL' ? '本' : '偽'})`;
    case 'AT': {
      const partGames = phase.part === 'KOYAKU' ? KOYAKU_PART_GAMES : BATTLE_PART_GAMES;
      return `${phase.tier === 'UPPER' ? '上位AT' : 'AT'} ${phase.part === 'KOYAKU' ? '小役' : 'バトル'} ${phase.partGame}/${partGames}G`;
    }
    case 'ENDING':
      return `エンディング ${phase.game}/${ENDING_GAMES}G(→${phase.after === 'UPPER_AT' ? '上位AT' : 'AT終了'})`;
  }
}

/** 発生イベントの 1 行表示(`GameEvent` は確定 28 の演出層向け情報) */
function formatEvent(event: GameEvent): string {
  switch (event.type) {
    case 'MODE_CHANGE':
      return `モード移行 ${MODE_LABELS[event.from]}→${MODE_LABELS[event.to]}(${ROLE_LABELS[event.trigger]})`;
    case 'HONZENCHO_ENTER':
      return `本前兆へ移行(${ROLE_LABELS[event.trigger]})`;
    case 'FAKE_OMEN_ENTER':
      return `偽前兆突入(${event.totalGames}G→演出${event.renzoku}。${ROLE_LABELS[event.trigger]})`;
    case 'OMEN_REWRITE':
      return `偽→本前兆 書き換え(${ROLE_LABELS[event.trigger]})`;
    case 'RENZOKU_START':
      return `連続演出${event.renzoku} 開始(${event.kind === 'REAL' ? '本' : '偽'})`;
    case 'RENZOKU_RESULT':
      return `連続演出${event.renzoku} ${event.success ? '成功!' : '失敗…'}`;
    case 'BACKGROUND_CHANGE':
      return `背景移行 ${BACKGROUND_LABELS[event.from]}→${BACKGROUND_LABELS[event.to]}(${TRIGGER_LABELS[event.trigger]})`;
    case 'AT_START':
      return `AT 突入!(継続率 ${Math.round(event.continueRate * 100)}%)`;
    case 'V_STOCK_GAIN':
      return `Vストック獲得(${ROLE_LABELS[event.trigger]}。計${event.vStock}個)`;
    case 'V_STOCK_USE':
      return `Vストック消費→継続確定(残${event.vStock}個)`;
    case 'AT_SET_CONTINUE':
      return `セット継続(${event.renchan}連目)`;
    case 'ENDING_START':
      return `エンディング開始(消化後: ${event.after === 'UPPER_AT' ? '上位AT' : 'AT終了'})`;
    case 'UPPER_AT_ENTER':
      return '上位AT 突入!(継続率 93%)';
    case 'AT_END':
      return `AT終了(${event.reason === 'DEFEAT' ? 'バトル敗北' : 'エンディング完走'}→${MODE_LABELS[event.mode]}モード・${BACKGROUND_LABELS[event.background]}背景)`;
  }
}

/** 前兆シナリオのデバッグ 1 行表示用のスロット短縮名 */
const SLOT_SHORT: Record<ZenchoYokokuSlot, string> = {
  KOYU_4: '固4',
  KOYU_5: '固5',
  KYOTSU_3: '共3',
  KYOTSU_4: '共4',
};

/** 前兆シナリオの 1 行表示(デバッグパネル用。予告なしの G = ・) */
function scenarioSummary(scenario: OmenScenario): string {
  return scenario.steps
    .map((step) =>
      step.level === 0 || step.slot === undefined ? '・' : `L${step.level}${SLOT_SHORT[step.slot]}`,
    )
    .join(' ');
}

/** 連続演出チャンスアップの 1 行表示(デバッグパネル用) */
function chanceUpSummary(chanceUps: RenzokuChanceUps): string {
  return chanceUps.map((pattern) => (pattern === 'CHANCE' ? 'チ' : '通')).join('・');
}

/** オート消化時の目押しモード(押下位置の決め方)。手動時はタイミング押しが正 */
type AimMode = 'RANDOM' | 'SEVEN' | 'DDT';

const AIM_LABELS: Record<AimMode, string> = {
  RANDOM: '適当押し(ランダム)',
  SEVEN: '赤7 狙い(全リール)',
  DDT: 'DDT(左リール黒バー狙い)',
};

/** target のコマを中段へ引き込める(0〜4 コマ手前の)押下位置から 1 つ選ぶ */
function aimedPush(reel: ReelIndex, target: string, rng: Rng): number {
  const index = REEL_LAYOUT[reel].indexOf(target as (typeof REEL_LAYOUT)[number][number]);
  return (index - rng.nextInt(5) + KOMA_COUNT) % KOMA_COUNT;
}

function pickPushes(aim: AimMode, rng: Rng): [number, number, number] {
  const random = (): number => rng.nextInt(KOMA_COUNT);
  if (aim === 'SEVEN') {
    return [aimedPush(0, 'SEVEN_RED', rng), aimedPush(1, 'SEVEN_RED', rng), aimedPush(2, 'SEVEN_RED', rng)];
  }
  if (aim === 'DDT') {
    return [aimedPush(0, 'BAR_BLACK', rng), random(), random()];
  }
  return [random(), random(), random()];
}

/**
 * リール窓でハイライトする段(row 0 = 上段 / 1 = 中段 / 2 = 下段)を計算する。
 * ライン役は揃った有効ライン上の 3 コマ、チェリーは左リール窓内のチェリー。
 */
function highlightRows(
  lines: readonly LineId[],
  displayed: Role,
  positions: StopPositions,
): [Set<number>, Set<number>, Set<number>] {
  const rows: [Set<number>, Set<number>, Set<number>] = [new Set(), new Set(), new Set()];
  for (const line of lines) {
    LINES[line].forEach((offset, reel) => rows[reel].add(1 - offset));
  }
  if (displayed === 'CHERRY_CORNER' || displayed === 'CHERRY_CENTER') {
    windowAt(0, positions[0]).forEach((symbol, row) => {
      if (symbol === 'CHERRY') rows[0].add(row);
    });
  }
  return rows;
}

interface GameLog {
  game: number;
  won: Role;
  displayed: Role;
  lines: LineId[];
  payout: number;
  net: number;
  phase: string;
  /** 停止ボタンを押した順(このゲームの実際の押し順) */
  pushOrder: string;
}

interface EventLogEntry {
  game: number;
  text: string;
}

interface PlayState {
  /** ステートマシンの状態(`advanceGame` の返り state) */
  gameState: GameState;
  positions: StopPositions;
  lines: LineId[];
  displayed: Role;
  lastLog?: GameLog;
  logs: GameLog[];
  /** 発生イベントの履歴(新しい順) */
  eventLog: EventLogEntry[];
  /** クレジット・払出・AT 獲得枚数のメーター(STEP 3c) */
  meter: MeterState;
  /** 直近ゲームのカットイン演出列(STEP 3d。DirectionLayer がキューへ積む) */
  cutinFrame: CutinFrame;
  /** 遊技データ(スランプグラフ・AT 履歴 = STEP 6a) */
  stats: PlayStats;
}

function makePlayState(gameState: GameState): PlayState {
  return {
    gameState,
    positions: [18, 19, 1],
    lines: [],
    displayed: 'NONE',
    logs: [],
    eventLog: [],
    meter: initMeter(),
    cutinFrame: { seq: 0, cutins: [] },
    stats: initPlayStats(),
  };
}

type Action =
  | { type: 'LEVER' }
  | {
      type: 'FINISH';
      spin: SpinResult;
      result: AdvanceResult;
      pushOrder: string;
      /** このゲームのカットイン列(復活告知の差し込みがあるため呼び出し側で確定させる) */
      cutins: readonly Cutin[];
    }
  | {
      /** オートプレイ(高速一括消化 = STEP 6a)の結果を一括反映する */
      type: 'BULK';
      update: Pick<
        PlayState,
        'gameState' | 'positions' | 'lines' | 'displayed' | 'meter' | 'stats'
      > & { lastLog: GameLog; logs: GameLog[]; eventLog: EventLogEntry[] };
    }
  | { type: 'RESET'; gameState: GameState };

function reducer(prev: PlayState, action: Action): PlayState {
  if (action.type === 'RESET') return makePlayState(action.gameState);
  if (action.type === 'LEVER') {
    // レバーオン = BET 徴収(リプレイ持越しなら自動 BET)+ 払出枚数表示のリセット
    return { ...prev, meter: meterOnLever(prev.meter, prev.gameState.replayCarry) };
  }
  if (action.type === 'BULK') {
    const { update } = action;
    return {
      ...prev,
      ...update,
      logs: [...update.logs, ...prev.logs].slice(0, 8),
      eventLog: [...update.eventLog, ...prev.eventLog].slice(0, 14),
      // 高速消化中のカットインは表示しない(seq だけ進めて古いキューを無効化)
      cutinFrame: { seq: update.gameState.totalGames, cutins: [] },
    };
  }
  const { spin, result } = action;
  // AT 獲得枚数の加算対象か = ゲーム開始時点(advanceGame 前)のフェーズが AT / エンディング
  const wasAtGame = prev.gameState.phase.type === 'AT' || prev.gameState.phase.type === 'ENDING';
  const game = result.state.totalGames;
  const log: GameLog = {
    game,
    won: result.wonRole,
    displayed: spin.displayed,
    lines: spin.lines,
    payout: result.payout.payout,
    net: result.state.netCoins,
    phase: phaseLabel(result.state.phase),
    pushOrder: action.pushOrder,
  };
  const newEvents = result.events
    .map((event) => ({ game, text: formatEvent(event) }))
    .reverse();
  return {
    gameState: result.state,
    positions: spin.positions,
    lines: spin.lines,
    displayed: spin.displayed,
    lastLog: log,
    logs: [log, ...prev.logs].slice(0, 8),
    eventLog: [...newEvents, ...prev.eventLog].slice(0, 14),
    meter: meterOnFinish(prev.meter, wasAtGame, result),
    cutinFrame: { seq: game, cutins: action.cutins },
    stats: statsOnFinish(prev.stats, {
      game,
      netCoins: result.state.netCoins,
      net: result.payout.net,
      wasAtGame,
      events: result.events,
    }),
  };
}

/** 停止ボタン押下後のスベリアニメーション(押下時刻 + 計画。表示専用) */
interface ReelSlip {
  anim: SlipAnim;
  pressAt: number;
}

/**
 * 遊技サイクル(STEP 3a・3b)の UI 状態。
 * IDLE = レバー待ち(前ゲームの出目を表示)/ SPINNING = 回転中(停止ボタン受付)。
 * 回転中の各リールの表示位置は「回転開始位置 + 経過時間」の連続位置
 * (`continuousPosition`。開始位置 = 前ゲームの停止位置で連続性を保つ)。
 * 停止ボタン押下後は `slips[reel]` のスベリアニメーション(押下瞬間の連続位置 →
 * 停止位置。最大 4 コマ ≤ 150ms)で停止し、押下位置の判定はその floor
 * (= `spinningPosition` と同値)を使うため見た目とロジックのコマが一致する。
 */
type SpinUi =
  | { mode: 'IDLE' }
  | {
      mode: 'SPINNING';
      cycle: SpinCycle;
      startPositions: StopPositions;
      startAt: number;
      slips: readonly (ReelSlip | undefined)[];
    };

/** オート消化の押し順セレクト: AUTO = 打ち方ポリシー連動(通常 = 左第一 / ナビ中のベル = ナビ) */
type PushOrderSelect = 'AUTO' | number;

function App() {
  const [seed] = useState(randomSeed);
  // rng と初期状態はペアで生成する(initGameState が rng を消費するため)
  const session = useMemo(() => {
    const rng = createRng(seed);
    return { rng, initialState: initGameState(rng) };
  }, [seed]);
  const rng = session.rng;
  // 演出専用 rng(小役示唆予告の抽せん)。advanceGame が使う rng とは分離し、
  // 出玉に影響する乱数列を演出が汚さないようにする(DIRECTION_SPEC「6.」)
  const hintRng = useMemo(() => createRng(randomSeed()), []);
  const [play, dispatch] = useReducer(reducer, session.initialState, makePlayState);
  const [spinUi, setSpinUi] = useState<SpinUi>({ mode: 'IDLE' });
  // レバーオン時に決定する 1G 分の予告演出(前兆シナリオ予告 / 小役示唆予告 = STEP 4c)
  const [leverDirection, setLeverDirection] = useState<LeverDirection>({ seq: 0 });

  const [stageSelect, setStageSelect] = useState<'AUTO' | StageId>('AUTO');
  const [bgmOn, setBgmOn] = useState(false);
  const [pushOrderSelect, setPushOrderSelect] = useState<PushOrderSelect>('AUTO');
  const [aim, setAim] = useState<AimMode>('RANDOM');
  const [forcedRole, setForcedRole] = useState<'DRAW' | Role>('DRAW');
  const [autoPlay, setAutoPlay] = useState(false);
  const [bulkGames, setBulkGames] = useState(500);
  const [resetCount, setResetCount] = useState(0);

  const stage = stageSelect === 'AUTO' ? stageForState(play.gameState) : stageSelect;
  const navi = isNaviActive(play.gameState);
  const spinning = spinUi.mode === 'SPINNING';

  // 回転中は requestAnimationFrame で毎フレーム再描画する(連続スクロール描画 = STEP 3b)
  const [, forceTick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!spinning) return;
    let raf = requestAnimationFrame(function loop() {
      forceTick();
      raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, [spinning]);

  // 最終リールのスベリ完了を待って 1G を締めるタイマー(リセット時に破棄)
  const finishTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(finishTimerRef.current), []);

  /**
   * バトルパートの進行中ルート(STEP 4e)。バトル 1G 目のレバーオンで一括抽せんし、
   * バトル中の毎レバーオンで参照する(表示は `battleView`)。UI 専用 rng で引くため
   * state ではなく ref に保持(再レンダー契機は leverDirection 側が担う)。
   * リセット・バトル終了(セット継続 / エンディング / AT 終了)で破棄する。
   */
  const battleRef = useRef<{ tier: BattleTier; route: BattleRoute } | undefined>(undefined);

  /** 全停止 → 表示判定 → advanceGame → レバー待ちへ(1G の締め) */
  const finishGame = (cycle: SpinCycle) => {
    const spin = finishSpin(cycle);
    const result = advanceGame(
      play.gameState,
      { wonRole: cycle.wonRole, displayedRole: spin.displayed },
      rng,
    );
    // 基本 SE(レア役 > 払出)。告知系の SE はカットイン表示時に DirectionLayer が鳴らす
    const cue = resultSoundCue(cycle.wonRole, result.payout.payout);
    if (cue !== undefined) playCue(cue);

    // 復活告知(STEP 4e): 敗北寄りルートの 8G 目全停止でセット継続 / エンディング移行が
    // 確定していたら、復活告知パターンを抽せんしてカットイン列の先頭へ差し込む
    // (第 3 リール停止時の告知 = DIRECTION_SPEC 2.5)
    let cutins: readonly Cutin[] = cutinsForEvents(result.events);
    const battle = battleRef.current;
    if (
      battle !== undefined &&
      battle.route.outcome === 'LOSE' &&
      result.events.some((e) => e.type === 'AT_SET_CONTINUE' || e.type === 'ENDING_START')
    ) {
      cutins = [revivalCutin(drawRevival(hintRng, battle.tier)), ...cutins];
    }

    // バトルルートの更新(STEP 4e): バトル 1G 目の全停止で率当せん(継続確定)が
    // 判明したら勝利ルートへ引き直す(direction.ts ヘッダーの実装解釈)。
    // バトルが終わったら破棄(次セット・エンディング・AT 終了・通常復帰)
    const nextPhase = result.state.phase;
    if (nextPhase.type === 'AT' && nextPhase.part === 'BATTLE') {
      if (
        nextPhase.partGame === 1 &&
        battle !== undefined &&
        battle.route.outcome === 'LOSE' &&
        nextPhase.continueConfirmed
      ) {
        battleRef.current = {
          tier: nextPhase.tier,
          route: drawBattleRoute(hintRng, nextPhase.tier, true, nextPhase.continueRate),
        };
      }
    } else {
      battleRef.current = undefined;
    }

    const pushOrder = cycle.pressed.map((reel) => REEL_NAMES[reel]).join('→');
    dispatch({ type: 'FINISH', spin, result, pushOrder, cutins });
    setSpinUi({ mode: 'IDLE' });
  };

  /**
   * レバーオン時の演出の決定(STEP 4c・4d・4e)。
   * - バトルパート中(1G 目 = 小役 10G 消化済みを含む)はバトル 8G 構成の全画面表示。
   *   1G 目でルートを一括抽せん(継続確定 = V ストック有無で仮判定。率当せんが
   *   1G 目の全停止で判明したら finishGame 側で勝利ルートへ引き直す)。
   * - AT 小役パート中は成立役から AT 予告を抽せん(DIRECTION_SPEC 2.3・3.5)。
   * - 連続演出中(1G 目 = 前兆最終 G 消化済みを含む)は 4G 構成の全画面表示(STEP 4d)。
   * - それ以外は前兆シナリオ予告(このゲームのステップ)を優先し、ない場合のみ
   *   小役示唆予告を成立役から抽せんする(競合規約 = DIRECTION_SPEC 2.1)。
   *   こぼすベル(bellMiss = 確定 35)には小役示唆予告を出さない(揃うベルは出す)。
   * いずれも次のレバーオンまで表示。
   */
  const drawLeverDirection = (won: Role, bellMiss: boolean) => {
    const state = play.gameState;
    const { phase: currentPhase } = state;
    // バトルパート(STEP 4e)
    let battle: LeverDirection['battle'];
    const battleGame = battleGameAtLeverOn(state);
    if (battleGame !== undefined && currentPhase.type === 'AT') {
      if (battleGame === 1 || battleRef.current === undefined) {
        // バトル 1G 目 = ルート一括抽せん(確定 29 の V ストック先消化ぶんだけ確定を仮判定)
        const confirmed =
          battleGame === 1 ? currentPhase.vStock > 0 : currentPhase.continueConfirmed;
        battleRef.current = {
          tier: currentPhase.tier,
          route: drawBattleRoute(hintRng, currentPhase.tier, confirmed, currentPhase.continueRate),
        };
      }
      battle = battleView(battleRef.current.tier, battleRef.current.route, battleGame);
    }
    // AT 小役パート予告(STEP 4e)
    let atYokoku: LeverDirection['atYokoku'];
    if (battle === undefined && atYokokuAllowed(state) && currentPhase.type === 'AT') {
      const drawn = drawAtYokoku(hintRng, won);
      if (drawn !== null) atYokoku = atYokokuView(drawn, won, currentPhase.tier);
    }
    const renzoku = battle === undefined ? renzokuAtLeverOn(state) : undefined;
    const yokoku =
      battle === undefined && renzoku === undefined ? scenarioYokokuAtLeverOn(state) : undefined;
    let hint: LeverDirection['hint'];
    if (
      battle === undefined &&
      atYokoku === undefined &&
      renzoku === undefined &&
      yokoku === undefined &&
      koyakuHintAllowed(state) &&
      // こぼすベルには小役示唆を出さない(揃うベルには出す = 確定 35 のユーザー指示)
      !(won === 'BELL' && bellMiss)
    ) {
      const drawn = drawKoyakuHint(hintRng, won);
      if (drawn !== null) hint = koyakuHintView(drawn, won, state.background);
    }
    setLeverDirection((prev) => ({ seq: prev.seq + 1, yokoku, hint, renzoku, atYokoku, battle }));
  };

  /** レバーオン: BET 徴収(メーター)+ 役抽せん + 予告決定 + 全リール回転開始(回転中は無視) */
  const onLever = () => {
    if (spinUi.mode !== 'IDLE') return;
    playCue('LEVER_ON');
    dispatch({ type: 'LEVER' });
    const won = forcedRole === 'DRAW' ? drawRole(rng) : forcedRole;
    // ベル当選時は 1/13 のこぼし抽せん(確定 35。playGame と同じ乱数消費順序)
    const bellMiss = won === 'BELL' ? drawBellMiss(rng) : false;
    drawLeverDirection(won, bellMiss);
    setSpinUi({
      mode: 'SPINNING',
      cycle: startSpin(won, bellMiss),
      startPositions: play.positions,
      startAt: performance.now(),
      slips: [undefined, undefined, undefined],
    });
  };

  /**
   * 停止ボタン: 押下瞬間に中段にあるコマ = 押下位置で 1 リール停止。押した順 = 押し順。
   * 押下位置は描画と同じ連続位置の floor(= `spinningPosition` と同値)で取得し、
   * 停止位置までのスベリをアニメーション(`planSlip`)で見せる。
   * 全リール停止後は最終リールのスベリ完了を待ってから 1G を締める。
   */
  const onStop = (reel: ReelIndex) => {
    if (spinUi.mode !== 'SPINNING' || spinUi.cycle.stopped[reel] !== undefined) return;
    playCue('REEL_STOP');
    const pressAt = performance.now();
    const fromPosition = continuousPosition(spinUi.startPositions[reel], pressAt - spinUi.startAt);
    const cycle = pressStop(spinUi.cycle, reel, Math.floor(fromPosition));
    const anim = planSlip(fromPosition, cycle.stopped[reel] ?? 0);
    const slips = spinUi.slips.slice();
    slips[reel] = { anim, pressAt };
    setSpinUi({ ...spinUi, cycle, slips });
    if (isAllStopped(cycle)) {
      finishTimerRef.current = window.setTimeout(() => finishGame(cycle), anim.durationMs);
    }
  };

  /** オート消化 1G: レバー〜全停止を即時実行(適当押し or 目押しセレクト + 押し順セレクト) */
  const autoGame = () => {
    if (spinUi.mode !== 'IDLE') return;
    playCue('LEVER_ON');
    dispatch({ type: 'LEVER' });
    const won = forcedRole === 'DRAW' ? drawRole(rng) : forcedRole;
    const bellMiss = won === 'BELL' ? drawBellMiss(rng) : false;
    drawLeverDirection(won, bellMiss);
    const pushes = pickPushes(aim, rng);
    const order: PushOrder =
      pushOrderSelect === 'AUTO'
        ? isNaviActive(play.gameState) && won === 'BELL'
          ? NAVI_PUSH_ORDER
          : NORMAL_PUSH_ORDER
        : PUSH_ORDERS[pushOrderSelect];
    let cycle = startSpin(won, bellMiss);
    for (const reel of order) cycle = pressStop(cycle, reel, pushes[reel]);
    finishGame(cycle);
  };

  /**
   * オートプレイ = 高速一括消化(STEP 6a。シミュレーションモード)。
   * `playGame`(確定 26 の打ち方ポリシー = 通常時 左第一・適当押し / AT 中 ナビ遵守)を
   * ヘッドレスで N ゲーム回し、結果(状態・メーター・遊技データ・直近ログ)を一括反映する。
   * リール描画・演出は出さない(終了後に最終ゲームの出目を表示)。成立役の強制指定は
   * オート消化と同様に尊重する。乱数は通常プレイと同じ `rng` を消費する(続きから遊技可能)。
   */
  const runBulk = (games: number) => {
    if (spinUi.mode !== 'IDLE') return;
    setAutoPlay(false);
    let state = play.gameState;
    let meter = play.meter;
    const stats = cloneStats(play.stats);
    const logs: GameLog[] = [];
    const eventLog: EventLogEntry[] = [];
    let lastSpin: SpinResult | undefined;
    for (let i = 0; i < games; i++) {
      const wasAtGame = state.phase.type === 'AT' || state.phase.type === 'ENDING';
      meter = meterOnLever(meter, state.replayCarry);
      const result = playGame(state, rng, forcedRole === 'DRAW' ? undefined : forcedRole);
      meter = meterOnFinish(meter, wasAtGame, result);
      const game = result.state.totalGames;
      pushGameStats(stats, {
        game,
        netCoins: result.state.netCoins,
        net: result.payout.net,
        wasAtGame,
        events: result.events,
      });
      logs.push({
        game,
        won: result.wonRole,
        displayed: result.spin.displayed,
        lines: result.spin.lines,
        payout: result.payout.payout,
        net: result.state.netCoins,
        phase: phaseLabel(result.state.phase),
        pushOrder: result.push.pushOrder.map((reel) => REEL_NAMES[reel]).join('→'),
      });
      if (logs.length > 8) logs.shift();
      for (const event of result.events) eventLog.push({ game, text: formatEvent(event) });
      if (eventLog.length > 14) eventLog.splice(0, eventLog.length - 14);
      state = result.state;
      lastSpin = result.spin;
    }
    if (lastSpin === undefined) return;
    logs.reverse();
    eventLog.reverse();
    // 高速消化中のレバーオン演出・バトルルートは無効化(最終ゲームの状態から再開)
    battleRef.current = undefined;
    setLeverDirection((prev) => ({ seq: prev.seq + 1 }));
    dispatch({
      type: 'BULK',
      update: {
        gameState: state,
        positions: lastSpin.positions,
        lines: lastSpin.lines,
        displayed: lastSpin.displayed,
        meter,
        stats,
        lastLog: logs[0],
        logs,
        eventLog,
      },
    });
  };

  // オート消化(30G 背景移行・AT の通し確認用)
  const autoGameRef = useRef(autoGame);
  autoGameRef.current = autoGame;
  useEffect(() => {
    if (!autoPlay) return;
    const id = setInterval(() => autoGameRef.current(), 160);
    return () => clearInterval(id);
  }, [autoPlay]);

  // キーボード操作: Space = レバーオン / Z・X・C = 左・中・右停止(ROADMAP 実装デフォルト 2)
  const onLeverRef = useRef(onLever);
  onLeverRef.current = onLever;
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'SELECT' || target.tagName === 'INPUT')) return;
      if (event.code === 'Space') {
        event.preventDefault(); // ボタンのスペース押下・スクロールと二重発火させない
        onLeverRef.current();
      } else if (event.code === 'KeyZ') onStopRef.current(0);
      else if (event.code === 'KeyX') onStopRef.current(1);
      else if (event.code === 'KeyC') onStopRef.current(2);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ステージ(状態連動 or 手動)に合わせて BGM を自動切替
  useEffect(() => {
    if (bgmOn) playBgm(STAGE_BGMS[stage]);
  }, [bgmOn, stage]);

  const onToggleBgm = () => {
    if (isBgmPlaying()) {
      stopBgm();
      setBgmOn(false);
    } else {
      playBgm(STAGE_BGMS[stage]);
      setBgmOn(true);
    }
  };

  const onReset = () => {
    setAutoPlay(false);
    window.clearTimeout(finishTimerRef.current);
    setSpinUi({ mode: 'IDLE' });
    setResetCount((n) => n + 1); // DirectionLayer を再マウントして演出キューを破棄
    setLeverDirection({ seq: 0 });
    battleRef.current = undefined;
    dispatch({ type: 'RESET', gameState: initGameState(rng) });
  };

  // 描画に使う現在時刻(回転中は rAF で毎フレーム再レンダーされる)
  const now = performance.now();

  /**
   * 現在の表示位置(連続位置。小数コマ)。
   * 停止中 = 前ゲームの出目 / 回転中 = 経過時間から算出 /
   * 停止ボタン押下後 = スベリアニメーション(完了後は停止位置に固定)
   */
  const displayPosition = (reel: ReelIndex): number => {
    if (spinUi.mode === 'IDLE') return play.positions[reel];
    const slip = spinUi.slips[reel];
    if (slip) return slipPosition(slip.anim, now - slip.pressAt);
    return continuousPosition(spinUi.startPositions[reel], now - spinUi.startAt);
  };

  /** リールが視覚的に動いているか(回転中 or スベリ中。ぼかし表示に使う) */
  const isReelMoving = (reel: ReelIndex): boolean => {
    if (spinUi.mode !== 'SPINNING') return false;
    const slip = spinUi.slips[reel];
    return slip === undefined || !isSlipDone(slip.anim, now - slip.pressAt);
  };

  // 出目ハイライトは全停止中のみ(回転中は消す)
  const hitRows = spinning
    ? ([new Set<number>(), new Set<number>(), new Set<number>()] as const)
    : highlightRows(play.lines, play.displayed, play.positions);
  const { gameState, meter } = play;
  const { phase } = gameState;
  // 押し順ナビの本表示(STEP 3c): AT・エンディング中のベル当選時、レバーオンで
  // リール窓上へナビ数字(何番目に押すか)を出し、リールが停止するごとに消す
  const naviShown = spinning && navi && spinUi.cycle.wonRole === 'BELL';
  const naviDigit = (reel: ReelIndex): number | undefined => {
    if (!naviShown || spinUi.cycle.stopped[reel] !== undefined) return undefined;
    return NAVI_PUSH_ORDER.indexOf(reel) + 1;
  };
  // AT 獲得枚数はゲーム開始時点が AT / エンディングのゲームで加算される(counters.ts)。
  // メーター表示は AT 中(エンディング含む)のみ(終了後は非表示。値は次の AT_START まで凍結)
  const atGainVisible = phase.type === 'AT' || phase.type === 'ENDING';

  return (
    <main className="app">
      <h1>義経物語 — 遊技デモ(STEP 3 完了版)</h1>
      <p className="note">
        Space = レバーオン(BET 3 枚掛け固定。リプレイは自動 BET)/ Z・X・C = 左・中・右停止
        (押下瞬間に中段にあるコマで停止 = タイミング目押し。押した順 = 押し順)。
        開発用の情報・操作は下部の「デバッグ(開発用)」を開く。
      </p>

      <div className="play-area">
        <section className="cabinet-column">
          <div
            className="cabinet"
            style={{ aspectRatio: `${CABINET_SIZE.w} / ${CABINET_SIZE.h}` }}
          >
            <img className="cabinet-frame" src={CABINET_FRAME_URL} alt="筐体" />
            <video
              key={stage}
              className="lcd"
              style={rectToPercent(LCD_RECT)}
              src={STAGE_VIDEOS[stage]}
              autoPlay
              muted
              loop
              playsInline
            />
            <div className="direction-layer-wrap" style={rectToPercent(LCD_RECT)}>
              <DirectionLayer
                key={resetCount}
                overlay={overlayForState(gameState)}
                lever={leverDirection}
                cutinFrame={play.cutinFrame}
              />
            </div>
            {REEL_WINDOW_RECTS.map((rect, reel) => {
              const reelIndex = reel as ReelIndex;
              const moving = isReelMoving(reelIndex);
              const digit = naviDigit(reelIndex);
              // コマ帯(窓 3 コマ + 上下 1 コマ)を連続位置ぶんだけ下へずらして描画する。
              // offset 1 コマ = 帯高さの 1/5(STRIP_KOMA)。key を floor 位置にすることで
              // コマ境界ごとに帯が入れ替わり、translateY は常に 0〜1 コマ分に収まる
              const strip = reelStrip(reelIndex, displayPosition(reelIndex));
              return (
                <div
                  key={reel}
                  className={moving ? 'reel-window reel-spinning' : 'reel-window'}
                  style={rectToPercent(rect)}
                >
                  <div
                    className="reel-strip"
                    style={{ transform: `translateY(${(strip.offset * 100) / STRIP_KOMA}%)` }}
                  >
                    {strip.symbols.map((symbol, i) => (
                      <img
                        key={i}
                        className={!moving && hitRows[reel].has(i - 1) ? 'hit' : undefined}
                        src={SYMBOL_IMAGES[symbol]}
                        alt={symbol}
                      />
                    ))}
                  </div>
                  {digit !== undefined && <div className="navi-digit">{digit}</div>}
                </div>
              );
            })}
          </div>
          <div className="meter-panel">
            <div className="meter">
              <span className="meter-label">CREDIT</span>
              <span className="seg">
                <span className="seg-ghost">8888</span>
                <span className="seg-value">{meter.credit}</span>
              </span>
            </div>
            <div className="meter">
              <span className="meter-label">BET</span>
              <span className="seg">
                <span className="seg-ghost">8</span>
                <span className="seg-value">{spinning ? 3 : 0}</span>
              </span>
              <span className={meter.autoBet && spinning ? 'lamp lamp-on' : 'lamp'}>REPLAY</span>
            </div>
            <div className="meter">
              <span className="meter-label">WIN</span>
              <span className="seg">
                <span className="seg-ghost">88</span>
                <span className="seg-value">{meter.payout}</span>
              </span>
            </div>
            {atGainVisible && (
              <div className="meter meter-at">
                <span className="meter-label">AT獲得</span>
                <span className="seg seg-at">
                  <span className="seg-ghost">8888</span>
                  <span className="seg-value">
                    {meter.atGained > 0 ? `+${meter.atGained}` : meter.atGained}
                  </span>
                </span>
                <span className="meter-unit">枚</span>
              </div>
            )}
          </div>
          <div className="stop-buttons">
            {REEL_NAMES.map((name, reel) => {
              const reelIndex = reel as ReelIndex;
              const enabled = spinning && spinUi.cycle.stopped[reelIndex] === undefined;
              return (
                <button
                  key={name}
                  type="button"
                  className="stop-button"
                  disabled={!enabled}
                  onClick={() => onStop(reelIndex)}
                >
                  {name}停止
                  <span className="key-hint">{STOP_KEY_NAMES[reel]}</span>
                </button>
              );
            })}
          </div>
          <div className="main-controls">
            <button type="button" className="lever" onClick={onLever} disabled={spinning}>
              レバーオン <span className="key-hint">Space</span>
            </button>
            <button
              type="button"
              className={autoPlay ? 'auto-on' : undefined}
              onClick={() => setAutoPlay((v) => !v)}
            >
              オート消化 {autoPlay ? '停止' : '開始'}
            </button>
            <button type="button" onClick={onToggleBgm}>
              BGM {bgmOn ? '停止' : '再生'}
            </button>
            <span className="bulk-controls">
              <select
                aria-label="オートプレイのゲーム数"
                value={bulkGames}
                onChange={(e) => setBulkGames(Number(e.target.value))}
              >
                {[100, 500, 1000, 5000].map((n) => (
                  <option key={n} value={n}>
                    {n}G
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => runBulk(bulkGames)} disabled={spinning}>
                オートプレイ(一括)
              </button>
            </span>
          </div>
          <StatsPanel stats={play.stats} />
        </section>
      </div>

      <details className="debug">
        <summary>デバッグ(開発用)</summary>
        <section className="debug-body">
          <div className="panel status state-panel">
            <div className="state-grid">
              <div>
                モード: <strong>{MODE_LABELS[gameState.mode]}</strong>
              </div>
              <div>
                背景: <strong>{BACKGROUND_LABELS[gameState.background]}</strong>
                <span className="miss">
                  ({gameState.backgroundGames}G{phase.type === 'NORMAL' ? '/30G' : ''})
                </span>
              </div>
              <div>
                フェーズ: <strong className={phase.type !== 'NORMAL' ? 'accent' : undefined}>{phaseLabel(phase)}</strong>
              </div>
              <div>
                総ゲーム数: <strong>{gameState.totalGames}</strong> G
              </div>
              <div>
                差枚:{' '}
                <strong className={gameState.netCoins >= 0 ? 'plus' : 'minus'}>
                  {gameState.netCoins >= 0 ? '+' : ''}
                  {gameState.netCoins}
                </strong>{' '}
                枚
              </div>
              <div>
                ナビ:{' '}
                {navi ? <strong className="accent">押し順ナビ中(ベル = 中第一)</strong> : 'なし'}
              </div>
              <div>
                予告演出:{' '}
                {leverDirection.battle !== undefined ? (
                  <strong className="accent">{leverDirection.battle.label}</strong>
                ) : leverDirection.atYokoku !== undefined ? (
                  <strong className="accent">{leverDirection.atYokoku.label}</strong>
                ) : leverDirection.renzoku !== undefined ? (
                  <strong className="accent">{leverDirection.renzoku.label}</strong>
                ) : leverDirection.yokoku !== undefined ? (
                  <strong className="accent">{leverDirection.yokoku.label}</strong>
                ) : leverDirection.hint !== undefined ? (
                  <strong>小役示唆 {leverDirection.hint.label}</strong>
                ) : (
                  'なし'
                )}
              </div>
            </div>
            {phase.type === 'OMEN' && (
              <div className="at-detail">
                <span>
                  シナリオ: <strong>{scenarioSummary(phase.scenario)}</strong>
                </span>
                <span>
                  連続演出チャンスアップ:{' '}
                  <strong>{chanceUpSummary(phase.scenario.renzokuSteps)}</strong>
                </span>
              </div>
            )}
            {phase.type === 'RENZOKU' && (
              <div className="at-detail">
                <span>
                  チャンスアップ(1〜3G): <strong>{chanceUpSummary(phase.chanceUps)}</strong>
                </span>
              </div>
            )}
            {phase.type === 'AT' && (
              <div className="at-detail">
                <span>
                  連チャン: <strong>{phase.renchan}</strong> 連目
                </span>
                <span>
                  継続率: <strong>{Math.round(phase.continueRate * 100)}%</strong>
                </span>
                <span>
                  Vストック: <strong>{phase.vStock}</strong> 個
                </span>
                <span>
                  継続:{' '}
                  <strong className={phase.continueConfirmed ? 'plus' : undefined}>
                    {phase.continueConfirmed ? '確定' : '未確定'}
                  </strong>
                </span>
              </div>
            )}
            {phase.type === 'ENDING' && (
              <div className="at-detail">
                <span>
                  消化後: <strong>{phase.after === 'UPPER_AT' ? '上位AT へ' : 'AT 終了'}</strong>
                </span>
                <span>
                  Vストック持越し: <strong>{phase.vStock}</strong> 個
                </span>
              </div>
            )}
            {spinning ? (
              <div>
                <strong className="accent">回転中</strong>
                <span className="miss">
                  停止ボタン(Z・X・C)で {REEL_NAMES.filter(
                    (_, reel) => spinUi.cycle.stopped[reel as ReelIndex] === undefined,
                  ).join('・')}{' '}
                  リールを停止
                </span>
              </div>
            ) : (
              play.lastLog && (
                <div>
                  成立役: <strong>{ROLE_LABELS[play.lastLog.won]}</strong>
                  {play.lastLog.displayed !== play.lastLog.won && (
                    <span className="miss">
                      (出目: {ROLE_LABELS[play.lastLog.displayed]}
                      {play.lastLog.displayed === 'NONE'
                        ? play.lastLog.won === 'BELL'
                          ? ' = ベルこぼし(12/13)'
                          : ' = 取りこぼし/未成立'
                        : ''})
                    </span>
                  )}
                  {play.lastLog.lines.length > 0 && (
                    <span className="miss">
                      ライン: {play.lastLog.lines.map((line) => LINE_LABELS[line]).join('・')}
                      {play.lastLog.displayed === 'BELL' &&
                        (play.lastLog.lines.some((line) => DIAGONAL_LINES.includes(line))
                          ? '(押し順正解 13 枚)'
                          : '(左第一 1/13 揃い 13 枚)')}
                    </span>
                  )}
                  <span className="miss">押し順: {play.lastLog.pushOrder}</span>
                </div>
              )
            )}
          </div>

          <div className="panel">
            <label>
              成立役:
              <select
                value={forcedRole}
                onChange={(e) => setForcedRole(e.target.value as 'DRAW' | Role)}
              >
                <option value="DRAW">抽せん(通常)</option>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}(強制)
                  </option>
                ))}
              </select>
            </label>
            <label>
              オート時の押し順:
              <select
                value={pushOrderSelect}
                onChange={(e) =>
                  setPushOrderSelect(e.target.value === 'AUTO' ? 'AUTO' : Number(e.target.value))
                }
              >
                <option value="AUTO">自動(通常 = 左第一 / ナビ遵守)</option>
                {PUSH_ORDER_LABELS.map((label, i) => (
                  <option key={label} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              オート時の目押し:
              <select value={aim} onChange={(e) => setAim(e.target.value as AimMode)}>
                {(Object.keys(AIM_LABELS) as AimMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {AIM_LABELS[mode]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="panel">
            <label>
              ステージ:
              <select
                value={stageSelect}
                onChange={(e) => setStageSelect(e.target.value as 'AUTO' | StageId)}
              >
                <option value="AUTO">自動(状態連動)</option>
                {STAGE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {STAGE_LABELS[id]}(手動)
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={autoGame} disabled={spinning}>
              1G消化(オート)
            </button>
            <button type="button" onClick={onReset}>
              リセット
            </button>
          </div>

          <h2>発生イベント(新しい順)</h2>
          <ul className="event-log">
            {play.eventLog.map((entry, i) => (
              <li key={`${entry.game}-${i}`}>
                <span className="event-game">{entry.game}G</span> {entry.text}
              </li>
            ))}
            {play.eventLog.length === 0 && <li className="miss">まだイベントなし</li>}
          </ul>

          <h2>ゲーム履歴(直近 8G)</h2>
          <table>
            <thead>
              <tr>
                <th>G数</th>
                <th>成立役</th>
                <th>出目</th>
                <th>押し順</th>
                <th>払出</th>
                <th>差枚</th>
                <th>フェーズ</th>
              </tr>
            </thead>
            <tbody>
              {play.logs.map((log) => (
                <tr key={log.game}>
                  <td>{log.game}</td>
                  <td>{ROLE_LABELS[log.won]}</td>
                  <td>{ROLE_LABELS[log.displayed]}</td>
                  <td>{log.pushOrder}</td>
                  <td>{log.payout}</td>
                  <td>{log.net}</td>
                  <td>{log.phase}</td>
                </tr>
              ))}
              {play.logs.length === 0 && (
                <tr>
                  <td colSpan={7}>レバーオンでゲーム開始</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </details>
    </main>
  );
}

export default App;
