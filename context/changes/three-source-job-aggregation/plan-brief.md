# Plan Brief: Three-source Job Aggregation

## Goal

Turn the one-source Remotive feed into a provider-based aggregated feed that can combine Remotive, Adzuna, and JustJoinIT without making one source failure break the dashboard.

## Recommended Scope

- Keep Remotive as the proven source.
- Add Adzuna behind server-only credentials and skip it with a visible warning when credentials are missing.
- Add a JustJoinIT adapter only after a stable source contract is confirmed; otherwise ship a source warning and keep the provider boundary ready.
- Deduplicate after normalization, then reuse existing preference filtering and scoring.

## Non-goals

- No CV scoring.
- No persistent imported-jobs table yet.
- No scraping-heavy implementation unless explicitly accepted after research.

## Main Risk

JustJoinIT does not currently have an identified official public API contract. S-03 should not make the app depend on a brittle undocumented endpoint without isolating that risk.
