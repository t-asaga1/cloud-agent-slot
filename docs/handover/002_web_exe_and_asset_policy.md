# 引継ぎ資料(最新)

- 作成者: AGENT #002(Web+exe 配布方針・素材管理ルールの策定)
- 作成日: 2026-07-04
- 履歴コピー: `docs/handover/002_web_exe_and_asset_policy.md`

## プロジェクト概要

パチスロアプリケーションを開発するプロジェクト。
**1 AGENT につきユーザーとのやり取りは 1 回のみ**。作業終了時に必ずこのファイルを更新し、`docs/handover/` に履歴コピーを残すこと(詳細ルールは `AGENTS.md` 参照)。

## これまでの経緯

1. ユーザーがプロジェクトルール(1 AGENT 1 やり取り + 引継ぎ資料の作成)を制定。
2. AGENT #001 が開発の進め方を提案し、`docs/DEVELOPMENT_PLAN.md` として文書化。
   - 技術スタック案: TypeScript + React + Vite + Vitest
   - 方針: ゲームロジック(`src/core/`)と UI(`src/ui/`)を分離、ロジックは全て単体テスト対象
   - Phase 0(仕様策定)〜 Phase 5(演出・仕上げ)のフェーズ計画を定義
3. ユーザーが「Web アプリで進めると同時に exe ファイルとしても公開できるように」と指示(= Web 主軸の計画は事実上承認)。AGENT #002 が以下を実施:
   - `docs/DEVELOPMENT_PLAN.md` を更新: Tauri による exe パッケージング方針(Phase 4.5)、`src/platform/` によるブラウザ API の抽象化、CI(Windows ランナー)での exe ビルドを追記。
   - `docs/ASSET_GUIDELINES.md` を新規作成: 素材(筐体画像・音声・液晶データ)の管理ルールを策定。

## 現在の状態

- コードは未実装。リポジトリにはドキュメントのみ存在する。
  - `AGENTS.md` … プロジェクトルール
  - `docs/DEVELOPMENT_PLAN.md` … 開発計画(Web + exe 両対応、フェーズ定義、アーキテクチャ方針)
  - `docs/ASSET_GUIDELINES.md` … 素材管理ルール(SVG/コード生成優先、manifest.json による出所管理、サイズ上限)
  - `docs/HANDOVER.md` … 本ファイル
- 決定済みの方針:
  - Web アプリ(Vite ビルド)を主軸とし、exe は Tauri でラップして配布(Phase 4.5 で導入)。
  - 素材はリポジトリ内で一元管理。オリジナル素材のみ。コード描画(SVG/CSS/Web Audio 合成)を優先し、バイナリは最終手段。Git LFS は現時点で未導入。
- Phase 0(機種仕様書 `docs/SPEC.md` の作成)は**未着手**。

## 次の AGENT へのタスク

ユーザーの指示内容を最優先とした上で、次を実施:

1. `docs/DEVELOPMENT_PLAN.md` の Phase 0 に従い、機種仕様書 `docs/SPEC.md` を作成する。
   - オリジナル機種として、リール配列・役構成・設定別確率・ボーナス仕様・払い出しを定義する。
2. ユーザーから計画・素材方針への修正指示があれば該当ドキュメントを更新してから作業する。
3. 作業終了時に本ファイルを更新し、`docs/handover/003_*.md` に履歴を残す。

## 注意事項

- ブランチは `cursor/<説明>-<suffix>` 形式で作成し、PR を出すこと(suffix は環境から指示される)。
- `AGENTS.md` のルール(テスト実行、不要ファイル削除禁止、PR 用の簡潔なまとめ)を守ること。
- ブラウザ API(音声・永続化)は `src/platform/` のラッパー経由で使うこと(exe 対応のため)。
- 素材を追加する際は必ず `docs/ASSET_GUIDELINES.md` に従うこと。
