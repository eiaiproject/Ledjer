import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "node:path";

const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;

// In dev, Vite injects Tailwind CSS as an inline <style> and a React-refresh
// inline script. The production CSP (style-src 'self', script-src 'self') blocks
// those, leaving the page unstyled and breaking HMR. Relax it for `vite` serve
// only; production builds keep the strict CSP (postbuild-csp.sh adds Sentry).
function relaxCspForDev(): Plugin {
  return {
    name: "relax-csp-for-dev",
    transformIndexHtml(html, ctx) {
      if (!ctx.server) return html; // build: leave the strict CSP intact
      const devCsp =
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data:; " +
        "connect-src 'self' ws: wss: http://localhost:* http://127.0.0.1:*; " +
        "base-uri 'self'; form-action 'self'";
      // Run last — replaces any Sentry-injected CSP placeholders with clean dev CSP
      return html.replace(
        /<meta http-equiv="Content-Security-Policy"[^>]*>/,
        `<meta http-equiv="Content-Security-Policy" content="${devCsp}">`,
      );
    },
  };
}

const isAnalyze = process.env.ANALYZE === "true";

function bundleAnalyzerPlugin(): Plugin | undefined {
  if (!isAnalyze) return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { visualizer } = require("rollup-plugin-visualizer");
    return visualizer({
      filename: "./dist/bundle-analysis.html",
      open: true,
      gzipSize: true,
      brotliSize: true,
    }) as unknown as Plugin;
  } catch {
    console.warn(
      "⚠️  Bundle analysis skipped: rollup-plugin-visualizer not installed.\n" +
      "   Install with: pnpm add -D rollup-plugin-visualizer\n" +
      "   Then run: ANALYZE=true pnpm build"
    );
    return undefined;
  }
}

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("@sentry/react")) return "sentry";
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/react-router-dom")) return "vendor";
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    cloudflare({
      // Local E2E only: vite preview runs the worker with wrangler vars, where
      // APP_ORIGIN=https://ledjer.id would reject localhost origins (CSRF).
      // Only override vars when LEDJER_E2E_LOCAL=1 (set by playwright webServer).
      // Production builds keep the real vars so `wrangler deploy` (which reads
      // the built dist/ledjer/wrangler.json via .wrangler/deploy/config.json
      // redirect) never deploys dev values.
      config: (cfg) => {
        if (process.env.LEDJER_E2E_LOCAL === "1") {
          cfg.vars = { APP_ENV: "development", APP_ORIGIN: "http://localhost:4173" };
        }
      },
    }),
    tailwindcss(),
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
    // Bundle analysis — run with ANALYZE=true pnpm build
    ...(isAnalyze ? [bundleAnalyzerPlugin()!] : []),
    // MUST run last — replaces any Sentry-injected CSP with clean dev CSP
    relaxCspForDev(),
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
