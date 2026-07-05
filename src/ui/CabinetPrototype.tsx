import { useEffect, useMemo, useRef, useState } from 'react';
import { ASSETS, cabinetLayout, type LayoutRect } from '../assets';
import { drawRole } from '../core/lottery';
import {
  REEL_INDEXES,
  SYMBOLS_PER_REEL,
  judgeDisplay,
  normalizePosition,
  stopReel,
  symbolAt,
  type ReelIndex,
  type SymbolId,
} from '../core/reel';
import { createRng, randomSeed } from '../core/rng';
import type { Role, Setting } from '../core/roles';
import './cabinet.css';

/**
 * 筐体画像を使った画面レイアウトの試作(液晶エリア・リール窓の位置合わせ確認)。
 *
 * - 筐体フレーム(液晶・リール窓は透過抜き済み)を最前面に重ね、
 *   `cabinet_layout.json` の座標に液晶・リール窓コンテンツをはめ込む。
 * - リールは Phase 2 の停止制御(core/reel)をそのまま使う動作確認付き。
 *   回転の見た目は UI 層の簡易実装(コマ送り)で、core は押下位置→停止位置の純関数のみ。
 */

const SYMBOL_VIEW: Record<SymbolId, { label: string; className: string }> = {
  RED7: { label: '7', className: 'sym-red7' },
  WHITE7: { label: '7', className: 'sym-white7' },
  BAR: { label: 'BAR', className: 'sym-bar' },
  BELL: { label: '🔔', className: 'sym-bell' },
  WATERMELON: { label: '🍉', className: 'sym-wm' },
  CHERRY: { label: '🍒', className: 'sym-cherry' },
  REPLAY: { label: 'RP', className: 'sym-replay' },
};

const ROLE_LABELS: Record<Role, string> = {
  REPLAY: 'リプレイ',
  BELL: 'ベル',
  WATERMELON: 'スイカ',
  CHERRY_WEAK: '弱チェリー',
  CHERRY_STRONG: '強チェリー',
  CHANCE_ME: 'チャンス目',
  BONUS_BIG: 'BIG(赤7揃い)',
  BONUS_REG: 'REG(白7揃い)',
  NONE: 'ハズレ',
};

function rectStyle(rect: LayoutRect): React.CSSProperties {
  return {
    left: `${rect.ratio.x * 100}%`,
    top: `${rect.ratio.y * 100}%`,
    width: `${rect.ratio.width * 100}%`,
    height: `${rect.ratio.height * 100}%`,
  };
}

interface ReelState {
  /** 中段のコマ番号(回転中は現在通過中のコマ) */
  position: number;
  spinning: boolean;
}

const INITIAL_REELS: ReelState[] = [
  { position: 0, spinning: false },
  { position: 0, spinning: false },
  { position: 0, spinning: false },
];

export function CabinetPrototype({ setting }: { setting: Setting }) {
  const rng = useMemo(() => createRng(randomSeed()), []);
  const [reels, setReels] = useState<ReelState[]>(INITIAL_REELS);
  const [wonRole, setWonRole] = useState<Role | null>(null);
  const [lastResult, setLastResult] = useState<{ won: Role; display: Role } | null>(null);
  const reelsRef = useRef(reels);
  reelsRef.current = reels;

  const anySpinning = reels.some((r) => r.spinning);

  // 回転アニメーション(UI 層の責務): 60ms ごとに 1 コマ進める
  useEffect(() => {
    if (!anySpinning) return;
    const timer = setInterval(() => {
      setReels((prev) =>
        prev.map((r) =>
          r.spinning ? { ...r, position: normalizePosition(r.position + 1) } : r,
        ),
      );
    }, 60);
    return () => clearInterval(timer);
  }, [anySpinning]);

  const onLever = () => {
    if (anySpinning) return;
    const role = drawRole(rng, setting);
    setWonRole(role);
    setLastResult(null);
    setReels((prev) => prev.map((r) => ({ ...r, spinning: true })));
  };

  const onStop = (reel: ReelIndex) => {
    if (wonRole === null) return;
    const current = reelsRef.current;
    if (!current[reel].spinning) return;
    const stopped: Partial<Record<ReelIndex, number>> = {};
    for (const r of REEL_INDEXES) {
      if (!current[r].spinning) stopped[r] = current[r].position;
    }
    const stopPosition = stopReel(wonRole, reel, current[reel].position, stopped);
    const next = current.map((r, i) =>
      i === reel ? { position: stopPosition, spinning: false } : r,
    );
    setReels(next);
    if (next.every((r) => !r.spinning)) {
      const display = judgeDisplay([next[0].position, next[1].position, next[2].position]);
      setLastResult({ won: wonRole, display });
      setWonRole(null);
    }
  };

  return (
    <div className="cabinet-proto">
      <div className="cabinet-stage">
        {/* 液晶エリア(水色プレースホルダー位置) */}
        <div className="cabinet-lcd" style={rectStyle(cabinetLayout.lcd as LayoutRect)}>
          <div className="lcd-content">
            <p className="lcd-title">液晶エリア</p>
            {lastResult ? (
              <>
                <p className="lcd-role">{ROLE_LABELS[lastResult.won]}</p>
                <p className="lcd-sub">
                  表示役: {ROLE_LABELS[lastResult.display]}
                  {lastResult.display !== lastResult.won && ' (取りこぼし/出目のみ)'}
                </p>
              </>
            ) : (
              <p className="lcd-sub">{anySpinning ? '回転中…' : 'レバーオンで抽選'}</p>
            )}
          </div>
        </div>

        {/* リール窓(ピンクプレースホルダー位置)。上・中・下段の 3 コマ表示 */}
        {REEL_INDEXES.map((reel) => {
          const rect = (cabinetLayout.reelWindows as LayoutRect[])[reel];
          const { position, spinning } = reels[reel];
          const rows = [1, 0, -1].map((offset) =>
            symbolAt(reel, normalizePosition(position + offset)),
          );
          return (
            <div key={rect.name} className="cabinet-reel" style={rectStyle(rect)}>
              {rows.map((symbol, i) => (
                <div
                  key={i}
                  className={`reel-cell ${i === 1 ? 'reel-cell-middle' : ''} ${spinning ? 'reel-cell-spin' : ''}`}
                >
                  <span className={`sym ${SYMBOL_VIEW[symbol].className}`}>
                    {SYMBOL_VIEW[symbol].label}
                  </span>
                </div>
              ))}
            </div>
          );
        })}

        {/* 筐体フレーム(最前面。液晶・リール窓は透過) */}
        <img className="cabinet-frame" src={ASSETS.cabinetFrame} alt="筐体フレーム" />
      </div>

      <div className="cabinet-controls">
        <button type="button" className="lever" onClick={onLever} disabled={anySpinning}>
          レバーオン
        </button>
        {REEL_INDEXES.map((reel) => (
          <button
            key={reel}
            type="button"
            onClick={() => onStop(reel)}
            disabled={!reels[reel].spinning}
          >
            停止 {['左', '中', '右'][reel]}
          </button>
        ))}
        <span className="cabinet-hint">
          コマ番号: {reels.map((r) => r.position).join(' / ')}(全 {SYMBOLS_PER_REEL} コマ)
        </span>
      </div>
    </div>
  );
}
