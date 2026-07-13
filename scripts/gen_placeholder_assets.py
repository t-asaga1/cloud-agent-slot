#!/usr/bin/env python3
"""仮素材(プレースホルダー)の一括生成スクリプト。

ユーザー入稿済みの素材(筐体画像・リール図柄・背景動画)以外の素材
(液晶フォールバック静止画・演出動画・BGM・SE)を
「黒背景 + 白文字の ●●（仮)」形式で生成する。実素材が入稿されたら同名ファイルを
差し替えるだけで置き換えられる。
※ ユーザー入稿素材の取り込み(変換)は scripts/import_incoming_assets.py 参照。

実行: python3 scripts/gen_placeholder_assets.py [対象...]
  対象なし = 全生成 / 対象 = images / effects / yokoku / renzoku / at / audio のいずれか
  (例: `python3 scripts/gen_placeholder_assets.py at` で AT・エンディング演出ムービーのみ再生成。
   ffmpeg 出力はバイト単位で再現しないため、無関係な既存仮素材まで差分を出さないよう
   追加分の対象だけを指定して実行すること)
依存: pip install pillow / ffmpeg / fonts-noto-cjk(日本語フォント)
"""

from __future__ import annotations

import subprocess
import sys
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

# ---------------------------------------------------------------------------
# 予告ムービー(STEP 4c)— docs/DIRECTION_SPEC.md「4.」の命名規約
#   通常背景固有予告: yokoku_<bg>_koyu<1-5>_<weak|strong>.webm(4 背景 × 5 × 2 = 40)
#   背景共通予告:     yokoku_common<1-4>_<weak|strong>.webm(8)
#   前兆背景固有予告: yokoku_zencho<1-3>.webm(期待度 弱/中/確定 = 3)
# 実素材入稿時は同名ファイル置き換えで差し替え(STEP 4f)。
# ---------------------------------------------------------------------------

YOKOKU_BGS = [
    ("yoshitsune", "義経"),
    ("shizuka", "静"),
    ("benkei", "弁慶"),
    ("yugata", "夕方"),
]

YOKOKU_VARIANTS = [("weak", "弱", "white"), ("strong", "強", "#facc15")]

# 前兆背景の期待度ラダー(確定 33: 1 = 弱 / 2 = 中 / 3 = 本前兆確定)
YOKOKU_ZENCHO = [
    (1, "期待度弱", "white"),
    (2, "期待度中", "#facc15"),
    (3, "本前兆確定", "#f87171"),
]

YOKOKU_SECONDS = 2


def yokoku_files() -> list[tuple[str, str, str]]:
    """(ファイル名 stem, 表示ラベル, 文字色)の一覧(合計 51 本)。"""
    files: list[tuple[str, str, str]] = []
    for bg_id, bg_label in YOKOKU_BGS:
        for n in range(1, 6):
            for variant, v_label, color in YOKOKU_VARIANTS:
                files.append(
                    (f"yokoku_{bg_id}_koyu{n}_{variant}", f"{bg_label}予告{n} {v_label}", color)
                )
    for n in range(1, 5):
        for variant, v_label, color in YOKOKU_VARIANTS:
            files.append((f"yokoku_common{n}_{variant}", f"共通予告{n} {v_label}", color))
    for n, role, color in YOKOKU_ZENCHO:
        files.append((f"yokoku_zencho{n}", f"前兆予告{n} {role}", color))
    return files

# ---------------------------------------------------------------------------
# 連続演出ムービー(STEP 4d)— docs/DIRECTION_SPEC.md「4.」の命名規約
#   連続演出 A/B(背景固有): renzoku_<a|b>_<bg>_g<1-4>.webm(2 × 5 背景 × 4 = 40)
#   連続演出 C(背景共通):   renzoku_c_g<1-4>.webm(4)
#   成否告知:               renzoku_result_<win|lose>.webm(2)
# 4G 構成は G1 = 導入 / G2 = 展開 / G3 = あおり / G4 = 決着(成否告知は全停止後の
# カットイン = renzoku_result_*)。チャンスアップは仮素材では表示差分(UI 側のバッジ)で
# 表現するためムービーは共通(DIRECTION_SPEC「4.」)。実素材入稿時は同名置き換え(STEP 4f)。
# ---------------------------------------------------------------------------

RENZOKU_BG_LIST = [
    ("yoshitsune", "義経"),
    ("shizuka", "静"),
    ("benkei", "弁慶"),
    ("yugata", "夕方"),
    ("zencho", "前兆"),
]

