# 夏祭りの絵日記 🎆

日記を書くと、Gemini（または無料の Pollinations）がその情景を読み取って
日本の夏祭りのイラストに描き、絵と日記を 1 枚の作品として保存できるアプリです。（React + Vite）

---

## すぐに起動する手順（VS Code）

1. この ZIP を解凍し、フォルダ `natsu-enikki` を **VS Code で開く**
   （メニュー → File → Open Folder…）

2. VS Code のターミナルを開く（メニュー → Terminal → New Terminal）

3. 依存パッケージをインストール
   ```bash
   npm install
   ```

4. APIキーを設定
   - `.env.example` を **`.env`** という名前でコピー
   - `.env` を開き、`GEMINI_API_KEY` にあなたの Gemini APIキーを入れる
   - キーは https://aistudio.google.com/apikey で発行できます
   ```bash
   cp .env.example .env   # macOS / Linux
   # Windows(PowerShell) は: copy .env.example .env
   ```

5. 開発サーバーを起動
   ```bash
   npm run dev
   ```
   ブラウザで http://localhost:5173 が自動で開きます。

> **メモ**：APIキーを入れなくても画面（UI）はすぐ表示されます。
> エンジンを「Pollinations(無料)」にすればAPIキーなしでも絵を生成できます。
> 「Gemini(高品質)」で生成するには APIキーが必要です。

---

## APIキーの扱いについて

- APIキーは **`.env`（サーバー側）だけ** に置きます。ブラウザには一切渡しません。
- フロントエンドは `/api/gemini/v1beta/models/gemini-2.5-flash-image:generateContent` を呼び、
  Vite の開発サーバーが `https://generativelanguage.googleapis.com` へ中継しつつ、
  キーをヘッダーに付けます（設定は `vite.config.js`）。
- 絵の生成にはあなたの Gemini の利用枠（API のクレジット）が消費されます。
  Pollinations エンジンはAPIキー不要・無料です。

---

## 日記の保存機能（Supabase・任意）

ログインして「日記を保存」すると、書いた日記本文をクラウド（Supabase）に保存できます。
使わなくてもアプリの他の機能（絵を描く等）には影響しません。

1. [supabase.com](https://supabase.com/) で無料アカウントを作成し、新しいプロジェクトを作成
2. プロジェクトの **Project Settings → API** を開き、
   - `Project URL`
   - `anon public` キー
   をコピー
3. `.env` に追記
   ```
   VITE_SUPABASE_URL=あなたのProject URL
   VITE_SUPABASE_ANON_KEY=あなたのanon publicキー
   ```
4. Supabaseダッシュボードの **SQL Editor** を開き、[`supabase/schema.sql`](supabase/schema.sql) の内容を貼り付けて実行
   （`diary_entries` テーブルと、本人の日記だけ読み書きできる権限設定が作られます）
5. `npm run dev` を再起動（`.env` を変更したときは再起動が必要です）

画面上部の「ログイン / 新規登録」からユーザー名・メールアドレス・パスワードで登録できます。
新規登録すると確認メールが届くので、メール内のリンクを開いてから「ログイン」してください。
（すぐに試したい場合は、Supabaseダッシュボードの **Authentication → Providers → Email** で
「Confirm email」をオフにすると、確認メールなしでそのままログインできます。）

---

## エンジンの変更

画面右の「エンジン」で切り替えられます（初期値は Gemini）。

| 表示                | 用途                             |
| ------------------- | -------------------------------- |
| Gemini(高品質)      | `gemini-2.5-flash-image`。要APIキー |
| Pollinations(無料) | `flux`モデル。APIキー不要        |

Gemini側のモデルIDを変更したい場合は、`src/App.jsx` の `fetchGeminiImage` 内の
エンドポイントURLを編集してください。利用可能なモデルは
公式ドキュメントで確認してください：https://ai.google.dev/gemini-api/docs/models

---

## Claude Code for VS Code で編集する

このフォルダを VS Code で開いた状態で Claude Code を起動すると、
`src/App.jsx` を対象に「花火の色を増やして」「屋台のシルエットを足して」等の
指示でそのまま改修できます。変更は `npm run dev` の画面に即時反映されます。

---

## スマホアプリ化(PWA)

このアプリはPWA(Progressive Web App)対応済みです。ビルドして配信すると、
スマホのブラウザから「ホーム画面に追加」でき、アイコンをタップするとブラウザのUIなしで
アプリのように起動します(iOS Safari / Android Chrome 両対応)。オフライン時も
一度読み込んだ画面はある程度表示できます。

- 開発中(`npm run dev`)はPWA機能(Service Worker)は動きません。確認するには
  `npm run build && npm run preview` で本番相当のビルドを起動してください
- マニフェスト・アイコンの設定は `vite.config.js` の `VitePWA({...})` と
  `public/icons/` にあります。アイコンを変更したい場合はここを差し替えてください
- 実際にスマホの「ホーム画面に追加」を試すには、スマホからアクセスできる場所に
  デプロイ(Vercel/Netlifyなど)するか、同じWi-Fi内で `npm run preview -- --host` して
  スマホからPCのIPアドレスにアクセスしてください(PWAはHTTPS、またはlocalhostでのみ動作します)

---

## ビルド（配布用）

```bash
npm run build     # dist/ に静的ファイルを生成
npm run preview   # ビルド結果をローカル確認
```

> 本番公開する場合、`vite.config.js` の開発用プロキシは使われません。
> APIキーを安全に扱うための **サーバー側の中継（バックエンドや関数）** を別途用意してください。
> APIキーをフロントエンドに埋め込まないでください。

---

## 構成

```
natsu-enikki/
├─ index.html
├─ package.json
├─ vite.config.js       # APIキーを注入する開発プロキシ
├─ .env.example         # → .env にコピーしてキーを設定
├─ .gitignore
├─ supabase/
│  └─ schema.sql        # 日記保存用テーブルのSQL（Supabaseで実行）
└─ src/
   ├─ main.jsx
   ├─ App.jsx           # アプリ本体
   └─ supabaseClient.js # Supabaseクライアント設定
```
