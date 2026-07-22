import React, { useState, useRef } from "react";

// 日本の夏 絵日記アプリ
// 日記本文 → Claude(claude-sonnet-4-6)がSVGイラストに変換 → 絵日記ページに表示

// 作風プリセット(画面から選べる)
const STYLES = [
  {
    key: "watercolor",
    label: "水彩風",
    dir: "半透明の色面をやわらかく重ね、輪郭はうっすらにじませる。淡くやさしい色調で、光がふわりと広がる水彩画のように描く。",
  },
  {
    key: "flat",
    label: "フラット",
    dir: "均一な色面と最小限のグラデーションで、明快でモダンに描く。形はシンプルに整理し、洗練された配色でまとめる。",
  },
  {
    key: "kiri-e",
    label: "切り絵風",
    dir: "はっきりした色面のシルエットを重ね、要素の縁に細い白フチを入れて、切り絵を貼り重ねたように描く。",
  },
  {
    key: "ukiyoe",
    label: "浮世絵風",
    dir: "平坦な色面と流れるような曲線で、藍と朱を効かせた古典的な構図に。空はぼかしの階調(ぼかし摺り)で表現する。",
  },
];

const PROMPT_TOP = `あなたは日本の夏を描く、腕利きの絵日記イラストレーターです。
以下の日記本文を深く読み取り、その情景・光・空気感・感情を、1枚の完成度の高いSVGイラストに描いてください。

# 制作の手順(頭の中で行い、最終的には SVG のみ出力)
1. 日記から、主役となる情景と「時間帯・天気」を1つ決める
2. 遠景(空・雲・山や海)/ 中景(主役のモチーフ)/ 近景(手前の要素)の3層で構図を組む
3. 時間帯に合う配色と、光の向きを決める
4. その計画に沿って、ていねいに描く

# 出力ルール
- 出力は <svg> で始まり </svg> で終わる、完全なSVGコードのみ。説明・前置き・コードフェンスは一切書かない
- viewBox="0 0 800 600"
- 外部画像・外部フォントは読み込まない。図形(rect, circle, ellipse, path, polygon, line)のみで描く

# クオリティの指針
- 空や水面には linearGradient / radialGradient を使い、なめらかな階調と夏の光を表現する
- 遠景から近景へ色を少しずつ変えて奥行きを出す(遠くは淡く霞ませ、手前ははっきり)
- 主役のモチーフは、大きさ・位置・色のコントラストで画面の明確な焦点にする
- 光源を1つ決め、その向きに沿ってハイライトと影(半透明の重ね塗り)を入れる
- 太陽や光の周りは、opacityの低い円を重ねたグローで夏の眩しさを添える
- 細部の描き込みは2〜3か所にしぼる(例:風鈴の短冊、金魚のひれ、向日葵の種)。他は余白として引く
- 全体の色数は5〜7色ほどに抑え、調和のとれた配色にする

# 日本の夏の題材(日記に合うものを選ぶ)
入道雲、夕焼け、天の川、花火、風鈴、金魚、朝顔、向日葵、蝉、麦わら帽子、うちわ、かき氷、縁側、田んぼ、海、灯籠、蚊取り線香、夕立、虹

# 作風
`;

function buildPrompt(styleDir, body) {
  return `${PROMPT_TOP}${styleDir}\n\n# 日記本文\n${body}`;
}

function todayLabel() {
  const d = new Date();
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return {
    y: d.getFullYear(),
    md: `${d.getMonth() + 1}月${d.getDate()}日`,
    dow: days[d.getDay()],
  };
}

function extractSvg(raw) {
  if (!raw) return null;
  const start = raw.indexOf("<svg");
  const end = raw.lastIndexOf("</svg>");
  if (start === -1 || end === -1) return null;
  return raw.slice(start, end + "</svg>".length);
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c])
  );
}

