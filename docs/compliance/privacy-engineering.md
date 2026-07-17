# Privacy Engineering

## Data Inventory

### Personal Data Collected

| Data Field | Collection Purpose | Legal Basis | Storage Location |
|------------|-------------------|-------------|-----------------|
| Email address | Authentication, communication | Consent (registration) | D1 (encrypted at rest) |
| Full name | Profile, reporting | Consent (registration) | D1 |
| IP address | Audit, rate limiting | Legitimate interest | D1 (login_attempts, sessions) |
| User agent | Session audit | Legitimate interest | D1 (sessions) |
| OAuth profile | Authentication | Consent (OAuth login) | D1, Google |

### Financial Data

| Data Field | Collection Purpose | Legal Basis | Storage Location |
|------------|-------------------|-------------|-----------------|
| Transaction amounts | Accounting | Legal obligation | D1 |
| Account balances | Accounting | Legal obligation | D1 |
| Party information | Business records | Legal obligation | D1 |
| Inventory values | Accounting | Legal obligation | D1 |

## Processing Purposes

1. Application operation and hosting
2. Authentication and authorization
3. Financial record-keeping and reporting
4. Fraud prevention and security
5. Error monitoring and performance optimization
6. Customer support

## Data Protection Controls

### Technical Controls
- **Encryption at rest**: D1 encrypts data at rest (Cloudflare infrastructure).
- **Encryption in transit**: TLS 1.3 for all API traffic.
- **Access control**: Role-based (owner/admin/member/viewer) plus organization scoping.
- **Authentication**: Password (PBKDF2-SHA256, peppered) or Google OAuth.
- **Session management**: HttpOnly, Secure, SameSite cookies with 30-day expiry.
- **Rate limiting**: Login attempts (5 per 15 min), registration (5 per hour).
- **Audit logging**: All sensitive operations logged immutably.
- **Input validation**: Zod schemas on all API inputs.
- **CSRF protection**: Origin-based validation.

### Organizational Controls
- Access to production data limited to essential team members.
- No production data copied to development without anonymization.
- Security incident response process documented.

## Cross-Border Processing

- Data is processed at Cloudflare's global edge network.
- Primary processing region: Asia (Southeast Asia).
- Subprocessors may process data in US and EU (see subprocessors.md).

## Breach Notification

1. Detect and confirm breach (engineering).
2. Contain and assess impact (security).
3. Notify affected users within 72 hours (legal/compliance).
4. Notify regulators per UU PDP requirements.
5. Document and publish postmortem.

## Data Subject Request Workflow

See `data-subject-request-runbook.md` for step-by-step DSR handling.

## Legal Notice

> This document is a technical compliance gap analysis and does not constitute
> legal advice. All compliance claims require review by qualified legal counsel
> before use in regulatory filings, customer contracts, or public disclosures.
