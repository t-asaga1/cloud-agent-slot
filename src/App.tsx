import { useMemo, useReducer, useState } from 'react';
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
import { drawRole } from './core/lottery';
import { calcPayout } from './core/payout';
import {
  KOMA_COUNT,
  LINES,
  PUSH_ORDERS,
  REEL_LAYOUT,
  resolveSpin,
  windowAt,
  type LineId,
  type PushOrder,
  type ReelIndex,
  type StopPositions,
} from './core/reel';
import { createRng, randomSeed, type Rng } from './core/rng';
import { isRareRole, ROLES, type Role } from './core/roles';
import { isBgmPlaying, playBgm, playSe, stopBgm } from './platform/audio';

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

const REEL_NAMES = ['左', '中', '右'] as const;

const PUSH_ORDER_LABELS = PUSH_ORDERS.map((order) =>
  order.map((reel) => REEL_NAMES[reel]).join('→'),
);

/** 目押しモード(押下位置の決め方)。タイミング目押しの停止ボタン化は Phase 4 */
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
  medals: number;
}

interface PlayState {
  game: number;
  medals: number;
  nextBetFree: boolean;
  positions: StopPositions;
  lines: LineId[];
  displayed: Role;
  lastLog?: GameLog;
  logs: GameLog[];
}

const INITIAL_STATE: PlayState = {
  game: 0,
  medals: 0,
  nextBetFree: false,
  positions: [18, 19, 1],
  lines: [],
  displayed: 'NONE',
  logs: [],
};

interface LeverAction {
  type: 'LEVER';
  won: Role;
  positions: StopPositions;
  displayed: Role;
  /** 表示役が揃った有効ライン(resolveSpin の判定結果) */
  lines: LineId[];
  /** 押し順ベルの払出区分(斜め揃い = 13 枚 / 上段揃い = 1 枚)。resolveSpin の判定結果 */
  bellSuccess: boolean;
}

type Action = LeverAction | { type: 'RESET' };

function reducer(prev: PlayState, action: Action): PlayState {
  if (action.type === 'RESET') return INITIAL_STATE;
  const result = calcPayout(action.displayed, !prev.nextBetFree, action.bellSuccess);
  const game = prev.game + 1;
  const medals = prev.medals + result.net;
  const log: GameLog = {
    game,
    won: action.won,
    displayed: action.displayed,
    lines: action.lines,
    payout: result.payout,
    medals,
  };
  return {
    game,
    medals,
    nextBetFree: result.isReplay,
    positions: action.positions,
    lines: action.lines,
    displayed: action.displayed,
    lastLog: log,
    logs: [log, ...prev.logs].slice(0, 8),
  };
}

