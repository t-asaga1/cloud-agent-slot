# 履歴 049: STEP 5a = Tauri 導入 + ローカル動作確認

- 作成者: AGENT #049
- 作成日: 2026-07-14
- 種別: 実装(`src-tauri/` 新設 + npm scripts。コアロジック・UI・テストは無変更)

## 依頼内容

「ロードマップstep5aを開始してください」(前回の同依頼ランはサービス側の一過性障害で ERROR 終了 = 履歴 048。今回は再依頼)。

## 実施内容

### 1. 環境構築(VM)

- Rust toolchain を stable 1.97.0 へ更新(`rustup update stable && rustup default stable`)。VM 既存の 1.83.0 は依存クレートの `edition2024` 要求でビルド不可だった。
- apt で WebKitGTK 開発依存を導入: `libwebkit2gtk-4.1-dev` `build-essential` `libxdo-dev` `libssl-dev` `libayatana-appindicator3-dev` `librsvg2-dev` 等。
- 実機確認用に PulseAudio null sink を導入(音声デバイス無しの VM で GStreamer のオーディオパイプラインが失敗しないようにするため)。

### 2. Tauri 2.x scaffold

- `src-tauri/` 新設: `tauri.conf.json`(productName = yoshitsune-monogatari / identifier = jp.cloudagent.yoshitsune / `frontendDist` = `../dist` / `beforeBuildCommand` = `npm run build` / アイコンは Tauri 既定の仮)。
- ウィンドウは conf ではなく Rust 側(`lib.rs` の `WebviewWindowBuilder`)で生成(760×1000・最小 520×720。筐体 1 カラム UI に合わせたサイズ)。Linux リリースビルドだけ URL を切り替える条件分岐のため。
- `@tauri-apps/cli` を devDependencies へ追加し、npm scripts `tauri` / `tauri:dev` / `tauri:build` を追加。**既存の `dev` / `build` / `test` / `lint` は無変更**(Web 版フローを壊していない)。
- `.gitignore` へ `src-tauri/target` / `src-tauri/gen/schemas` を追加。

### 3. Linux(WebKitGTK)のメディア再生問題 2 件を実測・解決

いずれも `src-tauri/src/lib.rs` に理由コメント付きで実装。**Windows の WebView2(Chromium 系)は別系統でどちらの問題も無く、`cfg(target_os = "linux")` の条件コンパイルで Windows ビルドから自動除外される**。

1. **GStreamer に `tauri://` の URI ハンドラが無い**: リリースビルドの背景・演出ムービー(WebM)/ BGM・SE(Ogg)が「No URI handler implemented for "tauri"」で全滅(tauri-apps/tauri#3725)。
   → Linux リリースビルドのみ `tauri-plugin-localhost`(+ `portpicker` で空きポート)でフロントエンドを `http://localhost:<port>/index.html` から配信。プラグインは "/" を index.html へ解決しない(500 を返す)ため URL に `/index.html` を明示。
2. **既定の playbin(2)では HTTP 配信の WebM(VP9)がストール**: 非ループ動画 = 最初のフレームで停止 / loop 動画 = 1 周目終端でフリーズ。MP4/H.264 は正常 = WebM + matroskademux 固有。素の WebKitGTK 単体(Tauri なし)でも再現 = Tauri 起因ではない。
   → `WEBKIT_GST_USE_PLAYBIN3=1` を WebView 初期化前に設定して解消。

### 4. デスクトップ実機確認(録画あり)

リリースビルドのバイナリ(`src-tauri/target/release/yoshitsune-monogatari`)を Linux デスクトップで起動し確認:

- 背景動画のループ再生 / リール回転・停止(キーボード Space・Z/X/C)/ メーター表示
- 前兆シナリオ予告・小役示唆予告ムービーの再生
- 本前兆 → 連続演出 4G → 勝利 → AT 突入の通しフロー
- console エラーなし

### 5. 既知の VM 限定の制約(コード起因ではない)

- **AT 突入後のステージ動画が黒画面になることがある**: GPU 無し(llvmpipe ソフトウェアレンダリング)+ 音声デバイス無しの VM で、動画プレイヤーを多数生成した後の新規 `<video>` 要素で発生する WebKitGTK 固有事象。ロジック・UI・メーターは正常動作。
- **音声はダミーシンクで再生** = 実音は VM では確認不可。
- どちらも Windows(WebView2)では別系統のため、**5b の実機確認チェックリストで確認する**こと。

## 検証結果

- `npm test` 323 パス(既存に影響なし)/ `npm run lint` / `npm run build` グリーン。
- `npm run tauri:build` で Linux リリースバイナリ + deb/rpm 生成を確認。

## Cursor Cloud 環境セットアップ更新の要否 = 要

Rust stable(1.97 以上)+ apt の WebKitGTK 依存 + 初回 `cargo build --release`(約 4 分)が毎回必要になるため、cursor.com/onboard の env setup agent での更新を推奨(具体パッケージは HANDOVER「次の AGENT へのタスク」参照)。

## 次のタスク

- **STEP 5b(CI ビルド + 配布)**: GitHub Actions(`windows-latest`)で Windows exe を自動ビルド(タグ push + `workflow_dispatch`)。`docs/STEP5_VERIFICATION.md`(Windows 実機確認の手順書)を作成しユーザーへ確認依頼。
- 実素材が `incoming/` に入稿されたら STEP 4f を優先(従来ルールどおり)。
