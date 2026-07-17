# AGENT #083: 弁慶背景 固有予告 1 を紙芝居(静止画 4 枚)方式で組込み

- 作成日: 2026-07-17
- ユーザー指示: 「弁慶背景固有予告1を組み込んで」(AGENT #082 が生成・`incoming/yokoku/` へ
  確保済みの 4 枚の採用確定)

## 1. 入稿した素材

`incoming/yokoku/弁慶_予告1_*.png` の原本 4 枚(1536x1024 = 3:2)を ffmpeg で
中央 16:9 クロップ(1536x864)+ 1280x720 WebP 化し `src/assets/images/yokoku/` へ。
`manifest.json` へ 4 件登録済み。

| ファイル(stem) | 用途 |
|---|---|
| `yokoku_benkei_koyu1_still1` | 弱・強共通 1 枚目(レバーオン)。滝の前の弁慶・正面チェストアップ |
| `yokoku_benkei_koyu1_still2_weak` | 弱 2 枚目(第 1 停止)。左向き |
| `yokoku_benkei_koyu1_still2_strong` | 強 2 枚目(第 1 停止)。バストアップ右向き |
| `yokoku_benkei_koyu1_still3` | 弱・強共通 3 枚目(第 3 停止 + 小役図柄)。比叡山の森 |

## 2. 実装(経緯 75 の想定どおり最小変更)

- `src/ui/direction.ts`: `KOYAKU_HINT_STILLS` へ `KOYU_1: { BENKEI: 'yokoku_benkei_koyu1' }`
  の 1 エントリ追加のみ。表示ロジック(`DirectionLayer` の `stoppedReels` 切替)・CSS は
  静版(AGENT #081)をそのまま流用。
- `src/ui/direction.test.ts`: YOKOKU_IMAGES 存在検証へ弁慶 4 キーを追加(計 8 キー)+
  弁慶版の紙芝居解決テスト(弱・強)を追加。
- 組込み後に `incoming/yokoku/` の原本 4 枚を削除(経緯 76 の運用どおり。Git 履歴には残る)。
- `docs/YOKOKU_PRODUCTION_PLAN.md` 12.5 へ組込み完了を追記。

## 3. テスト・確認

- テスト 407 パス・lint / build グリーン。
- ブラウザ実機確認(初期背景を弁慶固定 + 毎 G 固有 1 強制の一時ハックで確認後 revert 済み):
  - 弱(押し順ベル強制): 滝の前の弁慶正面 → 第 1 停止で左向き → 第 3 停止で森 + ベル図柄
  - 強(強スイカ強制): 正面 → 第 1 停止でバストアップ右向き → 第 3 停止で森 + スイカ図柄
  - いずれも停止ボタン(Z / X / C)連動で切替、console エラーなし(録画あり)。
- **注意(次の AGENT へ)**: computerUse がセレクトで「弱スイカ(強制)」を誤選択して
  「強の 2 枚目が出ない」と誤報告する事象があった。強弱の確認はデバッグパネルの
  「予告演出: 小役示唆 固有予告1(強/弱)」表示で必ず裏取りすること。

## 4. 次の AGENT へ

1. **ユーザーの表示確認の結果を待つ**(見た目・切替タイミング・図柄の位置/サイズの調整指示に対応)。
2. 残りの予告(義経・夕方の固有 1、各背景の固有 2・3 / 共通 1・2 など)は経緯 76〜77 と
   同フロー(生成ラン = プロンプト承認 → 生成 → 原本を `incoming/yokoku/` へコミット →
   ユーザー確認 → 組込みラン = WebP 化 + `KOYAKU_HINT_STILLS` へ 1 行 + テスト更新 +
   原本削除)で 1 予告ずつ進める(生成のコツ = YOKOKU_PRODUCTION_PLAN 12.3 / 組込み手順 = 12.4)。
