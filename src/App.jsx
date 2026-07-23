import React, { useState, useRef, useEffect } from "react";

// 日本の夏 絵日記アプリ
// 日記本文 → Claude(claude-sonnet-4-6)がSVGイラストに変換 → 絵日記ページに表示

// 作風プリセット(画面から選べる)
const STYLES = [
  {
    key: "watercolor",
    label: "水彩風",
    dir: "半透明の色面をやわらかく重ね、輪郭はうっすらにじませる。淡くやさしい色調で、光がふわりと広がる水彩画のように描く。",
    img: "soft watercolor painting style, delicate translucent color washes, gently blurred edges, pastel dreamy light",
  },
  {
    key: "flat",
    label: "フラット",
    dir: "均一な色面と最小限のグラデーションで、明快でモダンに描く。形はシンプルに整理し、洗練された配色でまとめる。",
    img: "flat design illustration, clean bold shapes, minimal gradients, modern refined color palette",
  },
  {
    key: "kiri-e",
    label: "切り絵風",
    dir: "はっきりした色面のシルエットを重ね、要素の縁に細い白フチを入れて、切り絵を貼り重ねたように描く。",
    img: "Japanese paper cut art (kirie) style, layered bold silhouette shapes with thin white outlines",
  },
  {
    key: "ukiyoe",
    label: "浮世絵風",
    dir: "平坦な色面と流れるような曲線で、藍と朱を効かせた古典的な構図に。空はぼかしの階調(ぼかし摺り)で表現する。",
    img: "traditional ukiyo-e Japanese woodblock print style, flowing linework, indigo and vermillion palette, gradated bokashi sky",
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
入道雲、夕焼け、天の川、花火、風鈴、金魚、朝顔、向日葵、蝉、麦わら帽子、うちわ、かき氷、縁側、田んぼ、海、灯籠、蚊取り線香、夕立、虹、
盆踊り、すいか割り、線香花火、浴衣、蝉時雨、七夕飾り、金魚鉢、屋台、打ち水、すだれ

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

// ラスター画像(data URL)を、指定の枠に収まる<image>タグに書き換える
function fitImageIntoBox(dataUrl, x, y, w, h) {
  return `<image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" href="${dataUrl}"/>`;
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
function composeArtwork(artwork, diary, date) {
  const illo =
    artwork.kind === "raster"
      ? fitImageIntoBox(artwork.data, 636, 198, 496, 372)
      : fitSvgIntoBox(artwork.data, 636, 198, 496, 372);
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
<text x="64" y="170" font-family="serif" font-size="24" fill="#000000">${escapeXml(dateLine)}</text>
<line x1="56" y1="190" x2="592" y2="190" stroke="#000000" stroke-opacity="0.4" stroke-width="1" stroke-dasharray="4 4"/>
${ruled}
${textEls}
<rect x="616" y="150" width="536" height="470" rx="12" fill="#ffffff" stroke="#E9DFC6"/>
${illo}
<text x="1136" y="774" text-anchor="end" font-family="serif" font-size="13" fill="#1B3A5B" fill-opacity="0.5">今日も一日お疲れ様でした！</text>
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

const FIREWORKS = [
  { top: "13%", left: "22%", c: "#EF9A3D", d: "0s", scale: 1.15 },
  { top: "9%", left: "62%", c: "#7FC6D6", d: "2.1s", scale: 1.35 },
  { top: "20%", left: "44%", c: "#F06E9A", d: "4s", scale: 0.95 },
  { top: "7%", left: "8%", c: "#8CE99A", d: "1.1s", scale: 1.05 },
  { top: "16%", left: "84%", c: "#FFD166", d: "3.2s", scale: 1.25 },
  { top: "25%", left: "6%", c: "#C77DFF", d: "5s", scale: 0.9 },
];

const CLICK_FW_COLORS = ["#EF9A3D", "#7FC6D6", "#F06E9A", "#8CE99A", "#FFD166", "#C77DFF", "#FF8C69"];

// 長押し(チャージ)の設定: 押している時間に比例して、飛距離・大きさ・音量が増す
const CHARGE_MAX_MS = 1400;
const CHARGE_MIN_TRAVEL = 140;
const CHARGE_MAX_TRAVEL = 560;
const CHARGE_MIN_SCALE = 0.75;
const CHARGE_MAX_SCALE = 2.1;
const CHARGE_MIN_VOL = 0.55;
const CHARGE_MAX_VOL = 1.7;

// 天の川(瞬く星)
const STARS = Array.from({ length: 42 }, (_, i) => ({
  left: `${(i * 13 + 7) % 100}%`,
  top: `${(i * 7 + 3) % 60}%`,
  size: 1 + (i % 3),
  d: `${-((i * 0.37) % 5).toFixed(2)}s`,
  dur: `${2.4 + (i % 4) * 0.6}s`,
}));

// 縁日の屋台のシルエット
const YATAI = [
  { left: "2%", w: 92 },
  { left: "16%", w: 68 },
  { left: "78%", w: 78 },
  { left: "90%", w: 60 },
];

// 打ち水のしぶき
const SPLASHES = Array.from({ length: 6 }, (_, i) => ({
  left: `${8 + i * 16}%`,
  d: `${(i * 1.3).toFixed(1)}s`,
}));

const MODELS = [
  { key: "sonnet", label: "きれい", id: "claude-sonnet-4-6", tokens: 8000 },
  { key: "haiku", label: "軽量", id: "claude-haiku-4-5-20251001", tokens: 6000 },
];

const ENGINES = [
  { key: "claude", label: "Claude(SVG)" },
  { key: "pollinations", label: "Pollinations(無料)" },
];

// Pollinations.ai 用の英語プロンプトを組み立てる
function buildPollinationsPrompt(styleImg, diary) {
  return `Japanese summer festival diary illustration, ${styleImg}, warm nostalgic mood, may feature motifs like fireworks, paper lanterns, wind chimes, goldfish, morning glories, cicadas, yukata, Bon dance, food stalls, sparkler fireworks, watermelon splitting, Tanabata streamers, bamboo blinds. no text, no watermark. Diary: ${diary}`;
}

// Pollinations.ai から画像を取得し、data URL にして返す
async function fetchPollinationsImage(prompt, signal) {
  const seed = Math.floor(Math.random() * 1_000_000);
  const url = `/api/pollinations/prompt/${encodeURIComponent(prompt)}?width=800&height=600&seed=${seed}&model=flux&nologo=true`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`pollinations_http_${res.status}`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("pollinations_read_failed"));
    reader.readAsDataURL(blob);
  });
}

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

// 花火の「ドン」と風鈴の「チリン」を Web Audio API でその場合成する(音源ファイル不要)
function useFestivalAudio() {
  const ctxRef = useRef(null);
  const reverbRef = useRef(null);

  function ensureCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctxRef.current) ctxRef.current = new AC();
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }

  // 遠くの花火の反響のような、簡易リバーブ(インパルス応答をその場生成)
  function ensureReverb(ctx) {
    if (!reverbRef.current) {
      const rate = ctx.sampleRate;
      const len = Math.floor(rate * 1.8);
      const impulse = ctx.createBuffer(2, len, rate);
      for (let ch = 0; ch < 2; ch++) {
        const data = impulse.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
        }
      }
      const convolver = ctx.createConvolver();
      convolver.buffer = impulse;
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.32;
      convolver.connect(wetGain).connect(ctx.destination);
      reverbRef.current = convolver;
    }
    return reverbRef.current;
  }

  function noiseBuffer(ctx, seconds, shape = (i, n) => 1 - i / n) {
    const size = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * shape(i, size);
    return buffer;
  }

  // 最初のクリック/タップで音を解禁(ブラウザの自動再生制限に対応)
  useEffect(() => {
    const unlock = () => ensureCtx();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  function playBoom(pan = 0, vol = 1) {
    const ctx = ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const reverb = ensureReverb(ctx);
    const out = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.destination;
    if (out !== ctx.destination) {
      out.pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(ctx.destination);
    }

    // 鋭い「バチッ」という初期の破裂トランジェント
    const crack = ctx.createBufferSource();
    crack.buffer = noiseBuffer(ctx, 0.05, (i, n) => Math.pow(1 - i / n, 0.5));
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.45 * vol, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    crack.connect(crackGain).connect(out);
    crackGain.connect(reverb);
    crack.start(now);

    // 低音の「ドン」という腹に響く一撃
    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(150, now);
    thump.frequency.exponentialRampToValueAtTime(34, now + 0.35);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.6 * vol, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    thump.connect(thumpGain).connect(out);
    thumpGain.connect(reverb);
    thump.start(now);
    thump.stop(now + 0.42);

    // 尾を引くシューというノイズの減衰
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 1.1, (i, n) => Math.pow(1 - i / n, 2.4));
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(260, now + 0.8);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.32 * vol, now + 0.025);
    noiseGain.gain.exponentialRampToValueAtTime(0.0006, now + 1.05);
    noise.connect(filter).connect(noiseGain).connect(out);
    noiseGain.connect(reverb);
    noise.start(now);
    noise.stop(now + 1.1);

    // 燃えかすがはぜる、ランダムな「パチ、パチ」
    const crackleCount = 10 + Math.floor(Math.random() * 6);
    for (let i = 0; i < crackleCount; i++) {
      const t = now + 0.08 + Math.random() * 1.1;
      const dur = 0.02 + Math.random() * 0.03;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, dur, (j, n) => 1 - j / n);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2500 + Math.random() * 3500;
      bp.Q.value = 4;
      const g = ctx.createGain();
      const amp = Math.max(0.01, (0.08 + Math.random() * 0.1) * (1 - (t - now) / 1.3)) * vol;
      g.gain.setValueAtTime(amp, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(bp).connect(g).connect(out);
      g.connect(reverb);
      src.start(t);
    }
  }

  function playChime() {
    const ctx = ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const reverb = ensureReverb(ctx);
    const base = 900 + Math.random() * 500; // 毎回わずかに音程を変えて単調さを避ける
    const partials = [1, 2.76, 4.18, 5.4]; // ガラス風鈴らしい非整数倍音

    partials.forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = base * ratio;
      const gain = ctx.createGain();
      const amp = 0.22 / (i + 1.3);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(amp, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8 - i * 0.25);
      osc.connect(gain).connect(ctx.destination);
      gain.connect(reverb);
      osc.start(now);
      osc.stop(now + 1.85);
    });

    // ガラスが触れ合う一瞬の高音トランジェント
    const tick = ctx.createBufferSource();
    tick.buffer = noiseBuffer(ctx, 0.02, (i, n) => 1 - i / n);
    const tickFilter = ctx.createBiquadFilter();
    tickFilter.type = "highpass";
    tickFilter.frequency.value = 4000;
    const tickGain = ctx.createGain();
    tickGain.gain.setValueAtTime(0.15, now);
    tickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    tick.connect(tickFilter).connect(tickGain).connect(ctx.destination);
    tick.start(now);
  }

  function playLaunch(vol = 1) {
    const ctx = ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 0.58;

    // ヒュルル…と上る笛のような音
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(1500, now + dur);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.exponentialRampToValueAtTime(0.13 * vol, now + 0.05);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(oscGain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);

    // シューッと空気を切るノイズ
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, dur, () => 1);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(4200, now + dur);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.1 * vol, now + 0.06);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    noise.connect(filter).connect(noiseGain).connect(ctx.destination);
    noise.start(now);
    noise.stop(now + dur + 0.02);
  }

  return { playBoom, playChime, playLaunch };
}

