import React, { useState, useRef, useEffect } from "react";
import { supabase } from "./supabaseClient";

// 日本の夏 絵日記アプリ
// 日記本文 → Claude(claude-sonnet-4-6)がSVGイラストに変換 → 絵日記ページに表示

// 作風プリセット(画面から選べる)
const STYLES = [
  {
    key: "watercolor-pencil",
    label: "水彩色鉛筆風",
    dir: "アニメ塗りのようなくっきりした塗りではなく、にじみやムラのある水彩と、紙の質感が透ける色鉛筆の重ね塗りで描く。輪郭は淡く、色は彩度を抑えて優しく発色させ、素朴であたたかい雰囲気にする。",
    img: "soft watercolor and colored pencil illustration, visible paper texture, gentle bleeding watercolor edges, muted pastel colors, rustic warm hand-colored feel",
  },
  {
    key: "sketch",
    label: "らくがき風",
    dir: "均一に整えすぎず、少し震えたような手描きの線(輪郭をわずかに二重線にする、ゆらぎのあるストローク)で描く。塗りもきっちり塗り分けず、はみ出しやムラを少し残し、完璧すぎないラフでゆるい仕上がりにする。個人の日記帳にさらっと描いたような、親密で気取らない空気感にする。",
    img: "hand-drawn doodle sketch style, wobbly uneven pencil lines, loose imperfect linework, casual personal diary sketch feel, rough scribbly illustration, not too polished",
  },
  {
    key: "comic-essay",
    label: "エッセイ漫画風",
    dir: "コマ割り風に画面を枠線で区切り、吹き出し(丸みを帯びた形)を組み合わせた、絵日記エッセイ漫画のような構図で描く。人物はやや簡略化したかわいらしいプロポーションにし、擬音や効果線などのマンガ的な記号を図形(線・円・多角形)で添える。文字は描かず、形と線の組み合わせだけでエッセイ漫画らしい雰囲気を出す。",
    img: "Japanese comic essay illustration style (manga essay / 4-koma inspired), panel border lines, simple speech bubble shapes, cute simplified chibi-style character, manga sound-effect lines, storytelling composition, blank speech bubbles with no readable text",
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

// 絵(SVG文字列 または ラスター画像のdata URL)を、そのままファイルとしてダウンロードする
function downloadArtwork(kind, data, filenameBase) {
  if (kind === "raster") {
    const a = document.createElement("a");
    a.href = data;
    a.download = `${filenameBase}.jpg`;
    a.click();
    return;
  }
  const blob = new Blob([data], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}.svg`;
  a.click();
  URL.revokeObjectURL(url);
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

// 花火・風鈴の効果音(録音したmp3を再生する)
const SFX_LAUNCH = "/audio/launch.mp3"; // 打ち上げ(ヒュー)
const SFX_BOOM = "/audio/boom.mp3"; // 自動で打ち上がる花火の爆発音
const SFX_BOOM_LAUNCH = "/audio/boom_launch.mp3"; // 火種(打ち上げ)から爆発する花火の爆発音
const SFX_CHIME = "/audio/chime.mp3"; // 風鈴(チリン)

const CHIME_REST_MS = 5000; // 風鈴の音を鳴らす間隔(この時間内は再度鳴らさない)

function useFestivalAudio() {
  const ctxRef = useRef(null);
  const lastChimeRef = useRef(0);

  // パン(左右定位)が必要な音だけ、Web Audio経由でステレオパンをかける
  function ensureCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctxRef.current) ctxRef.current = new AC();
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }

  // 最初のクリック/タップで音を解禁(ブラウザの自動再生制限に対応)
  useEffect(() => {
    const unlock = () => ensureCtx();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // 再生したAudio要素を返す(呼び出し側で途中停止できるように)。
  // vol が1を超える場合、audio.volume(最大1まで)では頭打ちになるため、
  // GainNode(1を超えて本当に増幅できる)経由で音量を上げる。
  // startAt/stopAt を指定すると、その区間(秒)だけを再生する
  // (1つの音源ファイルに複数発分の音が収録されている場合に、1発分だけ再生するため)
  function playClip(url, { vol = 1, pan = 0, startAt = 0, stopAt = null } = {}) {
    const audio = new Audio(url);
    const ctx = ensureCtx();

    if (startAt > 0) {
      audio.currentTime = startAt;
      audio.addEventListener("loadedmetadata", () => { audio.currentTime = startAt; }, { once: true });
    }

    if (stopAt) {
      setTimeout(() => audio.pause(), Math.max(0, stopAt - startAt) * 1000);
    }

    if (ctx && (pan !== 0 || vol > 1)) {
      try {
        const src = ctx.createMediaElementSource(audio);
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, vol);
        let node = src.connect(gain);
        if (pan !== 0 && ctx.createStereoPanner) {
          const panner = ctx.createStereoPanner();
          panner.pan.value = Math.max(-1, Math.min(1, pan));
          node = gain.connect(panner);
        } else {
          node = gain;
        }
        node.connect(ctx.destination);
        audio.play().catch(() => { });
        return audio;
      } catch {
        // 失敗した場合は、通常のaudio.volumeでの再生にフォールバックする
      }
    }

    audio.volume = Math.max(0, Math.min(1, vol));
    audio.play().catch(() => { });
    return audio;
  }

  const playBoom = (pan = 0, vol = 1) => playClip(SFX_BOOM, { vol, pan }); // 自動で打ち上がる花火用
  // 火種から爆発する花火用。収録音源には複数発分入っているため、無音の前置き部分を
  // 飛ばして0.25秒から再生し、2発目が始まる1.00秒より前の0.95秒で止める
  const playLaunchBoom = (pan = 0, vol = 1) => playClip(SFX_BOOM_LAUNCH, { vol, pan, startAt: 0.35, stopAt: 0.95 });
  const playLaunch = (vol = 1) => playClip(SFX_LAUNCH, { vol });

  // 風鈴: 前回の再生から CHIME_REST_MS 経っていなければ鳴らさない
  function playChime() {
    const now = performance.now();
    if (now - lastChimeRef.current < CHIME_REST_MS) return;
    lastChimeRef.current = now;
    playClip(SFX_CHIME, { vol: 1 });
  }

  return { playBoom, playLaunchBoom, playChime, playLaunch };
}

// "22%" のような left 値を、左右定位(-1〜1)に変換する
function pctToPan(pct) {
  const n = parseFloat(pct);
  if (Number.isNaN(n)) return 0;
  return (n / 100) * 2 - 1;
}

// 背景の装飾(星・提灯・花火・蛍・屋台・打ち水・すだれ)。ログイン画面・本編で共通。
// onBoom を渡すと、自動で打ち上がる花火が咲くタイミングにあわせて爆発音を鳴らす。
function AmbientDeco({ onBoom }) {
  return (
    <>
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
            <span className="lantern-body" style={{ color: L.c }}>
              <NatsuMotif width={30} height={30} style={{ left: 3, top: 9 }} />
            </span>
            <span className="lantern-tassel" />
          </span>
        ))}
      </div>
      {FIREWORKS.map((f, i) => (
        <span
          key={i}
          className="fw"
          style={{ top: f.top, left: f.left, color: f.c, animationDelay: f.d, "--fw-scale": f.scale }}
          onAnimationIteration={(e) => {
            if (e.animationName === "burst" && onBoom) onBoom(pctToPan(f.left), 0.6);
          }}
        />
      ))}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="firefly"
          style={{ left: p.left, bottom: p.bottom, animationDelay: p.d, animationDuration: p.dur }}
        />
      ))}

      <div className="yatai-row">
        {YATAI.map((y, i) => (
          <svg key={i} className="yatai" style={{ left: y.left, width: y.w, height: y.w * 0.62 }} viewBox="0 0 60 38" preserveAspectRatio="none">
            <polygon points="0,16 60,16 50,2 10,2" />
            <rect x="4" y="16" width="52" height="20" />
            <rect x="24" y="24" width="10" height="12" fill="#241033" />
          </svg>
        ))}
      </div>

      {SPLASHES.map((s, i) => (
        <span key={i} className="splash" style={{ left: s.left, animationDelay: s.d }} />
      ))}

      <div className="sudare">
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} style={{ left: `${i * 11 + 2}%` }} />
        ))}
      </div>
    </>
  );
}

// 金魚と朝顔の絵付けモチーフ(提灯・風鈴に共通で使う簡易SVG)
function NatsuMotif({ width, height, style }) {
  return (
    <svg viewBox="0 0 40 40" width={width} height={height} style={{ position: "absolute", ...style }} aria-hidden="true">
      <g transform="translate(9,26)">
        {[0, 72, 144, 216, 288].map((deg) => (
          <ellipse key={deg} cx="0" cy="-6" rx="2.6" ry="4.4" fill="#5B8DEF" opacity="0.92" transform={`rotate(${deg})`} />
        ))}
        <circle cx="0" cy="0" r="1.7" fill="#FFF6D8" />
      </g>
      <g transform="translate(23,11) rotate(-10)">
        <path d="M-6 0 C-6 -3 -2 -5 3 -5 C7 -5 10 -2 12 0 C10 2 7 5 3 5 C-2 5 -6 3 -6 0 Z" fill="#FF6B35" />
        <path d="M12 0 L17 -4 L15 0 L17 4 Z" fill="#FF6B35" />
        <circle cx="-3" cy="-1" r="0.7" fill="#2A2622" />
      </g>
      <g transform="translate(15,20) rotate(12) scale(0.78)">
        <path d="M-6 0 C-6 -3 -2 -5 3 -5 C7 -5 10 -2 12 0 C10 2 7 5 3 5 C-2 5 -6 3 -6 0 Z" fill="#FF8C5A" />
        <path d="M12 0 L17 -4 L15 0 L17 4 Z" fill="#FF8C5A" />
        <circle cx="-3" cy="-1" r="0.7" fill="#2A2622" />
      </g>
    </svg>
  );
}

// 風鈴(クリック/タップで鳴らせます)
function FurinChime({ onChime }) {
  return (
    <div
      className="furin"
      role="button"
      tabIndex={0}
      aria-label="風鈴を鳴らす"
      onClick={(e) => { e.stopPropagation(); onChime(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChime(); } }}
      onAnimationIteration={(e) => { if (e.animationName === "sway") onChime(); }}
    >
      <div className="furin-string" />
      <div className="furin-bell">
        <NatsuMotif width={26} height={26} style={{ left: 8, top: 4 }} />
        <div className="furin-inner" />
      </div>
      <div className="furin-tanzaku" />
    </div>
  );
}

// ロゴバッジ＋タイトル＋サブタイトル。ログイン画面・本編で共通。
// above: サブタイトルの上に表示する内容(ユーザー名など)、below: 下に表示する内容(ログアウト等)
function BrandHeader({ subtitle, above, below }) {
  return (
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
      {above}
      <p style={styles.subtitle}>{subtitle}</p>
      {below}
    </header>
  );
}

// ログイン/新規登録フォーム(ゲート画面・本編モーダル両方で共通)
function AuthForm({ authMode, setAuthMode, authUsername, setAuthUsername, authEmail, setAuthEmail, authPassword, setAuthPassword, authError, setAuthError, authBusy, onSignIn, onSignUp }) {
  return (
    <div style={styles.authPanel}>
      <div style={styles.authTabs}>
        <button
          style={{ ...styles.authTab, ...(authMode === "signin" ? styles.authTabOn : {}) }}
          onClick={() => { setAuthMode("signin"); setAuthError(""); }}
        >
          ログイン
        </button>
        <button
          style={{ ...styles.authTab, ...(authMode === "signup" ? styles.authTabOn : {}) }}
          onClick={() => { setAuthMode("signup"); setAuthError(""); }}
        >
          新規登録
        </button>
      </div>

      <form onSubmit={authMode === "signup" ? onSignUp : onSignIn} style={styles.authForm}>
        {authMode === "signup" && (
          <input
            style={styles.authInput}
            placeholder="ユーザー名"
            value={authUsername}
            onChange={(e) => setAuthUsername(e.target.value)}
            required
          />
        )}
        <input
          style={styles.authInput}
          type="email"
          placeholder="メールアドレス"
          value={authEmail}
          onChange={(e) => setAuthEmail(e.target.value)}
          required
        />
        <input
          style={styles.authInput}
          type="password"
          placeholder="パスワード(6文字以上)"
          value={authPassword}
          onChange={(e) => setAuthPassword(e.target.value)}
          minLength={6}
          required
        />
        {authError && <p style={styles.authError}>{authError}</p>}
        <button style={styles.authSubmit} type="submit" disabled={authBusy}>
          {authBusy ? "処理中…" : authMode === "signup" ? "登録する" : "ログイン"}
        </button>
      </form>
    </div>
  );
}

// マイページ: 保存済みの絵日記の一覧
function MyPageThumb({ kind, data }) {
  if (kind === "svg" && data) {
    return <div style={styles.mypageThumbInner} dangerouslySetInnerHTML={{ __html: data }} />;
  }
  if (kind === "raster" && data) {
    return <img src={data} alt="" style={styles.rasterImg} />;
  }
  return <div style={styles.mypageThumbPlaceholder}>絵なし</div>;
}

function MyPage({ images, onDeleteImage, entries, onOpen, onDelete }) {
  return (
    <section style={styles.mypageWrap} className="card">
      <h2 style={styles.mypageTitle}>マイページ</h2>

      <h3 style={styles.mypageSectionTitle}>生成した絵</h3>
      {images.length === 0 ? (
        <p style={styles.mypageEmpty}>まだ生成した絵がありません。「絵にする」を押すと、ここに並びます。</p>
      ) : (
        <div style={styles.mypageGrid}>
          {images.map((im) => (
            <div key={im.id} style={styles.mypageCard}>
              <div style={styles.mypageThumb}>
                <MyPageThumb kind={im.artwork_kind} data={im.artwork_data} />
              </div>
              <div style={styles.mypageDate}>
                {new Date(im.created_at).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}
              </div>
              <div style={styles.mypageActions}>
                <button
                  style={styles.mypageOpenBtn}
                  onClick={() => downloadArtwork(im.artwork_kind, im.artwork_data, `絵日記_絵_${im.id.slice(0, 8)}`)}
                >
                  ダウンロード
                </button>
                <button
                  style={styles.mypageDeleteBtn}
                  onClick={() => { if (window.confirm("この絵を削除しますか？")) onDeleteImage(im.id); }}
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ ...styles.mypageSectionTitle, marginTop: 28 }}>保存した絵日記</h3>
      {entries.length === 0 ? (
        <p style={styles.mypageEmpty}>
          まだ保存された絵日記がありません。日記を書いて「日記を保存」を押すと、ここに並びます。
        </p>
      ) : (
        <div style={styles.mypageGrid}>
          {entries.map((en) => (
            <div key={en.id} style={styles.mypageCard}>
              <div style={styles.mypageThumb}>
                <MyPageThumb kind={en.artwork_kind} data={en.artwork_data} />
              </div>
              <div style={styles.mypageDate}>
                {new Date(en.created_at).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}
              </div>
              <p style={styles.mypageBody}>{en.body}</p>
              <div style={styles.mypageActions}>
                <button style={styles.mypageOpenBtn} onClick={() => onOpen(en)}>開く</button>
                {en.artwork_kind && en.artwork_data && (
                  <button
                    style={styles.mypageDeleteBtn}
                    onClick={() => downloadArtwork(en.artwork_kind, en.artwork_data, `絵日記_${en.id.slice(0, 8)}`)}
                  >
                    DL
                  </button>
                )}
                <button
                  style={styles.mypageDeleteBtn}
                  onClick={() => { if (window.confirm("この絵日記を削除しますか？")) onDelete(en.id); }}
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [text, setText] = useState("");
  const [artwork, setArtwork] = useState(null); // { kind: "svg" | "raster", data }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [entries, setEntries] = useState([]); // セッション内のしおり
  const [styleKey, setStyleKey] = useState("watercolor-pencil");
  const [modelKey, setModelKey] = useState("sonnet");
  const [engineKey, setEngineKey] = useState("claude");
  const [savedText, setSavedText] = useState("");
  const [clickFireworks, setClickFireworks] = useState([]);
  const [launches, setLaunches] = useState([]);
  const [charge, setCharge] = useState(null); // { x, y } — 押している間の火種チャージ表示
  const dateRef = useRef(todayLabel());
  const clickFwId = useRef(0);
  const pressRef = useRef(null);
  const { playBoom, playLaunchBoom, playChime, playLaunch } = useFestivalAudio();

  // Supabase 認証・日記の保存
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(!!supabase);
  const [authMode, setAuthMode] = useState("signin"); // "signin" | "signup"
  const [authUsername, setAuthUsername] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [savedEntries, setSavedEntries] = useState([]);
  const [savingDiary, setSavingDiary] = useState(false);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [view, setView] = useState("diary"); // "diary" | "mypage"

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setSavedEntries([]);
      setGeneratedImages([]);
      return;
    }
    supabase
      .from("diary_entries")
      .select("id, body, style_key, artwork_kind, artwork_data, created_at")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error: err }) => {
        if (!err && data) setSavedEntries(data);
      });
    supabase
      .from("generated_images")
      .select("id, artwork_kind, artwork_data, style_key, created_at")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error: err }) => {
        if (!err && data) setGeneratedImages(data);
      });
  }, [session]);

  // 絵を生成するたびに、マイページの「生成した絵」欄へ自動保存する
  async function saveGeneratedImageToCloud(result) {
    if (!supabase || !session) return;
    const { data, error: err } = await supabase
      .from("generated_images")
      .insert({ user_id: session.user.id, artwork_kind: result.kind, artwork_data: result.data, style_key: styleKey })
      .select()
      .single();
    if (!err && data) setGeneratedImages((prev) => [data, ...prev].slice(0, 50));
  }

  // マイページ: 保存済みの絵日記を編集画面に呼び出す
  function openSavedEntry(en) {
    setText(en.body);
    setSavedText(en.body);
    if (en.style_key && STYLES.some((s) => s.key === en.style_key)) setStyleKey(en.style_key);
    setArtwork(en.artwork_kind && en.artwork_data ? { kind: en.artwork_kind, data: en.artwork_data } : null);
    setView("diary");
  }

  // マイページ: 保存済みの絵日記を削除する
  async function deleteSavedEntry(id) {
    if (!supabase) return;
    const { error: err } = await supabase.from("diary_entries").delete().eq("id", id);
    if (err) {
      setError("削除に失敗しました(" + err.message + ")。");
      return;
    }
    setSavedEntries((prev) => prev.filter((en) => en.id !== id));
  }

  // マイページ: 生成した絵を削除する
  async function deleteGeneratedImage(id) {
    if (!supabase) return;
    const { error: err } = await supabase.from("generated_images").delete().eq("id", id);
    if (err) {
      setError("削除に失敗しました(" + err.message + ")。");
      return;
    }
    setGeneratedImages((prev) => prev.filter((en) => en.id !== id));
  }

  async function handleSignUp(e) {
    e.preventDefault();
    if (!supabase) return;
    setAuthError("");
    setAuthBusy(true);
    const { error: err } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
      options: { data: { username: authUsername } },
    });
    setAuthBusy(false);
    if (err) {
      setAuthError(err.message);
      return;
    }
    setAuthError("確認メールを送信しました。メール内のリンクを開いて登録を完了してください。");
  }

  async function handleSignIn(e) {
    e.preventDefault();
    if (!supabase) return;
    setAuthError("");
    setAuthBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    setAuthBusy(false);
    if (err) {
      setAuthError(err.message);
      return;
    }
    setAuthEmail("");
    setAuthPassword("");
    setAuthUsername("");
  }

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  async function saveDiaryToCloud() {
    const body = text.trim();
    if (!body) {
      setError("日記を書いてから保存できます。");
      return;
    }
    if (!supabase) {
      setError("Supabaseが設定されていません。.env に VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY を設定してください。");
      return;
    }
    if (!session) {
      setError("ログインが必要です。ページを再読み込みしてログインしてください。");
      return;
    }
    setSavingDiary(true);
    const payload = { user_id: session.user.id, body, style_key: styleKey };
    if (artwork) {
      payload.artwork_kind = artwork.kind;
      payload.artwork_data = artwork.data;
    }
    const { data, error: err } = await supabase
      .from("diary_entries")
      .insert(payload)
      .select()
      .single();
    setSavingDiary(false);
    if (err) {
      setError("日記の保存に失敗しました(" + err.message + ")。");
      return;
    }
    setSavedEntries((prev) => [data, ...prev].slice(0, 20));
  }

  // 指定座標に花火を1発咲かせる(pan: 左右の音の定位、scale: 大きさ、vol: 音量)
  // ※これは火種(打ち上げ)から爆発する花火専用なので、爆発音は playLaunchBoom を使う
  function spawnBloom(x, y, pan = 0, scale = 1, vol = 1) {
    const id = clickFwId.current++;
    const color = CLICK_FW_COLORS[Math.floor(Math.random() * CLICK_FW_COLORS.length)];
    const jitteredScale = scale * (0.9 + Math.random() * 0.2);
    setClickFireworks((prev) => [...prev, { id, x, y, color, scale: jitteredScale }]);
    playLaunchBoom(pan, vol);
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
    const launchAudio = playLaunch(vol);
    setTimeout(() => {
      // 花火が咲く(火種が爆発する)瞬間に、打ち上げ音を止める
      if (launchAudio) {
        launchAudio.pause();
        launchAudio.currentTime = 0;
      }
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
      saveGeneratedImageToCloud(result);
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

  // 初回のセッション確認中(一瞬)
  if (authLoading) {
    return (
      <div style={styles.root}>
        <style>{css}</style>
        <div className="deco" aria-hidden="true"><AmbientDeco onBoom={playBoom} /></div>
        <div style={styles.gateLoading}><div className="ink" /></div>
      </div>
    );
  }

  // Supabase設定済みで未ログインの場合は、ログイン/新規登録画面だけを表示する
  if (supabase && !session) {
    return (
      <div style={styles.root}>
        <style>{css}</style>

        <div className="deco" aria-hidden="true"><AmbientDeco onBoom={playBoom} /></div>
        <FurinChime onChime={playChime} />

        <BrandHeader subtitle="ログインして、きょうの絵日記を書きましょう" />

        <div style={styles.authGate}>
          <AuthForm
            authMode={authMode}
            setAuthMode={setAuthMode}
            authUsername={authUsername}
            setAuthUsername={setAuthUsername}
            authEmail={authEmail}
            setAuthEmail={setAuthEmail}
            authPassword={authPassword}
            setAuthPassword={setAuthPassword}
            authError={authError}
            setAuthError={setAuthError}
            authBusy={authBusy}
            onSignIn={handleSignIn}
            onSignUp={handleSignUp}
          />
        </div>

        <footer style={styles.footer}>夜空に花火、軒に提灯</footer>
      </div>
    );
  }

  return (
    <div style={styles.root} onPointerDown={handlePressStart}>
      <style>{css}</style>

      {/* 夏祭りの装飾(背面) */}
      <div className="deco" aria-hidden="true">
        <AmbientDeco onBoom={playBoom} />
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
      </div>

      <FurinChime onChime={playChime} />

      <BrandHeader
        subtitle="今日は何がありましたか？"
        above={session && (
          <span style={styles.accountName}>
            {session.user.user_metadata?.username || session.user.email} さん
          </span>
        )}
        below={session && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            {view === "diary" ? (
              <button style={styles.accountBtn} onClick={() => setView("mypage")}>マイページ</button>
            ) : (
              <button style={styles.accountBtn} onClick={() => setView("diary")}>日記に戻る</button>
            )}
            <button style={styles.accountBtn} onClick={handleSignOut}>ログアウト</button>
          </div>
        )}
      />

      {view === "mypage" && (
        <MyPage
          images={generatedImages}
          onDeleteImage={deleteGeneratedImage}
          entries={savedEntries}
          onOpen={openSavedEntry}
          onDelete={deleteSavedEntry}
        />
      )}

      {view === "diary" && (
        <>
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
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={styles.saveDiaryBtn} onClick={saveDiaryToCloud} disabled={savingDiary}>
                    {savingDiary ? "保存中…" : "マイページに日記を保存"}
                  </button>
                  <button
                    style={{ ...styles.drawBtn, ...(loading ? styles.drawBtnOff : {}) }}
                    onClick={draw}
                    disabled={loading}
                  >
                    {loading ? "描いています…" : "絵にする"}
                  </button>
                </div>
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
                    作品をダウンロード(絵＋日記)
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
        </>
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
.lantern-body {
  display: block; width: 36px; height: 48px; border-radius: 50% / 42%;
  background:
    radial-gradient(ellipse 4px 6px at 24% 16%, rgba(255,255,255,1), rgba(255,255,255,0) 78%),
    radial-gradient(ellipse 12px 18px at 30% 24%, rgba(255,255,255,.85), rgba(255,255,255,0) 74%),
    repeating-linear-gradient(180deg, rgba(70,25,10,.32) 0 2px, transparent 2px 13px),
    radial-gradient(circle at 40% 32%, #fff4cf 0%, currentColor 58%, rgba(0,0,0,.45) 100%);
  box-shadow:
    0 0 34px 8px currentColor,
    inset -7px -8px 12px rgba(0,0,0,.42),
    inset 4px 5px 8px rgba(255,255,255,.4);
  position: relative;
  overflow: hidden;
  animation: lglow 3.2s ease-in-out infinite;
}
.lantern-body::before, .lantern-body::after {
  content: ''; position: absolute; left: 6px; right: 6px; height: 7px; border-radius: 50%;
  background: linear-gradient(180deg, rgba(255,255,255,.5) 0%, rgba(0,0,0,.15) 22%, rgba(0,0,0,.6) 100%);
  z-index: 1;
}
.lantern-body::before { top: -3.5px; } .lantern-body::after { bottom: -3.5px; }
.lantern-tassel {
  position: absolute; left: 50%; bottom: -13px; width: 9px; height: 13px; transform: translateX(-50%);
  background: repeating-linear-gradient(90deg, #d8b45c 0 1.4px, #8a6a2a 1.4px 2.8px);
  clip-path: polygon(20% 0, 80% 0, 62% 100%, 38% 100%);
}
@keyframes swing { 0%,100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
@keyframes lglow { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.3); } }

/* 打ち上げ花火(大玉+小玉の二重リングで派手に。中心はガラス/クリスタル風の白い核) */
.fw { position: absolute; width: 7px; height: 7px; border-radius: 50%;
  background: radial-gradient(circle at 32% 28%, #fff 0%, #fff 22%, currentColor 62%, currentColor 100%);
  opacity: 0;
  box-shadow:
    0 0 5px 1px #fff, 0 0 16px 5px #fff, 0 0 26px 9px currentColor,
    52px 0 5px 1.5px currentColor, 45px 26px 5px 1.5px currentColor, 26px 45px 5px 1.5px currentColor, 0 52px 5px 1.5px currentColor,
    -26px 45px 5px 1.5px currentColor, -45px 26px 5px 1.5px currentColor, -52px 0 5px 1.5px currentColor, -45px -26px 5px 1.5px currentColor,
    -26px -45px 5px 1.5px currentColor, 0 -52px 5px 1.5px currentColor, 26px -45px 5px 1.5px currentColor, 45px -26px 5px 1.5px currentColor,
    30px 15px 4px 0.5px #fff, 15px 30px 4px 0.5px currentColor, -15px 30px 4px 0.5px #fff, -30px 15px 4px 0.5px currentColor,
    -30px -15px 4px 0.5px #fff, -15px -30px 4px 0.5px currentColor, 15px -30px 4px 0.5px #fff, 30px -15px 4px 0.5px currentColor;
  filter: drop-shadow(0 0 16px currentColor);
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

/* すだれ(竹の縦すのこ+編み糸の横線で、それらしく見せる) */
.sudare { position: absolute; top: 0; left: 0; width: 96px; height: 150px; opacity: .4; transform-origin: top center; animation: sway 6s ease-in-out infinite; }
.sudare span { position: absolute; top: 0; width: 3px; height: 100%; background: linear-gradient(180deg, rgba(230,200,150,.75), rgba(180,140,90,.35)); border-radius: 1.5px; }
.sudare::before, .sudare::after {
  content: ''; position: absolute; left: 0; right: 0; height: 2px;
  background: rgba(90,60,30,.55);
}
.sudare::before { top: 22%; } .sudare::after { top: 68%; }

/* ── 風鈴 ── */
.furin { position: absolute; top: 0; right: 30px; width: 42px; z-index: 4; transform-origin: top center; animation: sway 4.5s ease-in-out infinite; filter: drop-shadow(0 0 10px rgba(127,198,214,.5)); }
.furin-string { width: 2px; height: 52px; margin: 0 auto; background: rgba(255,255,255,.5); }
.furin-bell {
  width: 42px; height: 36px; margin: -2px auto 0; border-radius: 50% 50% 46% 46%;
  background-color: ${C.ai};
  background-image:
    repeating-radial-gradient(circle at 50% 100%, rgba(255,255,255,.5) 0 1.5px, transparent 1.5px 6px),
    radial-gradient(circle at 34% 30%, #ffffff 0%, ${C.asagi} 55%, ${C.ai} 100%);
  background-position: bottom center, center;
  background-size: 100% 42%, 100% 100%;
  background-repeat: no-repeat, no-repeat;
  box-shadow:
    inset -6px -7px 9px rgba(0,0,0,.35),
    inset 4px 5px 7px rgba(255,255,255,.55),
    0 0 22px rgba(127,198,214,.7);
  position: relative;
  overflow: hidden;
}
.furin-bell::before {
  content: ''; position: absolute; top: 4px; left: 8px; width: 7px; height: 19px;
  background: linear-gradient(120deg, rgba(255,255,255,1), rgba(255,255,255,0) 78%);
  border-radius: 50%; transform: rotate(-18deg); filter: blur(.3px);
}
.furin-bell::after {
  content: ''; position: absolute; top: 16px; left: 22px; width: 4px; height: 4px;
  background: rgba(255,255,255,.9); border-radius: 50%; filter: blur(.2px);
}
.furin-inner {
  position: absolute; left: 50%; bottom: -3px; width: 8px; height: 8px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff 0%, ${C.shu} 55%, #7a1f0f 100%);
  box-shadow: inset -1px -1px 2px rgba(0,0,0,.4);
  transform: translateX(-50%);
}
.furin-tanzaku {
  width: 13px; height: 32px; margin: 2px auto 0;
  background: linear-gradient(180deg, ${C.yuyake} 0%, ${C.shu} 65%, #a8351d 100%);
  box-shadow: inset 1px 0 0 rgba(255,255,255,.3), inset -1px 0 0 rgba(0,0,0,.15);
  opacity: .92; border-radius: 2px; animation: flutter 4.5s ease-in-out infinite;
}
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
  .furin, .furin-tanzaku, .ink, .svg-in, .lantern, .lantern-body, .fw, .click-fw, .fw-launch, .charge-ring, .firefly, .card, .badge-fw-rays, .badge-fw-core, .star, .splash, .sudare { animation: none !important; transition: none !important; }
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
  accountName: { display: "block", fontSize: 14, color: "rgba(246,234,204,.9)", letterSpacing: ".04em", marginBottom: 2 },
  accountBtn: {
    marginTop: 10,
    padding: "5px 14px",
    borderRadius: 999,
    border: `1px solid ${C.asagi}`,
    background: "rgba(255,255,255,.06)",
    color: "#F6EACC",
    fontFamily: "'Klee One', serif",
    fontSize: 12,
    cursor: "pointer",
  },
  authGate: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "56vh",
    position: "relative",
    zIndex: 1,
    padding: "24px 0",
  },
  gateLoading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "70vh",
    position: "relative",
    zIndex: 1,
  },
  authPanel: {
    width: 300,
    background: `linear-gradient(${C.kinari}, ${C.kinariDeep})`,
    borderRadius: 14,
    padding: 20,
    boxShadow: "0 24px 54px -18px rgba(0,0,0,.7)",
  },
  authTabs: { display: "flex", gap: 8, marginBottom: 14 },
  authTab: {
    flex: 1,
    padding: "8px 0",
    borderRadius: 999,
    border: `1px solid ${C.asagi}`,
    background: "transparent",
    color: C.ai,
    fontFamily: "'Klee One', serif",
    fontSize: 13,
    cursor: "pointer",
  },
  authTabOn: { background: C.ai, color: C.kinari, border: `1px solid ${C.ai}` },
  authForm: { display: "flex", flexDirection: "column", gap: 8 },
  authInput: {
    padding: "9px 12px",
    borderRadius: 8,
    border: `1px solid ${C.kinariDeep}`,
    background: "#fffdf7",
    fontSize: 14,
    fontFamily: "'Klee One', serif",
    color: C.sumi,
  },
  authError: { fontSize: 12, color: C.shu, margin: "2px 0" },
  authSubmit: {
    marginTop: 4,
    padding: "10px 0",
    border: "none",
    borderRadius: 8,
    background: `linear-gradient(135deg, ${C.shu}, ${C.yuyake})`,
    color: "#fff",
    fontFamily: "'Klee One', serif",
    fontSize: 14,
    cursor: "pointer",
  },
  authClose: {
    marginTop: 10,
    width: "100%",
    padding: "6px 0",
    border: "none",
    background: "transparent",
    color: C.asagi,
    fontFamily: "'Klee One', serif",
    fontSize: 12,
    cursor: "pointer",
  },
  saveDiaryBtn: {
    padding: "12px 18px",
    borderRadius: 999,
    border: `1.5px solid ${C.ai}`,
    background: "transparent",
    color: C.ai,
    fontFamily: "'Klee One', serif",
    fontSize: 13,
    cursor: "pointer",
  },
  page: {},
  // マイページ
  mypageWrap: {
    maxWidth: 1000,
    margin: "0 auto",
    background: `linear-gradient(${C.kinari}, ${C.kinariDeep})`,
    borderRadius: 14,
    padding: 24,
    border: "1px solid rgba(255,255,255,.4)",
    boxShadow: "0 24px 54px -18px rgba(0,0,0,.7), 0 0 46px -14px rgba(239,154,61,.35), inset 0 1px 0 rgba(255,255,255,.7)",
    position: "relative",
    zIndex: 1,
  },
  mypageTitle: {
    fontFamily: "'Shippori Mincho', serif",
    color: C.ai,
    fontSize: 22,
    letterSpacing: ".1em",
    margin: "0 0 16px",
  },
  mypageSectionTitle: {
    fontFamily: "'Shippori Mincho', serif",
    color: C.ai,
    fontSize: 15,
    letterSpacing: ".08em",
    margin: "0 0 12px",
    borderBottom: `1px dashed ${C.shu}66`,
    paddingBottom: 8,
  },
  mypageEmpty: { fontSize: 14, color: C.sumi, opacity: 0.6 },
  mypageGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 16,
  },
  mypageCard: {
    display: "flex",
    flexDirection: "column",
    background: "#fffdf7",
    borderRadius: 10,
    border: `1px solid ${C.kinariDeep}`,
    overflow: "hidden",
    boxShadow: "0 3px 8px rgba(27,58,91,.12)",
  },
  mypageThumb: {
    aspectRatio: "4 / 3",
    background: C.kinari,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mypageThumbInner: { width: "100%", height: "100%" },
  mypageThumbPlaceholder: { fontSize: 12, color: C.sumi, opacity: 0.4 },
  mypageDate: { fontSize: 11, color: C.shu, padding: "8px 10px 0" },
  mypageBody: {
    fontSize: 13,
    color: C.sumi,
    padding: "4px 10px 10px",
    margin: 0,
    flex: 1,
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  mypageActions: { display: "flex", gap: 6, padding: "0 10px 10px" },
  mypageOpenBtn: {
    flex: 1,
    padding: "7px 0",
    border: "none",
    borderRadius: 8,
    background: `linear-gradient(135deg, ${C.ai}, ${C.asagi})`,
    color: C.kinari,
    fontFamily: "'Klee One', serif",
    fontSize: 12,
    cursor: "pointer",
  },
  mypageDeleteBtn: {
    padding: "7px 12px",
    border: `1px solid ${C.shu}`,
    borderRadius: 8,
    background: "transparent",
    color: C.shu,
    fontFamily: "'Klee One', serif",
    fontSize: 12,
    cursor: "pointer",
  },
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
