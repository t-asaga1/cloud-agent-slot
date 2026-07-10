#!/usr/bin/env python3
"""仮素材(プレースホルダー)の一括生成スクリプト。

ユーザー入稿済みの素材(筐体画像・リール図柄・背景動画)以外の素材
(液晶フォールバック静止画・演出動画・BGM・SE)を
「黒背景 + 白文字の ●●（仮)」形式で生成する。実素材が入稿されたら同名ファイルを
差し替えるだけで置き換えられる。
※ ユーザー入稿素材の取り込み(変換)は scripts/import_incoming_assets.py 参照。

実行: python3 scripts/gen_placeholder_assets.py
依存: pip install pillow / ffmpeg / fonts-noto-cjk(日本語フォント)
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "src/assets"
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

# ---------------------------------------------------------------------------
# 定義(SPEC.md と一致させること)
# ---------------------------------------------------------------------------

# 演出ステージ(背景)9 種(id, 表示ラベル)— SPEC.md「5. 背景と背景移行抽せん」
# 図柄・背景動画はユーザー入稿済みのため、本スクリプトでは BGM の仮素材のみ生成する
STAGES = [
    ("yoshitsune", "義経背景"),
    ("shizuka", "静背景"),
    ("benkei", "弁慶背景"),
    ("yugata", "夕方背景"),
    ("zencho", "前兆背景"),
    ("at_koyaku", "AT(小役パート)"),
    ("at_battle", "AT(バトルパート)"),
    ("at_upper_koyaku", "上位AT(小役パート)"),
    ("at_upper_battle", "上位AT(バトルパート)"),
]

# 演出動画(id, 表示ラベル, 秒数)
EFFECTS = [
    ("effect_cutin_weak", "カットイン(弱)", 2),
    ("effect_cutin_strong", "カットイン(強)", 2),
]

# SE(id, 周波数系列 [(Hz, 長さ秒), ...])
SES = [
    ("se_lever_on", [(880, 0.08), (1320, 0.10)]),
    ("se_reel_stop", [(440, 0.06)]),
    ("se_payout", [(1047, 0.06), (1319, 0.06), (1568, 0.10)]),
    ("se_rare", [(660, 0.10), (990, 0.16)]),
    ("se_bonus", [(523, 0.12), (659, 0.12), (784, 0.12), (1047, 0.24)]),
]

# BGM のステージ別ベース周波数(単純な 2 音コードのループ。区別が付けばよい)
BGM_BASE_HZ = {
    "yoshitsune": 220,
    "shizuka": 233,
    "benkei": 247,
    "yugata": 262,
    "zencho": 196,
    "at_koyaku": 330,
    "at_battle": 349,
    "at_upper_koyaku": 370,
    "at_upper_battle": 392,
}


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, capture_output=True)


def load_font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size)


def fit_font(draw: ImageDraw.ImageDraw, text: str, max_width: int, start: int) -> ImageFont.FreeTypeFont:
    size = start
    while size > 10:
        font = load_font(size)
        if draw.textlength(text, font=font) <= max_width:
            return font
        size -= 4
    return load_font(10)


# ---------------------------------------------------------------------------
# 画像系(黒背景 + 白文字 + 白枠)
# ---------------------------------------------------------------------------

def gen_placeholder_image(
    path: Path, label: str, size: tuple[int, int], start_ratio: float = 5.0
) -> None:
    im = Image.new("RGB", size, (0, 0, 0))
    d = ImageDraw.Draw(im)
    w, h = size
    m = max(4, w // 50)
    d.rectangle([m, m, w - m - 1, h - m - 1], outline=(255, 255, 255), width=max(2, w // 130))
    text = f"{label}（仮）"
    font = fit_font(d, text, int(w * 0.86), int(h / start_ratio))
    d.text((w / 2, h / 2), text, font=font, fill=(255, 255, 255), anchor="mm")
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=90, method=6)


def gen_images() -> None:
    gen_placeholder_image(ASSETS / "images/lcd/lcd_bg_fallback.webp", "液晶画面", (1280, 720))


# ---------------------------------------------------------------------------
# 動画系(黒背景 + 白文字がゆっくり明滅する WebM/VP9 ループ)
# ---------------------------------------------------------------------------

def gen_placeholder_video(path: Path, label: str, duration: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = f"{label}（仮）"
    # 明滅周期 = 動画長にして、ループの継ぎ目を目立たせない
    drawtext = (
        f"drawtext=fontfile={FONT}:text='{text}':fontsize=96:fontcolor=white:"
        f"x=(w-text_w)/2:y=(h-text_h)/2:alpha='0.65+0.35*sin(2*PI*t/{duration})'"
    )
    run([
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"color=c=black:s=1280x720:d={duration}:r=30",
        "-vf", drawtext,
        "-c:v", "libvpx-vp9", "-crf", "45", "-b:v", "0",
        "-deadline", "realtime", "-cpu-used", "8", "-an",
        str(path),
    ])


def gen_videos() -> None:
    for effect_id, label, duration in EFFECTS:
        gen_placeholder_video(ASSETS / f"video/effect/{effect_id}.webm", label, duration)


# ---------------------------------------------------------------------------
# 音声系(サイン波合成 → OGG Vorbis)
# ---------------------------------------------------------------------------

def gen_se(path: Path, notes: list[tuple[float, float]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    parts = []
    offset = 0.0
    for hz, dur in notes:
        # 各音に短いフェードアウトを付けてクリックノイズを防ぐ
        parts.append(
            f"sine=frequency={hz}:duration={dur},afade=t=out:st={max(dur - 0.03, 0)}:d=0.03"
        )
        offset += dur
    filters = ";".join(f"[{i}]" for i in range(len(parts)))
    inputs: list[str] = []
    for p in parts:
        inputs += ["-f", "lavfi", "-i", p]
    concat = "".join(f"[{i}:a]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1[out]"
    run([
        "ffmpeg", "-y", *inputs,
        "-filter_complex", concat, "-map", "[out]",
        "-c:a", "libvorbis", "-q:a", "3", str(path),
    ])
    _ = filters, offset


def gen_bgm(path: Path, base_hz: float, duration: int = 8) -> None:
    """base_hz + 完全5度の 2 音をゆっくり揺らしたループ。ステージ区別用の仮 BGM。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    fifth = base_hz * 1.5
    expr = (
        f"aevalsrc='0.18*sin(2*PI*{base_hz}*t)+0.12*sin(2*PI*{fifth}*t)*"
        f"(0.6+0.4*sin(2*PI*t/{duration}))':d={duration}:s=44100"
    )
    run([
        "ffmpeg", "-y", "-f", "lavfi", "-i", expr,
        "-c:a", "libvorbis", "-q:a", "2", str(path),
    ])


def gen_audio() -> None:
    for se_id, notes in SES:
        gen_se(ASSETS / f"audio/se/{se_id}.ogg", notes)
    for stage_id, _ in STAGES:
        gen_bgm(ASSETS / f"audio/bgm/bgm_{stage_id}.ogg", BGM_BASE_HZ[stage_id])


def main() -> None:
    gen_images()
    gen_videos()
    gen_audio()
    total = 0
    for f in sorted(ASSETS.rglob("*")):
        if f.is_file() and f.suffix in {".webp", ".webm", ".ogg"}:
            size = f.stat().st_size
            total += size
            print(f"{f.relative_to(ROOT)}  {size / 1024:.0f} KB")
    print(f"total: {total / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
