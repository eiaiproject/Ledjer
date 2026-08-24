# ADR 0002: Forward-Only Database Migrations

**Date:** 2026-07-17
**Status:** Accepted
**Deciders:** Engineering team

## Context

D1 does not support transactional schema migrations or rollback. Traditional
up/down migration patterns are not applicable.

## Decision

All migrations are forward-only. No existing migration is ever modified or
deleted. To undo a change, write a new forward-only migration (e.g., add back
a column, restore data).

Key constraints:
- Migrations are numbered sequentially (0001, 0002, ...).
- A script validates naming and sequence in CI.
- Destructive operations (DROP, TRUNCATE) require a reviewed recovery plan
  and must be accompanied by a documented migration path.

## Consequences

- Positive: Simple, auditable, no rollback complexity.
- Positive: CI validates migration sequence.
- Negative: Cannot remove a bad migration - must write a compensating one.
- Negative: Schema drift requires careful planning.
