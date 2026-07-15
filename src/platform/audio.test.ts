/**
 * SE 再生の後発優先(SPEC 確定 40)の単体テスト。
 * SE は単一チャンネルで、新しい SE を鳴らすとき前の SE が再生中なら止めて差し替える
 * (例: チェリー入賞音の再生中にレバーオンしたら、入賞音を切ってレバーオン音を鳴らす)。
 * ブラウザの Audio は Node 環境にないため、再生状態だけ模倣したフェイクで検証する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playSe, setSeEnabled } from './audio';

class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  volume = 1;
  paused = true;
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
}

beforeEach(() => {
  FakeAudio.instances = [];
  vi.stubGlobal('Audio', FakeAudio);
  setSeEnabled(true);
});

afterEach(() => {
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
