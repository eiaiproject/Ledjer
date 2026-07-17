# Incident Response

## Severity Levels

| Level | Label | Description | Response Time |
|-------|-------|-------------|---------------|
| SEV1 | Critical | Data loss, cross-tenant access, outage, financial data corruption | Immediate |
| SEV2 | High | Degraded performance, feature outage, authentication failure | < 1 hour |
| SEV3 | Medium | Non-critical bug, cosmetic issue, documentation gap | < 1 day |
| SEV4 | Low | Enhancement, technical debt | Next sprint |

## Incident Workflow

### 1. Detection
- Automated alert (monitoring dashboard, Sentry, cron failure)
- User report (support email, in-app feedback)
- Manual observation

### 2. Triage
1. Acknowledge the alert.
2. Determine severity (SEV1–SEV4).
3. For SEV1: Immediately notify on-call engineer.
4. Create an incident issue with: title, severity, time discovered, affected component, symptoms.

### 3. Containment
- **Security incident**: Revoke affected sessions, rotate secrets, block IPs if needed.
- **Data corruption**: Stop all transactions, restore from backup.
- **Performance degradation**: Scale Workers, throttle abusive clients.

### 4. Investigation
- Check Sentry for error traces.
- Check Worker logs for request patterns.
- Check D1 query performance.
- Check recent deployments.

### 5. Resolution
- Apply fix (forward-only migration, code rollback, config change).
- Verify through health checks and smoke tests.
- Monitor for 15 minutes after fix.

### 6. Postmortem
For SEV1 and SEV2 incidents, write a postmortem within 48 hours:
1. Summary
2. Timeline
3. Root cause
4. Impact (users affected, data affected, duration)
5. Action items with owners and deadlines
6. Prevention

## Communication

| Channel | Purpose |
|---------|---------|
| GitHub Issues | Incident tracking, postmortems |
| Email | Customer notification (data breach: within 72 hours per UU PDP) |
| Status page | Public outage communication |

## Escalation

1. Engineer → Senior Engineer → Architect → CTO
2. Security incident → Add security team lead
3. Legal impact → Add legal counsel

## Post-Recovery Verification

After any SEV1/SEV2 incident:
1. Run tenant isolation tests
2. Run accounting invariant tests
3. Verify backup integrity
4. Run smoke tests
5. Confirm monitoring is operational
