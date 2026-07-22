import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// 開発サーバーが /api/anthropic/* への呼び出しを https://api.anthropic.com/* へ中継します。
// このとき ANTHROPIC_API_KEY をサーバー側でヘッダーに付けるため、
// APIキーはブラウザ（フロントエンド）に一切出ません。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiKey = env.ANTHROPIC_API_KEY || "";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      open: true,
      proxy: {
        "/api/anthropic": {
          target: "https://api.anthropic.com",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/anthropic/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              if (apiKey) proxyReq.setHeader("x-api-key", apiKey);
              proxyReq.setHeader("anthropic-version", "2023-06-01");
            });
          },
        },
      },
    },
  };
});
