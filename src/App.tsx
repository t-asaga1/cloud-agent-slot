import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import './App.css';
import {
  CABINET_FRAME_URL,
  SE,
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
import { drawRole } from './core/lottery';
import type { Mode } from './core/mode';
import { RENZOKU_GAMES } from './core/omen';
import { NAVI_PUSH_ORDER, NORMAL_PUSH_ORDER } from './core/play';
import {
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
import { isRareRole, ROLES, type Role } from './core/roles';
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
import { isBgmPlaying, playBgm, playSe, stopBgm } from './platform/audio';
import {
  finishSpin,
  isAllStopped,
  pressStop,
  spinningPosition,
  startSpin,
  SPIN_MS_PER_KOMA,
  type SpinCycle,
} from './ui/gameCycle';

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
}

function makePlayState(gameState: GameState): PlayState {
  return {
    gameState,
    positions: [18, 19, 1],
    lines: [],
    displayed: 'NONE',
    logs: [],
    eventLog: [],
  };
}

type Action =
  | { type: 'FINISH'; spin: SpinResult; result: AdvanceResult; pushOrder: string }
  | { type: 'RESET'; gameState: GameState };

function reducer(prev: PlayState, action: Action): PlayState {
  if (action.type === 'RESET') return makePlayState(action.gameState);
  const { spin, result } = action;
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
  };
}

/**
 * 遊技サイクル(STEP 3a)の UI 状態。
 * IDLE = レバー待ち(前ゲームの出目を表示)/ SPINNING = 回転中(停止ボタン受付)。
 * 回転中の各リールの表示位置は「回転開始位置 + 経過時間」から求める
 * (`spinningPosition`。開始位置 = 前ゲームの停止位置で連続性を保つ)。
 */
