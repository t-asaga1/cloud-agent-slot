# 引継ぎ資料(最新)

- 作成者: AGENT #006(筐体画像取り込み + Phase 2 リール制御 + 筐体レイアウト試作)
- 作成日: 2026-07-05
- 履歴コピー: `docs/handover/006_cabinet_intake_and_reel_control.md`

## プロジェクト概要

パチスロアプリケーションを開発するプロジェクト。
**1 AGENT につきユーザーとのやり取りは 1 回のみ**。作業終了時に必ずこのファイルを更新し、`docs/handover/` に履歴コピーを残すこと(詳細ルールは `AGENTS.md` 参照)。

## これまでの経緯

1. AGENT #001: 開発計画 `docs/DEVELOPMENT_PLAN.md`(TS + React + Vite + Vitest、core/UI 分離、Phase 0〜5)。
2. AGENT #002: Web + exe(Tauri)両対応方針と `docs/ASSET_GUIDELINES.md`。
3. AGENT #003: 素材入稿フロー(`incoming/`)、リール 20 コマ・内部状態 12 種・演出別レイヤーの `docs/SPEC.md` 骨子。
4. AGENT #004: プロジェクト雛形 + Phase 1 コアロジック(`rng` / `lottery` / `payout` + テスト 24 件)、SPEC に確率・配列・ラインの叩き台を追記。
5. AGENT #005: PR チェーン(#3〜#5 の base 誤り)を解消する統合 PR を作成。main に docs / src / incoming がすべて反映済み。
6. AGENT #006(今回)が以下を実施:
   - **筐体画像の取り込み**(ユーザーが `incoming/cabinet/筐体.png` に入稿した完全オリジナル作品):
     - `scripts/intake_cabinet.py` を作成。水色エリア(液晶)とピンク矩形 3 枚(リール窓 左・中・右)を色マスク + 連結成分解析で自動検出し、該当エリアを透過に抜いた `src/assets/images/cabinet/cabinet_frame.webp`(236 KB、上限 500 KB 以内)と、はめ込み座標 `src/assets/cabinet_layout.json`(px と正規化比率)を生成。
     - `src/assets/manifest.json` に `origin: user-provided` / `license: project-original` で登録。参照用の `src/assets/index.ts` も作成。
     - 取り込み完了に伴い `incoming/cabinet/筐体.png` は削除(ガイドライン規定。Git 履歴には残る)。
     - 筐体下部パネルに機種名らしき「**義経物語**」の表記あり(機種名・世界観の確定はユーザーに未確認)。
   - **Phase 2(リール制御)実装** — `src/core/reel.ts`:
     - 20 コマ × 3 リールのデータモデル(`REEL_STRIPS`。SPEC の配列叩き台と一致)。
     - **引き込み優先度探索方式**の停止制御(`stopReel` / `stopAll`)。押下位置から最大 4 コマの 5 候補を探索し、「当選役を揃える > 非当選役ラインを生かさない > スベリ最小」。非当選役が揃う位置・誤チェリー出目になる位置は蹴飛ばし。押し順(第 1〜第 3 停止)対応。
     - 表示役判定 `judgeDisplay`(中段ライン → 左リールのチェリー形 → NONE)。
     - 停止形: BIG = 赤7 揃い / REG = 白7 揃い / 中段チェリー = 強・角チェリー = 弱。チャンス目の専用出目は**未定義**(現状ハズレ目と同じ)。
     - **網羅テスト 22 件**(`src/core/reel.test.ts`): 当選役 9 種 × 押し順 6 通り × 押下位置 20³ 通りで「引き込み可能なら必ず揃う/非当選役は絶対に揃わない/最大スベリ 4 コマ」を全数検証。配列の 100% 引き込み保証(ベル・リプレイ隙間 4 コマ以内)も静的検証。
   - **筐体レイアウト試作** — `src/ui/CabinetPrototype.tsx`:
     - 取り込んだ筐体フレームの液晶エリア・リール窓に、`cabinet_layout.json` の比率座標でコンテンツをはめ込み(位置ズレなしをブラウザで確認済み)。
     - レバーオン(役抽選)→ 停止ボタン 3 つで `core/reel` の停止制御がそのまま動く動作確認 UI 付き。図柄は暫定のテキスト/絵文字表示(図柄素材は未入稿)。
   - `docs/SPEC.md` に「2.1 停止制御」を追記、`AGENTS.md` の Cloud 向け節を現状に合わせて更新。

