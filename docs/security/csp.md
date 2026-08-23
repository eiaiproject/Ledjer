# Content Security Policy

## Current Directives

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
  form-action 'self';
```

## Rationale

- **`script-src 'unsafe-inline'`**: Currently present in both dev and prod (`apps/web/public/_headers`, `apps/admin/public/_headers`). Required for Vite/HMR and some inline handlers. Not mitigated by hashing in current prod build — still `unsafe-inline`. Planned: nonce/hash-based CSP (backlog B5).
- **`style-src 'unsafe-inline'`**: Required for Tailwind CSS inline styles. Prod extracts to CSS files but header still includes `unsafe-inline` as safety net; remove when Worker serves nonce'd HTML.
- **`object-src 'none'`**: Prevents plugin loading (Flash, Java, etc.).
- **`frame-ancestors 'none'`**: Prevents clickjacking.
- **`form-action 'self'`**: Restricts form submissions to same origin.
- **`base-uri 'self'`**: Prevents base tag injection.

## Verified via Tests

See `e2e/security-headers.spec.ts` for automated header validation.

## Report-Only Mode

If a CSP change may break existing functionality, deploy changes first in
`Content-Security-Policy-Report-Only` mode and monitor Sentry for violations
before enforcing.
