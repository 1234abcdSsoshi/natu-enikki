# 作風プリセット プロンプト集 (v1.0)

絵日記アプリの「作風」ごとに使う画像生成プロンプトのソースです。
`src/App.jsx` はこのファイルを `?raw` インポートして読み込むため、
ここを編集すれば(ビルドし直すだけで)アプリ側の生成結果に反映されます。

- `label`: 画面の「作風」ボタンに表示される名前
- `dir`: この作風の狙い(日本語・現状はドキュメント用途で生成には使っていません)
- `img`: 画像生成AI(Gemini・Pollinations)に渡す英語のプロンプト本文

## watercolor-pencil
- label: 水彩色鉛筆風
- dir: アニメ塗りのようなくっきりした塗りではなく、にじみやムラのある水彩と、紙の質感が透ける色鉛筆の重ね塗りで描く。輪郭は淡く、色は彩度を抑えて優しく発色させ、素朴であたたかい雰囲気にする。
- img: soft watercolor and colored pencil illustration, visible paper texture, gentle bleeding watercolor edges, muted pastel colors, rustic warm hand-colored feel. Absolutely no readable text, no words, no letters, no captions, no signage, no writing of any kind anywhere in the image

## sketch
- label: らくがき風
- dir: 均一に整えすぎず、少し震えたような手描きの線(輪郭をわずかに二重線にする、ゆらぎのあるストローク)で描く。塗りもきっちり塗り分けず、はみ出しやムラを少し残し、完璧すぎないラフでゆるい仕上がりにする。個人の日記帳にさらっと描いたような、親密で気取らない空気感にする。
- img: hand-drawn doodle sketch style, wobbly uneven pencil lines, loose imperfect linework, casual personal diary sketch feel, rough scribbly illustration, not too polished. Absolutely no readable text, no words, no letters, no captions, no signage, no writing of any kind anywhere in the image

## comic-essay
- label: エッセイ漫画風
- dir: コマ割り風に画面を枠線で区切り、吹き出し(丸みを帯びた形)を組み合わせた、絵日記エッセイ漫画のような構図で描く。人物はやや簡略化したかわいらしいプロポーションにし、擬音や効果線などのマンガ的な記号を図形(線・円・多角形)で添える。文字は描かず、形と線の組み合わせだけでエッセイ漫画らしい雰囲気を出す。
- img: Japanese comic essay illustration style (manga essay / 4-koma inspired), page divided into clearly bordered comic panels arranged in a grid, each panel has a small bold numeral (1, 2, 3, 4...) in a simple circle badge in one corner marking its panel number, cute simplified chibi-style characters, manga-style motion lines and simple graphic sound-effect symbols (bursts, stars, lines only, not letters), empty blank speech bubble shapes only. Absolutely no readable text, no words, no letters, no captions, no signage anywhere in the image other than the single-digit panel numbers
