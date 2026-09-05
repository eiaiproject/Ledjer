# LEDJER API Documentation

## Live API

[openapi.yaml](openapi.yaml) - OpenAPI 3.1 spec covering the **currently
implemented MVP endpoints** (auth, organizations, accounts, transactions,
reports, dashboard, exports).

## P1 Roadmap (not implemented)

The `p1-*.md` files are **proposals for future slices** - they describe APIs
that do not exist in the codebase yet and are kept as design references only:

| Slice | File | Description |
|-------|------|-------------|
| P1.1 | [p1-import.md](p1-import.md) | CSV import: CoA, products, parties |
| P1.2 | [p1-opening-balance.md](p1-opening-balance.md) | Opening balance wizard |
| P1.3 | [p1-invoices.md](p1-invoices.md) | Invoice lifecycle |
| P1.4 | [p1-receivables.md](p1-receivables.md) | Receivables & payables |
| P1.5 | [p1-reconciliation.md](p1-reconciliation.md) | Bank reconciliation |
| P1.6 | [p1-attachments.md](p1-attachments.md) | Transaction attachments |
| P1.7 | [p1-cashflow.md](p1-cashflow.md) | Cash-flow statement |

## General

- [versioning.md](versioning.md) - API versioning policy
- The pre-MVP full-scope API (products, parties, inventory, team, period
  locks, etc.) was removed with the cash-only MVP reset; see git history.