## 現在の状態

- **Phase 1 完了 + Phase 2 完了**(リール制御)。Phase 3(遊技状態管理)は未着手。
- テスト: **46 件全パス**(`npm test`)。lint / build も通る。
- リポジトリ構成:
  - `src/core/` … rng / roles / lottery / payout / **reel**(全て単体テスト付き)
  - `src/assets/` … 筐体フレーム WebP + はめ込み座標 JSON + manifest
  - `src/ui/CabinetPrototype.tsx` … 筐体レイアウト試作(暫定 UI)
  - `src/App.tsx` … 開発検証ページ(筐体試作 + Phase 1 動作確認)
  - `scripts/intake_cabinet.py` … 筐体画像取り込み(再実行可能。要 `pip install pillow numpy scipy`)
- 既知の制約・注意点:
  - **REG(白7)は左リールを最後に押したときだけ揃う**(左の白7 = 12 番の下段にチェリー = 11 番があり、誤チェリー出目防止の蹴飛ばしと干渉するため)。配列側の調整で解消可能(SPEC 2.1 参照)。
  - チャンス目の専用出目が未定義。定義が決まったら `reel.ts` の停止制御と `judgeDisplay` を更新すること。
  - 取りこぼし時の払い出しは「表示役」で決めるべきだが、Phase 1 の `calcPayout` は内部当選役を受け取る。Phase 3 のゲームフロー統合時に `judgeDisplay` の結果を渡すこと。
- 決定済みの方針(変更なし): Web 主軸 + Tauri exe(Phase 4.5)、素材はユーザー入稿第一、リール 20 コマ、内部状態 12 種、演出別レイヤー。

## 次の AGENT へのタスク

ユーザーの指示内容を最優先とした上で、次を実施:

1. **`incoming/` に素材が入稿されていたら最優先で取り込む**(`docs/ASSET_GUIDELINES.md` の手順)。特にリール図柄(1 図柄 1 ファイル)が入稿されたら、`CabinetPrototype` の暫定テキスト図柄を差し替える。
2. **Phase 3(遊技状態管理)に着手**: `src/core/state.ts` に内部状態 12 種の遷移(データ駆動テーブル)、メダル増減、ゲーム数管理を実装。1 ゲームの流れ(BET → レバー → 抽選 → 停止 → 表示役判定 → 払い出し)を通しで動かすテストを書く。取りこぼし時は `judgeDisplay` の表示役で払い出すこと。
3. SPEC 未確定事項(機種名「義経物語」の扱い、チャンス目出目、AT 管理方式、状態遷移テーブル)にユーザーから回答があれば反映。
4. 余力があれば REG の左最終停止制約の解消(リール配列調整。SPEC の表と `REEL_STRIPS`・テストをセットで更新)。
5. 作業終了時に本ファイルを更新し、`docs/handover/007_*.md` に履歴を残す。

## 注意事項

- ブランチは `cursor/<説明>-<suffix>` 形式で作成し、**PR は必ず base を `main`** にすること。
- `AGENTS.md` のルール(テスト実行、不要ファイル削除禁止、PR 用の簡潔なまとめ)を守ること。
- **確率・配当・リール配列などの数値は `docs/SPEC.md` と `src/core/` の実装を必ず一致させる**(網羅テストが配列から期待値を再計算するため、片方だけの変更はテストで検出される)。
- 素材の追加・変更は必ず `docs/ASSET_GUIDELINES.md` に従い、`src/assets/manifest.json` を更新すること。筐体画像を差し替える場合は `scripts/intake_cabinet.py` を再実行すれば座標 JSON ごと再生成される。
- ブラウザ API(音声・動画再生・永続化)は `src/platform/` のラッパー経由で使うこと(exe 対応のため)。
