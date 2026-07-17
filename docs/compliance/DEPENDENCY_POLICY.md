# Dependency Security Policy

## Severity Thresholds

| Severity | CI Action | Exception Required |
|----------|-----------|-------------------|
| Critical | Fail | Yes — owner approval, 7-day expiry, documented compensating control |
| High | Fail | Yes — owner approval, 30-day expiry, documented compensating control |
| Medium | Warn | No |
| Low | Warn | No |

## Exception Process

1. Create GitHub issue with: CVE ID, affected package, severity, business justification, compensating control, expiry date.
2. Add entry to `DEPENDENCY_EXCEPTIONS.md` in the repository root.
3. CI reads exceptions from that file (future enhancement).

## License Compliance

- All production dependencies must have OSI-approved license or commercial agreement.
- Prohibited licenses: AGPL (unless vendored with notice), WTFPL, Unlicense, custom licenses without legal review.
- Generate `THIRD_PARTY_NOTICES.md` on each release.

## Vetting Criteria for New Dependencies

Before adding a new dependency, verify:
1. Is it already listed in `THIRD_PARTY_NOTICES.md`? Re-use existing deps first.
2. Does it have an OSI-approved or commercially acceptable license?
3. Is it actively maintained?
4. Does it have known CVEs?
5. Can the functionality be implemented with stdlib or existing deps?

## Review Cadence

- Automated scan: every push and weekly Monday.
- Manual review: quarterly dependency audit.
