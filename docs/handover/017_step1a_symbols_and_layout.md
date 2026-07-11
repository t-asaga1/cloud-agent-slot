# 引継ぎ 017: STEP 1a = 図柄 8 種化 + Excel 配列差し替え(データ層)

- 作成者: AGENT #017
- 作成日: 2026-07-11
- 本内容は作成時点の `docs/HANDOVER.md` のコピー(履歴用)。最新は常に `docs/HANDOVER.md` を参照。

## 実施内容(要約)

`docs/ROADMAP.md` の STEP 1a を実装した。

1. **`ReelSymbol` を 8 種へ変更**(`src/core/reel.ts`):
   - `SEVEN_RED` / `BAR_BLACK` / `BAR_WHITE` / `BELL` / `WATERMELON` / `CHERRY` / `REPLAY` / `BLANK`
   - `SEVEN_WHITE` 廃止、`BAR` を黒バー/白バーへ分離、ブランク新設。
2. **`REEL_LAYOUT` を SPEC「3.」の Excel 20 コマ配列へ差し替え**:
   - **コマ番号規約: index = コマ番号 - 1**(index 0 = コマ 1、index 19 = コマ 20)。
   - SPEC の表はコマ 20 → 1 の降順記載。リールは下方向回転で index p+1 が上段のため、表の見た目(コマ番号が大きいほど上)と窓の並びが一致する(`REEL_LAYOUT` の JSDoc に明記)。
3. **`src/assets/index.ts` の `SYMBOL_IMAGES` を正式 8 図柄マッピングへ**:
   - SEVEN_WHITE→白バー画像・BAR→黒バー画像の仮割り当てを解消。
   - `SYMBOL_BLANK_URL` を廃止し `BLANK` をマップへ組み込み。
   - `App.tsx` はコード変更不要(`Record<ReelSymbol, string>` 経由で追随)。
4. **配列検算テスト新設**(`src/core/reel.test.ts`):
   - SPEC 配列表(コマ 20→1 の降順)との全コマ一致。
   - 各リールの図柄個数 / 赤7・黒バー・白バー各 1 個 / ブランク 左 2・中 0・右 1。
   - ベル全リール最大間隔 5 以内(100% 中段引き込み)/ 左スイカ・中右リプレイ・右チェリーも 100%。
   - **左リプレイ最大間隔 6(コマ 12⇔18)**= 中段 1 ラインでは 100% 不可、窓内 7 コマ範囲なら全押下位置から到達可(5 ライン併用の前提を検算)。
   - 中・右スイカ / 左・中チェリーは取りこぼし発生配置。
5. **旧・中段 1 ライン前提の停止制御網羅テスト 2 describe を TODO 付き `describe.skip`**:
   - 新配列では前提(左リプレイの中段 100% 引き込み等)が成立しないため。
   - 1c〜1e で 5 ライン対応の新網羅テストへ置換し、1e で skip 残ゼロにする。
   - 停止制御ロジック(`resolveStop` / `judgeDisplay`)自体は未変更(1b〜1e の作業)。

## 検証結果

- `npm test`: 77 パス + 10 skip(旧網羅テスト)
- `npm run lint` / `npm run build`: グリーン
- ブラウザ(dev サーバー)でレバーオン 10G 消化・8 図柄の表示・ゲーム履歴記録を確認。console エラーなし。

## 次の AGENT へ

- **STEP 1b(5 ライン表示判定)から順に 1 つずつ実施**。詳細は `docs/HANDOVER.md`「次の AGENT へのタスク」と `docs/ROADMAP.md` を参照。
- 1 AGENT = 1 サブステップ = 1 PR を厳守(STEP 1 一括実施は過去 2 回 ERROR 終了)。
