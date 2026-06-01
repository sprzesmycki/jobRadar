# Plan Brief: First Live Job Source

## Problem

The dashboard currently uses static demo jobs. This proves the UI loop, but it does not prove the product's aggregation promise because the user is not seeing real offers.

## Decision

Use Remotive as the first live source. It has a public endpoint that does not require API credentials, returns software-related remote jobs with tags, company, salary text, location, URL, and publication date, and includes clear attribution/frequency requirements. Adzuna needs API credentials, and JustJoinIT needs separate access/API research before it can be treated as a low-risk first source.

## Scope

- Fetch Remotive jobs server-side from the Astro dashboard path.
- Map Remotive job payloads into the existing `MatchedJob` dashboard contract.
- Apply existing preference filters where the source data supports them.
- Keep demo jobs as an optional fallback if Remotive is unavailable.
- Preserve saved-job status behavior.

## Not In Scope

- JustJoinIT or Adzuna integration.
- Supabase persistence for fetched jobs.
- Background ingestion, caching database, cron jobs, or queueing.
- CV upload, AI scoring, or cover-letter generation.

## Verification

- `npm run lint`
- `npm run build`
- Local smoke: unauthenticated `/dashboard` still redirects.
- Logged-in dashboard shows at least one Remotive job or a clear fallback/error state.
- Saving a live Remotive job status persists after refresh.
