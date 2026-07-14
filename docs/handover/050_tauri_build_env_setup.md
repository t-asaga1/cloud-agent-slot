# 履歴 050: STEP 5b 前の Tauri ビルド環境整備

- 作成者: AGENT #050
- 作成日: 2026-07-14
- 種別: 環境整備 + テスト 1 件の flaky 修正(コアロジック・UI は無変更)

## 依頼内容

「STEP 5b に進む前に、このリポジトリで `npm run tauri:build` が動くように環境を整備してほしい。必要なもの: `rustup update stable && rustup default stable`(1.97 以上)、apt の WebKitGTK 系依存、可能なら `src-tauri` の初回 `cargo build --release` 実行によるキャッシュ作成」

## 実施内容

### 1. Rust toolchain の更新

- `rustup update stable && rustup default stable` で **1.83.0 → 1.97.0** へ更新(約 11 秒)。
- 1.97.0 は STEP 5a(履歴 049)の動作確認済みバージョンと同一。

### 2. apt 依存の導入

- `sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`(約 23 秒)。
- 実機確認用に `pulseaudio pulseaudio-utils` も追加導入し、null sink をロード(`pulseaudio --start` + `pactl load-module module-null-sink`)。

### 3. 初回 `npm run tauri:build` によるキャッシュ作成

- クリーンビルド **約 2 分 22 秒**で成功。Linux リリースバイナリ(`src-tauri/target/release/yoshitsune-monogatari`)+ バンドル 3 種(deb / rpm / AppImage)を生成。
- キャッシュサイズ: `src-tauri/target` 約 1.9GB / `$CARGO_HOME`(`/usr/local/cargo`)約 223MB。
- キャッシュ効果の実測: 2 回目の `cargo build --release` は**約 23 秒**。

### 4. ビルド成果物の実機確認

- リリースバイナリを VM のデスクトップ(DISPLAY :1)で起動し、computerUse で確認: 筐体描画・背景動画ループ再生・レバーオン → 停止ボタン 3 つでの 1G 消化・メーター表示、いずれも正常(console 致命エラーなし)。

### 5. テスト 1 件の flaky 修正(コード変更はこれのみ)

- `src/ui/gameCycle.test.ts` の「仮押し順が実際の押し順と一致する押し順では resolveSpin と完全に同じ出目になる」テスト(9 役 × 3 押し順 × 20³ 押下位置の全数比較)が、フルスイート並列実行時にデフォルトタイムアウト 5000ms をわずかに超えて失敗することがあった(実測 5.3 秒。単独実行では約 3 秒でパス = 環境負荷起因の flaky)。
- テスト定義に `{ timeout: 20_000 }` を明示指定。**テスト内容・検証範囲は無変更**。

## 検証結果

- テスト 323 パス(17 ファイル)/ lint(oxlint)グリーン / `npm run tauri:build` 成功(バンドル 3 種)。

## 次の AGENT への注意

- **VM への環境導入はこのランの VM 限り**。別ランで `tauri:build` を使う場合は同じセットアップが再度必要(手順と所要時間は `docs/HANDOVER.md` の「Cursor Cloud 環境セットアップ更新の要否」参照)。
- 恒久化するには cursor.com/onboard の env setup agent で環境イメージを更新する(#049 から提案済み。今回の実測値がそのまま設定の参考になる)。
- 次タスクは **STEP 5b(CI ビルド + 配布)**(`docs/ROADMAP.md` / HANDOVER「次の AGENT へのタスク」参照)。
