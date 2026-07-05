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
（使用する言語が決まったら追記）
- インストール: （例: npm install）
- テスト: （例: npm test）
- 開発サーバー: （例: npm run dev）

## Cloud Agent 向けルール
- 変更後は必ずテストを実行すること
- 不要なファイルは削除しないこと
- 変更内容は PR 用に簡潔にまとめること

## Cursor Cloud specific instructions
- 現状このリポジトリは雛形（プレースホルダー）で、追跡ファイルは `README.md` と `AGENTS.md` のみ。アプリケーションコード・パッケージ定義（`package.json` / `requirements.txt` 等）・テスト・ビルド設定は存在しない。
- そのためインストールする依存関係、起動できるアプリ、実行できる lint/test/build は現時点で無い。実際のコードが追加されるまで「環境セットアップ」で行うべき作業は無い。
- VM には Node.js 22 / npm 10 / Python 3.12 / Go 1.22 / Rust(cargo) 1.83 / Java 21 が既にインストール済み。言語を選定したら、対応するパッケージマネージャの定義ファイルを追加し、この節と `## 開発コマンド` を更新し、SetupVmEnvironment の update script も実際のインストールコマンドへ更新すること。
