// Minimal assets-only Worker: serves the built VitePress site from the
// ASSETS binding (see wrangler.jsonc). Matches the pattern used by the main
// Ledjer worker (env.ASSETS.fetch fallback).
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
