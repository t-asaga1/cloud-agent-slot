# cloud-agent-slot

## 概要
Cloud Agent 本番開発用リポジトリ。
現在のプロジェクト: **パチスロアプリケーションの開発**

## プロジェクトルール(最重要)
- 1 AGENT に対するやり取りは **1回のみ**。
- 各 AGENT は作業開始時に必ず `docs/HANDOVER.md`(最新の引継ぎ資料)を読むこと。
- 各 AGENT は作業終了時に必ず次の AGENT への引継ぎ資料を作成すること。
  - `docs/HANDOVER.md` を最新の内容に更新する(次の AGENT が最初に読むファイル)。
  - 履歴として `docs/handover/NNN_タイトル.md` に同内容のコピーを残す(NNN は 001 からの連番)。
- ルールはユーザーの指示により途中で変更されることがある。変更されたら本ファイルを更新すること。

## 開発コマンド
技術スタック: TypeScript + React + Vite + Vitest(Node 22 / npm)
- インストール: `npm install`
- テスト: `npm test`(Vitest。`src/**/*.test.ts` を実行)
- lint: `npm run lint`(oxlint)
- ビルド: `npm run build`(`tsc -b` + `vite build`)
- 開発サーバー: `npm run dev`(Vite、デフォルト http://localhost:5173)
- デスクトップ版(Tauri 2.x): `npm run tauri:dev`(開発)/ `npm run tauri:build`(リリースビルド)。要 Rust stable 1.97+ と Linux では WebKitGTK 開発依存(導入手順は `docs/HANDOVER.md` の STEP 5a 関連記載を参照)

## Cloud Agent 向けルール
- 変更後は必ずテストを実行すること
- 不要なファイルは削除しないこと
- 変更内容は PR 用に簡潔にまとめること

## Cursor Cloud specific instructions
- 環境セットアップは `npm install` のみで完了する(Node.js 22 / npm 10 が VM にインストール済み)。
- アプリは `npm run dev` で http://localhost:5173 に起動する。テストは `npm test`、lint は `npm run lint`、ビルドは `npm run build`。
- 素材(画像・動画・音声)の仮素材を再生成する場合のみ、追加で `pip install pillow numpy`、`sudo apt-get update && sudo apt-get install -y fonts-noto-cjk`(日本語フォント)が必要。ffmpeg は VM に導入済み。生成スクリプトは `scripts/gen_placeholder_assets.py`、筐体画像の取り込みは `scripts/import_cabinet.py`。
- Tauri(デスクトップ版)のビルド環境は環境イメージに導入済み(2026-07-14 更新): Rust stable 1.97 / WebKitGTK 等の apt 依存(`libwebkit2gtk-4.1-dev build-essential libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev pulseaudio pulseaudio-utils`)/ ビルドキャッシュ(`src-tauri/target` 約 2.0GB + `/usr/local/cargo` 約 223MB)。`npm run tauri:build` がそのまま通り、キャッシュ済みのため `cargo build --release` は約 23 秒。VM 内で実機確認する場合は音声デバイスが無いため PulseAudio null sink(`pulseaudio --start` + `pactl load-module module-null-sink`)を先に用意すること(詳細は `docs/HANDOVER.md`)。
- 万一 Tauri ビルドが通らない古い環境で起動した場合のみ、手動で `rustup update stable && rustup default stable`(1.97 以上)+ 上記 apt パッケージの導入が必要(初回 `cargo build --release` は約 4 分)。
