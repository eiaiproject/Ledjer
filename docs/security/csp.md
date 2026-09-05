# Content Security Policy

## Current Directives

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' https://static.cloudflareinsights.com;
  style-src 'self' 'unsafe-inline';
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
  form-action 'self';
```

## Rationale

- **`script-src 'self'`**: No inline executable scripts exist in production HTML
  (`apps/web/index.html` only embeds a JSON-LD **data block**, which is not
  subject to `script-src`). `'unsafe-inline'` was removed from
  `apps/web/public/_headers`. Dev mode keeps a
  relaxed CSP via `relaxCspForDev()` in `vite.config.ts` (Vite HMR needs inline
  scripts) - that relaxation never reaches production builds.
  Guarded by `e2e/security-headers.spec.ts` ("CSP script-src does not allow
  inline scripts").
- **`style-src 'unsafe-inline'`**: Required for Tailwind CSS inline styles. Prod extracts to CSS files but header still includes `unsafe-inline` as safety net; remove when Worker serves nonce'd HTML.
- **`object-src 'none'`**: Prevents plugin loading (Flash, Java, etc.).
- **`frame-ancestors 'none'`**: Prevents clickjacking.
- **`form-action 'self'`**: Restricts form submissions to same origin.
- **`base-uri 'self'`**: Prevents base tag injection.
- **`x-xss-protection: 0`**: The XSS auditor is obsolete and `1; mode=block`
  can introduce vulnerabilities; modern guidance (OWASP secure headers project)
  is to disable it explicitly.

## Verified via Tests

See `e2e/security-headers.spec.ts` for automated header validation.

## Report-Only Mode

If a CSP change may break existing functionality, deploy changes first in
`Content-Security-Policy-Report-Only` mode and monitor Sentry for violations
before enforcing.
