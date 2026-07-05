#!/usr/bin/env python3
"""筐体画像の取り込みスクリプト(docs/ASSET_GUIDELINES.md の手順に対応)。

入力: incoming/cabinet/筐体.png
  - 水色エリア   = 液晶画面のはめ込み位置(1 箇所)
  - ピンク矩形 3 枚 = リール窓(左・中・右)のはめ込み位置

処理:
  1. 色マスクで液晶エリア / リール窓のバウンディングボックスを検出
  2. 該当エリアを透過(alpha=0)に抜いた筐体フレームを WebP で書き出し
  3. 検出座標(px と 画像サイズ比の正規化値)を src/assets/cabinet_layout.json に出力

再実行: python3 scripts/intake_cabinet.py [入力PNG]
依存: pillow, numpy, scipy(pip install pillow numpy scipy)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = REPO_ROOT / "incoming" / "cabinet" / "筐体.png"
OUT_IMAGE = REPO_ROOT / "src" / "assets" / "images" / "cabinet" / "cabinet_frame.webp"
OUT_LAYOUT = REPO_ROOT / "src" / "assets" / "cabinet_layout.json"

# プレースホルダー色(入稿画像からサンプリングした実測値ベース)
# 液晶エリア: 水色 ≈ (133, 197, 237) / リール窓: ピンク ≈ (254, 170, 192)


def blue_mask(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    return (b > 200) & (g > 160) & (g < 235) & (r > 95) & (r < 185) & (b - r > 50)


def pink_mask(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    return (r > 225) & (g > 140) & (g < 210) & (b > 160) & (b < 225) & (r - g > 45)


def bbox(mask: np.ndarray) -> tuple[int, int, int, int]:
    """(x, y, w, h) を返す。"""
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        raise ValueError("マスクに該当ピクセルがありません(色閾値を確認してください)")
    return int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)


def largest_components(mask: np.ndarray, expected: int) -> list[np.ndarray]:
    """連結成分ラベリングで面積の大きい順に expected 個の成分マスクを返す。

    下部パネルのイラスト等が色閾値に引っかかるノイズを除外するため、
    プレースホルダー矩形(大面積・べた塗り)だけを面積順で選ぶ。
    戻り値は x 座標(左端)昇順。
    """
    labeled, n = ndimage.label(mask)
    if n < expected:
        raise ValueError(f"連結成分が {n} 個しかありません(期待 {expected} 個以上)")
    areas = ndimage.sum_labels(np.ones_like(labeled), labeled, index=range(1, n + 1))
    top = np.argsort(areas)[::-1][:expected] + 1
    comps = [labeled == label for label in top]
    comps.sort(key=lambda m: int(np.nonzero(m)[1].min()))
    return comps


def dilate(mask: np.ndarray, px: int) -> np.ndarray:
    """アンチエイリアスの縁を消すための簡易膨張(上下左右シフトの OR)。"""
    out = mask.copy()
    for _ in range(px):
        shifted = out.copy()
        shifted[1:, :] |= out[:-1, :]
        shifted[:-1, :] |= out[1:, :]
        shifted[:, 1:] |= out[:, :-1]
        shifted[:, :-1] |= out[:, 1:]
        out = shifted
    return out


def rect_entry(name: str, box: tuple[int, int, int, int], size: tuple[int, int]) -> dict:
    x, y, w, h = box
    img_w, img_h = size
    return {
        "name": name,
        "px": {"x": x, "y": y, "width": w, "height": h},
        "ratio": {
            "x": round(x / img_w, 5),
            "y": round(y / img_h, 5),
            "width": round(w / img_w, 5),
            "height": round(h / img_h, 5),
        },
    }


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_INPUT
    im = Image.open(src).convert("RGBA")
    arr = np.array(im)
    rgb = arr[..., :3]

    (lcd,) = largest_components(blue_mask(rgb), expected=1)
    reel_masks = largest_components(pink_mask(rgb), expected=3)

    lcd_box = bbox(lcd)
    reel_boxes = [bbox(m) for m in reel_masks]

    # プレースホルダー領域を透過に抜く(縁のにじみ対策で 2px 膨張)
    punch = lcd.copy()
    for m in reel_masks:
        punch |= m
    punch = dilate(punch, px=2)
    arr[punch, 3] = 0
    out = Image.fromarray(arr)
    OUT_IMAGE.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT_IMAGE, "WEBP", quality=82, method=6)

    layout = {
        "source": src.name,
        "imageSize": {"width": im.width, "height": im.height},
        "lcd": rect_entry("lcd", lcd_box, im.size),
        "reelWindows": [
            rect_entry(name, box, im.size)
            for name, box in zip(["left", "middle", "right"], reel_boxes)
        ],
    }
    OUT_LAYOUT.write_text(json.dumps(layout, indent=2, ensure_ascii=False) + "\n")

    kb = OUT_IMAGE.stat().st_size / 1024
    print(f"wrote {OUT_IMAGE.relative_to(REPO_ROOT)} ({kb:.0f} KB)")
    print(f"wrote {OUT_LAYOUT.relative_to(REPO_ROOT)}")
    print(json.dumps(layout, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
