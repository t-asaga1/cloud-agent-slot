# 引継ぎ資料(最新)

- 作成者: AGENT #012(実素材取り込み〈図柄 8 種 + 背景動画 7 本〉+ 完成ロードマップ策定)
- 作成日: 2026-07-10
- 履歴コピー: `docs/handover/012_asset_intake_and_roadmap.md`

## プロジェクト概要

パチスロアプリケーション「**義経物語**」を開発するプロジェクト。
**1 AGENT につきユーザーとのやり取りは 1 回のみ**。作業終了時に必ずこのファイルを更新し、`docs/handover/` に履歴コピーを残すこと(詳細ルールは `AGENTS.md` 参照)。

## 最重要: 仕様の正

- **`docs/specs/義経物語_仕様_260709.xlsx` が正式仕様(マスター)**。
- ただし **2026-07-10 のユーザー回答 16 件(`docs/SPEC.md`「13. 確定事項」)は Excel より優先**(Excel 誤植の訂正を含む)。
- 有効ラインは横 3 + 斜め 2 の 5 ライン。タイミング目押しあり。チェリー・スイカ・リーチ目 7 揃いは取りこぼし許容。設定差なし。
- **完成までの実行プランは `docs/ROADMAP.md`**(AGENT #012 作成。ユーザー提示済み)。

## これまでの経緯

1. AGENT #001〜#005: 開発計画策定(TS + React + Vite + Vitest)、Web + exe(Tauri)両対応方針、素材入稿フロー(`incoming/`)、Phase 1 コアロジック、main への統合。
2. AGENT #006: Excel 仕様書の入稿方法を整備(PR #9)。
3. AGENT #007〜#008: 筐体画像取り込み、仮素材 40 件生成、Phase 2 リール制御(旧叩き台)、PR 競合解消。
4. AGENT #009: Excel 本仕様書(全 16 シート)を `docs/SPEC.md` へ全転記。質問 17 件を送付。
5. AGENT #010: 回答 13 件を反映し、`src/core/` を Excel 仕様へ整合。Phase 3 の抽せんテーブル(`mode.ts` / `background.ts` / `omen.ts` / `at.ts`)をデータ駆動で実装。
6. AGENT #011: 残り 3 件の回答を反映(リーチ目取りこぼし / 背景移行の優先順位と 30G リセット / 純増確定)。大容量ファイルのプッシュ手順を `incoming/README.md` に追記。
7. **AGENT #012(今回)**: ユーザーが main へ直接プッシュした実素材を取り込み + 完成ロードマップを策定:
   - **図柄画像 8 種**(赤7 / 黒バー / 白バー / ベル / スイカ / チェリー / リプレイ / ブランク)を 480px 幅の透過 WebP へ変換し `src/assets/images/reels/` へ。旧仮素材(白7 / BAR)は削除し、`ReelSymbol` を Excel の 8 図柄(`SEVEN_RED` / `BAR_BLACK` / `BAR_WHITE` / `BELL` / `WATERMELON` / `CHERRY` / `REPLAY` / `BLANK`)へ改名(配列自体は旧叩き台のまま = STEP 1 で本対応)。
   - **背景動画 7 本**(義経 / 静 / 弁慶 / 夕方 / 前兆 / AT / 上位 AT)を VP9 WebM 720p・音声なし(約 2〜4.3 MB)へ変換し `src/assets/video/stage/` へ。旧ステージ 12 種の仮動画は削除。
   - `StageId` を SPEC「5.」の 9 種(通常背景 5 + AT 小役/バトル + 上位 AT 小役/バトル)へ再定義。AT / 上位 AT はパート別動画が未入稿のため 1 本を両パートで暫定共用。`STAGE_FOR_BACKGROUND`(core の `Background` → `StageId`)を追加。
   - **`docs/ROADMAP.md` を新規作成**(完成までの STEP 1〜6 とユーザーへの素材・仕様依頼リスト)。
   - テスト 81 件全パス、lint / build 成功。ブラウザで実素材の表示確認済み。

## 現在の状態

- Phase 1〜2 完了 + Phase 3 の抽せんテーブル層が完了(状態遷移の通しフロー = ステートマシンは未実装)。
- **`reel.ts` は暫定のまま**: 旧叩き台の配列 + 中段 1 ライン。図柄名だけ Excel の 8 種に改名済み。Excel 配列 + 5 ライン + 確定停止挙動への書き直しが **ROADMAP STEP 1(最優先)**。
- 素材: 筐体・図柄 8 種・背景動画 7 本は実素材。**BGM/SE・カットインは仮素材のまま**。AT/上位 AT のパート別動画、連続演出動画は未入稿(ユーザーへ依頼済み。ROADMAP「ユーザーに依頼したいもの」参照)。
- 仕様の未確定事項は `docs/SPEC.md`「14.」の 3 件(演出リスト確定版・白バー/ブランクの役割・30G の暫定値)。

## 次の AGENT へのタスク

ユーザーの指示内容を最優先とした上で、`docs/ROADMAP.md` の順に進める:

1. **STEP 1: `reel.ts` の本対応**(Excel 配列 + 5 有効ライン + 役別停止形 + DDT + 網羅テスト再設計)。大きい作業なので 1 AGENT はこれに集中してよい。
2. STEP 2: 1 ゲーム通しフローのステートマシン(`state.ts`)。
3. `incoming/` に新素材が入稿されていたら最優先で取り込む(`docs/ASSET_GUIDELINES.md`)。
4. 作業終了時に本ファイルを更新し、`docs/handover/013_*.md` に履歴を残す。

## 注意事項

- ブランチは `cursor/<説明>-<suffix>` 形式で作成し、**PR は必ず base を `main` にして作成すること**。
- **PR は 1 本ずつマージすること**(本ファイルが競合しやすい)。競合したら main をブランチへマージして解消する。
- `AGENTS.md` のルール(テスト実行、不要ファイル削除禁止、PR 用の簡潔なまとめ)を守ること。
- **確率・配当・配列などの数値は SPEC.md(Excel + 確定事項)と `src/core/` の実装を必ず一致させる**。抽せんテーブルは分母付き整数(10000 / 100 / 1000)で持ち、行合計 = 分母をテストで検証している。
- 背景移行の 30G は `BACKGROUND_ELAPSED_GAMES`(`src/core/background.ts`)で定数化済み。
- 実在機種の素材・画像の流用は禁止。
- ブラウザ API(音声・動画再生・永続化)は `src/platform/` のラッパー経由で使うこと(exe 対応のため)。
- 素材追加時は `docs/ASSET_GUIDELINES.md` に従い `manifest.json` に出所を登録し、取り込み後は `incoming/` の元ファイルを削除すること(履歴には残る)。
- 動画変換の目安: `ffmpeg -i in.mp4 -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" -an -c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 -cpu-used 4 -pix_fmt yuv420p out.webm`(今回 17〜33 MB の mp4 が 2〜4.3 MB になった)。