// 生成SVGを、指定の枠に収まる入れ子SVGに書き換える
function fitSvgIntoBox(svgStr, x, y, w, h) {
  const m = svgStr.match(/<svg[^>]*>/i);
  if (!m) return "";
  const viewBox = (m[0].match(/viewBox\s*=\s*"([^"]*)"/i) || [])[1] || "0 0 800 600";
  const after = svgStr.slice(m.index + m[0].length);
  const closeIdx = after.lastIndexOf("</svg>");
  const inner = closeIdx >= 0 ? after.slice(0, closeIdx) : after;
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

// 日本語テキストを、改行と最大文字数で行に折る
function wrapLines(text, maxChars) {
  const out = [];
  for (const para of String(text).split("\n")) {
    if (para.length === 0) { out.push(""); continue; }
    for (let i = 0; i < para.length; i += maxChars) out.push(para.slice(i, i + maxChars));
  }
  return out;
}

// 絵＋日記＋日付を1枚の作品SVGに組む(左=日記・右=絵、日付は日記の上)
function composeArtwork(svgStr, diary, date) {
  const illo = fitSvgIntoBox(svgStr, 636, 198, 496, 372);
  const dateLine = `${date.y}年 ${date.md}　${date.dow}曜日`;
  const startX = 64, startY = 236, lh = 42, maxLines = 10;
  let lines = wrapLines(diary, 15);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, 14) + "…";
  }
  const textEls = lines
    .map((ln, i) => `<text x="${startX}" y="${startY + i * lh}" font-family="serif" font-size="25" fill="#2A2622">${escapeXml(ln)}</text>`)
    .join("");
  let ruled = "";
  for (let i = 0; i < maxLines; i++) {
    const y = startY + i * lh + 8;
    ruled += `<line x1="56" y1="${y}" x2="592" y2="${y}" stroke="#5E93A6" stroke-opacity="0.24" stroke-width="1"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
<defs><linearGradient id="wbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4EEDD"/><stop offset="1" stop-color="#E9DFC6"/></linearGradient></defs>
<rect width="1200" height="800" fill="url(#wbg)"/>
<text x="64" y="92" font-family="serif" font-weight="700" font-size="40" fill="#1B3A5B" letter-spacing="10">絵日記</text>
<line x1="64" y1="116" x2="1136" y2="116" stroke="#1B3A5B" stroke-opacity="0.22" stroke-width="1.5"/>
<text x="64" y="170" font-family="serif" font-size="24" fill="#D8482B">${escapeXml(dateLine)}</text>
<line x1="56" y1="190" x2="592" y2="190" stroke="#D8482B" stroke-opacity="0.4" stroke-width="1" stroke-dasharray="4 4"/>
${ruled}
${textEls}
<rect x="616" y="150" width="536" height="470" rx="12" fill="#ffffff" stroke="#E9DFC6"/>
${illo}
<text x="1136" y="774" text-anchor="end" font-family="serif" font-size="13" fill="#1B3A5B" fill-opacity="0.5">夏祭りの夜に</text>
</svg>`;
}

// 夏祭りの装飾データ
const LANTERNS = [
  { left: "5%", d: "0s", c: "#D8482B" },
  { left: "19%", d: "-0.6s", c: "#EF9A3D" },
  { left: "33%", d: "-1.2s", c: "#E8552C" },
  { left: "48%", d: "-0.3s", c: "#F0B94E" },
  { left: "63%", d: "-1.5s", c: "#D8482B" },
  { left: "78%", d: "-0.9s", c: "#EF9A3D" },
  { left: "92%", d: "-1.8s", c: "#E8552C" },
];
const PARTICLES = Array.from({ length: 16 }, (_, i) => ({
  left: `${(i * 6 + 3) % 97}%`,
  bottom: `${(i * 11) % 42}%`,
  d: `${-((i * 0.8) % 7).toFixed(1)}s`,
  dur: `${6 + (i % 5)}s`,
}));