type SpinUi =
  | { mode: 'IDLE' }
  | { mode: 'SPINNING'; cycle: SpinCycle; startPositions: StopPositions; startAt: number };

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
  const [play, dispatch] = useReducer(reducer, session.initialState, makePlayState);
  const [spinUi, setSpinUi] = useState<SpinUi>({ mode: 'IDLE' });

  const [stageSelect, setStageSelect] = useState<'AUTO' | StageId>('AUTO');
  const [bgmOn, setBgmOn] = useState(false);
  const [pushOrderSelect, setPushOrderSelect] = useState<PushOrderSelect>('AUTO');
  const [aim, setAim] = useState<AimMode>('RANDOM');
  const [forcedRole, setForcedRole] = useState<'DRAW' | Role>('DRAW');
  const [autoPlay, setAutoPlay] = useState(false);

  const stage = stageSelect === 'AUTO' ? stageForState(play.gameState) : stageSelect;
  const navi = isNaviActive(play.gameState);
  const spinning = spinUi.mode === 'SPINNING';

  // 回転中はコマ送り表示のため一定間隔で再描画する(滑らかなスクロールは 3b)
  const [, forceTick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!spinning) return;
    const id = setInterval(forceTick, SPIN_MS_PER_KOMA);
    return () => clearInterval(id);
  }, [spinning]);

  /** 全停止 → 表示判定 → advanceGame → レバー待ちへ(1G の締め) */
  const finishGame = (cycle: SpinCycle) => {
    const spin = finishSpin(cycle);
    const result = advanceGame(
      play.gameState,
      { wonRole: cycle.wonRole, displayedRole: spin.displayed, bellSuccess: spin.bellSuccess },
      rng,
    );
    if (result.events.some((e) => e.type === 'AT_START' || e.type === 'UPPER_AT_ENTER')) {
      playSe(SE.bonus);
    } else if (cycle.wonRole === 'REACH_ME') playSe(SE.bonus);
    else if (isRareRole(cycle.wonRole)) playSe(SE.rare);
    else if (result.payout.payout > 0) playSe(SE.payout);
    const pushOrder = cycle.pressed.map((reel) => REEL_NAMES[reel]).join('→');
    dispatch({ type: 'FINISH', spin, result, pushOrder });
    setSpinUi({ mode: 'IDLE' });
  };

  /** レバーオン: 役抽せん + 全リール回転開始(回転中は無視) */
  const onLever = () => {
    if (spinUi.mode !== 'IDLE') return;
    playSe(SE.leverOn);
    const won = forcedRole === 'DRAW' ? drawRole(rng) : forcedRole;
    setSpinUi({
      mode: 'SPINNING',
      cycle: startSpin(won),
      startPositions: play.positions,
      startAt: performance.now(),
    });
  };

  /** 停止ボタン: 押下瞬間に中段にあるコマ = 押下位置で 1 リール停止。押した順 = 押し順 */
  const onStop = (reel: ReelIndex) => {
    if (spinUi.mode !== 'SPINNING' || spinUi.cycle.stopped[reel] !== undefined) return;
    playSe(SE.reelStop);
    const pushPosition = spinningPosition(
      spinUi.startPositions[reel],
      performance.now() - spinUi.startAt,
    );
    const cycle = pressStop(spinUi.cycle, reel, pushPosition);
    if (isAllStopped(cycle)) {
      finishGame(cycle);
    } else {
      setSpinUi({ ...spinUi, cycle });
    }
  };

  /** オート消化 1G: レバー〜全停止を即時実行(適当押し or 目押しセレクト + 押し順セレクト) */
  const autoGame = () => {
    if (spinUi.mode !== 'IDLE') return;
    playSe(SE.leverOn);
    const won = forcedRole === 'DRAW' ? drawRole(rng) : forcedRole;
    const pushes = pickPushes(aim, rng);
    const order: PushOrder =
      pushOrderSelect === 'AUTO'
        ? isNaviActive(play.gameState) && won === 'BELL'
          ? NAVI_PUSH_ORDER
          : NORMAL_PUSH_ORDER
        : PUSH_ORDERS[pushOrderSelect];
    let cycle = startSpin(won);
    for (const reel of order) cycle = pressStop(cycle, reel, pushes[reel]);
    finishGame(cycle);
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
    setSpinUi({ mode: 'IDLE' });
    dispatch({ type: 'RESET', gameState: initGameState(rng) });
  };

  /** 現在の表示位置(停止中 = 前ゲームの出目 / 回転中 = 経過時間から算出) */
  const displayPosition = (reel: ReelIndex): number => {
    if (spinUi.mode === 'IDLE') return play.positions[reel];
    const stopped = spinUi.cycle.stopped[reel];
    if (stopped !== undefined) return stopped;
    return spinningPosition(spinUi.startPositions[reel], performance.now() - spinUi.startAt);
  };

  // 出目ハイライトは全停止中のみ(回転中は消す)
  const hitRows = spinning
    ? ([new Set<number>(), new Set<number>(), new Set<number>()] as const)
    : highlightRows(play.lines, play.displayed, play.positions);
  const { gameState } = play;
  const { phase } = gameState;
  // ナビ表示(仮): AT・エンディング中のベル当選時、回転中に押し順ナビを出す(本表示は 3c)
  const naviText =
    spinning && navi && spinUi.cycle.wonRole === 'BELL'
      ? NAVI_PUSH_ORDER.map((reel) => REEL_NAMES[reel]).join('→')
      : undefined;

  return (
    <main className="app">
      <h1>パチスロアプリ — 遊技サイクルデモ(STEP 3a)</h1>
      <p className="note">
        レバーオン(Space)で役抽せん + 全リール回転、停止ボタン(Z・X・C)で 1 リールずつ停止
        (押下瞬間に中段にあるコマ = 押下位置、押した順 = 押し順)。全停止で表示判定・払出を行い、
        ステートマシン(<code>advanceGame</code>)が 1G 進む。回転表示はコマ送りの簡易版
        (滑らかなスクロールとスベリの視覚化は STEP 3b)。
      </p>

      <div className="layout">
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
            {REEL_WINDOW_RECTS.map((rect, reel) => {
              const reelIndex = reel as ReelIndex;
              const isReelSpinning =
                spinUi.mode === 'SPINNING' && spinUi.cycle.stopped[reelIndex] === undefined;
              return (
                <div
                  key={reel}
                  className={isReelSpinning ? 'reel-window reel-spinning' : 'reel-window'}
                  style={rectToPercent(rect)}
                >
                  {windowAt(reelIndex, displayPosition(reelIndex)).map((symbol, row) => (
                    <img
                      key={row}
                      className={hitRows[reel].has(row) ? 'hit' : undefined}
                      src={SYMBOL_IMAGES[symbol]}
                      alt={symbol}
                    />
                  ))}
                </div>
              );
            })}
            {naviText && <div className="navi-overlay">ナビ: {naviText}</div>}
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
        </section>

        <section className="side">
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
            </div>
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
                      {play.lastLog.displayed === 'NONE' ? ' = 取りこぼし/未成立' : ''})
                    </span>
                  )}
                  {play.lastLog.lines.length > 0 && (
                    <span className="miss">
                      ライン: {play.lastLog.lines.map((line) => LINE_LABELS[line]).join('・')}
                      {play.lastLog.displayed === 'BELL' &&
                        `(押し順${play.lastLog.payout >= 13 ? '正解 13 枚' : '不正解 1 枚'})`}
                    </span>
                  )}
                  <span className="miss">押し順: {play.lastLog.pushOrder}</span>
                </div>
              )
            )}
          </div>

          <div className="panel">
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
            <button type="button" onClick={onReset}>
              リセット
            </button>
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
            <button type="button" onClick={onToggleBgm}>
              BGM {bgmOn ? '停止' : '再生'}
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
      </div>
    </main>
  );
}

export default App;
