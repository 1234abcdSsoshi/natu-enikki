// Vercel Serverless Function: /api/pollinations/* を https://image.pollinations.ai/* へ中継する。
// vercel.json の rewrites でこの関数に集約し、元のパスは ?path= で受け取る。
// ブラウザから直接呼ぶとOriginヘッダーがCloudflareのボット対策(Turnstile要求/403)に
// 引っかかるため、サーバー側(この関数)から中継してOrigin/Refererを付けずに転送する。
export default async function handler(req, res) {
  const { path, ...rest } = req.query;
  const p = Array.isArray(path) ? path.join("/") : path || "";
  const qs = new URLSearchParams(rest).toString();
  const url = `https://image.pollinations.ai/${p}${qs ? "?" + qs : ""}`;

  const upstream = await fetch(url);
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.status(upstream.status);
  res.setHeader("content-type", upstream.headers.get("content-type") || "application/octet-stream");
  res.send(buf);
}
