# Known Limitations — Private Beta

These items do not block private beta but must be understood before public launch.

## Billing & Payments

- **Manual billing only.** No payment gateway (Stripe, Xendit, Midtrans). Plan changes are done by the operator via Supabase SQL Console. See [Manual Billing Runbook](manual-billing-runbook.md).
- **No invoice generation.** Users cannot generate invoices from the app.
- **No payment receipts.** No automated receipt generation for manual payments.
- **No subscription management UI.** Users cannot view payment history or manage subscription within the app.

## Staff & Team

- **Staff invitation may require existing registered users.** The `invite_staff` RPC checks that the invitee has a confirmed Supabase auth account. Beta operators should ensure the invited user has registered and confirmed their email before sending an invite.
- **No staff removal from UI.** Owner may need to use Supabase SQL Console to remove a staff member.
- **Limited permission granularity.** Permissions are per-organization, not per-feature within the same role.

## Features

- **No period lock.** Transactions can be edited/voided regardless of period. There is no "lock period" feature for closing a month.
- **No export/import.** Reports cannot be exported to CSV, PDF, or Excel. No data import from spreadsheets.
- **No attachments.** No file upload for receipts or invoices.
- **No invoice-level AR/AP.** Accounts receivable and payable are tracked by party (customer/supplier), not by individual invoice.
- **No automated closing entries.** Retained earnings calculation must be done manually at year-end.
- **No multi-currency.** All amounts are in IDR.
- **No automated tax.** PPN/PPh calculations are manual.
- **Indonesian context only.** Chart of accounts, terminology, and formatting are specific to Indonesia.

## Legal & Compliance

- **No Terms of Service.** Required before public launch.
- **No Privacy Policy.** Required before public launch.
- **No data processing agreement.** Required for GDPR compliance if targeting EU users.
- **No SLA.** No uptime guarantee documented.

## Operational

- **Backup/restore must be rehearsed** before storing critical production data. See [Backup & Restore Runbook](backup-restore-runbook.md).
- **No automated backups beyond Supabase free tier** (7-day retention).
- **No staging environment** with production parity. Operators test directly in production for private beta.
- **No load testing.** Performance under realistic load is unknown.
- **No WCAG 2.1 AA audit.** Accessibility compliance is unverified.

## Technical Debt

- **No full E2E auth flow tests.** Playwright smoke tests exist but authenticated flows require seeded test users.
- **Sentry alerts not configured.** Error tracking is wired but alerts must be set up in Sentry dashboard.
- **No uptime monitoring.** Must be configured externally (UptimeRobot, Checkly).
- **Database types drift** — the canonical types file must stay in sync with migrations. CI guards this.
