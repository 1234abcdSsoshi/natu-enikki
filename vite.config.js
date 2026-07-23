import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// 開発サーバーが /api/anthropic/* への呼び出しを https://api.anthropic.com/* へ中継します。
// このとき ANTHROPIC_API_KEY をサーバー側でヘッダーに付けるため、
// APIキーはブラウザ（フロントエンド）に一切出ません。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiKey = env.ANTHROPIC_API_KEY || "";

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["apple-touch-icon.png"],
        manifest: {
          name: "夏祭りの絵日記",
          short_name: "絵日記",
          description: "日記を書くとAIが夏祭りの絵に描いてくれる絵日記アプリ",
          lang: "ja",
          start_url: "/",
          display: "standalone",
          background_color: "#171139",
          theme_color: "#D8482B",
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
      }),
    ],
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
        // Pollinations.ai への中継。ブラウザから直接呼ぶとOriginヘッダーが
        // Cloudflareのボット対策(Turnstile要求/403)に引っかかるため、
        // サーバー側(Node)から中継してOrigin/Refererを付けずに転送する。
        "/api/pollinations": {
          target: "https://image.pollinations.ai",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/pollinations/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.removeHeader("origin");
              proxyReq.removeHeader("referer");
            });
          },
        },
      },
    },
  };
});
