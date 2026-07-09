/**
 * 音声再生の薄いラッパー(docs/DEVELOPMENT_PLAN.md「Web + exe 両対応の方針」)。
 * ブラウザ API を UI から直接呼ばず、デスクトップ(Tauri)対応時の差し替えを局所化する。
 * ブラウザの自動再生ポリシーにより、再生はユーザー操作(クリック等)を起点に呼ぶこと。
 */

let seEnabled = true;
let bgmAudio: HTMLAudioElement | undefined;
let bgmUrl: string | undefined;

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

/** BGM をループ再生する。同じ URL が再生中なら何もしない */
export function playBgm(url: string, volume = 0.3): void {
  if (bgmAudio !== undefined && bgmUrl === url && !bgmAudio.paused) return;
  stopBgm();
  bgmAudio = new Audio(url);
  bgmAudio.loop = true;
  bgmAudio.volume = volume;
  bgmUrl = url;
  void bgmAudio.play().catch(() => {});
}

export function stopBgm(): void {
  if (bgmAudio !== undefined) {
    bgmAudio.pause();
    bgmAudio = undefined;
    bgmUrl = undefined;
  }
}

export function isBgmPlaying(): boolean {
  return bgmAudio !== undefined && !bgmAudio.paused;
}
