// Minimal assets-only Worker: serves the built VitePress site from the
// ASSETS binding (see wrangler.jsonc). Matches the pattern used by the main
// Ledjer worker (env.ASSETS.fetch fallback).
//
// Security headers are set here because a Workers assets-only deployment has
// no Cloudflare Pages `_headers` file (security review F-06: docs.ledjer.id
// previously served without CSP/XFO/nosniff). Keep in sync with the header
// sets in apps/web/public/_headers and apps/admin/public/_headers.
//
// CSP notes for VitePress output:
// - VitePress emits external .js/.css assets only (no inline scripts), so
//   script-src/style-src 'self' suffice.
// - style-src 'unsafe-inline' is kept: Vue's transition/v-show compile to
//   inline style attributes, which fall under style-src.
// - data: images are needed for inlined SVG/asset placeholders.
const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    // HTML responses get the full set; other assets keep their caching headers
    // and receive the same hardening (cheap, and protects future file types).
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