const MODELS = [
  { key: "sonnet", label: "きれい", id: "claude-sonnet-4-6", tokens: 8000 },
  { key: "haiku", label: "軽量", id: "claude-haiku-4-5-20251001", tokens: 6000 },
];

// エラーが利用上限系なら、分かりやすい日本語に整形して返す(それ以外は null)
function limitMessage(err) {
  const raw = typeof err === "string" ? err : JSON.stringify(err || "");
  if (!/exceeded_limit|上限|rate_limit/.test(raw)) return null;
  let when = "";
  const iso = raw.match(/"resets_at":"([^"]+)"/);
  const unix = raw.match(/"resetsAt":(\d+)/);
  let dt = null;
  if (iso) dt = new Date(iso[1]);
  else if (unix) dt = new Date(parseInt(unix[1], 10) * 1000);
  if (dt && !isNaN(dt.getTime())) {
    when = "リセットは " + dt.toLocaleString("ja-JP", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " ごろです。";
  }
  return "Claudeの利用上限(5時間ごとの枠)に達したため、絵を描けませんでした。" + when + " 枠が回復してから、または「軽量」モデルで、もう一度お試しください。";
}

export default function App() {
  const [text, setText] = useState("");
  const [svg, setSvg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [entries, setEntries] = useState([]); // セッション内のしおり
  const [styleKey, setStyleKey] = useState("watercolor");
  const [modelKey, setModelKey] = useState("sonnet");
  const [savedText, setSavedText] = useState("");
  const dateRef = useRef(todayLabel());

  async function draw() {
    const body = text.trim();
    if (!body) {
      setError("日記を書いてから、絵にできます。");
      return;
    }
    setLoading(true);
    setError("");
    setSvg(null);
    try {
      const styleDir = (STYLES.find((s) => s.key === styleKey) || STYLES[0]).dir;
      const model = MODELS.find((m) => m.key === modelKey) || MODELS[0];
      const res = await fetch("/api/anthropic/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model.id,
          max_tokens: model.tokens,
          messages: [{ role: "user", content: buildPrompt(styleDir, body) }],
        }),
      });
      const data = await res.json();

      if (data.error) {
        console.error("API error:", data.error);
        const lim = limitMessage(data.error);
        setError(
          lim ||
            "絵を描くところで止まってしまいました(" +
              (data.error.message || data.error.type || "error") +
              ")。もう一度ためしてみてください。"
        );
        return;
      }

      const merged = (data.content || [])
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("");
      const found = extractSvg(merged);

      if (!found) {
        console.error("SVG not found. stop_reason:", data.stop_reason, "raw:", merged);
        if (data.stop_reason === "max_tokens") {
          setError("絵が長くなって、途中で切れてしまいました。日記を少し短くして、もう一度ためしてみてください。");
        } else {
          setError("うまく絵にできませんでした。少し言葉を足して、もう一度ためしてみてください。");
        }
        return;
      }

      setSvg(found);
      setSavedText(body);
      setEntries((prev) => [{ svg: found, text: body, date: { ...dateRef.current } }, ...prev].slice(0, 12));
    } catch (e) {
      setError("通信に失敗しました。時間をおいて、もう一度ためしてみてください。");
    } finally {
      setLoading(false);
    }
  }

  function saveArtwork() {
    if (!svg) return;
    const comp = composeArtwork(svg, savedText || text, dateRef.current);
    const W = 1200, H = 800, scale = 2;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W * scale;
      canvas.height = H * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, W, H);
      canvas.toBlob((blob) => {
        if (!blob) { setError("作品の書き出しに失敗しました。もう一度お試しください。"); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `絵日記_${dateRef.current.y}_${dateRef.current.md}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    img.onerror = () => setError("作品の書き出しに失敗しました。もう一度お試しください。");
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(comp);
  }

  function saveSvg() {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `絵日記_絵のみ_${dateRef.current.y}_${dateRef.current.md}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const d = dateRef.current;

  return (
    <div style={styles.root}>
      <style>{css}</style>

      {/* 夏祭りの装飾(背面) */}
      <div className="deco" aria-hidden="true">
        <div className="lanterns">
          <span className="wire" />
          {LANTERNS.map((L, i) => (
            <span key={i} className="lantern" style={{ left: L.left, animationDelay: L.d }}>
              <span className="lantern-body" style={{ color: L.c }} />
            </span>
          ))}
        </div>
        <span className="fw fw1" />
        <span className="fw fw2" />
        <span className="fw fw3" />
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="firefly"
            style={{ left: p.left, bottom: p.bottom, animationDelay: p.d, animationDuration: p.dur }}
          />
        ))}
      </div>

      {/* 風鈴 */}
      <div className="furin" aria-hidden="true">
        <div className="furin-string" />
        <div className="furin-bell">
          <div className="furin-inner" />
        </div>
        <div className="furin-tanzaku" />
      </div>

      <header style={styles.header}>
        <div style={styles.season}>祭</div>
        <h1 style={styles.title} className="neon">絵日記</h1>
        <p style={styles.subtitle}>夏祭りの夜に、きょうの絵日記を</p>
      </header>

      <main style={styles.page} className="page">
        {/* 日記(書くところ)— 左 */}
        <section style={styles.writeWrap} className="card">
          <div style={styles.dateBar}>
            <span style={styles.dateMain}>{d.y}年 {d.md}</span>
            <span style={styles.dateDow}>{d.dow}曜日</span>
          </div>

          <div style={styles.ruled}>
            <textarea
              style={styles.textarea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="金魚すくいをして、りんご飴を食べた。&#10;夜空に大きな花火が上がって、みんなで歓声をあげた…"
              maxLength={600}
            />
          </div>

          <div style={styles.styleRow}>
            <span style={styles.styleLabel}>作風</span>
            {STYLES.map((s) => (
              <button
                key={s.key}
                onClick={() => setStyleKey(s.key)}
                style={{ ...styles.stylePill, ...(styleKey === s.key ? styles.stylePillOn : {}) }}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div style={styles.styleRow}>
            <span style={styles.styleLabel}>モデル</span>
            {MODELS.map((m) => (
              <button
                key={m.key}
                onClick={() => setModelKey(m.key)}
                style={{ ...styles.stylePill, ...(modelKey === m.key ? styles.stylePillOn : {}) }}
              >
                {m.label}
              </button>
            ))}
            <span style={styles.modelHint}>
              {modelKey === "sonnet" ? "描写重視" : "上限にやさしい"}
            </span>
          </div>

          <div style={styles.controls}>
            <span style={styles.count}>{text.length} / 600</span>
            <button
              style={{ ...styles.drawBtn, ...(loading ? styles.drawBtnOff : {}) }}
              onClick={draw}
              disabled={loading}
            >
              {loading ? "描いています…" : "絵にする"}
            </button>
          </div>

          {error && <p style={styles.error}>{error}</p>}
        </section>

        {/* 絵(絵の出るところ)— 右 */}
        <section style={styles.canvasWrap} className="card">
          <div style={styles.canvas}>
            {loading && (
              <div style={styles.placeholder}>
                <div className="ink" />
                <p style={styles.placeholderText}>絵を描いています…</p>
              </div>
            )}
            {!loading && svg && (
              <div
                className="svg-in"
                style={styles.svgHost}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            )}
            {!loading && !svg && (
              <div style={styles.placeholder}>
                <div className="unmei" aria-hidden="true">画帳</div>
                <p style={styles.placeholderText}>ここに、きょうの絵が出ます</p>
              </div>
            )}
          </div>

          {svg && !loading && (
            <div style={styles.saveRow}>
              <button style={styles.saveMain} onClick={saveArtwork}>
                作品を保存(絵＋日記)
              </button>
              <button style={styles.saveSub} onClick={saveSvg}>
                絵だけ保存
              </button>
            </div>
          )}
        </section>
      </main>

      {/* しおり(このセッションで描いた絵) */}
      {entries.length > 1 && (
        <section style={styles.shelf}>
          <div style={styles.shelfLabel}>しおり</div>
          <div style={styles.shelfRow}>
            {entries.map((en, i) => (
              <button
                key={i}
                style={styles.thumb}
                onClick={() => { setSvg(en.svg); setText(en.text); setSavedText(en.text); }}
                dangerouslySetInnerHTML={{ __html: en.svg }}
                aria-label={`${en.date.md}の絵`}
              />
            ))}
          </div>
        </section>
      )}

      <footer style={styles.footer}>夜空に花火、軒に提灯</footer>
    </div>
  );
}

const C = {
  ai: "#1B3A5B",
  aiDeep: "#12283F",
  asagi: "#5E93A6",
  kinari: "#F4EEDD",
  kinariDeep: "#E9DFC6",
  shu: "#D8482B",
  wakatake: "#6E9B6A",
  yuyake: "#EF9A3D",
  sumi: "#2A2622",
};

const css = `
@import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700&family=Klee+One:wght@400;600&display=swap');
* { box-sizing: border-box; }

/* ── レイアウト ── */
.page { display: grid; grid-template-columns: 1fr 1.08fr; gap: 18px; max-width: 1000px; margin: 0 auto; position: relative; z-index: 1; perspective: 1400px; }
@media (max-width: 760px) { .page { grid-template-columns: 1fr; } }

/* ── 3D風カード ── */
.card { transition: transform .35s cubic-bezier(.2,.7,.2,1), box-shadow .35s ease; transform-style: preserve-3d; }
.card:hover { transform: translateY(-6px) rotateX(2deg); }

/* ── 装飾レイヤー(背面) ── */
.deco { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; }

/* 提灯の列 */
.lanterns { position: absolute; top: 0; left: 0; right: 0; height: 130px; }
.lanterns .wire { position: absolute; top: 30px; left: -3%; width: 106%; height: 2px; background: linear-gradient(90deg, transparent, rgba(255,214,150,.45), rgba(255,214,150,.45), transparent); }
.lantern { position: absolute; top: 30px; width: 36px; height: 48px; transform-origin: top center; animation: swing 4.2s ease-in-out infinite; }
.lantern-body { display: block; width: 36px; height: 48px; border-radius: 50% / 42%; background: radial-gradient(circle at 40% 32%, #fff4cf 0%, currentColor 62%, rgba(0,0,0,.35) 100%); box-shadow: 0 0 22px 5px currentColor, inset -4px -5px 9px rgba(0,0,0,.28); position: relative; animation: lglow 3.2s ease-in-out infinite; }
.lantern-body::before, .lantern-body::after { content:''; position:absolute; left:5px; right:5px; height:2px; background: rgba(70,25,10,.4); }
.lantern-body::before { top: 9px; } .lantern-body::after { bottom: 9px; }
@keyframes swing { 0%,100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
@keyframes lglow { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.3); } }

/* 打ち上げ花火 */
.fw { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: 0;
  box-shadow: 36px 0 2px 0 currentColor, 31px 18px 2px 0 currentColor, 18px 31px 2px 0 currentColor, 0 36px 2px 0 currentColor, -18px 31px 2px 0 currentColor, -31px 18px 2px 0 currentColor, -36px 0 2px 0 currentColor, -31px -18px 2px 0 currentColor, -18px -31px 2px 0 currentColor, 0 -36px 2px 0 currentColor, 18px -31px 2px 0 currentColor, 31px -18px 2px 0 currentColor;
  animation: burst 6s ease-out infinite; }
.fw1 { top: 15%; left: 24%; color: #EF9A3D; animation-delay: 0s; }
.fw2 { top: 11%; left: 64%; color: #7FC6D6; animation-delay: 2.1s; }
.fw3 { top: 22%; left: 46%; color: #F06E9A; animation-delay: 4s; }
@keyframes burst {
  0% { opacity: 0; transform: scale(.15); }
  6% { opacity: 1; }
  38% { opacity: .95; transform: scale(1); }
  66% { opacity: 0; transform: scale(1.35); }
  100% { opacity: 0; transform: scale(1.35); }
}

/* 光の粒(蛍) */
.firefly { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: radial-gradient(circle, #fff6c8, #ffcf6a); box-shadow: 0 0 9px 2px rgba(255,207,106,.7); opacity: 0; animation-name: rise; animation-timing-function: linear; animation-iteration-count: infinite; }
@keyframes rise {
  0% { transform: translate(0,0) scale(.7); opacity: 0; }
  15% { opacity: .9; }
  50% { transform: translate(14px,-90px) scale(1); }
  85% { opacity: .6; }
  100% { transform: translate(-8px,-180px) scale(.8); opacity: 0; }
}

/* ── 風鈴 ── */
.furin { position: absolute; top: 0; right: 30px; width: 42px; z-index: 4; transform-origin: top center; animation: sway 4.5s ease-in-out infinite; filter: drop-shadow(0 0 10px rgba(127,198,214,.5)); }
.furin-string { width: 2px; height: 52px; margin: 0 auto; background: rgba(255,255,255,.5); }
.furin-bell { width: 42px; height: 36px; margin: -2px auto 0; border-radius: 50% 50% 46% 46%; background: radial-gradient(circle at 34% 30%, #ffffff 0%, ${C.asagi} 55%, ${C.ai} 100%); box-shadow: inset -3px -4px 6px rgba(0,0,0,.2), 0 0 14px rgba(127,198,214,.5); position: relative; }
.furin-inner { position: absolute; left: 50%; bottom: -3px; width: 8px; height: 8px; border-radius: 50%; background: ${C.shu}; transform: translateX(-50%); }
.furin-tanzaku { width: 13px; height: 32px; margin: 2px auto 0; background: ${C.shu}; opacity: .9; border-radius: 2px; animation: flutter 4.5s ease-in-out infinite; }
@keyframes sway { 0%,100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg); } }
@keyframes flutter { 0%,100% { transform: skewX(-9deg); } 50% { transform: skewX(9deg); } }

/* ── ネオン見出し ── */
.neon { text-shadow: 0 0 10px rgba(239,154,61,.55), 0 0 24px rgba(216,72,43,.4), 0 2px 2px rgba(0,0,0,.35); }

/* ── 生成の演出 ── */
.svg-in { animation: reveal 1.1s ease both; }
.svg-in svg { width: 100%; height: auto; display: block; }
@keyframes reveal { from { opacity: 0; filter: blur(6px) saturate(.6); transform: scale(.98); } to { opacity: 1; filter: blur(0) saturate(1); transform: scale(1); } }
.ink { width: 46px; height: 46px; border-radius: 50%; background: radial-gradient(circle, ${C.asagi}, ${C.ai}); box-shadow: 0 0 22px rgba(94,147,166,.6); animation: spread 1.4s ease-in-out infinite; }
@keyframes spread { 0% { transform: scale(.4); opacity: .3; } 50% { transform: scale(1); opacity: .65; } 100% { transform: scale(.4); opacity: .3; } }
.unmei { font-family: 'Shippori Mincho', serif; font-size: 30px; color: ${C.ai}; opacity: .18; letter-spacing: .2em; }

textarea::placeholder { color: ${C.sumi}; opacity: .38; }
textarea:focus { outline: 2px solid ${C.asagi}; outline-offset: 2px; }
button:focus-visible { outline: 2px solid ${C.shu}; outline-offset: 3px; }

@media (prefers-reduced-motion: reduce) {
  .furin, .furin-tanzaku, .ink, .svg-in, .lantern, .lantern-body, .fw, .firefly, .card { animation: none !important; transition: none !important; }
}
`;

const styles = {
  root: {
    position: "relative",
    minHeight: "100%",
    padding: "78px 16px 44px",
    overflow: "hidden",
    background:
      "radial-gradient(130% 90% at 50% 0%, rgba(58,32,80,.85) 0%, transparent 55%), " +
      "radial-gradient(90% 70% at 85% 12%, rgba(216,72,43,.18) 0%, transparent 60%), " +
      "linear-gradient(180deg, #0c1633 0%, #171139 46%, #23123f 100%)",
    color: "#F6EACC",
    fontFamily: "'Klee One', 'Hiragino Mincho ProN', serif",
  },
  header: { textAlign: "center", paddingTop: 8, marginBottom: 20, position: "relative", zIndex: 1 },
  season: {
    display: "inline-block",
    fontFamily: "'Shippori Mincho', serif",
    color: C.kinari,
    background: `linear-gradient(135deg, ${C.shu}, ${C.yuyake})`,
    width: 46,
    height: 46,
    lineHeight: "46px",
    borderRadius: 10,
    fontSize: 25,
    boxShadow: "0 0 20px rgba(239,154,61,.5), 2px 3px 0 rgba(0,0,0,.25)",
    marginBottom: 10,
  },
  title: {
    fontFamily: "'Shippori Mincho', serif",
    fontSize: 40,
    letterSpacing: ".3em",
    color: "#FBEFCB",
    margin: "2px 0 6px",
    paddingLeft: ".3em",
  },
  subtitle: { fontSize: 13, color: "rgba(246,234,204,.72)", margin: 0, letterSpacing: ".06em" },
  page: {},
  // 画帳(右)
  canvasWrap: {
    position: "relative",
    background: "#fff",
    borderRadius: 14,
    padding: 14,
    boxShadow:
      "0 24px 54px -18px rgba(0,0,0,.7), 0 0 46px -14px rgba(127,198,214,.4), inset 0 1px 0 rgba(255,255,255,.7)",
    border: "1px solid rgba(255,255,255,.4)",
  },
  stamp: {
    position: "absolute",
    top: 22,
    left: 22,
    zIndex: 2,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: 62,
    height: 62,
    border: `2px solid ${C.shu}`,
    borderRadius: 8,
    color: C.shu,
    fontFamily: "'Shippori Mincho', serif",
    background: "rgba(255,255,255,.72)",
    transform: "rotate(-4deg)",
  },
  stampY: { fontSize: 10, letterSpacing: ".05em" },
  stampMd: { fontSize: 14, fontWeight: 700, lineHeight: 1.1 },
  stampDow: { fontSize: 9 },
  canvas: {
    aspectRatio: "4 / 3",
    borderRadius: 6,
    overflow: "hidden",
    background:
      `repeating-linear-gradient(0deg, ${C.kinari}, ${C.kinari} 27px, ${C.kinariDeep}66 28px)`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  svgHost: { width: "100%", height: "100%" },
  placeholder: { textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 },
  placeholderText: { fontSize: 13, color: C.sumi, opacity: 0.5, margin: 0 },
  saveRow: { display: "flex", gap: 10, marginTop: 12 },
  saveMain: {
    flex: "1 1 auto",
    padding: "11px 0",
    border: "none",
    background: `linear-gradient(135deg, ${C.ai}, ${C.asagi})`,
    color: C.kinari,
    borderRadius: 8,
    fontFamily: "'Klee One', serif",
    fontSize: 14,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(27,58,91,.25)",
  },
  saveSub: {
    flex: "0 0 auto",
    padding: "11px 16px",
    border: `1.5px solid ${C.ai}`,
    background: "transparent",
    color: C.ai,
    borderRadius: 8,
    fontFamily: "'Klee One', serif",
    fontSize: 14,
    cursor: "pointer",
  },
  // 日記(左)
  writeWrap: {
    display: "flex",
    flexDirection: "column",
    background: `linear-gradient(${C.kinari}, ${C.kinariDeep})`,
    borderRadius: 14,
    padding: 16,
    border: "1px solid rgba(255,255,255,.4)",
    boxShadow:
      "0 24px 54px -18px rgba(0,0,0,.7), 0 0 46px -14px rgba(239,154,61,.35), inset 0 1px 0 rgba(255,255,255,.7)",
  },
  dateBar: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    padding: "2px 4px 10px",
    marginBottom: 10,
    borderBottom: `1px dashed ${C.shu}66`,
  },
  dateMain: {
    fontFamily: "'Shippori Mincho', serif",
    fontSize: 19,
    color: C.ai,
    letterSpacing: ".06em",
  },
  dateDow: { fontFamily: "'Shippori Mincho', serif", fontSize: 13, color: C.shu },
  modelHint: { fontFamily: "'Klee One', serif", fontSize: 11, color: C.asagi, marginLeft: 2 },
  ruled: {
    background:
      `repeating-linear-gradient(0deg, transparent, transparent 37px, ${C.asagi}44 38px), #fffdf7`,
    borderRadius: 10,
    padding: 6,
    border: `1px solid ${C.kinariDeep}`,
    boxShadow: "inset 0 1px 3px rgba(0,0,0,.05)",
    flex: 1,
  },
  textarea: {
    width: "100%",
    minHeight: 260,
    height: "100%",
    resize: "vertical",
    border: "none",
    background: "transparent",
    lineHeight: "38px",
    fontSize: 17,
    fontFamily: "'Klee One', 'Hiragino Mincho ProN', serif",
    color: C.sumi,
    padding: "6px 10px",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    gap: 12,
  },
  styleRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  styleLabel: {
    fontFamily: "'Shippori Mincho', serif",
    color: C.ai,
    fontSize: 13,
    letterSpacing: ".12em",
    marginRight: 2,
  },
  stylePill: {
    padding: "6px 14px",
    borderRadius: 999,
    border: `1px solid ${C.asagi}`,
    background: "transparent",
    color: C.ai,
    fontFamily: "'Klee One', serif",
    fontSize: 13,
    cursor: "pointer",
  },
  stylePillOn: {
    background: C.ai,
    color: C.kinari,
    borderColor: C.ai,
  },
  count: { fontSize: 12, color: C.sumi, opacity: 0.45 },
  drawBtn: {
    padding: "12px 30px",
    border: "none",
    borderRadius: 999,
    background: `linear-gradient(135deg, ${C.shu}, ${C.yuyake})`,
    color: "#fff",
    fontFamily: "'Shippori Mincho', serif",
    fontSize: 16,
    letterSpacing: ".12em",
    cursor: "pointer",
    boxShadow: "0 6px 18px rgba(216,72,43,.5), 0 0 22px rgba(239,154,61,.4)",
  },
  drawBtnOff: { opacity: 0.6, cursor: "wait", boxShadow: "none" },
  error: { marginTop: 12, color: C.shu, fontSize: 13 },
  // しおり
  shelf: { maxWidth: 1000, margin: "28px auto 0", position: "relative", zIndex: 1 },
  shelfLabel: {
    fontFamily: "'Shippori Mincho', serif",
    color: "rgba(246,234,204,.85)",
    letterSpacing: ".2em",
    fontSize: 14,
    marginBottom: 8,
    paddingLeft: 2,
  },
  shelfRow: { display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 },
  thumb: {
    flex: "0 0 auto",
    width: 92,
    height: 69,
    padding: 0,
    border: `1px solid ${C.kinariDeep}`,
    borderRadius: 6,
    overflow: "hidden",
    background: "#fff",
    cursor: "pointer",
    boxShadow: "0 3px 8px rgba(27,58,91,.12)",
  },
  footer: {
    textAlign: "center",
    marginTop: 32,
    fontSize: 12,
    color: "rgba(246,234,204,.6)",
    fontFamily: "'Shippori Mincho', serif",
    letterSpacing: ".18em",
    position: "relative",
    zIndex: 1,
  },
};
