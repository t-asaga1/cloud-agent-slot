# incoming — 素材入稿用ディレクトリ

ここは**ユーザーが素材をアップロードするための一時置き場**です。
詳細な手順・推奨フォーマットは `docs/ASSET_GUIDELINES.md` の「3. 素材のアップロード(入稿)方法」を参照してください。

## 使い方(簡易版)

1. このディレクトリの下に、内容がわかるフォルダ/ファイル名で素材を置く(日本語名のままで OK、zip でも OK)。

   ```
   incoming/
     cabinet/   筐体.png
     reels/     図柄_赤7.png, 図柄_ベル.png, ...
     video/     通常A背景.mp4, カットイン01.mp4, ...
     bgm/       通常A.wav, AT中.wav, ...
     se/        レバオン.wav, 払い出し.wav, ...
     specs/     設計仕様書.xlsx, 確率テーブル.xlsx, ...
   ```

2. 各ファイルが「どの状態・どの用途向けか」をこの README に追記するか、AGENT への指示文に書く。
   - 例: 「`通常A背景.mp4` は通常ステージ A のループ背景」
3. コミット & プッシュして PR を作る(GitHub Web UI の `Add file → Upload files` が簡単)。
4. 次の AGENT に「incoming の素材を取り込んで」と指示する。

## 仕様書(Excel など)の入稿について

素材だけでなく、**設計仕様書(xlsx / xls / csv / pdf など)もこのディレクトリに置いて OK** です(`incoming/specs/` 推奨)。

- AGENT は VM 上で Python(openpyxl 等)を使って xlsx の全シート・セル・数式を読み取れます。数値テーブル(確率・配当・リール配列など)は Excel のまま渡すのが確実です。
- 入稿時は「どのシートが何の仕様か」「どの値を正とするか」を AGENT への指示文に一言添えてください。
- 取り込んだ AGENT は内容を `docs/SPEC.md` 等の Markdown に反映し、`src/core/` の実装・テストと数値を一致させます(原本の Excel は Git 履歴に残ります)。
- チャット添付でも渡せますが、次の AGENT 以降も参照できるよう **リポジトリにコミットする方法を推奨**します。

## 注意

- 1 ファイル 100 MB 未満(GitHub 制限)。動画が大きい場合は 720p 程度に落としてください。
- 合計 100 MB を超えそうなら PR を分割してください。
- 取り込み完了後、このディレクトリ内の素材ファイルは AGENT が削除します(Git 履歴には残ります)。

## 容量の目安と拡張手段(2026-07 時点の GitHub 制限)

- **1 ファイルの上限**: 100 MiB(超えるとプッシュがブロックされる)。50 MiB 超で警告。**ブラウザの Upload files は 25 MiB まで**なので、大きいファイルは git コマンド(または GitHub Desktop)でプッシュする。
- **リポジトリ全体**: ハード上限はないが、推奨は 1 GB 未満・強い推奨で 5 GB 未満(超えると clone/CI が遅くなり、GitHub から是正依頼が来ることがある)。
- **1 回のプッシュ**: 2 GB まで。
- **拡張手段**:
  1. **入稿前に圧縮**(推奨・まずはこれ): 背景ループ動画は WebM(VP9)720p・4〜8 秒ループにすれば 1 本数 MB 程度に収まる。ffmpeg での変換は AGENT 側でも実施できるので、原本が大きい場合は「圧縮して取り込んで」と指示すれば OK。
  2. **Git LFS**: 100 MiB 超のファイルを扱う場合の標準手段。無料枠はストレージ・帯域とも 10 GiB/月(Free/Pro。従量課金で拡張可能)。ただし取り込み後の配信用素材は結局リポジトリ内の圧縮版を使うため、原本アーカイブ用途向け。
  3. **GitHub Releases**: リリース添付ファイルとして置く場合、合計サイズ・帯域は無制限(1 ファイルは LFS 上限と同じ 2 GB まで)。原本(高解像度マスター素材)の保管場所として有効。
- **本プロジェクトの運用方針**: 原本をそのままコミットせず、`incoming/` には**取り込み可能なサイズ(1 ファイル 100 MB 未満、可能なら 25 MB 未満)に落とした版**を置く → AGENT が Web 配信向けに再圧縮して `src/assets/` へ取り込み、`incoming/` の元ファイルは削除する(履歴には残る)。履歴の肥大化が問題になったら原本は Releases か LFS へ移す。

## 25 MiB 超のファイルをプッシュする方法(git コマンド / GitHub Desktop)

ブラウザの「Upload files」は 25 MiB までなので、それを超えるファイル(〜100 MiB 未満)は以下のどちらかでプッシュする。

### 方法 A: GitHub Desktop(コマンド不要・推奨)

1. [GitHub Desktop](https://desktop.github.com/) をインストールし、GitHub アカウントでサインインする(初回のみ)。
2. `File → Clone repository...` で本リポジトリ(`t-asaga1/cloud-agent-slot`)を選び、クローンする(初回のみ)。2 回目以降は左上でリポジトリを選ぶだけでよい。
3. 2 回目以降は、作業前に上部の `Fetch origin` を押してリポジトリを最新化する(裏で他 AGENT の PR がマージされているため)。
4. エクスプローラー/Finder でクローン先フォルダを開き(`Repository → Show in Explorer`)、`incoming/video/` など適切なフォルダに動画ファイルをコピーする。
5. GitHub Desktop に戻ると左側の Changes に追加ファイルが表示される。左下の Summary 欄にコミットメッセージ(例: `背景動画を入稿`)を入力し、`Commit to main` を押す。
6. 上部の `Push origin` を押す。これでリポジトリに反映される(main 直接コミットで OK。ブランチを切りたい場合は `Branch → New branch` を先に実行し、Push 後に表示される `Create Pull Request` を押す)。

### 方法 B: git コマンド

```bash
# 初回のみ: クローン
git clone https://github.com/t-asaga1/cloud-agent-slot.git
cd cloud-agent-slot

# 2 回目以降は最新化してから作業
git pull origin main

# ファイルを置く(例: 背景動画)
#   エクスプローラーでコピーするか、以下のようにコマンドでコピー
cp /path/to/通常A背景.mp4 incoming/video/

# コミットしてプッシュ
git add incoming/
git commit -m "背景動画を入稿"
git push origin main
```

- 認証を求められたら GitHub のユーザー名と **Personal Access Token**(パスワードの代わり。GitHub → Settings → Developer settings → Personal access tokens で発行)を入力する。GitHub Desktop でサインイン済みなら、同じ PC のコマンドラインでも認証が共有されることが多い。
- 100 MiB 以上のファイルはどちらの方法でもプッシュがブロックされるので、事前に圧縮するか分割する(上記「容量の目安と拡張手段」参照)。
- プッシュ後は AGENT に「incoming の素材を取り込んで」と指示すれば取り込まれる。
