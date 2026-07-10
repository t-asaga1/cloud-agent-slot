#!/usr/bin/env python3
"""ユーザー入稿素材(incoming/)の取り込み変換スクリプト(2026-07-10 入稿分)。

- 図柄画像: incoming/図柄画像/*.png(透過 PNG)
    → 透過余白をトリム → 400x200 の透過キャンバスへコンテインフィット
    → WebP で src/assets/images/reels/ へ出力
- 背景動画: incoming/背景動画/*.mp4(H.264 720p/1080p)
    → 1280x720 へスケール(アスペクト違いは中央クロップ)
    → WebM(VP9・音声なし)で src/assets/video/stage/ へ出力

実行: python3 scripts/import_incoming_assets.py
依存: pip install pillow / ffmpeg
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
INCOMING = ROOT / "incoming"
ASSETS = ROOT / "src/assets"

# 入稿ファイル名 → 素材 ID(docs/SPEC.md「3.」図柄 8 種)
SYMBOLS = {
    "red7.png": "symbol_seven_red",
    "blackbar.png": "symbol_bar_black",
    "whitebar.png": "symbol_bar_white",
    "bell.png": "symbol_bell",
    "suika.png": "symbol_watermelon",
    "cherry.png": "symbol_cherry",
    "replay.png": "symbol_replay",
    "blank.png": "symbol_blank",
}

# 入稿ファイル名 → 素材 ID(docs/SPEC.md「5.」背景。AT/上位 AT は小役・バトル共用)
STAGE_VIDEOS = {
    "義経背景1.mp4": "stage_yoshitsune",
    "静背景1.mp4": "stage_shizuka",
    "弁慶背景1.mp4": "stage_benkei",
    "夕方背景1.mp4": "stage_yugata",
    "前兆背景1.mp4": "stage_zencho",
    "AT背景1.mp4": "stage_at",
    "上位AT背景1.mp4": "stage_at_upper",
}

# リール窓 1 コマは横長(約 2:1)。全図柄を同一キャンバスに揃える
SYMBOL_CANVAS = (400, 200)


def import_symbol(src: Path, dst: Path) -> None:
    im = Image.open(src).convert("RGBA")
    bbox = im.getchannel("A").getbbox()
    if bbox is not None:
        im = im.crop(bbox)
    cw, ch = SYMBOL_CANVAS
    scale = min(cw / im.width, ch / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGBA", SYMBOL_CANVAS, (0, 0, 0, 0))
    canvas.paste(im, ((cw - im.width) // 2, (ch - im.height) // 2), im)
    dst.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dst, "WEBP", quality=90, method=6)
    print(f"{src.name} -> {dst.relative_to(ROOT)}  {dst.stat().st_size / 1024:.0f} KB")


def import_stage_video(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    # アスペクト比が 16:9 でない素材(4:3 等)は中央クロップで 1280x720 に統一
    vf = "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720"
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(src),
            "-vf", vf,
            "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34",
            "-deadline", "good", "-cpu-used", "4", "-row-mt", "1",
            "-pix_fmt", "yuv420p", "-an",
            str(dst),
        ],
        check=True,
        capture_output=True,
    )
    print(f"{src.name} -> {dst.relative_to(ROOT)}  {dst.stat().st_size / 1024 / 1024:.1f} MB")


def main() -> None:
    for name, asset_id in SYMBOLS.items():
        import_symbol(INCOMING / "図柄画像" / name, ASSETS / f"images/reels/{asset_id}.webp")
    for name, asset_id in STAGE_VIDEOS.items():
        import_stage_video(INCOMING / "背景動画" / name, ASSETS / f"video/stage/{asset_id}.webm")


if __name__ == "__main__":
    main()