export default function App() {
  const [text, setText] = useState("");
  const [artwork, setArtwork] = useState(null); // { kind: "svg" | "raster", data }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [entries, setEntries] = useState([]); // セッション内のしおり
  const [styleKey, setStyleKey] = useState("watercolor");
  const [modelKey, setModelKey] = useState("sonnet");
  const [engineKey, setEngineKey] = useState("claude");
  const [savedText, setSavedText] = useState("");
  const [clickFireworks, setClickFireworks] = useState([]);
  const [launches, setLaunches] = useState([]);
  const [charge, setCharge] = useState(null); // { x, y } — 押している間の火種チャージ表示
  const dateRef = useRef(todayLabel());
  const clickFwId = useRef(0);
  const pressRef = useRef(null);
  const { playBoom, playChime, playLaunch } = useFestivalAudio();

  // 指定座標に花火を1発咲かせる(pan: 左右の音の定位、scale: 大きさ、vol: 音量)
  function spawnBloom(x, y, pan = 0, scale = 1, vol = 1) {
    const id = clickFwId.current++;
    const color = CLICK_FW_COLORS[Math.floor(Math.random() * CLICK_FW_COLORS.length)];
    const jitteredScale = scale * (0.9 + Math.random() * 0.2);
    setClickFireworks((prev) => [...prev, { id, x, y, color, scale: jitteredScale }]);
    playBoom(pan, vol);
    setTimeout(() => {
      setClickFireworks((prev) => prev.filter((f) => f.id !== id));
    }, 950);
  }

  // 日記・絵の欄以外でマウスを押して離すと、火種が「ピュー」と駆け上がって花火が咲く。
  // 押していた時間が長いほど、飛距離・花火の大きさ・音量が増す。
  function handlePressStart(e) {
    if (e.target.closest(".card")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pan = (x / rect.width) * 2 - 1;
    pressRef.current = { x, y, pan, start: performance.now() };
    setCharge({ x, y });
  }

  function handlePressEnd() {
    const press = pressRef.current;
    pressRef.current = null;
    setCharge(null);
    if (!press) return;

    const heldMs = performance.now() - press.start;
    const t = Math.min(heldMs, CHARGE_MAX_MS) / CHARGE_MAX_MS;
    const travel = CHARGE_MIN_TRAVEL + t * (CHARGE_MAX_TRAVEL - CHARGE_MIN_TRAVEL);
    const scale = CHARGE_MIN_SCALE + t * (CHARGE_MAX_SCALE - CHARGE_MIN_SCALE);
    const vol = CHARGE_MIN_VOL + t * (CHARGE_MAX_VOL - CHARGE_MIN_VOL);

    const id = clickFwId.current++;
    const dx = (Math.random() - 0.5) * 70;
    const targetY = Math.max(50, press.y - travel);
    setLaunches((prev) => [...prev, { id, x: press.x, y: press.y, dx, travel }]);
    playLaunch(vol);
    setTimeout(() => {
      setLaunches((prev) => prev.filter((l) => l.id !== id));
      spawnBloom(press.x + dx, targetY, press.pan, scale, vol);
    }, 620);
  }

  useEffect(() => {
    window.addEventListener("pointerup", handlePressEnd);
    return () => window.removeEventListener("pointerup", handlePressEnd);
  }, []);

  async function drawWithClaude(body, style) {
    const model = MODELS.find((m) => m.key === modelKey) || MODELS[0];
    const res = await fetch("/api/anthropic/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model.id,
        max_tokens: model.tokens,
        messages: [{ role: "user", content: buildPrompt(style.dir, body) }],
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
      return null;
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
      return null;
    }

    return { kind: "svg", data: found };
  }

  async function drawWithPollinations(body, style) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const prompt = buildPollinationsPrompt(style.img, body);
      const dataUrl = await fetchPollinationsImage(prompt, controller.signal);
      return { kind: "raster", data: dataUrl };
    } catch (e) {
      if (e.name === "AbortError") {
        setError("絵ができるまで時間がかかりすぎました(60秒)。混雑しているようです。もう一度ためしてみてください。");
      } else {
        console.error("Pollinations error:", e);
        setError("絵を描くところで止まってしまいました。もう一度ためしてみてください。");
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function draw() {
    const body = text.trim();
    if (!body) {
      setError("日記を書いてから、絵にできます。");
      return;
    }
    setLoading(true);
    setError("");
    setArtwork(null);
    try {
      const style = STYLES.find((s) => s.key === styleKey) || STYLES[0];
      const result =
        engineKey === "pollinations" ? await drawWithPollinations(body, style) : await drawWithClaude(body, style);
      if (!result) return;

      setArtwork(result);
      setSavedText(body);
      setEntries((prev) => [{ artwork: result, text: body, date: { ...dateRef.current } }, ...prev].slice(0, 12));
    } catch (e) {
      setError("通信に失敗しました。時間をおいて、もう一度ためしてみてください。");
    } finally {
      setLoading(false);
    }
  }

  function saveArtwork() {
    if (!artwork) return;
    const comp = composeArtwork(artwork, savedText || text, dateRef.current);
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

  function saveRaw() {
    if (!artwork) return;
    if (artwork.kind === "raster") {
      const a = document.createElement("a");
      a.href = artwork.data;
      a.download = `絵日記_絵のみ_${dateRef.current.y}_${dateRef.current.md}.jpg`;
      a.click();
      return;
    }
    const blob = new Blob([artwork.data], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `絵日記_絵のみ_${dateRef.current.y}_${dateRef.current.md}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const d = dateRef.current;

  return (
    <div style={styles.root} onPointerDown={handlePressStart}>
      <style>{css}</style>

      {/* 夏祭りの装飾(背面) */}
      <div className="deco" aria-hidden="true">
        {/* 天の川(瞬く星) */}
        {STARS.map((s, i) => (
          <span
            key={i}
            className="star"
            style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.d, animationDuration: s.dur }}
          />
        ))}

        <div className="lanterns">
          <span className="wire" />
          {LANTERNS.map((L, i) => (
            <span key={i} className="lantern" style={{ left: L.left, animationDelay: L.d }}>
              <span className="lantern-body" style={{ color: L.c }} />
            </span>
          ))}
        </div>
        {FIREWORKS.map((f, i) => (
          <span
            key={i}
            className="fw"
            style={{ top: f.top, left: f.left, color: f.c, animationDelay: f.d, "--fw-scale": f.scale }}
          />
        ))}
        {clickFireworks.map((f) => (
          <span
            key={f.id}
            className="fw click-fw"
            style={{ left: f.x, top: f.y, color: f.color, "--fw-scale": f.scale }}
          />
        ))}
        {launches.map((l) => (
          <span
            key={l.id}
            className="fw-launch"
            style={{ left: l.x, top: l.y, "--dx": `${l.dx}px`, "--travel": `${l.travel}px` }}
          />
        ))}
        {charge && <span className="charge-ring" style={{ left: charge.x, top: charge.y }} />}
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="firefly"
            style={{ left: p.left, bottom: p.bottom, animationDelay: p.d, animationDuration: p.dur }}
          />
        ))}

        {/* 縁日の屋台のシルエット */}
        <div className="yatai-row">
          {YATAI.map((y, i) => (
            <svg key={i} className="yatai" style={{ left: y.left, width: y.w, height: y.w * 0.62 }} viewBox="0 0 60 38" preserveAspectRatio="none">
              <polygon points="0,16 60,16 50,2 10,2" />
              <rect x="4" y="16" width="52" height="20" />
              <rect x="24" y="24" width="10" height="12" fill="#241033" />
            </svg>
          ))}
        </div>

        {/* 打ち水のしぶき */}
        {SPLASHES.map((s, i) => (
          <span key={i} className="splash" style={{ left: s.left, animationDelay: s.d }} />
        ))}

        {/* 蚊取り線香 */}
        <div className="kayari">
          <svg viewBox="0 0 32 32" width="30" height="30">
            <path
              d="M16 24 a8 8 0 1 1 5.6-13.6 a5.5 5.5 0 1 1 -3.9 9.5 a3 3 0 1 1 -2.1-5.1"
              fill="none"
              stroke="#B65C38"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="16" cy="26" r="1.4" fill="#8A3A22" />
          </svg>
          <span className="smoke" />
        </div>

        {/* すだれ */}
        <div className="sudare">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} style={{ left: `${i * 11 + 2}%` }} />
          ))}
        </div>
      </div>

      {/* 風鈴(クリックで鳴らせます) */}
      <div
        className="furin"
        role="button"
        tabIndex={0}
        aria-label="風鈴を鳴らす"
        onClick={(e) => { e.stopPropagation(); playChime(); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); playChime(); } }}
        onAnimationIteration={(e) => { if (e.animationName === "sway") playChime(); }}
      >
        <div className="furin-string" />
        <div className="furin-bell">
          <div className="furin-inner" />
        </div>
        <div className="furin-tanzaku" />
      </div>

      <header style={styles.header}>
        <div style={styles.season} aria-label="絵日記">
          <svg viewBox="0 0 40 40" width="30" height="30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <filter id="badgeGlow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="1.8" />
              </filter>
            </defs>
            <g className="badge-fw-rays" stroke="#FBEFCB" strokeWidth="2.2" strokeLinecap="round" filter="url(#badgeGlow)">
              <line x1="20" y1="17" x2="20" y2="2" />
              <line x1="20" y1="17" x2="31" y2="6" />
              <line x1="20" y1="17" x2="35" y2="17" />
              <line x1="20" y1="17" x2="31" y2="28" />
              <line x1="20" y1="17" x2="9" y2="28" />
              <line x1="20" y1="17" x2="5" y2="17" />
              <line x1="20" y1="17" x2="9" y2="6" />
            </g>
            <g stroke="#FBEFCB" strokeWidth="1.6" strokeLinecap="round">
              <line x1="20" y1="17" x2="20" y2="2" />
              <line x1="20" y1="17" x2="31" y2="6" />
              <line x1="20" y1="17" x2="35" y2="17" />
              <line x1="20" y1="17" x2="31" y2="28" />
              <line x1="20" y1="17" x2="9" y2="28" />
              <line x1="20" y1="17" x2="5" y2="17" />
              <line x1="20" y1="17" x2="9" y2="6" />
            </g>
            <circle cx="20" cy="17" r="9.5" fill="none" stroke="#FBEFCB" strokeWidth="1" strokeOpacity="0.4" />
            <circle className="badge-fw-core" cx="20" cy="17" r="5" fill="#FBEFCB" />
            <path d="M20 22 L24.5 34 L20 39.5 L15.5 34 Z" fill="#2A2622" stroke="#FBEFCB" strokeWidth="0.8" />
          </svg>
        </div>
        <h1 style={styles.title} className="neon">絵日記</h1>
        <p style={styles.subtitle}>今日は何がありましたか？</p>
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
            <span style={styles.styleLabel}>エンジン</span>
            {ENGINES.map((en) => (
              <button
                key={en.key}
                onClick={() => setEngineKey(en.key)}
                style={{ ...styles.stylePill, ...(engineKey === en.key ? styles.stylePillOn : {}) }}
              >
                {en.label}
              </button>
            ))}
            <span style={styles.modelHint}>
              {engineKey === "pollinations" ? "APIキー不要・低コスト" : "SVGで描き、なめらかに拡大できる"}
            </span>
          </div>

          {engineKey === "claude" && (
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
          )}

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
            {!loading && artwork && artwork.kind === "svg" && (
              <div
                className="svg-in"
                style={styles.svgHost}
                dangerouslySetInnerHTML={{ __html: artwork.data }}
              />
            )}
            {!loading && artwork && artwork.kind === "raster" && (
              <div className="svg-in" style={styles.svgHost}>
                <img src={artwork.data} alt="生成された絵" style={styles.rasterImg} />
              </div>
            )}
            {!loading && !artwork && (
              <div style={styles.placeholder}>
                <div className="unmei" aria-hidden="true">画帳</div>
                <p style={styles.placeholderText}>ここに、きょうの絵が出ます</p>
              </div>
            )}
          </div>

          {artwork && !loading && (
            <div style={styles.saveRow}>
              <button style={styles.saveMain} onClick={saveArtwork}>
                作品を保存(絵＋日記)
              </button>
              <button style={styles.saveSub} onClick={saveRaw}>
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
            {entries.map((en, i) =>
              en.artwork.kind === "svg" ? (
                <button
                  key={i}
                  style={styles.thumb}
                  onClick={() => { setArtwork(en.artwork); setText(en.text); setSavedText(en.text); }}
                  dangerouslySetInnerHTML={{ __html: en.artwork.data }}
                  aria-label={`${en.date.md}の絵`}
                />
              ) : (
                <button
                  key={i}
                  style={styles.thumb}
                  onClick={() => { setArtwork(en.artwork); setText(en.text); setSavedText(en.text); }}
                  aria-label={`${en.date.md}の絵`}
                >
                  <img src={en.artwork.data} alt="" style={styles.rasterImg} />
                </button>
              )
            )}
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

/* 打ち上げ花火(大玉+小玉の二重リングで派手に) */
.fw { position: absolute; width: 7px; height: 7px; border-radius: 50%; background: currentColor; opacity: 0;
  box-shadow:
    52px 0 4px 1px currentColor, 45px 26px 4px 1px currentColor, 26px 45px 4px 1px currentColor, 0 52px 4px 1px currentColor,
    -26px 45px 4px 1px currentColor, -45px 26px 4px 1px currentColor, -52px 0 4px 1px currentColor, -45px -26px 4px 1px currentColor,
    -26px -45px 4px 1px currentColor, 0 -52px 4px 1px currentColor, 26px -45px 4px 1px currentColor, 45px -26px 4px 1px currentColor,
    30px 15px 3px 0 currentColor, 15px 30px 3px 0 currentColor, -15px 30px 3px 0 currentColor, -30px 15px 3px 0 currentColor,
    -30px -15px 3px 0 currentColor, -15px -30px 3px 0 currentColor, 15px -30px 3px 0 currentColor, 30px -15px 3px 0 currentColor;
  filter: drop-shadow(0 0 12px currentColor);
  animation: burst 5.2s ease-out infinite; }
@keyframes burst {
  0% { opacity: 0; transform: scale(calc(var(--fw-scale, 1) * .15)); }
  5% { opacity: 1; }
  36% { opacity: .95; transform: scale(var(--fw-scale, 1)); }
  64% { opacity: 0; transform: scale(calc(var(--fw-scale, 1) * 1.5)); }
  100% { opacity: 0; transform: scale(calc(var(--fw-scale, 1) * 1.5)); }
}

/* クリックした場所に咲く単発の花火 */
.click-fw { animation: burstOnce .9s ease-out both; z-index: 5; }
@keyframes burstOnce {
  0% { opacity: 0; transform: scale(calc(var(--fw-scale, 1) * .1)); }
  8% { opacity: 1; }
  40% { opacity: 1; transform: scale(var(--fw-scale, 1)); }
  100% { opacity: 0; transform: scale(calc(var(--fw-scale, 1) * 1.6)); }
}

/* 火種が「ピュー」と駆け上がる打ち上げ演出 */
.fw-launch {
  position: absolute; width: 4px; height: 4px; border-radius: 50%;
  background: #fff8d8; box-shadow: 0 0 8px 3px rgba(255,214,120,.9);
  animation: launchUp .62s cubic-bezier(.3,.6,.4,1) both;
  z-index: 5;
}
.fw-launch::after {
  content: ""; position: absolute; left: 50%; top: 100%; width: 2px; height: 34px;
  background: linear-gradient(to top, transparent, rgba(255,200,110,.85));
  transform: translateX(-50%);
}
@keyframes launchUp {
  0% { transform: translate(0, 0); opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translate(var(--dx), calc(-1 * var(--travel))); opacity: .85; }
}

/* 押している間、火種を溜めるリング */
.charge-ring {
  position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px;
  border-radius: 50%; border: 2px solid rgba(255,214,120,.85);
  box-shadow: 0 0 10px rgba(255,190,90,.6);
  animation: chargeGrow 1.4s linear forwards;
  z-index: 5;
}
@keyframes chargeGrow {
  0% { transform: scale(.3); opacity: .9; }
  100% { transform: scale(3.2); opacity: .15; }
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

/* 天の川(瞬く星) */
.star { position: absolute; border-radius: 50%; background: #fff; opacity: .15; animation-name: twinkle; animation-timing-function: ease-in-out; animation-iteration-count: infinite; box-shadow: 0 0 4px rgba(255,255,255,.8); }
@keyframes twinkle { 0%,100% { opacity: .15; transform: scale(.8); } 50% { opacity: 1; transform: scale(1.2); } }

/* 縁日の屋台のシルエット */
.yatai-row { position: absolute; left: 0; right: 0; bottom: 0; height: 40px; opacity: .32; }
.yatai { position: absolute; bottom: 0; fill: #0b0714; }

/* 打ち水のしぶき */
.splash { position: absolute; bottom: 18px; width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,.5); opacity: 0; animation: splash 4.5s ease-out infinite; }
@keyframes splash {
  0% { transform: scale(.2); opacity: 0; }
  8% { opacity: .55; }
  30% { transform: scale(1.7); opacity: 0; }
  100% { opacity: 0; }
}

/* 蚊取り線香 */
.kayari { position: absolute; left: 18px; bottom: 44px; opacity: .9; }
.kayari .smoke { position: absolute; left: 13px; bottom: 24px; width: 3px; height: 3px; border-radius: 50%; background: rgba(255,255,255,.55); filter: blur(1px); animation: smokeRise 3.6s ease-in infinite; }
@keyframes smokeRise {
  0% { transform: translate(0,0) scaleX(1); opacity: 0; }
  15% { opacity: .5; }
  55% { transform: translate(6px,-30px) scaleX(1.8); opacity: .3; }
  100% { transform: translate(-4px,-62px) scaleX(2.6); opacity: 0; }
}

/* すだれ */
.sudare { position: absolute; top: 0; left: 0; width: 96px; height: 150px; opacity: .35; transform-origin: top center; animation: sway 6s ease-in-out infinite; }
.sudare span { position: absolute; top: 0; width: 3px; height: 100%; background: linear-gradient(180deg, rgba(230,200,150,.7), rgba(180,140,90,.3)); }

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

/* ── バッジの花火アイコン ── */
.badge-fw-rays { animation: badgeRays 2.6s ease-in-out infinite; transform-origin: 20px 17px; }
.badge-fw-core { animation: badgeCore 2.6s ease-in-out infinite; transform-origin: 20px 17px; }
@keyframes badgeRays { 0%,100% { opacity: 0.5; transform: scale(0.94); } 50% { opacity: 1; transform: scale(1.05); } }
@keyframes badgeCore { 0%,100% { opacity: 0.8; transform: scale(0.92); } 50% { opacity: 1; transform: scale(1.12); } }

/* ── 生成の演出 ── */
.svg-in { animation: reveal 1.1s ease both; }
.svg-in svg { width: 100%; height: auto; display: block; }
.svg-in img { width: 100%; height: 100%; display: block; }
@keyframes reveal { from { opacity: 0; filter: blur(6px) saturate(.6); transform: scale(.98); } to { opacity: 1; filter: blur(0) saturate(1); transform: scale(1); } }
.ink { width: 46px; height: 46px; border-radius: 50%; background: radial-gradient(circle, ${C.asagi}, ${C.ai}); box-shadow: 0 0 22px rgba(94,147,166,.6); animation: spread 1.4s ease-in-out infinite; }
@keyframes spread { 0% { transform: scale(.4); opacity: .3; } 50% { transform: scale(1); opacity: .65; } 100% { transform: scale(.4); opacity: .3; } }
.unmei { font-family: 'Shippori Mincho', serif; font-size: 30px; color: ${C.ai}; opacity: .18; letter-spacing: .2em; }

textarea::placeholder { color: ${C.sumi}; opacity: .38; }
textarea:focus { outline: 2px solid ${C.asagi}; outline-offset: 2px; }
button:focus-visible { outline: 2px solid ${C.shu}; outline-offset: 3px; }

@media (prefers-reduced-motion: reduce) {
  .furin, .furin-tanzaku, .ink, .svg-in, .lantern, .lantern-body, .fw, .click-fw, .fw-launch, .charge-ring, .firefly, .card, .badge-fw-rays, .badge-fw-core, .star, .splash, .kayari .smoke, .sudare { animation: none !important; transition: none !important; }
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
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 10px",
    background: `linear-gradient(135deg, ${C.shu}, ${C.yuyake})`,
    width: 46,
    height: 46,
    borderRadius: 10,
    boxShadow: "0 0 20px rgba(239,154,61,.5), 2px 3px 0 rgba(0,0,0,.25)",
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
  rasterImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
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
