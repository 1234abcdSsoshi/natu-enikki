// Vercel Serverless Function: /api/anthropic/* を https://api.anthropic.com/* へ中継する。
// vercel.json の rewrites でこの関数に集約し、元のパスは ?path= で受け取る。
// ANTHROPIC_API_KEY はVercelの環境変数(サーバー側)からのみ読み、ブラウザには一切渡さない。
export default async function handler(req, res) {
  const { path, ...rest } = req.query;
  const p = Array.isArray(path) ? path.join("/") : path || "";
  const qs = new URLSearchParams(rest).toString();
  const url = `https://api.anthropic.com/${p}${qs ? "?" + qs : ""}`;

  const upstream = await fetch(url, {
    method: req.method,
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body),
  });

  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
  res.send(text);
}
