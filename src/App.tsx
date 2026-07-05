import { useMemo, useReducer, useState } from 'react';
import './App.css';
import { drawRole, theoreticalDenominator } from './core/lottery';
import { calcPayout } from './core/payout';
import { createRng, randomSeed } from './core/rng';
import { SETTINGS, type Role, type Setting } from './core/roles';

const ROLE_LABELS: Record<Role, string> = {
  REPLAY: 'リプレイ',
  BELL: 'ベル',
  WATERMELON: 'スイカ',
  CHERRY_WEAK: '弱チェリー',
  CHERRY_STRONG: '強チェリー',
  CHANCE_ME: 'チャンス目',
  BONUS_BIG: 'BIG',
  BONUS_REG: 'REG',
  NONE: 'ハズレ',
};

interface GameLog {
  game: number;
  role: Role;
  payout: number;
  medals: number;
}

interface PlayState {
  game: number;
  medals: number;
  nextBetFree: boolean;
  logs: GameLog[];
}

const INITIAL_STATE: PlayState = { game: 0, medals: 0, nextBetFree: false, logs: [] };

function App() {
  const [setting, setSetting] = useState<Setting>(1);
  const [seed] = useState(randomSeed);
  const rng = useMemo(() => createRng(seed), [seed]);

  const [state, dispatch] = useReducer(
    (prev: PlayState, action: 'LEVER' | 'RESET'): PlayState => {
      if (action === 'RESET') return INITIAL_STATE;
      const role = drawRole(rng, setting);
      const result = calcPayout(role, !prev.nextBetFree);
      const game = prev.game + 1;
      const medals = prev.medals + result.net;
      const log: GameLog = { game, role, payout: result.payout, medals };
      return {
        game,
        medals,
        nextBetFree: result.isReplay,
        logs: [log, ...prev.logs].slice(0, 12),
      };
    },
    INITIAL_STATE,
  );

  return (
    <main className="app">
      <h1>パチスロアプリ — Phase 1 コア動作確認</h1>
      <p className="note">
        役抽選(<code>core/lottery</code>)・払い出し(<code>core/payout</code>)・シード付き乱数(
        <code>core/rng</code>)の動作確認ページ。リール・状態遷移・演出は今後のフェーズで実装。
      </p>

      <section className="panel">
        <label>
          設定:
          <select
            value={setting}
            onChange={(e) => setSetting(Number(e.target.value) as Setting)}
          >
            {SETTINGS.map((s) => (
              <option key={s} value={s}>
                設定{s}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="lever" onClick={() => dispatch('LEVER')}>
          レバーオン(1G 消化)
        </button>
        <button type="button" onClick={() => dispatch('RESET')}>
          リセット
        </button>
      </section>

      <section className="panel status">
        <div>
          総ゲーム数: <strong>{state.game}</strong> G
        </div>
        <div>
          メダル収支: <strong className={state.medals >= 0 ? 'plus' : 'minus'}>{state.medals >= 0 ? '+' : ''}{state.medals}</strong> 枚
        </div>
      </section>

      <section className="columns">
        <div>
          <h2>ゲーム履歴(直近 12G)</h2>
          <table>
            <thead>
              <tr>
                <th>G数</th>
                <th>成立役</th>
                <th>払出</th>
                <th>収支</th>
              </tr>
            </thead>
            <tbody>
              {state.logs.map((log) => (
                <tr key={log.game}>
                  <td>{log.game}</td>
                  <td>{ROLE_LABELS[log.role]}</td>
                  <td>{log.payout}</td>
                  <td>{log.medals}</td>
                </tr>
              ))}
              {state.logs.length === 0 && (
                <tr>
                  <td colSpan={4}>レバーオンでゲーム開始</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div>
          <h2>設定{setting} 理論値</h2>
          <table>
            <thead>
              <tr>
                <th>役</th>
                <th>確率</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  'REPLAY',
                  'BELL',
                  'WATERMELON',
                  'CHERRY_WEAK',
                  'CHERRY_STRONG',
                  'CHANCE_ME',
                  'BONUS_BIG',
                  'BONUS_REG',
                ] as const
              ).map((role) => (
                <tr key={role}>
                  <td>{ROLE_LABELS[role]}</td>
                  <td>1/{theoreticalDenominator(role, setting).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default App;
