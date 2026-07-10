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
import { resolveSpin, windowAt, type StopPositions } from './core/reel';
import { createRng, randomSeed } from './core/rng';
import { isRareRole, type Role } from './core/roles';
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

interface GameLog {
  game: number;
  won: Role;
  displayed: Role;
  payout: number;
  medals: number;
}

interface PlayState {
  game: number;
  medals: number;
  nextBetFree: boolean;
  positions: StopPositions;
  lastLog?: GameLog;
  logs: GameLog[];
}

const INITIAL_STATE: PlayState = {
  game: 0,
  medals: 0,
  nextBetFree: false,
  positions: [18, 19, 1],
  logs: [],
};

interface LeverAction {
  type: 'LEVER';
  won: Role;
  positions: StopPositions;
  displayed: Role;
}

type Action = LeverAction | { type: 'RESET' };

function reducer(prev: PlayState, action: Action): PlayState {
  if (action.type === 'RESET') return INITIAL_STATE;
  const result = calcPayout(action.displayed, !prev.nextBetFree);
  const game = prev.game + 1;
  const medals = prev.medals + result.net;
  const log: GameLog = {
    game,
    won: action.won,
    displayed: action.displayed,
    payout: result.payout,
    medals,
  };
  return {
    game,
    medals,
    nextBetFree: result.isReplay,
    positions: action.positions,
    lastLog: log,
    logs: [log, ...prev.logs].slice(0, 8),
  };
}

function App() {
  const [stage, setStage] = useState<StageId>('STAGE_NORMAL_A');
  const [bgmOn, setBgmOn] = useState(false);
  const [seed] = useState(randomSeed);
  const rng = useMemo(() => createRng(seed), [seed]);
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const onLever = () => {
    playSe(SE.leverOn);
    const won = drawRole(rng);
    // 押下位置はランダム(タイミング目押しは Phase 4 で停止ボタン化)。押し順は順押し固定
    const pushes: [number, number, number] = [
      rng.nextInt(20),
      rng.nextInt(20),
      rng.nextInt(20),
    ];
    const { positions, displayed } = resolveSpin(won, pushes);
    if (won === 'REACH_ME') playSe(SE.bonus);
    else if (isRareRole(won)) playSe(SE.rare);
    else if (calcPayout(displayed, true).payout > 0) playSe(SE.payout);
    else playSe(SE.reelStop);
    dispatch({ type: 'LEVER', won, positions, displayed });
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

  return (
    <main className="app">
      <h1>パチスロアプリ — 素材確認 + Phase 2 リール制御</h1>
      <p className="note">
        筐体はユーザー入稿画像。液晶・リール図柄・BGM/SE
        は仮素材(黒背景+白文字)で、実素材の入稿後に差し替える。リールの出目は
        <code>core/reel</code> の停止制御(引き込み優先度探索)の実出力。
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
              {windowAt(reel as 0 | 1 | 2, state.positions[reel]).map((symbol, row) => (
                <img key={row} src={SYMBOL_IMAGES[symbol]} alt={symbol} />
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
          </div>

          <h2>ゲーム履歴(直近 8G)</h2>
          <table>
            <thead>
              <tr>
                <th>G数</th>
                <th>成立役</th>
                <th>出目</th>
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
                  <td>{log.payout}</td>
                  <td>{log.medals}</td>
                </tr>
              ))}
              {state.logs.length === 0 && (
                <tr>
                  <td colSpan={5}>レバーオンでゲーム開始</td>
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
