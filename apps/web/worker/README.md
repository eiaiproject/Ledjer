# Ledjer Worker

Cloudflare Worker API for Ledjer. Phase 1 exposes `/api/health` and the D1 migration foundation only; Supabase-backed frontend code is still present until later phases replace each domain.

Local checks:

```bash
pnpm --filter web cf:dev
pnpm --filter web db:migrations:apply:local
```
