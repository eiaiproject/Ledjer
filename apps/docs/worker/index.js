// Minimal assets-only Worker: serves the built VitePress site from the
// ASSETS binding (see wrangler.jsonc). Matches the pattern used by the main
// Ledjer worker (env.ASSETS.fetch fallback).
//
// Security headers (F-06) are applied via docs/public/_headers, which Workers
// Static Assets evaluates at serving time. A worker-side wrapper does not
// work here: static assets are served straight from the edge cache without
// executing the worker script.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
