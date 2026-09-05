# Threat Model

## Trust Boundaries

```
[Browser] → [Cloudflare CDN] → [Worker API] → [D1 Database]
                                      ↓
                               [Google OAuth]
                                      ↓
                               [Sentry (errors)]
```

| Boundary | Trust Level | Notes |
|----------|-------------|-------|
| Browser ⇔ Cloudflare CDN | Low | TLS, CSP, CSRF protect this boundary |
| CDN ⇔ Worker | Medium | Cloudflare controls edge, Worker is tenant code |
| Worker ⇔ D1 | High | Same Cloudflare account, not exposed to internet |
| Worker ⇔ Sentry | Low | Error data sent externally |
| Browser ⇔ Google OAuth | Low | Short-lived state cookie protects this |

## Assets

| Asset | Sensitivity | Storage |
|-------|-------------|---------|
| User credentials (password hashes) | Critical | D1 (sessions, users tables) |
| Session tokens | Critical | D1 (sessions table) |
| Financial transactions | High | D1 (transactions, journals) |
| Organization data | High | D1 (all tenant tables) |
| Personal data (email, name) | Medium | D1 (users, oauth_accounts) |
| Auth tokens (Google OAuth) | Medium | D1 (sessions, transient) |

## Threats (STRIDE per component)

### Worker API

| Threat | Risk | Mitigation |
|--------|------|------------|
| Cross-tenant data access | **Critical** | `TenantScopedRepository` + org middleware |
| SQL injection | **High** | All queries use prepared statements |
| Session hijacking | **High** | HttpOnly/Secure/SameSite cookies, hashed tokens |
| CSRF | **High** | Origin/Referer validation via URL.origin on all state changes (exact match, comma-separated) |
| Privilege escalation | **High** | Permission check on every protected route |
| Rate limit bypass | Medium | Atomic D1 conditional INSERT `COUNT(*) < max` per bucket_key (was SELECT+INSERT TOCTOU) |
| Idempotency-key reuse | Medium | Key bound to SHA-256 payload hash; replay with a different payload rejected |

### D1 Database

| Threat | Risk | Mitigation |
|--------|------|------------|
| Unauthorized direct access | **Critical** | D1 is not publicly accessible |
| Data loss | **High** | Daily backups to R2, retention policy |
| Data corruption | Medium | Forward-only migrations, idempotent mutations |

### Google OAuth

| Threat | Risk | Mitigation |
|--------|------|------------|
| OAuth state replay | Medium | State parameter validated |
| Token interception | Low | TLS; state cookie guards the callback (no PKCE) |
| Open redirect | Medium | Redirect URI validated |

### Sentry Error Reporting

| Threat | Risk | Mitigation |
|--------|------|------------|
| PII leakage in error context | Medium | Error redaction middleware strips secrets |
| Credential leakage | **High** | `beforeSend` callback redacts sensitive fields |

## Attack Surface

| Entry point | Method | Auth | Ratelimited |
|-------------|--------|------|-------------|
| `/api/auth/login` | POST | No | Yes |
| `/api/auth/register` | POST | No | Yes |
| `/api/auth/oauth/*` | GET/POST | No | No |
| `/api/*` (authenticated) | All | Yes | No |
| `/api/health` | GET | No | No |
| Static assets | GET | No | No |

## Incident Response

See [incident-response.md](../production/incident-response.md) for:
- Cross-tenant data access
- Data breach
- Auth compromise
- Database corruption
- Deployment failure
