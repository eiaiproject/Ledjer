# ADR 0003: Origin-Based CSRF Protection

**Date:** 2026-07-17
**Status:** Accepted
**Deciders:** Engineering team

## Context

Hono provides a built-in `csrf()` middleware, but it cannot access
`c.env.APP_ORIGIN` at configuration time. A custom middleware is needed.

## Decision

Implement a custom CSRF middleware that:
- Checks `Origin` (or `Referer` fallback) against `APP_ORIGIN`.
- Rejects missing Origin with session cookie (403).
- In production, denies all origins if `APP_ORIGIN` is unset (500).
- Accepts comma-separated origins in `APP_ORIGIN`.

## Consequences

- Positive: Fail-closed when unconfigured.
- Positive: Supports multiple allowed origins (dev + production).
- Negative: Non-browser API clients must include Origin header.
