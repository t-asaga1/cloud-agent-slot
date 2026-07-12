import { describe, expect, it } from 'vitest';
import { KOMA_COUNT, MAX_SLIP, REEL_INDEXES, komaAt, windowAt } from '../core/reel';
import { SPIN_MS_PER_KOMA, SPIN_MS_PER_REV, spinningPosition } from './gameCycle';
import {
  STRIP_KOMA,
  continuousPosition,
  isSlipDone,
  planSlip,
  reelStrip,
  slipKoma,
  slipPosition,
} from './reelAnimation';

describe('連続位置(continuousPosition)と離散モデル(spinningPosition)の整合', () => {
  it('floor(連続位置) = spinningPosition が常に成り立つ(描画のコマ = 押下位置)', () => {
    // 描画に使う連続位置と押下位置の判定(3a の離散モデル)が同じ時計・同じ結果に
    // なることの全域検証。コマ境界(37.5ms の倍数)前後も含めて総当たり
    for (let start = 0; start < KOMA_COUNT; start++) {
      for (let step = 0; step < 200; step++) {
        for (const jitter of [0, 0.25, 18.7, 37.4]) {
          const elapsed = step * SPIN_MS_PER_KOMA + jitter;
          expect(Math.floor(continuousPosition(start, elapsed))).toBe(
            spinningPosition(start, elapsed),
          );
        }
      }
    }
  });

  it('経過時間とともに増加し 1 周(750ms)で元へ戻る', () => {
    expect(continuousPosition(0, 0)).toBe(0);
    expect(continuousPosition(0, SPIN_MS_PER_KOMA / 2)).toBeCloseTo(0.5);
    expect(continuousPosition(0, SPIN_MS_PER_REV)).toBeCloseTo(0);
    expect(continuousPosition(19, SPIN_MS_PER_KOMA * 1.5)).toBeCloseTo(0.5);
  });

  it('開始位置の正規化と負経過時間の切り捨て', () => {
    expect(continuousPosition(-1, 0)).toBe(19);
    expect(continuousPosition(25, 0)).toBe(5);
    expect(continuousPosition(3, -100)).toBe(3);
  });
});

