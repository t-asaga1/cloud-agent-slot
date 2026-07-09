# 引継ぎ資料(最新)

- 作成者: AGENT #007(素材取り込み + 仮素材生成 + Phase 2 リール制御)
- 作成日: 2026-07-09
- 履歴コピー: `docs/handover/007_assets_and_phase2_reel.md`

## プロジェクト概要

パチスロアプリケーションを開発するプロジェクト。
**1 AGENT につきユーザーとのやり取りは 1 回のみ**。作業終了時に必ずこのファイルを更新し、`docs/handover/` に履歴コピーを残すこと(詳細ルールは `AGENTS.md` 参照)。

## これまでの経緯

1. ユーザーがプロジェクトルール(1 AGENT 1 やり取り + 引継ぎ資料の作成)を制定。
2. AGENT #001 が開発計画を `docs/DEVELOPMENT_PLAN.md` として文書化(TS + React + Vite + Vitest、core/UI 分離、Phase 0〜5)。
3. AGENT #002 が Web + exe(Tauri)両対応方針と `docs/ASSET_GUIDELINES.md`(素材管理ルール)を策定。
4. AGENT #003 が素材入稿フロー(`incoming/`)整備、リール 20 コマ・内部状態 12 種・演出別レイヤー方針を `docs/SPEC.md` 骨子として文書化。
5. AGENT #004 がプロジェクト雛形 + Phase 1 コアロジック(rng/lottery/payout + テスト 24 件)+ SPEC 叩き台(確率・配列・ライン)を実装。
6. AGENT #005 が PR チェーンの構造問題を解消し、全成果物を main へ統合。
7. ユーザーが筐体画像(`incoming/cabinet/筐体.png`、完全オリジナル)を入稿。水色矩形=液晶のはめ込み位置、ピンク矩形 3 枚=リール窓(左・中・右)。
8. AGENT #006 が Excel 設計仕様書の入稿方法を整備(PR #9)。推奨フローは **`incoming/specs/` に xlsx を置いてコミット & プッシュ**。VM 上で openpyxl(Python)により xlsx の全シート・セル・数式が読めることを検証済み。`incoming/README.md` に仕様書入稿ルールを追記。
9. AGENT #007(今回)が以下を実施:
   - **筐体画像の取り込み**: WebP 変換(277 KB)→ `src/assets/images/cabinet/cabinet_frame.webp`。マーカー矩形の座標をピクセル検出し `src/assets/layout.ts` に定義(液晶 x116,y80,1369x768 / リール窓 3 枚)。取り込みスクリプトは `scripts/import_cabinet.py`(再実行可能)。取り込み後、ガイドラインに従い `incoming/` の元ファイルは削除(履歴には残る)。
   - **筐体以外の全素材の仮素材を生成**(ユーザー指示: 黒背景+白文字「●●（仮）」形式で後から差し替え可能に):
     - リール図柄 7 種(400x200 WebP、横長 2:1 で窓の 1 コマにフィット)
     - 液晶ステージ背景動画 12 種(WebM/VP9 1280x720、文字が明滅する 4 秒ループ)
     - 演出動画 2 種(カットイン弱・強)
     - BGM 12 種(ステージ別に周波数を変えたサイン波ループ OGG)/ SE 5 種(レバオン・停止・払出・レア役・ボーナス)
     - 生成スクリプトは `scripts/gen_placeholder_assets.py`(再実行で全再生成可能)
     - 全素材(40 件)を `src/assets/manifest.json` に出所付きで登録。参照は `src/assets/index.ts` の ID 経由(Vite import でビルド時存在チェック)
   - **Phase 2(リール制御)実装**: `src/core/reel.ts`
     - 20 コマ×3 リールのデータ駆動配列(SPEC 叩き台と一致)
     - 引き込み優先度探索方式の停止制御(`resolveStop`/`resolveSpin`)。優先度: 当選役引き込み > 蹴飛ばし > スベリ最小
     - 出目判定 `judgeDisplay`(中段ライン役 → 左リールチェリー弱/強)
     - 蹴飛ばしルール: 白7/チェリー揃い=禁止出目、チェリー非当選時は左窓内チェリー非表示(ベル・リプレイ引き込み時は例外)、左リール停止前の中・右テンパイ回避
     - **網羅テスト 18 件**: 全役 × 押下位置 20^3 × 全押し順 6 通りで「スベリ≤4」「当選役は引き込み可能なら必ず揃う」「非当選役は絶対揃わない」を検証。配列制約(ベル・リプレイ 100% 引き込み)も検証
   - **UI 更新**(`src/App.tsx`): 筐体画像に液晶動画・リール窓(図柄 3 コマ×3)をはめ込み表示。レバーオンで抽選→停止制御→出目・履歴表示。ステージ切替(12 種の仮動画/BGM 確認用)、BGM 再生/停止。音声は `src/platform/audio.ts` ラッパー経由
   - `docs/SPEC.md` に停止制御仕様を追記、`AGENTS.md` の Cloud 向けセットアップ手順を更新
