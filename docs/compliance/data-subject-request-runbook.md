# Data Subject Request Runbook

## Request Types

### 1. Access Request (DSR-A)
**User wants to know what data is held about them.**

1. Verify identity (email + current session).
2. Export data:
   - User profile: `SELECT * FROM users WHERE id = ?`
   - Organizations: `SELECT * FROM organization_members WHERE user_id = ?`
   - Sessions: `SELECT * FROM sessions WHERE user_id = ?`
   - Login history: `SELECT * FROM login_attempts WHERE email = ?`
3. Compile into JSON/CSV response.
4. Deliver via secure download link (expires in 7 days).
5. Log the request in audit trail.
6. **Timeline**: Respond within 7 days (UU PDP requirement).

### 2. Deletion Request (DSR-D)
**User wants their account and associated data deleted.**

1. Verify identity.
2. Check for legal hold (if applicable, skip deletion).
3. Revoke all sessions.
4. Set `users.status = 'disabled'`.
5. Anonymize personal data in financial records (replace name with 'Deleted User').
6. Remove organization memberships.
7. Schedule hard delete after 90-day grace period.
8. Log the request in audit trail.
9. **Timeline**: Initiate within 7 days. Hard delete after 90 days.

### 3. Correction Request (DSR-C)
**User wants to correct inaccurate data.**

1. Verify identity.
2. Validate the correction.
3. Update user profile fields (not financial records — those are immutable).
4. Log the correction in audit trail.
5. **Timeline**: Complete within 7 days.

### 4. Portability Request (DSR-P)
**User wants their data in machine-readable format.**

1. Same as Access Request, but format MUST be structured (CSV/JSON).
2. Include: profile data, transaction history (by org), account list.
3. **Timeline**: Respond within 14 days.

## Verification

For all requests, verify identity before processing:
- Authenticated user: session cookie confirms identity.
- Unauthenticated user: email verification + additional proof.

## Legal Hold

If a legal hold applies:
1. Mark user account as `legal_hold = true`.
2. Skip deletion steps.
3. Notify user that retention is required by law.
4. Document the legal hold reason and authority.

## Logging

All DSR actions must be logged in audit_logs:
- `entity_type: 'data_subject_request'`
- `action: 'access' | 'deletion' | 'correction' | 'portability'`
- `after_json: { requestType, status, timestamp }`

## Manual steps requiring human intervention

- **Legal hold determination**: Requires legal counsel review.
- **Hard delete execution**: Requires manual DB operation after 90-day grace period.
- **Regulatory notification**: Must be done by compliance team.
