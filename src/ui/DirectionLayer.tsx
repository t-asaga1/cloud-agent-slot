/**
 * 演出表示レイヤー(STEP 3d)。液晶(LCD)領域へ重ねて描画する。
 *
 * `direction.ts` が返す宣言的データを表示するだけの「画面」側:
 * - `overlay`(フェーズ由来の常時表示)= 親から毎レンダー渡される(状態が変われば消える)
 * - `cutinFrame`(イベント由来のワンショット)= seq(ゲーム通し番号)が進むたびに
 *   カットイン列をキューへ積み、先頭から durationMs ずつ順番に表示 + SE 再生する
 *
 * STEP 4 でシナリオテーブルへ差し替えるときも本コンポーネントは変えない
 * (direction.ts の対応表だけを置き換える)。リセット時は親が `key` を変えて
 * 再マウントし、キューを破棄する。
 */
import { useEffect, useRef, useState } from 'react';
import type { Cutin, StateOverlay } from './direction';
import { playCue } from './sound';

/** 1 ゲーム分のカットイン列(seq = ゲーム通し番号。同じ seq は一度だけキューへ積む) */
export interface CutinFrame {
  seq: number;
  cutins: readonly Cutin[];
}

interface QueuedCutin {
  cutin: Cutin;
  key: number;
}

/**
 * カットインキューの上限。オート消化(160ms/G)ではゲーム進行が表示時間より速く、
 * 無制限に積むと古い演出が何分も再生され続けるため、超過したら「表示中の先頭を残して
 * 古い待機分から間引き」、直近の演出を優先する(手動プレイでは実質無制限と同じ)。
 */
export const MAX_CUTIN_QUEUE = 4;

interface Props {
  overlay: StateOverlay | undefined;
  cutinFrame: CutinFrame;
}

export function DirectionLayer({ overlay, cutinFrame }: Props) {
  const [queue, setQueue] = useState<QueuedCutin[]>([]);
  const seenSeqRef = useRef(cutinFrame.seq);
  const keyRef = useRef(0);

  // 新しいゲームのカットイン列をキューへ積む(同じ seq は一度だけ)
  useEffect(() => {
    if (cutinFrame.seq === seenSeqRef.current) return;
    seenSeqRef.current = cutinFrame.seq;
    if (cutinFrame.cutins.length === 0) return;
    const queued = cutinFrame.cutins.map((cutin) => ({ cutin, key: keyRef.current++ }));
    setQueue((prev) => {
      const merged = [...prev, ...queued];
      if (merged.length <= MAX_CUTIN_QUEUE) return merged;
      return [merged[0], ...merged.slice(merged.length - (MAX_CUTIN_QUEUE - 1))];
    });
  }, [cutinFrame]);

  // キュー先頭のカットインを durationMs 表示し、表示開始時に SE を鳴らす
  const head = queue.length > 0 ? queue[0] : undefined;
  const headKey = head?.key;
  useEffect(() => {
    if (head === undefined) return;
    if (head.cutin.sound !== undefined) playCue(head.cutin.sound);
    const id = window.setTimeout(
      () => setQueue((prev) => prev.slice(1)),
      head.cutin.durationMs,
    );
    return () => window.clearTimeout(id);
    // 依存は headKey のみ = キュー先頭が入れ替わったときだけタイマーを張り直す
  }, [headKey]);

  // 前兆テロップの表示・文言更新時に予告音を鳴らす
  const telopText = overlay?.kind === 'TELOP' ? overlay.text : undefined;
  useEffect(() => {
    if (telopText !== undefined) playCue('TELOP');
  }, [telopText]);

  return (
    <div className="direction-layer">
      {overlay?.kind === 'RENZOKU' && (
        <div className="renzoku-screen">
          <div className="renzoku-title">{overlay.title}</div>
          <div className="renzoku-text">{overlay.text}</div>
          <div className="renzoku-count">
            {overlay.game}/{overlay.totalGames}G
          </div>
        </div>
      )}
      {overlay?.kind === 'ENDING' && (
        <div className="ending-banner">
          <span className="ending-title">ENDING</span>
          <span>
            {overlay.game}/{overlay.totalGames}G
          </span>
        </div>
      )}
      {overlay?.kind === 'TELOP' && <div className="telop">{overlay.text}</div>}
      {head !== undefined && (
        <div key={head.key} className={`cutin cutin-${head.cutin.style.toLowerCase()}`}>
          {head.cutin.videoUrl !== undefined && (
            <video
              className="cutin-video"
              src={head.cutin.videoUrl}
              autoPlay
              muted
              loop
              playsInline
            />
          )}
          <div className="cutin-body">
            <div className="cutin-title">{head.cutin.title}</div>
            {head.cutin.sub !== undefined && <div className="cutin-sub">{head.cutin.sub}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
