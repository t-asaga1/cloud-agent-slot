# cloud-agent-slot

## 概要
Cloud Agent 本番開発用リポジトリ。
現在のプロジェクト: **パチスロアプリケーション「義経物語」の開発**

## プロジェクトルール(最重要)
- ~~1 AGENT に対するやり取りは 1 回のみ~~ → **2026-07-18 に廃止**。同一 AGENT と複数回やり取りしてよい(プロンプト承認 → 生成 → 確認 → 組込みを 1 会話内で進めてよい)。
- 各 AGENT は作業開始時に必ず **`docs/HANDOVER.md`**(最新の引継ぎ資料)を読むこと。
- 作業終了時、引継ぎに影響する変更(残作業・注意事項・仕様の変化)があれば `docs/HANDOVER.md` を更新すること。`docs/handover/NNN_タイトル.md` への履歴コピーは**大きな区切りのときのみでよい**(毎回は不要)。
- ルールはユーザーの指示により途中で変更されることがある。変更されたら本ファイルを更新すること。

## 作業の進め方(2026-07-18 ユーザー指示)
- **画像作成・実装・検証はできるだけ簡易に進めること**。
- **検証はアプリ本体での確認を主とする**(`npm test` + 必要最小限のブラウザ確認)。作業内容の録画・スクリーンショットなど**ユーザー確認用の資料作成は最小限にする**(凝ったデモ動画・大量のスクショは作らない)。
- **画像の生成にはリファレンス(参考画像)を必ず使うこと**: `incoming/reference/設定資料/` のキャラクター設定資料ペア(顔 + 全身)+ 背景参考画像を参照に渡し、連続する画像は前の生成画像を参照に連鎖させて一貫性を保つ(詳細は `docs/HANDOVER.md` の「画像生成」節)。

## 開発コマンド
技術スタック: TypeScript + React + Vite + Vitest(Node 22 / npm)
- インストール: `npm install`
- テスト: `npm test`(Vitest。`src/**/*.test.ts` を実行)
- lint: `npm run lint`(oxlint)
- ビルド: `npm run build`(`tsc -b` + `vite build`)
- 開発サーバー: `npm run dev`(Vite、デフォルト http://localhost:5173)
- デスクトップ版(Tauri 2.x): `npm run tauri:dev`(開発)/ `npm run tauri:build`(リリースビルド)。要 Rust stable 1.97+ と Linux では WebKitGTK 開発依存(導入手順は `docs/HANDOVER.md` 参照)

## Cloud Agent 向けルール
- 変更後は必ずテストを実行すること
- 不要なファイルは削除しないこと
- 変更内容は PR 用に簡潔にまとめること

## AI 素材生成のルール
演出画像・ムービーを生成する際は、以下のワークフローを守ること(1 会話内で複数回やり取りして進めてよい):

1. **生成する前に、使用予定のプロンプト(または構図案)をユーザーへ提示して承認を得ること**。
2. **生成したら、組込み(取り込み・差し替え)まで進まず、まずユーザーに生成物を確認してもらうこと**。
   生成原本は同ランのうちに `incoming/` 配下へコミットして現物を確保する(アーティファクトはラン終了で消える)。
3. **生成物をユーザーの指示なしに勝手に再生成しないこと**(API 課金が余分に掛かるため)。
- fal.ai の API キーは Cloud Agent Secret **`FAL_KEY2`** を使用する(生成スクリプトは `fal.config({ credentials: process.env.FAL_KEY2 })` で明示設定する)。

## Cursor Cloud specific instructions
- 環境セットアップは `npm install` のみで完了する(Node.js 22 / npm 10 が VM にインストール済み)。
- アプリは `npm run dev` で http://localhost:5173 に起動する。テストは `npm test`、lint は `npm run lint`、ビルドは `npm run build`。
- 素材(画像・動画・音声)の仮素材を再生成する場合のみ、追加で `pip install pillow numpy`、`sudo apt-get update && sudo apt-get install -y fonts-noto-cjk`(日本語フォント)が必要。ffmpeg は VM に導入済み。生成スクリプトは `scripts/gen_placeholder_assets.py`、筐体画像の取り込みは `scripts/import_cabinet.py`。
- Tauri(デスクトップ版)のビルド環境は環境イメージに導入済み(2026-07-14 更新): Rust stable 1.97 / WebKitGTK 等の apt 依存(`libwebkit2gtk-4.1-dev build-essential libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev pulseaudio pulseaudio-utils`)/ ビルドキャッシュ(`src-tauri/target` 約 2.0GB + `/usr/local/cargo` 約 223MB)。`npm run tauri:build` がそのまま通り、キャッシュ済みのため `cargo build --release` は約 23 秒。VM 内で実機確認する場合は音声デバイスが無いため PulseAudio null sink(`pulseaudio --start` + `pactl load-module module-null-sink`)を先に用意すること(詳細は `docs/HANDOVER.md`)。
- 万一 Tauri ビルドが通らない古い環境で起動した場合のみ、手動で `rustup update stable && rustup default stable`(1.97 以上)+ 上記 apt パッケージの導入が必要(初回 `cargo build --release` は約 4 分)。