RENZOKU_KINDS = [("a", "A「追走」"), ("b", "B「一騎打ち」")]

# G ごとの(段階ラベル, 文字色)。あおり・決着ほど熱い色にする
RENZOKU_GAME_STAGES = [
    (1, "導入", "white"),
    (2, "展開", "white"),
    (3, "あおり", "#facc15"),
    (4, "決着", "#f87171"),
]

RENZOKU_RESULTS = [
    ("win", "勝利", "#facc15"),
    ("lose", "敗北", "#94a3b8"),
]

RENZOKU_SECONDS = 2


def renzoku_files() -> list[tuple[str, str, str]]:
    """(ファイル名 stem, 表示ラベル, 文字色)の一覧(合計 46 本)。"""
    files: list[tuple[str, str, str]] = []
    for kind_id, kind_label in RENZOKU_KINDS:
        for bg_id, bg_label in RENZOKU_BG_LIST:
            for n, stage, color in RENZOKU_GAME_STAGES:
                files.append(
                    (
                        f"renzoku_{kind_id}_{bg_id}_g{n}",
                        f"連続演出{kind_label} {bg_label} G{n} {stage}",
                        color,
                    )
                )
    for n, stage, color in RENZOKU_GAME_STAGES:
        files.append((f"renzoku_c_g{n}", f"連続演出C「決戦」 G{n} {stage}", color))
    for result_id, label, color in RENZOKU_RESULTS:
        files.append((f"renzoku_result_{result_id}", f"成否告知 {label}", color))
    return files


# ---------------------------------------------------------------------------
# AT・上位 AT・エンディング演出ムービー(STEP 4e)— docs/DIRECTION_SPEC.md「4.」の命名規約
#   AT 小役パート予告: at_koyaku_<navi|rare|strong>.webm / uat_koyaku_<...>.webm(6)
#   バトルパート(AT): battle_at_<01-20>.webm(Excel「AT中」シートのパターン No に対応 = 20)
#   バトルパート(上位): battle_uat_<no>.webm(Excel「上位AT中」の No に対応。
#     13・15・16・19 は歯抜けで 01-12, 14, 17, 18, 20, 21 の 17 本)
#   エンディング: ending_<to_upper|complete>.webm(2)
# バトルの通常/チャンス変化は Excel の No がパターン別に採番済み(ムービー自体が別)。
# 実素材入稿時は同名ファイル置き換えで差し替え(STEP 4f)。
# ---------------------------------------------------------------------------

AT_KOYAKU_YOKOKU = [
    ("navi", "ベルナビ", "white"),
    ("rare", "レア役示唆", "#facc15"),
    ("strong", "強予告 V濃厚", "#f87171"),
]

AT_TIERS = [("at", "AT"), ("uat", "上位AT")]

# Excel「AT中」シート バトルパート No 1〜20(No, ラベル, 文字色)
BATTLE_AT_PATTERNS = [
    (1, "G1 導入 通常", "white"),
    (2, "G1 導入 チャンス", "#facc15"),
    (3, "G2 義経台詞 通常", "white"),
    (4, "G2 義経台詞 チャンス", "#facc15"),
    (5, "G3 頼朝台詞 通常", "white"),
    (6, "G3 頼朝台詞 チャンス", "#facc15"),
    (7, "G4 攻撃決め 義経攻撃へ", "white"),
    (8, "G4 攻撃決め 頼朝攻撃へ", "white"),
    (9, "G5 義経弱攻撃", "white"),
    (10, "G5 義経強攻撃", "#facc15"),
    (11, "G5 頼朝弱攻撃", "white"),
    (12, "G5 頼朝強攻撃", "#facc15"),
    (13, "G6 頼朝にヒット", "white"),
    (14, "G6 桜花繚乱チャンス", "#facc15"),
    (15, "G6 義経喰らうか", "white"),
    (16, "G7 頼朝の台詞", "white"),
    (17, "G7 耐える", "white"),
    (18, "G7 耐えれない", "#94a3b8"),
    (19, "G8 継続 次セットへ", "#facc15"),
    (20, "G8 復活判定", "#f87171"),
]

