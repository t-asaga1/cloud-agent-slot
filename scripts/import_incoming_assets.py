#!/usr/bin/env python3
"""ユーザー入稿素材(incoming/)の取り込み変換スクリプト。

- 図柄画像: incoming/図柄画像/*.png(透過 PNG)— 2026-07-10 入稿分
    → 透過余白をトリム → 400x200 の透過キャンバスへコンテインフィット
    → WebP で src/assets/images/reels/ へ出力
- 背景動画: incoming/背景動画/*.mp4(H.264 720p/1080p)— 2026-07-10 入稿分
    → 1280x720 へスケール(アスペクト違いは中央クロップ)
    → WebM(VP9・音声なし)で src/assets/video/stage/ へ出力
- 演出ムービー: incoming/*.mp4 — 2026-07-14 入稿分(AT確定)
    → 背景動画と同じ変換で src/assets/video/at/ へ出力
- BGM: incoming/*.wav — 2026-07-14 入稿分(4 曲)
    → OGG Vorbis(q4)へ変換し src/assets/audio/bgm/ へ出力
- SE: incoming/*.wav — 2026-07-15 入稿分(7 音)
    → OGG Vorbis(q4)へ変換し src/assets/audio/se/ へ出力

incoming/ の元ファイルは取り込み後に削除される運用のため、
存在しない入稿ファイルはスキップする(再実行可能)。

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

# 入稿ファイル名 → 素材 ID(演出ムービー。2026-07-14 入稿分 = AT確定ムービー。
# 通常時 AT 確定後の赤7待機画面で再生し最終フレームで停止する = SPEC 確定 37)
AT_MOVIES = {
    "AT確定.mp4": "at_kakutei",
}

# 入稿ファイル名 → 素材 ID(予告ムービー実素材。SPEC 確定 43 / docs/YOKOKU_PRODUCTION_PLAN.md。
# 生成は scripts/gen_yokoku_koyu1.mjs → 採用版をこの名前で incoming/ へ置いて取り込む。
# 既存仮素材の同名差し替えのため manifest.json の該当項目も更新すること)
YOKOKU_MOVIES = {
    "義経_固有予告1_弱.mp4": "yokoku_yoshitsune_koyu1_weak",
    "義経_固有予告1_強.mp4": "yokoku_yoshitsune_koyu1_strong",
    "静_固有予告1_弱.mp4": "yokoku_shizuka_koyu1_weak",
    "静_固有予告1_強.mp4": "yokoku_shizuka_koyu1_strong",
    "弁慶_固有予告1_弱.mp4": "yokoku_benkei_koyu1_weak",
    "弁慶_固有予告1_強.mp4": "yokoku_benkei_koyu1_strong",
    "夕方_固有予告1_弱.mp4": "yokoku_yugata_koyu1_weak",
    "夕方_固有予告1_強.mp4": "yokoku_yugata_koyu1_strong",
}

# 入稿ファイル名 → 素材 ID(BGM。2026-07-14 入稿分 = 4 曲。
# 使用箇所の仕様は docs/SPEC.md 確定 38 / トラック解決は src/ui/bgm.ts)
BGMS = {
    "Ashen Gate（前兆背景）.wav": "bgm_zencho",
    "Skyfall Trigger（下位AT中基本）.wav": "bgm_at_base",
    "義経テーマ曲（上位AT中基本）.wav": "bgm_at_upper",
    "頼朝テーマ曲（下位AT継続確定）.wav": "bgm_at_kakutei",
}

# 入稿ファイル名 → 素材 ID(SE。2026-07-15 入稿分 = 7 音。
# サウンドキューへの割り当ては src/ui/sound.ts の SOUND_CUES / SPEC 確定 40)
SES = {
    "レバオン音.wav": "se_lever_on",
    "リール停止音.wav": "se_reel_stop",
    "リール消灯音.wav": "se_reel_blackout",
    "リプレイ入賞音.wav": "se_win_replay",
    "スイカ（弱強共通）入賞音.wav": "se_win_watermelon",
    # 弱チェリー = 角チェリー(CHERRY_CORNER)の入賞に対応
    "弱チェリー入賞音.wav": "se_win_cherry_weak",
    "中段チェリー入賞音.wav": "se_win_cherry_center",
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


def import_bgm(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    # ループ再生用 BGM。WAV(PCM)を OGG Vorbis q4(約 128kbps)へ圧縮する
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(src), "-c:a", "libvorbis", "-q:a", "4", str(dst)],
        check=True,
        capture_output=True,
    )
    print(f"{src.name} -> {dst.relative_to(ROOT)}  {dst.stat().st_size / 1024 / 1024:.1f} MB")


def import_se(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    # ワンショット SE。BGM と同じ OGG Vorbis q4 へ圧縮する(音声内容は無加工)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(src), "-c:a", "libvorbis", "-q:a", "4", str(dst)],
        check=True,
        capture_output=True,
    )
    print(f"{src.name} -> {dst.relative_to(ROOT)}  {dst.stat().st_size / 1024:.0f} KB")


def main() -> None:
    # 取り込み済みの入稿ファイルは incoming/ から削除される運用のためスキップ
    def each(mapping: dict[str, str], subdir: str) -> list[tuple[Path, str]]:
        found = []
        for name, asset_id in mapping.items():
            src = INCOMING / subdir / name if subdir else INCOMING / name
            if src.exists():
                found.append((src, asset_id))
            else:
                print(f"skip(入稿なし): {name}")
        return found

    for src, asset_id in each(SYMBOLS, "図柄画像"):
        import_symbol(src, ASSETS / f"images/reels/{asset_id}.webp")
    for src, asset_id in each(STAGE_VIDEOS, "背景動画"):
        import_stage_video(src, ASSETS / f"video/stage/{asset_id}.webm")
    for src, asset_id in each(AT_MOVIES, ""):
        import_stage_video(src, ASSETS / f"video/at/{asset_id}.webm")
    for src, asset_id in each(YOKOKU_MOVIES, ""):
        import_stage_video(src, ASSETS / f"video/yokoku/{asset_id}.webm")
    for src, asset_id in each(BGMS, ""):
        import_bgm(src, ASSETS / f"audio/bgm/{asset_id}.ogg")
    for src, asset_id in each(SES, ""):
        import_se(src, ASSETS / f"audio/se/{asset_id}.ogg")


if __name__ == "__main__":
    main()
