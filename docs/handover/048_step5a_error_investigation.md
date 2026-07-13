# 履歴 048: STEP 5a 依頼ランの ERROR 終了の原因調査

- 作成者: AGENT #048
- 作成日: 2026-07-13
- 種別: 障害調査(コード変更なし。ドキュメントのみ)

## 依頼内容

「step5e 進行にてエラーが発生しました。原因調査してください」+ ラン起動時のログ(`Failed to create recording directory /opt/cursor/artifacts/` の ERROR を含む desktop init ログ)の貼り付け。

※ STEP 5 に「5e」は存在しない(5a / 5b の 2 分割 = AGENT #047 の計画)。ERROR 終了したランは「Roadmap step5a」(bc-11a6fcd6-c96a-4d22-b27f-5c8312bc3aa4。STEP 5a = Tauri 導入の依頼)で、これが調査対象。

## 調査方法

Cloud Agent 診断 API(`cursor-cloud` MCP)で当該ランのメタデータ・セットアップログ・トランスクリプト・差分メタデータを取得し、正常完了した直近ラン 2 本(AGENT #046 = STEP 4e / AGENT #047 = STEP 5 計画)のセットアップログと比較した。

## 結論

### 1. 貼り付けられたログの ERROR は失敗原因ではない(無害な既知警告)

`ERROR Failed to create recording directory /opt/cursor/artifacts/ - screen recording may not work` は、**正常完了したラン(#046・#047)の起動ログにも全く同じものが 2 件ずつ記録されている**。

- 原因は Cursor Cloud VM 起動時の並行処理の競合: セットアップの `create-artifacts-dir` ステップ(`rm -rf` → `mkdir -p /opt/cursor/artifacts/`)と exec-daemon の起動(`ensureDirWithDataDirPolicy`)がほぼ同時に走る。
- 直後のログで `INFO Artifacts assets directory created/verified: /opt/cursor/artifacts/assets` / `INFO Artifacts: setting up artifact upload manager` と成功しており、画面録画・アーティファクトのアップロードを含めエージェントの動作に影響しない。
- 本調査ラン(#048)の VM でも `/opt/cursor/artifacts/` は正常に存在・書き込み可能。

### 2. 実際の障害 = ランが会話開始前にサービス側で打ち切られた(一過性障害)

当該ラン bc-11a6fcd6 のタイムライン(UTC):

| 時刻 | 出来事 |
|---|---|
| 21:16:27〜21:16:39 | VM(ポッド)起動・環境セットアップ。`npm install` 含め全ステップ exit code 0 で正常完了 |
| 21:32:20 | ラン作成(ユーザーが STEP 5a を依頼) |
| 21:32:50 | 最終メッセージアクティビティ |
| 21:32:56 | ステータス ERROR(作成から 36 秒) |

- **トランスクリプトは完全に空(メッセージ 0 件)**。エージェントは最初の応答(思考・ツール呼び出し)を一切生成していない。
- ブランチ作成なし・コミットなし・コード変更なし・PR なし。
- リポジトリ・環境・依頼文に問題はない(セットアップは全て成功。直前・直後の別ランは同一環境で正常動作)。
- 履歴 014 で調査した ERROR 事例(STEP 1 の巨大スコープ → 思考肥大化 → 応答生成の繰り返し失敗)とはパターンが異なる。今回は開始直後・応答ゼロの即死で、**Cursor Cloud サービス側の一過性障害**と判断。

### 3. 対処: 同じ依頼文で再依頼すれば OK

- 失われた成果物はゼロ。再試行は安全。
- スコープ分割・依頼文の変更などの対策は不要(#014 の事例とは原因が異なるため)。
- 念のため現 main(96c4432)で `npm test` 323 件全パス・lint グリーンを確認済み。

## 次の AGENT へ

`docs/HANDOVER.md` の「次の AGENT へのタスク」どおり、STEP 5a(Tauri 導入 + ローカル動作確認)を再依頼・着手してよい。
