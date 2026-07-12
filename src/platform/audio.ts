/**
 * 音声再生の薄いラッパー(docs/DEVELOPMENT_PLAN.md「Web + exe 両対応の方針」)。
 * ブラウザ API を UI から直接呼ばず、デスクトップ(Tauri)対応時の差し替えを局所化する。
 * ブラウザの自動再生ポリシーにより、再生はユーザー操作(クリック等)を起点に呼ぶこと。
 *
 * SE の再生は本モジュールを直接呼ばず `src/ui/sound.ts` のサウンドキュー
 * (用途 ID → ファイルの差し替えレイヤー)を経由すること。
 */

let seEnabled = true;
let bgmAudio: HTMLAudioElement | undefined;
let bgmUrl: string | undefined;

/** BGM 切替時のフェード時間(STEP 3d。切替のブツ切れ防止) */
export const BGM_FADE_MS = 600;

/** フェード進行中の audio 要素 → interval id(多重フェードの打ち切り用) */
const activeFades = new Map<HTMLAudioElement, number>();

/** 音量を線形フェードする(進行中のフェードがあれば打ち切って上書き) */
function fadeTo(
  audio: HTMLAudioElement,
  target: number,
  durationMs: number,
  onDone?: () => void,
): void {
  const existing = activeFades.get(audio);
  if (existing !== undefined) clearInterval(existing);
  if (durationMs <= 0) {
    audio.volume = target;
    onDone?.();
    return;
  }
  const from = audio.volume;
  const startedAt = Date.now();
  const id = window.setInterval(() => {
    const t = Math.min(1, (Date.now() - startedAt) / durationMs);
    audio.volume = from + (target - from) * t;
    if (t >= 1) {
      clearInterval(id);
      activeFades.delete(audio);
      onDone?.();
    }
  }, 50);
  activeFades.set(audio, id);
}

export function setSeEnabled(enabled: boolean): void {
  seEnabled = enabled;
}

/** 効果音のワンショット再生(再生失敗は無視する) */
export function playSe(url: string, volume = 0.5): void {
  if (!seEnabled) return;
  const audio = new Audio(url);
  audio.volume = volume;
  void audio.play().catch(() => {});
}

/**
 * BGM をループ再生する。同じ URL が再生中なら何もしない。
 * 別 BGM が再生中ならクロスフェード(旧をフェードアウト・新をフェードイン)で切り替える。
 */
export function playBgm(url: string, volume = 0.3, fadeMs = BGM_FADE_MS): void {
  if (bgmAudio !== undefined && bgmUrl === url && !bgmAudio.paused) return;
  const old = bgmAudio;
  const crossFade = old !== undefined && !old.paused;
  if (old !== undefined) {
    if (crossFade) fadeTo(old, 0, fadeMs, () => old.pause());
    else old.pause();
  }
  bgmAudio = new Audio(url);
  bgmAudio.loop = true;
  bgmAudio.volume = crossFade ? 0 : volume;
  bgmUrl = url;
  void bgmAudio.play().catch(() => {});
  if (crossFade) fadeTo(bgmAudio, volume, fadeMs);
}

export function stopBgm(fadeMs = BGM_FADE_MS): void {
  if (bgmAudio !== undefined) {
    const audio = bgmAudio;
    fadeTo(audio, 0, fadeMs, () => audio.pause());
    bgmAudio = undefined;
    bgmUrl = undefined;
  }
}

export function isBgmPlaying(): boolean {
  return bgmAudio !== undefined && !bgmAudio.paused;
}
