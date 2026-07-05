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

## Cloud Agent 向けルール
- 変更後は必ずテストを実行すること
- 不要なファイルは削除しないこと
- 変更内容は PR 用に簡潔にまとめること