function App() {
  const [stage, setStage] = useState<StageId>('STAGE_YOSHITSUNE');
  const [bgmOn, setBgmOn] = useState(false);
  const [seed] = useState(randomSeed);
  const rng = useMemo(() => createRng(seed), [seed]);
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [pushOrderIndex, setPushOrderIndex] = useState(0);
  const [aim, setAim] = useState<AimMode>('RANDOM');
  const [forcedRole, setForcedRole] = useState<'DRAW' | Role>('DRAW');

  const onLever = () => {
    playSe(SE.leverOn);
    const won = forcedRole === 'DRAW' ? drawRole(rng) : forcedRole;
    // 押下位置は目押しモードに従う(タイミング目押しの停止ボタン化は Phase 4)
    const pushes = pickPushes(aim, rng);
    const pushOrder: PushOrder = PUSH_ORDERS[pushOrderIndex];
    const { positions, displayed, lines, bellSuccess } = resolveSpin(won, pushes, pushOrder);
    if (won === 'REACH_ME') playSe(SE.bonus);
    else if (isRareRole(won)) playSe(SE.rare);
    else if (calcPayout(displayed, true, bellSuccess).payout > 0) playSe(SE.payout);
    else playSe(SE.reelStop);
    dispatch({ type: 'LEVER', won, positions, displayed, lines, bellSuccess });
  };

  const onStageChange = (next: StageId) => {
    setStage(next);
    if (bgmOn) playBgm(STAGE_BGMS[next]);
  };

  const onToggleBgm = () => {
    if (isBgmPlaying()) {
      stopBgm();
      setBgmOn(false);
    } else {
      playBgm(STAGE_BGMS[stage]);
      setBgmOn(true);
    }
  };

  const hitRows = highlightRows(state.lines, state.displayed, state.positions);

  return (
    <main className="app">
      <h1>パチスロアプリ — 素材確認 + リール制御デモ(STEP 1 完了版)</h1>
      <p className="note">
        筐体・背景動画・リール図柄はユーザー入稿素材。BGM/SE
        は仮素材で、実素材の入稿後に差し替える(AT/上位ATの背景は小役・バトル共用)。リールの出目は
        <code>core/reel</code> の停止制御(5 ライン対応の引き込み優先度探索)の実出力。
        揃った有効ラインは金枠でハイライト表示。成立役の強制指定は停止形確認のデモ用。
      </p>

      <div className="layout">
        <section
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
          {REEL_WINDOW_RECTS.map((rect, reel) => (
            <div key={reel} className="reel-window" style={rectToPercent(rect)}>
              {windowAt(reel as ReelIndex, state.positions[reel]).map((symbol, row) => (
                <img
                  key={row}
                  className={hitRows[reel].has(row) ? 'hit' : undefined}
                  src={SYMBOL_IMAGES[symbol]}
                  alt={symbol}
                />
              ))}
            </div>
          ))}
        </section>

        <section className="side">
          <div className="panel">
            <label>
              ステージ:
              <select value={stage} onChange={(e) => onStageChange(e.target.value as StageId)}>
                {STAGE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {STAGE_LABELS[id]}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={onToggleBgm}>
              BGM {bgmOn ? '停止' : '再生'}
            </button>
          </div>

          <div className="panel">
            <label>
              押し順:
              <select
                value={pushOrderIndex}
                onChange={(e) => setPushOrderIndex(Number(e.target.value))}
              >
                {PUSH_ORDER_LABELS.map((label, i) => (
                  <option key={label} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              目押し:
              <select value={aim} onChange={(e) => setAim(e.target.value as AimMode)}>
                {(Object.keys(AIM_LABELS) as AimMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {AIM_LABELS[mode]}
                  </option>
                ))}
              </select>
            </label>
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
          </div>

          <div className="panel">
            <button type="button" className="lever" onClick={onLever}>
              レバーオン(1G 消化)
            </button>
            <button type="button" onClick={() => dispatch({ type: 'RESET' })}>
              リセット
            </button>
          </div>

          <div className="panel status">
            <div>
              総ゲーム数: <strong>{state.game}</strong> G
            </div>
            <div>
              収支:{' '}
              <strong className={state.medals >= 0 ? 'plus' : 'minus'}>
                {state.medals >= 0 ? '+' : ''}
                {state.medals}
              </strong>{' '}
              枚
            </div>
            {state.lastLog && (
              <div>
                成立役: <strong>{ROLE_LABELS[state.lastLog.won]}</strong>
                {state.lastLog.displayed !== state.lastLog.won && (
                  <span className="miss">
                    (出目: {ROLE_LABELS[state.lastLog.displayed]}
                    {state.lastLog.displayed === 'NONE' ? ' = 取りこぼし/未成立' : ''})
                  </span>
                )}
              </div>
            )}
            {state.lastLog && state.lastLog.lines.length > 0 && (
              <div>
                揃ったライン:{' '}
                <strong>{state.lastLog.lines.map((line) => LINE_LABELS[line]).join('・')}</strong>
                {state.lastLog.displayed === 'BELL' && (
                  <span className="miss">
                    (押し順{state.lastLog.payout >= 13 ? '正解 13 枚' : '不正解 1 枚'})
                  </span>
                )}
              </div>
            )}
          </div>

          <h2>ゲーム履歴(直近 8G)</h2>
          <table>
            <thead>
              <tr>
                <th>G数</th>
                <th>成立役</th>
                <th>出目</th>
                <th>ライン</th>
                <th>払出</th>
                <th>収支</th>
              </tr>
            </thead>
            <tbody>
              {state.logs.map((log) => (
                <tr key={log.game}>
                  <td>{log.game}</td>
                  <td>{ROLE_LABELS[log.won]}</td>
                  <td>{ROLE_LABELS[log.displayed]}</td>
                  <td>{log.lines.map((line) => LINE_LABELS[line]).join('・') || '—'}</td>
                  <td>{log.payout}</td>
                  <td>{log.medals}</td>
                </tr>
              ))}
              {state.logs.length === 0 && (
                <tr>
                  <td colSpan={6}>レバーオンでゲーム開始</td>
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
