# ADR 0001: Tenant-Scoped Repository

**Date:** 2026-07-17
**Status:** Accepted
**Deciders:** Engineering team

## Context

Ledjer uses shared-database, shared-schema multi-tenancy. Every tenant-owned
table has an `organization_id` column. The risk is a query that omits the
organization_id WHERE clause, leaking data across tenants.

## Decision

Introduce `TenantScopedRepository` - a wrapper around D1 that validates
`organization_id` is present in the values array for tenant-scoped tables.

Key design choices:
- **Optional use**: Services can use it directly or bypass it. Enforcement
  is cultural + architectural tests (future).
- **Runtime assertion**: Throws at query time if org_id is missing, not at
  compile time. Catches bugs in tests and staging.
- **Minimal surface**: Three methods - queryAll, queryFirst, execute. No
  query builder, no ORM.

## Consequences

- Positive: Runtime safety net against unscoped queries.
- Positive: Clear boundary between tenant-scoped and global tables.
- Negative: Extra parameter for every service call.
- Negative: Not enforceable at compile time (no TypeScript-level guard).
