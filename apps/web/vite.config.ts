import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "path";

const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;

// Local-only CSP: production CSP forbids localhost. For `vite preview` (local
// E2E), allow http(s)://localhost:* and http://127.0.0.1:* so the in-browser
// Supabase client can reach the local stack. Dockerized local E2E uses
// host.docker.internal to reach services running on the host. Production builds
// keep the strict CSP from index.html (no override).
const localPreviewCspPlugin = () => ({
  name: "ledjer-local-preview-csp",
  apply: "build",
  transformIndexHtml: {
    order: "pre",
    handler(html: string) {
      if (process.env.LEDJER_CSP_LOCAL !== "1") return html;
      return html.replace(
        /connect-src 'self' https:\/\/\*\.supabase\.co https:\/\/\*\.supabase\.in/,
        "connect-src 'self' http://localhost:* http://127.0.0.1:* http://host.docker.internal:* https://*.supabase.co https://*.supabase.in",
      );
    },
  },
});

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    localPreviewCspPlugin(),
    // Upload source maps to Sentry for readable stack traces
    // Requires SENTRY_ORG, SENTRY_PROJECT, and SENTRY_AUTH_TOKEN in env
    ...(SENTRY_AUTH_TOKEN
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG || "",
            project: process.env.SENTRY_PROJECT || "",
            authToken: SENTRY_AUTH_TOKEN,
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  preview: {
    allowedHosts: ["host.docker.internal"],
  },
});
