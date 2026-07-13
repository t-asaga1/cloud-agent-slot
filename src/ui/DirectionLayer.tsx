/**
 * 演出表示レイヤー(STEP 3d 新設 / STEP 4c で予告演出を追加)。液晶(LCD)領域へ重ねて描画する。
 *
 * `direction.ts` が返す宣言的データを表示するだけの「画面」側:
 * - `overlay`(フェーズ由来の常時表示)= 親から毎レンダー渡される(状態が変われば消える)
 * - `lever`(レバーオン時に決定する 1G 分の演出 = STEP 4c・4d)= seq が進むたびに
 *   差し替え表示する(次のレバーオンまで表示。前兆シナリオ予告 = 中央パネル /
 *   小役示唆予告 = 右下パネル + ムービー後に成立役の図柄画像を重ねる(確定 33)。
 *   図柄の遅延表示は CSS の animation-delay で行う /
 *   連続演出(STEP 4d)= 全画面ムービー + タイトル・n/4G・段階名 + チャンスアップ
 *   バッジ(G4 の成否告知は全停止後のカットイン側))
 * - `cutinFrame`(イベント由来のワンショット)= seq(ゲーム通し番号)が進むたびに
 *   カットイン列をキューへ積み、先頭から durationMs ずつ順番に表示 + SE 再生する
 *
 * 演出の中身(どのムービー・どの図柄か)は direction.ts が解決済みで、
 * 本コンポーネントは表示するだけ。リセット時は親が `key` を変えて再マウントし、
 * キューを破棄する。
 */
import { useEffect, useRef, useState } from 'react';
import type { Cutin, LeverDirection, StateOverlay } from './direction';
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
  /** レバーオン時に決定した 1G 分の予告演出(STEP 4c) */
  lever: LeverDirection;
  cutinFrame: CutinFrame;
}

export function DirectionLayer({ overlay, lever, cutinFrame }: Props) {
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

  // 前兆シナリオ予告の表示開始時に予告音を鳴らす(小役示唆予告は無音。
  // 専用 SE は実素材入稿時にキュー追加を検討)
  const leverSeq = lever.seq;
  const hasYokoku = lever.yokoku !== undefined;
  useEffect(() => {
    if (leverSeq > 0 && hasYokoku) playCue('TELOP');
  }, [leverSeq, hasYokoku]);

  return (
    <div className="direction-layer">
      {lever.renzoku !== undefined && (
        <div
          key={`renzoku-${lever.seq}`}
          className={
            lever.renzoku.chanceUp ? 'renzoku-screen renzoku-chance' : 'renzoku-screen'
          }
          data-label={lever.renzoku.label}
        >
          <video
            className="renzoku-video"
            src={lever.renzoku.videoUrl}
            autoPlay
            muted
            loop
            playsInline
          />
          <div className="renzoku-header">
            <span className="renzoku-title">{lever.renzoku.title}</span>
            <span className="renzoku-count">
              {lever.renzoku.game}/{lever.renzoku.totalGames}G
            </span>
          </div>
          <div className="renzoku-footer">
            <span className="renzoku-stage">{lever.renzoku.stage}</span>
            {lever.renzoku.chanceUp && <span className="renzoku-chance-badge">CHANCE UP!</span>}
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
      {lever.yokoku !== undefined && (
        <div
          key={`yokoku-${lever.seq}`}
          className={`yokoku yokoku-l${lever.yokoku.level}`}
          data-label={lever.yokoku.label}
        >
          <video className="yokoku-video" src={lever.yokoku.videoUrl} autoPlay muted playsInline />
        </div>
      )}
      {lever.hint !== undefined && (
        <div
          key={`hint-${lever.seq}`}
          className={lever.hint.strong ? 'koyaku-hint hint-strong' : 'koyaku-hint'}
          data-label={lever.hint.label}
        >
          <video className="hint-video" src={lever.hint.videoUrl} autoPlay muted playsInline />
          <img className="hint-symbol" src={lever.hint.symbolUrl} alt={lever.hint.label} />
        </div>
      )}
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
