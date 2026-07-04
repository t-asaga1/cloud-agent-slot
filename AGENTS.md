# cloud-agent-slot

## 概要
Cloud Agent 本番開発用リポジトリ。

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