10. AGENT #008: PR #9 が先にマージされたことで PR #7 / #8 が `docs/HANDOVER.md` で競合したため、両ブランチに main をマージして競合を解消(詳細は `docs/handover/008_pr7_pr8_conflict_resolution.md`)。

## 現在の状態

- **重要**: 本ブランチ(PR #8)と PR #7 は同じタスク(筐体取り込み + Phase 2 リール制御)を別アプローチで実装した並行 PR。`src/core/reel.ts` や `src/App.tsx` など 10 ファイル以上で互いに競合するため、**どちらか一方のみマージし、もう一方はクローズすること**。

- **Phase 1 完了、Phase 2 完了**(リール制御 + 網羅テスト)。Phase 3(遊技状態管理)は未着手。
- テスト 42 件全パス、lint/build 成功。
- ユーザーから Excel 仕様書が入稿される可能性あり(`incoming/specs/` またはチャット添付)。入稿されたら内容を `docs/SPEC.md` に反映し、`src/core/` の数値・テストとセットで整合させること。
- リポジトリ構成:
  - `src/core/` … rng / lottery / payout / **reel(新規)** — 全て単体テスト付き
  - `src/assets/` … 筐体(実素材)+ 仮素材 40 件 + `manifest.json` + `layout.ts`(はめ込み座標)+ `index.ts`(ID 参照)
  - `src/platform/audio.ts` … 音声再生ラッパー(exe 対応のための抽象化)
  - `src/App.tsx` … 筐体表示 + 1G 消化 + ステージ/BGM 確認ページ(本格 UI は Phase 4)
  - `scripts/` … `import_cabinet.py`(筐体取り込み)/ `gen_placeholder_assets.py`(仮素材再生成)
  - `incoming/` … README に素材・仕様書入稿ルールあり(現在入稿物なし)
- 仮素材の再生成に必要な環境: `pip install pillow numpy` + `sudo apt-get install -y fonts-noto-cjk`(日本語フォント)。ffmpeg は VM 導入済み。

## 次の AGENT へのタスク

ユーザーの指示内容を最優先とした上で、次を実施:

1. **`incoming/` に素材が入稿されていたら最優先で取り込む**(`docs/ASSET_GUIDELINES.md` の手順)。実素材が来たら `src/assets/` の同名仮素材ファイルを差し替え、`manifest.json` の該当エントリを `user-provided` に更新するだけでよい。
2. **Excel 仕様書(`incoming/specs/*.xlsx` 等)が入稿されていたら**: openpyxl(`pip3 install --user openpyxl`、VM は Python 3.12)で全シートを読み取り、内容を `docs/SPEC.md` へ反映。確率・配当・配列の数値は `src/core/` の実装・テストと必ずセットで更新する。数式セルは `load_workbook(path)` で数式文字列、`data_only=True` で計算済み値が取れる(後者は Excel 側で保存時に計算されている場合のみ)。
3. ユーザーから SPEC 叩き台(有効ライン・リール配列・確率・払い出し・停止制御の蹴飛ばしルール)への回答があれば反映。修正時は `src/core/` の数値・テストも必ずセットで更新。
4. **Phase 3(遊技状態管理)に着手**: `src/core/state.ts` に内部抽選状態 12 種の遷移(データ駆動テーブル)、メダル増減、ゲーム数管理、1 ゲームの通しフロー(BET → レバー → 抽選 → 停止 → 払い出し)を実装しテストする(`docs/DEVELOPMENT_PLAN.md` Phase 3 参照)。
5. 作業終了時に本ファイルを更新し、`docs/handover/008_*.md` に履歴を残す。

## 注意事項

- ブランチは `cursor/<説明>-<suffix>` 形式で作成し、**PR は必ず base を `main` にして作成すること**(suffix は環境から指示される)。
- **PR は 1 本ずつマージすること**。複数 AGENT が並行で同じファイル(特に本ファイル)を更新すると競合する。競合したら main をブランチへマージして解消する。
- `AGENTS.md` のルール(テスト実行、不要ファイル削除禁止、PR 用の簡潔なまとめ)を守ること。
- **確率・配当・配列などの数値は `docs/SPEC.md` と `src/core/` の実装を必ず一致させる**(テストが理論値・配列制約を参照しているため、片方だけの変更はテストで検出される)。
- リール配列(`REEL_LAYOUT`)や蹴飛ばしルールを変更したら、`src/core/reel.test.ts` の網羅テストが検出してくれる。テストの期待値計算(`expectedDisplay`)側の意図も理解した上で変更すること。
- ブラウザ API(音声・動画再生・永続化)は `src/platform/` のラッパー経由で使うこと(exe 対応のため)。
- 素材を追加する際は必ず `docs/ASSET_GUIDELINES.md` に従い、`manifest.json` に出所を登録すること。仮素材の差し替え時は ID・ファイル名を変えない(参照は `src/assets/index.ts` 経由のため差し替えだけで反映される)。
- チャンス目の停止形は未定義(叩き台では「特定の出目を持たずハズレと同じ停止制御」)。ユーザーと出目仕様を詰めるとよい。
