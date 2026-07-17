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

- **`script-src 'unsafe-inline'`**: Required for Vite/HMR in development. In production, this is mitigated by the build process which hashes or bundles all inline scripts. Future enhancement: switch to nonce-based or hash-based CSP.
- **`style-src 'unsafe-inline'`**: Required for Tailwind CSS which uses inline styles. Tailwind v4 generates static CSS in production, reducing inline usage. Future enhancement: evaluate `'strict-dynamic'`.
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
