# Subprocessor Inventory

| Subprocessor | Service | Data Accessed | Location | Purpose | Contractual Safeguards |
|-------------|---------|---------------|----------|---------|----------------------|
| Cloudflare, Inc. | Cloudflare Workers, D1, R2 | All application data, IP addresses | Global edge network | Application hosting, database, object storage | DPA in place, SOC 2 Type II, ISO 27001 |
| Google LLC | Google OAuth | Email address, profile name | Global | Authentication | Limited to OAuth scope, no data storage |
| Google LLC | Google Cloud (if used) | Email communications | Global | Transactional email (future) | DPA in place |
| Sentry (Functional Software, Inc.) | Error monitoring | Error stack traces, performance data, IP address | US, EU | Application monitoring | DPA in place, SOC 2 Type II |

## Notes

- **No subprocessor has direct database access.** All data access is mediated by the Cloudflare Worker.
- **No personal data is sold or used for training** by any subprocessor.
- **DPA review**: Ensure all subprocessors have signed Data Processing Agreements.
- **Subprocessor changes**: Notify customers 30 days before adding/changing subprocessors.
