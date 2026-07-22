# 夏祭りの絵日記 🎆

日記を書くと、Claude がその情景を読み取って日本の夏祭りの SVG イラストに描き、
絵と日記を 1 枚の作品として保存できるアプリです。（React + Vite）

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
   - `.env` を開き、`ANTHROPIC_API_KEY` にあなたの Anthropic APIキーを入れる
   - キーは https://console.anthropic.com/ で発行できます
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
> ただし「絵にする」で絵を生成するには APIキーが必要です。

---

## APIキーの扱いについて

- APIキーは **`.env`（サーバー側）だけ** に置きます。ブラウザには一切渡しません。
- フロントエンドは `/api/anthropic/v1/messages` を呼び、Vite の開発サーバーが
  `https://api.anthropic.com` へ中継しつつ、キーをヘッダーに付けます
  （設定は `vite.config.js`）。
- 絵の生成にはあなたの Anthropic の利用枠（API のクレジット）が消費されます。

---

## モデルの変更

画面右の「モデル」で切り替えられます（初期値）。

| 表示   | モデルID                        | 用途             |
| ------ | ------------------------------- | ---------------- |
| きれい | `claude-sonnet-4-6`             | 描写重視         |
| 軽量   | `claude-haiku-4-5-20251001`     | 速い・低コスト   |

さらに高品質にしたい場合は、`src/App.jsx` の `MODELS` を編集して
`claude-sonnet-5` や `claude-opus-4-8` などに変更できます。
利用可能なモデルはアカウントにより異なります。最新の正式なモデルID は
公式ドキュメントで確認してください：https://docs.claude.com/en/docs/about-claude/models/overview

---

## Claude Code for VS Code で編集する

このフォルダを VS Code で開いた状態で Claude Code を起動すると、
`src/App.jsx` を対象に「花火の色を増やして」「屋台のシルエットを足して」等の
指示でそのまま改修できます。変更は `npm run dev` の画面に即時反映されます。

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
└─ src/
   ├─ main.jsx
   └─ App.jsx           # アプリ本体
```
