# Product Instrumentation

## Privacy-Aware Events

Events are defined for product analysis. Implementation deferred until analytics
SDK is selected.

### Core Events

| Event | Trigger | Properties | Privacy |
|-------|---------|------------|---------|
| `signup` | Registration form submitted | `method: email|google` | No email in event |
| `org_created` | Organization created with default COA | None | No org name |
| `first_transaction` | First transaction posted | `transaction_type` | |
| `transaction_voided` | A posted transaction is voided | None | |
| `first_report` | First report generated | `report_type` | |
| `export_downloaded` | CSV export downloaded | `export_type, row_count, truncated` | |
| `weekly_active` | At least one action in 7 days | `role` | Aggregated |

### Revenue Events (when billing exists)

| Event | Trigger | Properties |
|-------|---------|------------|
| `subscription_started` | First payment | `plan, amount` |
| `subscription_changed` | Plan change | `from_plan, to_plan` |
| `subscription_cancelled` | Cancellation | `reason` |

## Business Metric Formulas

### Revenue Metrics

| Metric | Formula | Notes |
|--------|---------|-------|
| MRR | Σ(monthly subscription fees) | Per active paying account |
| ARR | MRR × 12 | Annualized |
| New MRR | MRR from new customers this month | |
| Expansion MRR | MRR from upgrades this month | |
| Contraction MRR | MRR lost from downgrades this month | |
| Churned MRR | MRR lost from cancellations this month | |
| Net Revenue Retention | (Starting MRR + Expansion - Contraction - Churn) / Starting MRR | |

### Growth Metrics

| Metric | Formula | Notes |
|--------|---------|-------|
| Logo churn rate | Cancelled accounts / Total accounts | Monthly |
| Revenue churn rate | Churned MRR / Starting MRR | Monthly |
| Retention cohort | % of users active in month N after signup | Weekly cohorts |
| Activation rate | Users who posted a first transaction / Signups | |
| CAC | Total sales & marketing cost / New customers | Requires cost data |
| LTV | ARPU / Monthly churn rate | Simplified calculation |
| CAC payback | CAC / (ARPU - COGS per customer) | Months to recover CAC |
| Gross margin | (Revenue - COGS) / Revenue | |

## Pricing Hypotheses (for future A/B testing)

> These are hypotheses only. Do not hardcode pricing before business approval.

1. **Flat rate**: Single price for all features. Simple, but may not capture value.
2. **Tiered (Starter / Business / Enterprise)**: Based on transaction volume or
   user count. Standard SaaS model.
3. **Usage-based**: Per transaction or per report. Aligns cost with value but
   may reduce predictability.
4. **Freemium**: Free tier (limited transactions, 1 user) → paid upgrade.
   Increases adoption but may reduce conversion.

## Implementation Guidance

- **Do not**: Send PII (email, name, org name) to analytics.
- **Do**: Use anonymized user IDs (hashed or random).
- **Do**: Respect `Do Not Track` headers.
- **Do**: Provide opt-out mechanism in settings.
- **Deferred until**: Analytics SDK selection and privacy review.
