# Data Retention Matrix

| Data Entity | Retention | Deletion Trigger | Deletion Method | Notes |
|-------------|-----------|-----------------|-----------------|-------|
| User accounts | Active + 90 days | Account deletion request | Soft delete (status=disabled), hard delete after 90 days | Legal hold override available |
| Sessions | Until revoked or expired | Logout, password change, 30-day expiry | Automatic (revoked_at set) | |
| Email verifications | 24 hours | After use or expiry | Automatic (expires_at check) | |
| Password reset tokens | 1 hour | After use or expiry | Automatic (expires_at check) | |
| Login attempts | 90 days | After 90 days | Deletion via maintenance cron | Audit purposes |
| OAuth accounts | Until user deleted | Account deletion | Cascade delete | |
| Organizations | Active + 90 days | Owner deletes org | Soft delete, hard after 90 days | Requires no active members |
| Organization members | Until membership removed | Member removed or org deleted | Soft delete (status=removed) | |
| Organization invitations | 7 days or after acceptance | After acceptance, revocation, or expiry | Automatic | |
| Accounts (COA) | Permanent (financial records) | Never (accounting records) | Deactivate (is_active=0) | Immutable for audit trail |
| Transactions | Permanent (financial records) | Never | Void (not delete) | Correction via void/reversal |
| Journal entries | Permanent (financial records) | Never | Void (not delete) | Correction via reversal entry |
| Products | Until no transactions reference | Never if transaction exists | Deactivate (is_active=0) | |
| Parties | Until no transactions reference | Never if transaction exists | Deactivate (is_active=0) | |
| Stock movements | Permanent | Never | Never | Audit trail |
| Period locks | Permanent | Never | Never | Audit trail |
| Audit logs | 5 years | After 5 years | Archival to cold storage | Regulatory compliance |
| Exports | Until expired (24h) | After expiry | Automatic | |
| Rate limits | 1 hour | After 1 hour | Automatic | |

## Data Subject Rights (UU PDP)

| Right | Implementation |
|-------|---------------|
| Access | `GET /api/auth/me` + data export |
| Correction | Profile update in settings |
| Deletion | Account deletion request |
| Portability | Data export (CSV) |
| Restriction | Account suspension (future) |
| Objection | Unsubscribe / disable account |
