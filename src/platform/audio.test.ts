/**
 * SE 再生の後発優先(SPEC 確定 40)+ BGM の再生開始位置(確定 41)の単体テスト。
 * SE は単一チャンネルで、新しい SE を鳴らすとき前の SE が再生中なら止めて差し替える
 * (例: チェリー入賞音の再生中にレバーオンしたら、入賞音を切ってレバーオン音を鳴らす)。
 * ブラウザの Audio は Node 環境にないため、再生状態だけ模倣したフェイクで検証する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playBgm, playSe, setSeEnabled, stopBgm } from './audio';

class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  volume = 1;
  paused = true;
  loop = false;
  currentTime = 0;
  /** 新規インスタンスの readyState 初期値(テストごとに切替可) */
  static defaultReadyState = 0;
  /** 0 = メタデータ未読み込み / 1 = HAVE_METADATA(読み込み済み) */
  readyState = FakeAudio.defaultReadyState;
  private listeners = new Map<string, Array<() => void>>();
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  addEventListener(type: string, listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      list.filter((l) => l !== listener),
    );
  }
  /** loadedmetadata 等の発火を模倣(once は模倣不要 = テスト内で 1 回だけ発火する) */
  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

beforeEach(() => {
  FakeAudio.instances = [];
  FakeAudio.defaultReadyState = 0;
  vi.stubGlobal('Audio', FakeAudio);
  setSeEnabled(true);
});

afterEach(() => {
  stopBgm(0); // モジュール内の BGM 状態を破棄(fadeMs 0 = タイマー不使用)
  vi.unstubAllGlobals();
});

describe('playSe(後発優先 = 確定 40)', () => {
  it('前の SE が再生中なら止めて新しい SE を鳴らす(チェリー入賞音 → レバーオン)', () => {
    playSe('se_win_cherry_center.ogg');
    const cherry = FakeAudio.instances[0];
    expect(cherry.paused).toBe(false);

    playSe('se_lever_on.ogg');
    const lever = FakeAudio.instances[1];
    expect(cherry.paused).toBe(true); // 入賞音は切られる
    expect(lever.paused).toBe(false); // レバーオン音が鳴る
    expect(lever.src).toBe('se_lever_on.ogg');
  });

  it('前の SE が再生終了済みなら何もせず新しい SE を鳴らす', () => {
    playSe('se_reel_stop.ogg');
    const stop = FakeAudio.instances[0];
    stop.paused = true; // 再生終了を模倣

    playSe('se_win_replay.ogg');
    expect(FakeAudio.instances).toHaveLength(2);
    expect(FakeAudio.instances[1].paused).toBe(false);
  });

  it('連続再生でも常に最後の SE だけが再生中', () => {
    playSe('a.ogg');
    playSe('b.ogg');
    playSe('c.ogg');
    const playing = FakeAudio.instances.filter((audio) => !audio.paused);
    expect(playing).toHaveLength(1);
    expect(playing[0].src).toBe('c.ogg');
  });

  it('SE 無効時は再生しない(前の SE にも触らない)', () => {
    playSe('a.ogg');
    setSeEnabled(false);
    playSe('b.ogg');
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].paused).toBe(false);
  });
});

describe('playBgm の再生開始位置(startSec = 確定 41)', () => {
  it('startSec 指定なし(0)は曲頭から再生する', () => {
    playBgm('bgm_at_base.ogg');
    const bgm = FakeAudio.instances[0];
    expect(bgm.paused).toBe(false);
    expect(bgm.loop).toBe(true);
    expect(bgm.currentTime).toBe(0);
  });

  it('メタデータ読み込み済みなら即時に開始位置へシークする', () => {
    FakeAudio.defaultReadyState = 1;
    playBgm('bgm_at_kakutei.ogg', 0.3, 0, 21.6);
    const bgm = FakeAudio.instances[0];
    expect(bgm.paused).toBe(false);
    expect(bgm.currentTime).toBe(21.6);
  });

  it('メタデータ未読み込みなら loadedmetadata 後に開始位置へシークする', () => {
    playBgm('bgm_at_kakutei.ogg', 0.3, 0, 21.6);
    const bgm = FakeAudio.instances[0];
    expect(bgm.paused).toBe(false);
    expect(bgm.currentTime).toBe(0); // まだシークされない
    bgm.emit('loadedmetadata');
    expect(bgm.currentTime).toBe(21.6);
  });

  it('同じ URL が再生中なら何もしない(シークし直さない)', () => {
    playBgm('bgm_at_kakutei.ogg', 0.3, 0, 21.6);
    const bgm = FakeAudio.instances[0];
    bgm.emit('loadedmetadata');
    bgm.currentTime = 100; // 再生が進んだ状態を模倣
    playBgm('bgm_at_kakutei.ogg', 0.3, 0, 21.6);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(bgm.currentTime).toBe(100);
  });
});
