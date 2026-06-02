---
topic: three-source-job-aggregation
researcher: Codex
created: 2026-06-01
updated: 2026-06-01
---

# Research: Three-source Job Aggregation

## Scope

Roadmap S-03 asks for aggregated offers from JustJoinIT, Remotive, and Adzuna with source labels, deduplication, and preference filtering. S-02 already added live Remotive jobs in `src/lib/jobs.ts`, rendered by `src/pages/dashboard.astro`.

## Current Code

- `src/lib/jobs.ts` owns the whole job pipeline today: source type, Remotive fetch/cache, fallback jobs, normalization, preference filtering, scoring, and `getMatchedJobs()`.
- `src/pages/dashboard.astro` expects `getMatchedJobs(preferences)` and displays a source count, job source badge, external URL, salary, technologies, and saved-job form.
- `src/lib/saved-jobs.ts` and `supabase/migrations/20260601101000_create_saved_jobs.sql` store saved jobs by generic external id/source/title/company/url, so multi-source saved status should not need a schema migration.

## Source Research

### Remotive

- Official/public docs live in the `remotive-com/remote-jobs-api` repository.
- The current endpoint is `https://remotive.com/api/remote-jobs`.
- Remotive requires attribution and a backlink to the Remotive URL.
- Remotive advises low polling frequency: a few times per day, max 4/day, and excessive requests may be blocked.
- The live sample still includes a legal warning, `jobs`, `id`, `url`, `title`, `company_name`, `category`, `tags`, `candidate_required_location`, and optional `salary`.

Sources:

- https://github.com/remotive-com/remote-jobs-api
- https://remotive.com/api/remote-jobs?limit=1

### Adzuna

- Adzuna has an official REST API.
- It requires `app_id` and `app_key`.
- Root URL is `https://api.adzuna.com/v1/api`.
- Job search endpoint shape is `GET /jobs/{country}/search/{page}`.
- The API supports JSON responses and has live endpoint documentation.

Sources:

- https://developer.adzuna.com/overview
- https://developer.adzuna.com/activedocs/

### JustJoinIT

- The public website currently renders live IT job listings at `https://justjoin.it/` and identifies itself as a job board for the tech industry in Europe.
- The HTML includes `preconnect` hints for `https://api.justjoin.it` and `https://public.justjoin.it`.
- Initial research missed the current candidate API endpoint and incorrectly focused on the old `/api/offers` path plus embedded Next.js payloads.
- User provided a working browser-observed endpoint on 2026-06-02: `https://justjoin.it/api/candidate-api/offers`.
- The endpoint returned HTTP 200 without user cookies when called with query parameters such as `from=0`, `itemsCount=20`, `categories=mobile`, `currency=pln`, and sorting by `publishedAt`.
- Response shape includes `data[]` offers with `guid`, `slug`, `title`, `workplaceType`, `companyName`, `city`, `employmentTypes`, `requiredSkills`, and `niceToHaveSkills`.

Implication: JustJoinIT can use a much cleaner JSON adapter than the HTML parser, but the endpoint still appears undocumented, so the provider should remain isolated, cache-backed, and allowed to fail without breaking the dashboard.

Sources:

- https://justjoin.it/
- https://justjoin.it/api/candidate-api/offers

## Architecture Implications

- `src/lib/jobs.ts` is now doing too much. S-03 should introduce a small provider abstraction before adding sources.
- Each source needs its own cache policy, normalization function, and error boundary. One source failure must not collapse the whole dashboard.
- The dashboard should show available source count and source-specific warnings.
- Deduplication should happen after normalization and before preference filtering. A pragmatic MVP key can combine normalized company + title + URL host/source id fallback.
- Adzuna credentials must stay server-only. Use Cloudflare/Astro runtime environment variables, never frontend code.

## Open Decisions

1. Adzuna credentials: implementation can be written to skip Adzuna when `ADZUNA_APP_ID` or `ADZUNA_APP_KEY` is absent, but full S-03 verification needs real keys. User confirmed on 2026-06-02 that keys are not available yet and credentials-gated implementation may proceed.
2. JustJoinIT policy: user accepted an experimental adapter on 2026-06-02, provided it is isolated and can fail without breaking the dashboard. User then provided the current candidate API endpoint, replacing the brittle HTML parsing approach.
3. Source count semantics: count configured sources, successfully fetched sources, or visible sources after filtering. Recommended: successfully fetched sources.
