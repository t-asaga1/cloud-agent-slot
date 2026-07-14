use tauri::{webview::WebviewWindowBuilder, WebviewUrl};

/// パチスロアプリ「義経物語」の Tauri シェル。
///
/// Linux(WebKitGTK)では 2 つの理由で動画・音声再生の回避策が必要(STEP 5a で実測。
/// Windows の WebView2(Chromium 系)はどちらの問題も無い):
///
/// 1. GStreamer にカスタムプロトコル tauri:// の URI ハンドラが無く、リリース
///    ビルドの背景・演出ムービー(WebM)や BGM/SE(Ogg)が
///    「No URI handler implemented for "tauri"」で再生できない
///    (tauri-apps/tauri#3725)。→ Linux リリースビルドのみ tauri-plugin-localhost
///    でフロントエンドを http://localhost:<空きポート> から配信する。
/// 2. 既定の playbin(2)では HTTP 配信の WebM(VP9)が再生開始またはループ境界で
///    ストール(非ループ動画 = 最初のフレームで停止 / loop 動画 = 1 周目の終端で
///    フリーズ)。playbin3 を使うと解消する(MP4/H.264 では発生しないため
///    WebM + matroskademux のバッファリング固有の問題。素の WebKitGTK でも再現)。
///    → WEBKIT_GST_USE_PLAYBIN3=1 を WebView 初期化前に設定する。
pub fn run() {
  #[cfg(target_os = "linux")]
  std::env::set_var("WEBKIT_GST_USE_PLAYBIN3", "1");

  #[allow(unused_mut)]
  let mut builder = tauri::Builder::default();

  #[cfg(all(target_os = "linux", not(debug_assertions)))]
  let port = portpicker::pick_unused_port().expect("failed to pick an unused port");
  #[cfg(all(target_os = "linux", not(debug_assertions)))]
  {
    builder = builder.plugin(tauri_plugin_localhost::Builder::new(port).build());
  }

  builder
    .setup(move |app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // tauri-plugin-localhost は "/" を index.html へ解決しない(500 を返す)ため
      // /index.html を明示する。
      #[cfg(all(target_os = "linux", not(debug_assertions)))]
      let url = WebviewUrl::External(
        format!("http://localhost:{port}/index.html")
          .parse()
          .expect("valid localhost url"),
      );
      #[cfg(not(all(target_os = "linux", not(debug_assertions))))]
      let url = WebviewUrl::App("index.html".into());

      // 横長 1 画面レイアウト(左 = 筐体 / 右 = 情報・開発用サイドパネル)に合わせる
      WebviewWindowBuilder::new(app, "main", url)
        .title("義経物語")
        .inner_size(1280.0, 900.0)
        .min_inner_size(900.0, 640.0)
        .build()?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
