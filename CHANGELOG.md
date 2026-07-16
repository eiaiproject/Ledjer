# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Server-side Sentry error tracking via @sentry/cloudflare
- X-Request-Id response header on all requests
- Global 401 redirect handler in API client
- Rate limiting on register, forgot-password, verify-email endpoints
- Auth audit logging (login, logout, registration, password reset, OAuth)
- D1 backup script and restore documentation
- GET /api/audit-logs endpoint (team:manage permission)
- Structured request logging with password field redaction

### Fixed
- Stock settlement miscalculation (broken find predicate)
- E2E spec files with undeclared locator variables
- Google OAuth account-takeover via email-match auto-linking
- CSRF middleware fail-open when APP_ORIGIN unset in production
- Opening-balance posting direction for credit-normal accounts
- Journal entry status not set to 'voided' on transaction void
- Misnamed settleAndVoidTransaction (never voided)
- Empty cash account select in settle form
- CSP inconsistency between _headers and index.html
- Fragile string-match retry logic replaced with ApiError status check
- Session cookie now uses __Host- prefix in production
- purchase_price_minor no longer overwritten with average cost
- COGS rounding drift from fractional quantities
- Account_mappings and export_jobs dead tables dropped
