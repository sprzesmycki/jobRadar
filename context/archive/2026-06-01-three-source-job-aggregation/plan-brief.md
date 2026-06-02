# Plan Brief: Three-source Job Aggregation

## Goal

Turn the one-source Remotive feed into a provider-based aggregated feed that can combine Remotive, Adzuna, and JustJoinIT without making one source failure break the dashboard.

## Recommended Scope

- Keep Remotive as the proven source.
- Add Adzuna behind server-only credentials and skip it with a visible warning when credentials are missing.
- Add a JustJoinIT adapter through the browser-observed candidate API endpoint, keeping it isolated and warning-backed because it is undocumented.
- Deduplicate after normalization, then reuse existing preference filtering and scoring.

## Non-goals

- No CV scoring.
- No persistent imported-jobs table yet.
- No scraping-heavy implementation unless explicitly accepted after research.

## Main Risk

JustJoinIT has a working candidate API endpoint, but it still does not appear to be officially documented for third-party use. S-03 should keep the adapter isolated and allowed to fail without breaking the feed.
