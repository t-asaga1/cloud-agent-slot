/**
 * 演出表示レイヤー(STEP 3d 新設 / STEP 4c で予告演出を追加)。液晶(LCD)領域へ重ねて描画する。
 *
 * `direction.ts` が返す宣言的データを表示するだけの「画面」側:
 * - `overlay`(フェーズ由来の常時表示)= 親から毎レンダー渡される(状態が変われば消える)
 * - `lever`(レバーオン時に決定する 1G 分の演出 = STEP 4c・4d・4e)= seq が進むたびに
 *   差し替え表示する(次のレバーオンまで表示。前兆シナリオ予告 = 中央パネル /
 *   小役示唆予告 = 右下パネル + ムービー後に成立役の図柄画像を重ねる(確定 33)。
 *   図柄の遅延表示は CSS の animation-delay で行う /
 *   連続演出(STEP 4d)= 全画面ムービー + タイトル・n/4G・段階名 + チャンスアップ
 *   バッジ(G4 の成否告知は全停止後のカットイン側)/
 *   AT 小役パート予告(STEP 4e)= 右下パネル + ベル・レア役の図柄とナビ押し順 /
 *   バトルパート(STEP 4e)= 連続演出と同じ全画面構成(タイトル・n/8G・役割ラベル))
 * - `overlay` のエンディング(STEP 4e)= 全画面ムービー(after で描き分け)+ 上部バナー
 * - `cutinFrame`(イベント由来のワンショット)= seq(ゲーム通し番号)が進むたびに
 *   カットイン列をキューへ積み、先頭から durationMs ずつ順番に表示 + SE 再生する
 *
 * 演出の中身(どのムービー・どの図柄か)は direction.ts が解決済みで、
 * 本コンポーネントは表示するだけ。リセット時は親が `key` を変えて再マウントし、
 * キューを破棄する。
 */
import { useEffect, useRef, useState } from 'react';
import type { Cutin, LeverDirection, SevenWaitView, StateOverlay } from './direction';
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
  /**
   * 各リールの停止済みフラグ(リール消灯演出 = 確定 39 用)。
   * 回転中は停止したリールから順に true になり、全停止後(レバー待ち)は全 true。
   */
  stoppedReels: readonly [boolean, boolean, boolean];
}

/**
 * 赤7待機画面(確定 37)。AT確定ムービーを待機 1G 目に再生 → 最終フレームで停止し、
 * 赤7 図柄 3 つ + 目押し指示を重ねる。揃えられずに待機が続いても video 要素は
 * 親側で安定キー(seq 非依存)によりマウント維持され、再生し直さない。
 * 一括消化後など freeze 状態で新規マウントされた場合は最終フレームへシークする。
 */
function SevenWaitScreen({ view }: { view: SevenWaitView }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ended, setEnded] = useState(view.freeze);
  useEffect(() => {
    if (view.freeze) setEnded(true);
  }, [view.freeze]);
  const seekToEnd = () => {
    const video = videoRef.current;
    if (view.freeze && video && Number.isFinite(video.duration)) {
      video.currentTime = Math.max(video.duration - 0.05, 0);
    }
  };
  return (
    <div className="seven-wait-screen" data-label={view.label}>
      <video
        ref={videoRef}
        className="renzoku-video"
        src={view.videoUrl}
        autoPlay={!view.freeze}
        muted
        playsInline
        onLoadedMetadata={seekToEnd}
        onEnded={() => setEnded(true)}
      />
      <div className="renzoku-header">
        <span className="renzoku-title">AT確定!</span>
      </div>
      {ended && (
        <div className="seven-aim">
          <div className="seven-aim-symbols">
            {[0, 1, 2].map((i) => (
              <img key={i} src={view.sevenUrl} alt="赤7" />
            ))}
          </div>
          <div className="seven-aim-text">赤7を狙え!</div>
        </div>
      )}
    </div>
  );
}