describe('スベリのアニメーション計画(planSlip / slipPosition)', () => {
  it('slipKoma は前進方向のコマ数(mod 20)', () => {
    expect(slipKoma(5, 5)).toBe(0);
    expect(slipKoma(5, 9)).toBe(4);
    expect(slipKoma(18, 2)).toBe(4);
  });

  it('スベリ 1〜4 コマ: 同速で前進を継続し、停止コマが中央へ来た瞬間に止まる', () => {
    for (let slip = 1; slip <= MAX_SLIP; slip++) {
      for (const frac of [0, 0.25, 0.75, 0.999]) {
        const push = 7;
        const anim = planSlip(push + frac, push + slip);
        expect(anim.travelKoma).toBeCloseTo(slip - frac);
        expect(anim.travelKoma).toBeGreaterThan(0);
        expect(anim.durationMs).toBeCloseTo((slip - frac) * SPIN_MS_PER_KOMA);
        // 開始 = 押下瞬間の連続位置、完了 = 停止位置(整数)
        expect(slipPosition(anim, 0)).toBeCloseTo(push + frac);
        expect(slipPosition(anim, anim.durationMs)).toBe(push + slip);
        // 前進方向へ単調(中間点で開始と完了の間)
        const mid = slipPosition(anim, anim.durationMs / 2);
        expect(mid).toBeGreaterThan(push + frac);
        expect(mid).toBeLessThan(push + slip);
      }
    }
  });

  it('スベリ 0 コマ(ビタ止まり): 1 コマ未満の戻りで中央へ収まる(所要 < 37.5ms)', () => {
    const anim = planSlip(7.4, 7);
    expect(anim.travelKoma).toBeCloseTo(-0.4);
    expect(anim.durationMs).toBeCloseTo(0.4 * SPIN_MS_PER_KOMA);
    expect(anim.durationMs).toBeLessThan(SPIN_MS_PER_KOMA);
    expect(slipPosition(anim, 0)).toBeCloseTo(7.4);
    expect(slipPosition(anim, anim.durationMs)).toBe(7);
    // frac = 0 でのビタ止まりは即時停止
    const instant = planSlip(7, 7);
    expect(instant.durationMs).toBe(0);
    expect(slipPosition(instant, 0)).toBe(7);
  });

  it('最大スベリ(4 コマ)でも所要 150ms 以内', () => {
    const anim = planSlip(3, 7);
    expect(anim.durationMs).toBeLessThanOrEqual(MAX_SLIP * SPIN_MS_PER_KOMA);
    expect(MAX_SLIP * SPIN_MS_PER_KOMA).toBe(150);
  });

  it('コマ 20 → 1 をまたぐスベリも正しく循環する(mod 20)', () => {
    const anim = planSlip(18.5, 2); // 押下位置 18 からスベリ 4
    expect(anim.travelKoma).toBeCloseTo(3.5);
    expect(slipPosition(anim, anim.durationMs)).toBe(2);
    // 中間ではまだ 20 未満 → 0 へ折り返す途中の値も [0, 20) に正規化される
    for (const t of [0.2, 0.5, 0.8]) {
      const pos = slipPosition(anim, anim.durationMs * t);
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThan(KOMA_COUNT);
    }
  });

  it('isSlipDone は所要時間の経過で true', () => {
    const anim = planSlip(7.5, 9);
    expect(isSlipDone(anim, anim.durationMs - 1)).toBe(false);
    expect(isSlipDone(anim, anim.durationMs)).toBe(true);
  });

  it('押下位置(floor)→ 停止位置のスベリコマ数が 0〜4 の前提で travel ≤ 4', () => {
    for (let push = 0; push < KOMA_COUNT; push++) {
      for (let slip = 0; slip <= MAX_SLIP; slip++) {
        for (const frac of [0, 0.5, 0.999]) {
          const anim = planSlip(push + frac, (push + slip) % KOMA_COUNT);
          expect(anim.travelKoma).toBeLessThanOrEqual(MAX_SLIP);
          expect(anim.travelKoma).toBeGreaterThan(-1);
          expect(slipPosition(anim, anim.durationMs)).toBe((push + slip) % KOMA_COUNT);
        }
      }
    }
  });
});

describe('コマ帯ビュー(reelStrip)', () => {
  it('5 コマ帯で、offset 0 のとき中央 3 コマが windowAt と一致する', () => {
    expect(STRIP_KOMA).toBe(5);
    for (const reel of REEL_INDEXES) {
      for (let p = 0; p < KOMA_COUNT; p++) {
        const strip = reelStrip(reel, p);
        expect(strip.offset).toBe(0);
        expect(strip.symbols).toHaveLength(STRIP_KOMA);
        expect([strip.symbols[1], strip.symbols[2], strip.symbols[3]]).toEqual(windowAt(reel, p));
        // 上下のはみ出しコマ
        expect(strip.symbols[0]).toBe(komaAt(reel, p + 2));
        expect(strip.symbols[4]).toBe(komaAt(reel, p - 2));
      }
    }
  });

  it('小数位置では offset = 小数部、帯の中央コマ = floor(位置)', () => {
    for (const reel of REEL_INDEXES) {
      for (const c of [0.5, 3.25, 19.9]) {
        const strip = reelStrip(reel, c);
        expect(strip.offset).toBeCloseTo(c - Math.floor(c));
        expect(strip.symbols[2]).toBe(komaAt(reel, Math.floor(c)));
      }
    }
  });

  it('コマ境界で表示が連続する(c → 次の整数で次の帯の offset 0 と同じ見た目)', () => {
    // c = base + 1 - ε の帯(offset ≈ 1)を 1 コマ下へずらした表示は、
    // c = base + 1 の帯(offset 0)と同じ窓内容になる
    for (const reel of REEL_INDEXES) {
      for (let base = 0; base < KOMA_COUNT; base++) {
        const before = reelStrip(reel, base + 1 - 1e-9);
        const after = reelStrip(reel, (base + 1) % KOMA_COUNT);
        // before を 1 コマ下へずらすと、before.symbols[0..3] が after.symbols[1..4] の位置に来る
        expect(before.symbols.slice(0, 4)).toEqual(after.symbols.slice(1, 5));
      }
    }
  });
});
