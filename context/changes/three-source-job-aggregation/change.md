---
change_id: three-source-job-aggregation
title: Three-source job aggregation
status: implementing
created: 2026-06-01
updated: 2026-06-01
archived_at: null
---

## Notes

Implement roadmap slice S-03: aggregate real offers from JustJoinIT, Remotive, and Adzuna with source labels, deduplication, and preference filtering. This slice is currently marked blocked in the roadmap because source API access, rate limits, and usage constraints need current research before implementation.

2026-06-02 decisions:

- JustJoinIT experimental adapter is accepted if it is isolated, cache-backed, and allowed to fail without breaking the dashboard.
- Adzuna can be implemented as credentials-gated. Until keys are available, the provider should be skipped with a user-visible source warning.