export function DirectionLayer({ overlay, lever, cutinFrame, stoppedReels }: Props) {
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

  // 前兆シナリオ予告・AT 小役パート予告の表示開始時に予告音を鳴らす(小役示唆予告は無音。
  // 専用 SE は実素材入稿時にキュー追加を検討)。リール消灯演出(ムービーなし = 確定 39)は
  // レバーオン時点で悟らせないため鳴らさない(消灯は停止時から始まる)
  const leverSeq = lever.seq;
  const hasYokoku = lever.yokoku?.videoUrl !== undefined || lever.atYokoku !== undefined;
  useEffect(() => {
    if (leverSeq > 0 && hasYokoku) playCue('TELOP');
  }, [leverSeq, hasYokoku]);

  // リール消灯音(ユーザー入稿 SE = 確定 40): 消灯している部分の数が増えるたびに鳴らす
  // (対象リールの停止に同期 = 確定 39 の消灯タイミング)。同一 seq 内の増加で 1 回ずつ。
  // 1G 即時消化(デバッグの 1G消化オート)では seq 替わりと同時に消灯が確定するため、
  // そのときも 1 回鳴らす。
  const blackoutOn =
    lever.yokoku?.blackoutReels?.filter((reel) => stoppedReels[reel]).length ?? 0;
  const prevBlackoutRef = useRef({ seq: lever.seq, on: blackoutOn });
  useEffect(() => {
    const prev = prevBlackoutRef.current;
    const increased = lever.seq === prev.seq ? blackoutOn > prev.on : blackoutOn > 0;
    if (increased) playCue('REEL_BLACKOUT');
    prevBlackoutRef.current = { seq: lever.seq, on: blackoutOn };
  }, [lever.seq, blackoutOn]);

  return (
    <div className="direction-layer">
      {overlay?.kind === 'ENDING' && (
        <div className="ending-screen">
          <video
            className="ending-video"
            src={overlay.videoUrl}
            autoPlay
            muted
            loop
            playsInline
          />
        </div>
      )}
      {lever.battle !== undefined && (
        <div
          key={`battle-${lever.seq}`}
          className={
            lever.battle.chanceUp ? 'renzoku-screen renzoku-chance' : 'renzoku-screen'
          }
          data-label={lever.battle.label}
        >
          <video
            className="renzoku-video"
            src={lever.battle.videoUrl}
            autoPlay
            muted
            loop
            playsInline
          />
          <div className="renzoku-header">
            <span className="renzoku-title">{lever.battle.title}</span>
            <span className="renzoku-count">
              {lever.battle.game}/{lever.battle.totalGames}G
            </span>
          </div>
          <div className="renzoku-footer">
            <span className="renzoku-stage">{lever.battle.stage}</span>
            {lever.battle.chanceUp && <span className="renzoku-chance-badge">CHANCE UP!</span>}
          </div>
        </div>
      )}
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
      {lever.sevenWait !== undefined && (
        // 安定キー(seq 非依存)= 待機が複数ゲーム続いてもムービーを再生し直さない
        <SevenWaitScreen key="seven-wait" view={lever.sevenWait} />
      )}
      {lever.atIntro !== undefined && (
        <div key={`at-intro-${lever.seq}`} className="renzoku-screen" data-label={lever.atIntro.label}>
          <video
            className="renzoku-video"
            src={lever.atIntro.videoUrl}
            autoPlay
            muted
            loop
            playsInline
          />
          <div className="renzoku-header">
            <span className="renzoku-title">AT突入</span>
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
      {lever.yokoku?.videoUrl !== undefined && (
        <div
          key={`yokoku-${lever.seq}`}
          className={`yokoku yokoku-l${lever.yokoku.level}`}
          data-label={lever.yokoku.label}
        >
          <video className="yokoku-video" src={lever.yokoku.videoUrl} autoPlay muted playsInline />
        </div>
      )}
      {lever.yokoku?.blackoutReels !== undefined && (
        // リール消灯演出(共通 3 = 確定 39): 画面 3 分割の左/中/右が、対応する
        // 消灯対象リールの停止に合わせて黒くなる(次のレバーオンまで維持)
        <div
          key={`blackout-${lever.seq}`}
          className="reel-blackout"
          data-label={lever.yokoku.label}
        >
          {([0, 1, 2] as const).map((reel) => (
            <div
              key={reel}
              className={
                lever.yokoku?.blackoutReels?.includes(reel) && stoppedReels[reel]
                  ? 'blackout-section blackout-on'
                  : 'blackout-section'
              }
            />
          ))}
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
      {lever.atYokoku !== undefined && (
        <div
          key={`at-yokoku-${lever.seq}`}
          className={lever.atYokoku.strong ? 'koyaku-hint hint-strong' : 'koyaku-hint'}
          data-label={lever.atYokoku.label}
        >
          <video
            className="hint-video"
            src={lever.atYokoku.videoUrl}
            autoPlay
            muted
            playsInline
          />
          {lever.atYokoku.symbolUrl !== undefined && (
            <img
              className="hint-symbol"
              src={lever.atYokoku.symbolUrl}
              alt={lever.atYokoku.label}
            />
          )}
          {lever.atYokoku.naviText !== undefined && (
            <div className="hint-navi-order">{lever.atYokoku.naviText}</div>
          )}
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
