# API Versioning

## Current State

All API routes are at `/api/*` without version prefix.

## Target Migration

Introduce `/api/v1/*` for stable public endpoints while preserving
legacy `/api/*` routes during a transition window.

### Migration Plan

1. **Phase 1 (current)**: All routes at `/api/*`.
2. **Phase 2**: Add `/api/v1/*` routes alongside `/api/*`. Route handlers
   are shared (aliased).
3. **Phase 3**: Deprecate `/api/*` with `Deprecation` header on legacy routes.
4. **Phase 4**: Remove `/api/*` after transition window.

### Route Mapping

```
Legacy              →  Stable
/api/health         →  /api/v1/health (no auth)
/api/auth/*         →  /api/v1/auth/*
/api/organizations/* → /api/v1/organizations/*
/api/accounts       →  /api/v1/accounts
/api/transactions   →  /api/v1/transactions
/api/reports/*      →  /api/v1/reports/*
/api/dashboard/*    →  /api/v1/dashboard/*
/api/exports/*      →  /api/v1/exports/*
```

### Implementation Strategy

```typescript
// Future: mount both versions
const v1 = new Hono<AppContext>();
v1.route("/accounts", accountsRoutes);
// ...

app.route("/api", api);       // legacy (to be deprecated)
app.route("/api/v1", v1);     // stable
```

### Breaking Changes Policy

1. **Major version**: Breaking changes (response structure change, field removal).
2. **Minor version**: Additive changes (new fields, new endpoints).
3. **Patch**: Bug fixes, documentation.

### Deprecation Header

When deprecating a route version:
```
Deprecation: version="v0"
Sunset: Sat, 1 Jan 2028 00:00:00 GMT
Link: </api/v1/accounts>; rel="successor-version"
```
