# Product Decision Matrix

Release decisions for Ledjer features. Separates launch blockers from post-beta improvements.

## Decision Categories

| Category | Meaning |
|----------|---------|
| **Must fix before beta** | Blocks controlled beta launch |
| **Must fix before public launch** | Blocks public release |
| **Post-launch** | Can ship after public launch |
| **Won't fix** | Explicitly excluded from scope |

## Decision Matrix

| Item | Current Behavior | Risk | Decision | Owner/Action |
|------|------------------|------|----------|--------------|
| **Payment** | Not implemented (manual billing only) | Users cannot self-serve upgrades | Post-launch | Integrate payment gateway (Midtrans/Xendit) after beta |
| **Cash-flow report** | Not implemented | Missing standard accounting report | Post-launch | Implement if product decision changes; not beta-blocking |
| **Invitation email delivery** | Token generated, no email sent | Users must share links manually | Must fix before public launch | Configure SMTP or implement email sending |
| **CSV export** | Implemented for transactions, accounts, products, reports | None | Ready | Already working |
| **Monitoring (Sentry)** | Wired, no alerts configured | Errors not visible to team | Must fix before beta | Configure Sentry alerts |
| **Backup/restore** | Documented, not rehearsed | Data loss risk if restore fails | Must fix before beta | Run restore drill |
| **Legal pages** | Exist, marked "REQUIRES LEGAL REVIEW" | Legal liability | Must fix before public launch | Get lawyer review |
| **Onboarding** | Implemented, works end-to-end | None | Ready | Already working |
| **Staff permissions** | Implemented, granular per-staff | None | Ready | Already working |
| **Period lock** | Implemented | None | Ready | Already working |
| **Uptime monitoring** | Not configured | Downtime not detected | Must fix before public launch | Set up UptimeRobot or similar |
| **E2E auth flow tests** | Smoke tests only, no authenticated flows | Auth regressions not caught | Post-launch | Add test user seeding |
| **WCAG 2.1 AA audit** | Basic accessibility tested | Accessibility gaps unknown | Post-launch | Full audit |
| **PDF/Excel export** | Not implemented | Users want rich exports | Post-launch | Add after beta |
| **Invoice generation** | Not implemented | Users want invoices | Post-launch | Add after beta |
| **Multi-currency** | Not implemented | IDR only | Won't fix | Out of scope for UMKM Indonesia |
| **Automated tax** | Not implemented | Manual PPN/PPh | Post-launch | Add after beta |
| **Mobile app** | Web responsive only | No native experience | Post-launch | React Native if demand exists |
| **Load testing** | Not done | Performance unknown | Post-launch | Add before public launch |
| **Admin dashboard** | Placeholder | No server-side auth | Post-launch | Implement with admin auth |

## Beta Launch Requirements

Must complete before controlled beta:

1. ✅ CI green (all jobs pass)
2. ✅ Sentry wired (errors tracked)
3. ⚠️ Sentry alerts configured (manual step)
4. ⚠️ Backup restore drilled (manual step)
5. ✅ Core flows working (register, onboarding, transactions, reports)
6. ✅ Staff permissions working
7. ✅ Legal pages exist (marked for review)

## Public Launch Requirements

Must complete before public release:

1. All beta requirements
2. ⚠️ Invitation email delivery working
3. ⚠️ Legal pages reviewed by lawyer
4. ⚠️ Uptime monitoring configured
5. ⚠️ Load testing completed
6. ⚠️ WCAG 2.1 AA audit (or accepted risk)

## Post-Launch Improvements

Ship after public release:

1. Payment gateway integration
2. Cash-flow report
3. PDF/Excel export
4. Invoice generation
5. E2E auth flow tests
6. Mobile app (if demand)
7. Multi-currency (if demand)
8. Automated tax
