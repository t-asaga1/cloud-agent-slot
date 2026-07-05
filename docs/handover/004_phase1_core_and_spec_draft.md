# 引継ぎ資料(最新)

- 作成者: AGENT #004(Phase 1: プロジェクト雛形 + core の rng/lottery/payout 実装、SPEC 叩き台追記)
- 作成日: 2026-07-05
- 履歴コピー: `docs/handover/004_phase1_core_and_spec_draft.md`

## プロジェクト概要

パチスロアプリケーションを開発するプロジェクト。
**1 AGENT につきユーザーとのやり取りは 1 回のみ**。作業終了時に必ずこのファイルを更新し、`docs/handover/` に履歴コピーを残すこと(詳細ルールは `AGENTS.md` 参照)。

## これまでの経緯

1. ユーザーがプロジェクトルール(1 AGENT 1 やり取り + 引継ぎ資料の作成)を制定。
2. AGENT #001 が開発計画を `docs/DEVELOPMENT_PLAN.md` として文書化(TS + React + Vite + Vitest、core/UI 分離、Phase 0〜5)。
3. AGENT #002 が Web + exe(Tauri)両対応方針と `docs/ASSET_GUIDELINES.md`(素材管理ルール)を策定。
4. AGENT #003 が素材入稿フロー(`incoming/`)整備、リール 20 コマ・内部状態 12 種・演出別レイヤー方針を `docs/SPEC.md` 骨子として文書化。
5. AGENT #004(今回)が以下を実施:
   - `incoming/` を確認 → 素材入稿なし(README のみ)のため取り込み作業はスキップ。
   - **プロジェクト雛形作成**: Vite + React + TS + Vitest(Node 22 / npm)。`npm install / test / lint / build / dev` が動く状態。
   - **Phase 1 コアロジック実装**(`src/core/`):
     - `rng.ts` … シード指定可能な乱数(mulberry32)。テスト再現性を保証
     - `roles.ts` … 役 9 種(リプレイ/ベル/スイカ/弱チェ/強チェ/チャンス目/BIG/REG/ハズレ)と設定 1〜6 の型定義
     - `lottery.ts` … 設定別役抽選(分母 65536、データ駆動テーブル)
     - `payout.ts` … 払い出し計算(投入 3 枚、リプレイの再遊技対応)
   - **単体テスト 24 件**(`src/core/*.test.ts`): テーブル静的検証(合計<分母、設定差の単調性)、50 万試行シミュレーションでの理論値収束、再現性、払い出し全役検証。全件パス。
   - **`docs/SPEC.md` の TBD に叩き台を追記**(ユーザー未承認の提案): 有効ライン=中段 1 ライン、リール配列 20 コマ×3(ベル・リプレイ 100% 引き込み保証配置)、設定 1〜6 確率テーブル(ボーナス合算 1/595.8〜1/434.0)、払い出し枚数。**数値は `src/core/` の実装と一致**させている。
   - **動作確認用の最小 UI**(`src/App.tsx`): 設定選択+レバーオンで 1G 消化(抽選→払い出し→収支表示)できる Phase 1 検証ページ。本格的な筐体 UI は Phase 4。
   - `AGENTS.md` の開発コマンド欄を実コマンドで更新。

## 現在の状態

- **Phase 1 完了**(rng / lottery / payout + テスト)。Phase 2(リール制御)は未着手。
- リポジトリ構成:
  - `src/core/` … ゲームロジック(UI 非依存・全て単体テスト付き)
  - `src/App.tsx` … コア動作確認ページ(暫定 UI)
  - `docs/SPEC.md` … 確率・配列・ラインの叩き台入り(承認待ち)
  - `docs/DEVELOPMENT_PLAN.md` / `docs/ASSET_GUIDELINES.md` / `incoming/` … 変更なし
- 開発コマンド: `npm install` → `npm test`(24 件)/ `npm run lint` / `npm run build` / `npm run dev`
- 決定済みの方針(変更なし):
  - Web アプリ主軸 + Tauri で exe 配布(Phase 4.5)
  - 素材はユーザー入稿第一(`incoming/` → 変換して `src/assets/`)。動画 WebM(VP9)、音声 OGG
  - リール 20 コマ、内部状態 12 種、演出は別レイヤー(ステージ移行抽選)

## 次の AGENT へのタスク

ユーザーの指示内容を最優先とした上で、次を実施:

1. **`incoming/` に素材が入稿されていたら最優先で取り込む**(`docs/ASSET_GUIDELINES.md` の手順)。
2. ユーザーから SPEC 叩き台(有効ライン・リール配列・確率・払い出し)への回答があれば反映。修正時は `src/core/` の数値・テストも必ずセットで更新。
3. **Phase 2(リール制御)に着手**: `src/core/reel.ts` に 20 コマ×3 リールのデータモデルと「引き込み優先度探索方式」の停止制御を実装(方式詳細は `docs/DEVELOPMENT_PLAN.md` Phase 2 参照)。リール配列は `docs/SPEC.md` の叩き台を使用。「当選役×全 20 押下位置」の網羅テスト必須。
4. 作業終了時に本ファイルを更新し、`docs/handover/005_*.md` に履歴を残す。

## 注意事項

- ブランチは `cursor/<説明>-<suffix>` 形式で作成し、PR を出すこと(suffix は環境から指示される)。
- `AGENTS.md` のルール(テスト実行、不要ファイル削除禁止、PR 用の簡潔なまとめ)を守ること。
- **確率・配当・配列などの数値は `docs/SPEC.md` と `src/core/` の実装を必ず一致させる**(テストが理論値を参照しているため、片方だけの変更はテストで検出される)。
- ブラウザ API(音声・動画再生・永続化)は `src/platform/` のラッパー経由で使うこと(exe 対応のため)。
- 素材を追加する際は必ず `docs/ASSET_GUIDELINES.md` に従うこと。
- **PR #1〜#4 が未マージのため、main には docs も src も無い**。最新のドキュメント+コードは本ブランチ系列(PR チェーン: #2 → #3 → #4 → 本 PR)にある。次の AGENT はこの系列の最新ブランチから分岐すること。
- docs 内ファイルへのアクセス方法: GitHub のリポジトリページでブランチを本系列の最新ブランチに切り替えて `docs/` を開く(または各 PR の Files changed タブ)。main へのマージが進めば main 直下の `docs/` で見られるようになる。
