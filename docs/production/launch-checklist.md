# Public Launch Checklist — Release Gate

Last updated: 2026-07-31

⚠️ **This checklist must be fully completed before public launch.**
Each item must be verified and signed off by the launch owner.

---

## CI & Testing

- [ ] CI workflow green on `main` (all jobs pass)
- [ ] SQL tests green (`supabase db reset` + `run_all.sql`)
- [ ] E2E full-local green (Chromium)
- [ ] Cross-browser smoke green (Firefox + WebKit)
- [ ] Production build green (`pnpm --filter web build`)
- [ ] TypeScript typecheck clean
- [ ] ESLint clean
- [ ] Database types in sync

## Staging Verification

- [ ] Staging environment deployed
- [ ] Supabase migrations applied to staging
- [ ] Staging smoke test passed (login, register, transaction, reports)
- [ ] Staging billing page verified
- [ ] Staging legal pages accessible

## Backup & Restore

- [ ] Backup restore drill completed (see `docs/production/backup-restore.md`)
- [ ] Restore time documented
- [ ] Data integrity verified post-restore
- [ ] RPO/RTO targets documented and acceptable

## Monitoring

- [ ] Sentry configured and receiving errors
- [ ] Sentry alerts configured (error spike, new error type)
- [ ] Uptime monitoring configured
- [ ] Supabase database monitoring reviewed
- [ ] Auth failure monitoring in place

## Billing

- [ ] Billing page shows correct plan and usage
- [ ] Plan limits enforced (free plan 50 transactions/month)
- [ ] Upgrade/downgrade/cancel UX is truthful
- [ ] Billing events audit trail working
- [ ] Admin plan override tested (`admin_update_plan`)
- [ ] ⚠️ Self-serve payment checkout NOT claimed as complete
- [ ] Manual billing runbook reviewed (`docs/private-beta/manual-billing-runbook.md`)

## Staff Invitations

- [ ] `create_invitation` RPC tested (token_hash auto-computed by trigger)
- [ ] `accept_invitation` RPC tested (hash-only lookup, no plaintext token comparison)
- [ ] `revoke_invitation` RPC tested
- [ ] Invitation expiry enforced
- [ ] Cross-org invite prevention verified
- [ ] Plan limit (Business only, 1 staff max) enforced
- [ ] Invitation audit logging working

## Period Lock

- [ ] `set_period_lock` RPC tested
- [ ] `unlock_period_lock` RPC tested
- [ ] Period lock trigger blocks transactions on/before locked date
- [ ] Period lock enforced server-side (not just UI)
- [ ] Owner-only permission verified
- [ ] Lock/unlock audited

## Data Export

- [ ] Transaction CSV export working (uses `csv_escape()` for formula injection protection)
- [ ] Accounts CSV export working
- [ ] Products CSV export working
- [ ] Trial Balance CSV export working
- [ ] Profit/Loss CSV export working
- [ ] Balance Sheet CSV export working
- [ ] General Ledger CSV export working
- [ ] Export respects org isolation
- [ ] Export requires appropriate permissions
- [ ] CSV cells with leading `=`, `+`, `-`, `@` are safely prefixed with `'`

## Legal & Policy

- [ ] Terms of Service page exists and accessible
- [ ] Privacy Policy page exists and accessible
- [ ] Refund Policy page exists and accessible
- [ ] Security Policy page exists and accessible
- [ ] Contact/Support page exists and accessible
- [ ] Legal pages linked in landing page footer
- [ ] ⚠️ All legal pages marked "Requires Legal Review"
- [ ] Legal review completed (or accepted as known limitation)

## Security

- [ ] Security checklist completed (`docs/production/security-checklist.md`)
- [ ] No service role key in frontend code
- [ ] No secrets in repository
- [ ] RLS enabled on all new tables (`billing_events`, `organization_invitations`)
- [ ] Admin RPCs revoked from anon/authenticated (verified by inline privilege tests)
- [ ] Billing trigger protection working
- [ ] CSP/security headers production-safe (no localhost in production CSP)
- [ ] Sentry Replay privacy enabled (maskAllText, blockAllMedia, maskAllInputs)
- [ ] Auth error enumeration prevented (generic error messages for user_not_found)
- [ ] Invitation tokens hashed at rest (SHA-256 via BEFORE INSERT trigger)
- [ ] CSV formula injection protected (`csv_escape()` prefixes `'` on `=`, `+`, `-`, `@`)

## Operational

- [ ] Incident response runbook reviewed (`docs/production/incident-response.md`)
- [ ] Backup/restore runbook reviewed (`docs/production/backup-restore.md`)
- [ ] Support process documented
- [ ] On-call/owner contact placeholder filled

## Deployment

- [ ] Domain configured (`app.ledjer.id`)
- [ ] HTTPS enabled
- [ ] Auth redirect URLs configured in Supabase
- [ ] Production environment variables set
- [ ] No placeholder Supabase config in production
- [ ] Cloudflare/Vercel deployment verified

## Final Sign-Off

| Item | Owner | Date | Sign-off |
|------|-------|------|----------|
| CI green | | | |
| SQL tests green | | | |
| E2E green | | | |
| Staging verified | | | |
| Backup drill done | | | |
| Monitoring active | | | |
| Billing verified | | | |
| Invitations working | | | |
| Period lock working | | | |
| Export working | | | |
| Legal reviewed | | | |
| Security passed | | | |
| Ops ready | | | |
| Deploy verified | | | |

---

## Known Limitations Accepted at Launch

1. **Self-serve billing not implemented** — manual billing via admin SQL console
2. **Payment webhook verification not implemented** — scaffold only
3. **Email delivery for invitations not implemented** — token generated, email sending is provider setup
4. **Admin dashboard requires server-side auth** — current page is a placeholder
5. **No PDF/Excel export** — CSV only
6. **No automated closing entries** — manual process
7. **No multi-currency support** — IDR only
8. **No WCAG 2.1 AA full audit** — basic accessibility tested
9. **Legal pages not reviewed by lawyer** — marked for review
10. **No invoice-level AR/AP tracking** — party-level only

---

## Launch Command

After all checklist items are verified:

```bash
# 1. Ensure main is green
git log --oneline -5

# 2. Run full test suite one final time
pnpm test:quality
pnpm test:sql  # requires local Supabase running

# 3. Build production
pnpm --filter web build

# 4. Deploy (platform-specific)
# For Cloudflare Pages: git push to main triggers deployment
# For Vercel: vercel --prod

# 5. Verify production
curl -I https://app.ledjer.id/login

# 6. Run deploy smoke tests
pnpm test:e2e:deploy
```
