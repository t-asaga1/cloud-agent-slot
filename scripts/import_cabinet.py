#!/usr/bin/env python3
"""筐体画像の取り込みスクリプト。

incoming/cabinet/筐体.png を WebP に変換して src/assets/images/cabinet/ に配置し、
画像内のマーカー矩形(水色=液晶エリア、ピンク=リール窓)の座標を検出して表示する。
検出した座標は src/assets/layout.ts に手で反映する(値が変わったときのみ)。

実行: python3 scripts/import_cabinet.py
依存: pip install pillow numpy
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "incoming/cabinet/筐体.png"
DST = ROOT / "src/assets/images/cabinet/cabinet_frame.webp"

# ラスター画像の上限(docs/ASSET_GUIDELINES.md)
MAX_BYTES = 500 * 1024


def detect_rects(im: Image.Image) -> None:
    """マーカー色(中央画素からサンプリング)で矩形領域を検出して表示する。"""
    arr = np.array(im.convert("RGB")).astype(int)
    h, w, _ = arr.shape
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    def analyze(target: np.ndarray, name: str, tol: int = 12, min_run: int = 100) -> None:
        mask = (
            (abs(r - target[0]) < tol)
            & (abs(g - target[1]) < tol)
            & (abs(b - target[2]) < tol)
        )
        colhist = mask.sum(axis=0)
        on = colhist > min_run
        segs: list[tuple[int, int]] = []
        start = None
        for x in range(w):
            if on[x] and start is None:
                start = x
            if not on[x] and start is not None:
                segs.append((start, x - 1))
                start = None
        if start is not None:
            segs.append((start, w - 1))
        for x0, x1 in segs:
            sub = mask[:, x0 : x1 + 1]
            rowhist = sub.sum(axis=1)
            rows = np.where(rowhist > (x1 - x0 + 1) * 0.8)[0]
            if len(rows) == 0:
                continue
            print(
                f"{name}: x={x0} y={rows.min()} w={x1 - x0 + 1} h={rows.max() - rows.min() + 1}"
            )

    # 液晶エリア(水色)・リール窓(ピンク)の代表色は既知の位置からサンプリング
    analyze(arr[680, 800], "LCD(cyan)")
    analyze(arr[1140, 480], "REEL(pink)")


def main() -> None:
    im = Image.open(SRC)
    print(f"source: {SRC.name} size={im.size} mode={im.mode}")
    detect_rects(im)

    DST.parent.mkdir(parents=True, exist_ok=True)
    for quality in (85, 80, 75, 70, 60, 50):
        im.save(DST, "WEBP", quality=quality, method=6)
        size = DST.stat().st_size
        if size <= MAX_BYTES:
            print(f"saved: {DST.relative_to(ROOT)} quality={quality} {size / 1024:.0f} KB")
            return
    raise SystemExit(f"WebP が上限 {MAX_BYTES // 1024} KB に収まりません: {size} bytes")


if __name__ == "__main__":
    main()
