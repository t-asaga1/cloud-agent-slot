# 引継ぎ資料(最新)

- 作成者: AGENT #006(Excel 仕様書の入稿方法を整備)
- 作成日: 2026-07-09
- 履歴コピー: `docs/handover/006_excel_spec_intake_guide.md`

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
6. AGENT #005 が PR チェーンの構造問題を解消:
   - PR #3〜#5 は base が main ではなく前のブランチだったため、マージしても main に成果物が反映されていなかった(PR #2 の成果物のみ main に入っていた)。
   - PR #5 のマージコミット(全成果物を含む)から新ブランチを作成し、main を取り込んだ上で **main 向けの統合 PR** を作成。統合 PR(#6)はマージ済みで、`incoming/`・`src/`・`docs/` すべて main に反映済み。
7. ユーザーが `incoming/cabinet/筐体.png` を GitHub Web UI 経由で入稿(コミット `a82e407`、未取り込み)。
8. AGENT #006(今回)が「Excel の設計仕様書をどう渡すか」というユーザーの質問に回答:
   - 推奨フローは **`incoming/specs/` に xlsx を置いてコミット & プッシュ**(GitHub Web UI の `Add file → Upload files` が簡単)。チャット添付でも可だが、次の AGENT 以降も参照できるようリポジトリ入稿を推奨。
   - VM 上で openpyxl(Python)により xlsx の全シート・セル・数式が読み取れることを実機検証済み。
   - `incoming/README.md` に仕様書入稿のセクションと `specs/` フォルダの例を追記。

## 現在の状態

- **Phase 1 完了**(rng / lottery / payout + テスト)。Phase 2(リール制御)は未着手。
- **`incoming/cabinet/筐体.png` が入稿済み・未取り込み**(次の AGENT が最優先で取り込むこと)。
- ユーザーから Excel 仕様書が入稿される可能性あり(`incoming/specs/` またはチャット添付)。入稿されたら内容を `docs/SPEC.md` に反映し、`src/core/` の数値・テストとセットで整合させること。
- リポジトリ構成:
  - `src/core/` … ゲームロジック(UI 非依存・全て単体テスト付き)
  - `src/App.tsx` … コア動作確認ページ(暫定 UI)
  - `docs/SPEC.md` … 確率・配列・ラインの叩き台入り(承認待ち)
  - `docs/DEVELOPMENT_PLAN.md` / `docs/ASSET_GUIDELINES.md` … 変更なし
  - `incoming/` … `cabinet/筐体.png`(未取り込み)+ README に仕様書入稿ルール追記
- 開発コマンド: `npm install` → `npm test`(24 件)/ `npm run lint` / `npm run build` / `npm run dev`
- 決定済みの方針(変更なし):
  - Web アプリ主軸 + Tauri で exe 配布(Phase 4.5)
  - 素材はユーザー入稿第一(`incoming/` → 変換して `src/assets/`)。動画 WebM(VP9)、音声 OGG
  - リール 20 コマ、内部状態 12 種、演出は別レイヤー(ステージ移行抽選)

## 次の AGENT へのタスク

ユーザーの指示内容を最優先とした上で、次を実施:

1. **`incoming/cabinet/筐体.png` を取り込む**(`docs/ASSET_GUIDELINES.md` の手順)。その他の素材・仕様書が入稿されていればあわせて取り込む。
2. **Excel 仕様書(`incoming/specs/*.xlsx` 等)が入稿されていたら**: openpyxl(`pip3 install --user openpyxl`、VM は Python 3.12)で全シートを読み取り、内容を `docs/SPEC.md` へ反映。確率・配当・配列の数値は `src/core/` の実装・テストと必ずセットで更新する。数式セルは `load_workbook(path)` で数式文字列、`data_only=True` で計算済み値が取れる(後者は Excel 側で保存時に計算されている場合のみ)。
3. ユーザーから SPEC 叩き台(有効ライン・リール配列・確率・払い出し)への回答があれば反映。修正時は `src/core/` の数値・テストも必ずセットで更新。
4. **Phase 2(リール制御)に着手**: `src/core/reel.ts` に 20 コマ×3 リールのデータモデルと「引き込み優先度探索方式」の停止制御を実装(方式詳細は `docs/DEVELOPMENT_PLAN.md` Phase 2 参照)。リール配列は `docs/SPEC.md` の叩き台を使用。「当選役×全 20 押下位置」の網羅テスト必須。
5. 作業終了時に本ファイルを更新し、`docs/handover/007_*.md` に履歴を残す。

## 注意事項

- ブランチは `cursor/<説明>-<suffix>` 形式で作成し、PR を出すこと(suffix は環境から指示される)。
- `AGENTS.md` のルール(テスト実行、不要ファイル削除禁止、PR 用の簡潔なまとめ)を守ること。
- **確率・配当・配列などの数値は `docs/SPEC.md` と `src/core/` の実装を必ず一致させる**(テストが理論値を参照しているため、片方だけの変更はテストで検出される)。
- ブラウザ API(音声・動画再生・永続化)は `src/platform/` のラッパー経由で使うこと(exe 対応のため)。
- 素材を追加する際は必ず `docs/ASSET_GUIDELINES.md` に従うこと。
- **PR は必ず base を `main` にして作成すること**。過去に base を前のブランチにした PR チェーン(#3→#4→#5)を作ったため、マージしても main に反映されない問題が起きた(統合 PR #6 で解消済み)。ブランチは main から分岐すること。
