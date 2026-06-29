import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "path";

const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;

export default defineConfig({
  plugins: [
    react(),
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
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});