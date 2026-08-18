import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// In dev, Vite injects Tailwind CSS as an inline <style> and a React-refresh
// inline script. The production CSP (style-src 'self', script-src 'self') blocks
// those, leaving the page unstyled and breaking HMR. Relax it for `vite` serve
// only; production builds keep the strict CSP (set via Cloudflare _headers).
function relaxCspForDev(): Plugin {
  return {
    name: "relax-csp-for-dev",
    transformIndexHtml(html, ctx) {
      if (!ctx.server) return html; // build: leave the strict CSP intact
      const devCsp =
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; " +
        "connect-src 'self' ws: wss: http://localhost:* http://127.0.0.1:*; " +
        "base-uri 'self'; form-action 'self'";
      return html.replace(
        /<meta http-equiv="Content-Security-Policy"[^>]*>/,
        `<meta http-equiv="Content-Security-Policy" content="${devCsp}">`,
      );
    },
  };
}

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 750,
  },
  plugins: [
    react(),
    cloudflare({
      config: (cfg) => {
        // Local E2E / dev only: never ship dev vars to production builds.
        if (process.env.LEDJER_ADMIN_E2E_LOCAL === "1") {
          cfg.vars = { APP_ENV: "development", APP_ORIGIN: "http://localhost:4173" };
        }
      },
    }),
    tailwindcss(),
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