# Excel「上位AT中」シート バトルパート No(歯抜けのまま。共闘版)
BATTLE_UAT_PATTERNS = [
    (1, "G1 導入 通常", "white"),
    (2, "G1 導入 チャンス", "#facc15"),
    (3, "G2 義経台詞 通常", "white"),
    (4, "G2 義経台詞 チャンス", "#facc15"),
    (5, "G3 頼朝台詞 通常", "white"),
    (6, "G3 頼朝台詞 チャンス", "#facc15"),
    (7, "G4 義経攻撃へ", "white"),
    (8, "G4 頼朝攻撃へ", "white"),
    (9, "G4 ダブル攻撃へ", "#facc15"),
    (10, "G5 義経攻撃", "white"),
    (11, "G5 頼朝攻撃", "white"),
    (12, "G5 ダブル攻撃", "#facc15"),
    (14, "G6 敵を倒せるか", "white"),
    (17, "G7 倒せる 二人の台詞", "white"),
    (18, "G7 倒せない 敵の反撃", "#94a3b8"),
    (20, "G8 継続", "#facc15"),
    (21, "G8 復活判定", "#f87171"),
]

# エンディング 2 種(EndingPhase.after で描き分け = Q20)
ENDING_MOVIES = [
    ("to_upper", "エンディング 上位ATへ", "#facc15"),
    ("complete", "エンディング 完全制覇", "#f87171"),
]

AT_SECONDS = 2


def at_files() -> list[tuple[str, str, str]]:
    """(ファイル名 stem, 表示ラベル, 文字色)の一覧(合計 45 本)。"""
    files: list[tuple[str, str, str]] = []
    for tier_id, tier_label in AT_TIERS:
        for kind_id, kind_label, color in AT_KOYAKU_YOKOKU:
            files.append((f"{tier_id}_koyaku_{kind_id}", f"{tier_label}予告 {kind_label}", color))
    for no, label, color in BATTLE_AT_PATTERNS:
        files.append((f"battle_at_{no:02d}", f"ATバトル {label}", color))
    for no, label, color in BATTLE_UAT_PATTERNS:
        files.append((f"battle_uat_{no:02d}", f"共闘バトル {label}", color))
    for ending_id, label, color in ENDING_MOVIES:
        files.append((f"ending_{ending_id}", label, color))
    return files


# SE(id, 周波数系列 [(Hz, 長さ秒), ...])
SES = [
    ("se_lever_on", [(880, 0.08), (1320, 0.10)]),
    ("se_reel_stop", [(440, 0.06)]),
    ("se_payout", [(1047, 0.06), (1319, 0.06), (1568, 0.10)]),
    ("se_rare", [(660, 0.10), (990, 0.16)]),
    ("se_bonus", [(523, 0.12), (659, 0.12), (784, 0.12), (1047, 0.24)]),
    # STEP 3d 追加: 前兆テロップ表示音(短い 1 音)/ 連続演出失敗音(下降 2 音)
    ("se_telop", [(1568, 0.09)]),
    ("se_fail", [(494, 0.14), (330, 0.28)]),
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

def gen_placeholder_video(
    path: Path, label: str, duration: int, fontcolor: str = "white", fontsize: int = 96
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = f"{label}（仮）"
    # 明滅周期 = 動画長にして、ループの継ぎ目を目立たせない
    drawtext = (
        f"drawtext=fontfile={FONT}:text='{text}':fontsize={fontsize}:fontcolor={fontcolor}:"
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


def gen_yokoku_videos() -> None:
    for stem, label, color in yokoku_files():
        gen_placeholder_video(
            ASSETS / f"video/yokoku/{stem}.webm", label, YOKOKU_SECONDS,
            fontcolor=color, fontsize=84,
        )


def gen_renzoku_videos() -> None:
    for stem, label, color in renzoku_files():
        gen_placeholder_video(
            ASSETS / f"video/renzoku/{stem}.webm", label, RENZOKU_SECONDS,
            fontcolor=color, fontsize=72,
        )


def gen_at_videos() -> None:
    for stem, label, color in at_files():
        gen_placeholder_video(
            ASSETS / f"video/at/{stem}.webm", label, AT_SECONDS,
            fontcolor=color, fontsize=72,
        )


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
    # 対象指定なし = 全生成 / 指定あり = その対象のみ(既存仮素材の無用な差分を防ぐ)
    targets = set(sys.argv[1:]) or {"images", "effects", "yokoku", "renzoku", "at", "audio"}
    unknown = targets - {"images", "effects", "yokoku", "renzoku", "at", "audio"}
    if unknown:
        raise SystemExit(
            f"未知の対象: {sorted(unknown)}(images / effects / yokoku / renzoku / at / audio)"
        )
    if "images" in targets:
        gen_images()
    if "effects" in targets:
        gen_videos()
    if "yokoku" in targets:
        gen_yokoku_videos()
    if "renzoku" in targets:
        gen_renzoku_videos()
    if "at" in targets:
        gen_at_videos()
    if "audio" in targets:
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
