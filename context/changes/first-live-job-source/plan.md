# First Live Job Source Implementation Plan

## Overview

Replace the dashboard's demo-only job list with the first real job source. This slice should make JobRadar show live remote offers before we invest in CV upload and scoring.

## Current State Analysis

The archived `onboarding-preferences` slice left a working authenticated dashboard with saved preferences, deterministic demo jobs, and saved job statuses. The matching contract lives in `src/lib/jobs.ts`; the dashboard calls `matchJobs(preferences)` server-side and renders the returned jobs in `src/pages/dashboard.astro`.

### Key Discoveries

- `src/lib/jobs.ts` owns the current job contract (`DemoJob`, `MatchedJob`) and preference filtering/scoring helpers.
- `src/pages/dashboard.astro` already reads Supabase preferences and saved jobs before rendering.
- Saved status posting in `src/pages/api/saved-jobs.ts` only needs stable `external_id`, `source`, `title`, `company`, and `url`.
- Remotive exposes `https://remotive.com/api/remote-jobs` without credentials and returns `jobs` with `id`, `url`, `title`, `company_name`, `candidate_required_location`, `salary`, `tags`, and `publication_date`.
- Remotive's API notice asks clients to link back to Remotive, mention Remotive as the source, and avoid excessive polling; it recommends only a few requests per day for typical uses.
- Adzuna is not a good first source because it requires API credentials. JustJoinIT needs separate current-access/API research before it is safe to plan as the first integration.

## Desired End State

A logged-in user can open `/dashboard` and see live Remotive offers filtered by saved preferences where possible. The dashboard still works if Remotive is unavailable, and saved-job status works for live offers exactly like it worked for demo offers.

## What We're NOT Doing

- Integrating JustJoinIT or Adzuna.
- Adding a job ingestion database or Supabase job cache.
- Adding scheduled background jobs.
- Implementing CV upload, CV parsing, AI scoring, or cover-letter generation.
- Building FastAPI/VPS service code.
- Adding a dedicated test runner.

## Implementation Approach

Keep this as a thin vertical slice inside the Astro/Supabase app. Add a Remotive fetcher/mapper in `src/lib/jobs.ts` or a nearby helper, fetch live jobs server-side from `dashboard.astro`, and keep a small demo fallback so dashboard rendering remains resilient. Cache Remotive responses for multiple hours in process memory to avoid repeated provider calls on every dashboard render. Apply existing preference filtering to normalized live jobs; for salary, parse only obvious numeric ranges and otherwise avoid incorrectly filtering out jobs.

## Phase 1: Remotive Fetch And Normalization

### Overview

Add a server-side integration that fetches Remotive jobs, caches them briefly on the server, and maps them into the existing dashboard job contract.

### Changes Required

#### 1. Job source contract

**Files**:

- `src/lib/jobs.ts`

**Intent**: Separate the job shape used by the dashboard from the current hardcoded demo array.

**Contract**: Expose a normalized job type with stable `id`, `source`, `title`, `company`, `location`, `workMode`, `salaryMin`, `salaryCurrency`, `technologies`, and `url`.

#### 2. Remotive fetcher

**Files**:

- `src/lib/jobs.ts` or `src/lib/job-sources/remotive.ts`

**Intent**: Fetch software-related remote jobs from Remotive on the server and normalize them.

**Contract**: The fetcher must not require secrets, must set source to `Remotive`, must produce stable IDs such as `remotive-<id>`, and must fail closed with a typed error/fallback path.

#### 3. Server-side request throttling

**Files**:

- `src/lib/jobs.ts` or `src/lib/job-sources/remotive.ts`

**Intent**: Respect Remotive's guidance to avoid frequent polling.

**Contract**: Cache successful Remotive responses in process memory with a multi-hour TTL. If the API fails and stale cache exists, serve stale data with a warning; otherwise fall back to demo jobs with a visible source-unavailable message.

#### 4. Conservative salary parsing

**Files**:

- `src/lib/jobs.ts` or `src/lib/job-sources/remotive.ts`

**Intent**: Preserve salary preference filtering without pretending all free-text salaries are structured.

**Contract**: Parse obvious `$80k - $100k` or similar patterns into `salaryMin` and `USD`; leave unknown salary as `null` or skip salary filtering for unparseable values.

### Success Criteria

#### Automated Verification

- `npm run lint` passes.
- `npm run build` passes.
- Fetcher can map a representative Remotive payload without throwing.
- Remotive fetch path uses a server-side cache/TTL rather than refetching on every dashboard render.

#### Manual Verification

- A logged-in user sees Remotive-sourced live jobs on `/dashboard`.
- Remotive jobs display source attribution and link back to Remotive job URLs.
- If Remotive fetch fails, the dashboard still renders a clear fallback state.

---

## Phase 2: Dashboard Live Job Loop

### Overview

Wire the live source into the authenticated dashboard and verify that existing preference and saved-status behavior still works.

### Changes Required

#### 1. Dashboard data loading

**Files**:

- `src/pages/dashboard.astro`
- `src/lib/jobs.ts`

**Intent**: Replace synchronous demo matching with async live job loading and matching.

**Contract**: `dashboard.astro` should await the live job result server-side, render live jobs when available, and render a clear fallback/error message when the source is unavailable.

#### 2. Preference filtering

**Files**:

- `src/lib/jobs.ts`

**Intent**: Reuse current role, salary, work-mode, and technology matching against normalized Remotive jobs.

**Contract**: Empty preferences should show jobs. Work mode should treat Remotive jobs as remote. Technology preferences should narrow the live list. Salary filtering should respect both minimum amount and currency for parseable salaries, and the user can decide whether unparseable salaries remain visible.

#### 3. Unknown salary preference

**Files**:

- `supabase/migrations/20260601103000_add_unknown_salary_preference.sql`
- `src/lib/preferences.ts`
- `src/pages/api/preferences.ts`
- `src/pages/dashboard.astro`

**Intent**: Avoid hardcoding whether jobs without listed salary survive the salary filter.

**Contract**: Preferences include an `include_unknown_salary` checkbox, defaulting to checked for existing users. When unchecked and min salary is set, jobs without parseable salary are hidden.

#### 4. Saved status compatibility

**Files**:

- `src/pages/dashboard.astro`
- `src/pages/api/saved-jobs.ts` if needed

**Intent**: Preserve the status-save loop for live jobs.

**Contract**: Status forms post stable live job IDs and persist through the existing `saved_jobs` upsert.

### Success Criteria

#### Automated Verification

- `npm run lint` passes.
- `npm run build` passes.
- Runtime smoke check: `/dashboard` redirects unauthenticated requests to `/auth/signin`.

#### Manual Verification

- A logged-in user sees at least one Remotive job on `/dashboard` with realistic title/company/location.
- Preferences can reduce the live list or show the existing empty-state message.
- Saving a live job status persists after redirect/refresh.
- The dashboard remains usable on desktop and mobile widths after live data loads.

---

## Testing Strategy

### Unit Tests

No dedicated test runner exists yet. If the implementation introduces pure mapper helpers, add a lightweight verification path only if it fits existing tooling; otherwise keep validation through build/lint and runtime smoke.

### Integration Tests

Manual integration against Remotive is required because this slice's value is the live source.

### Manual Testing Steps

1. Sign in locally.
2. Open `/dashboard`.
3. Confirm at least one Remotive job appears with source attribution and real job URL.
4. Set preferences that should narrow the list.
5. Save one live job as `interested`, then change it to `applied`.
6. Refresh and confirm the saved status remains visible.
7. Check desktop and mobile layout after live data loads.

## Performance Considerations

Do not poll Remotive aggressively. This first slice may trigger loading from the dashboard path, but implementation must cache successful responses for multiple hours and avoid client-side polling. A later ingestion/cache slice can move this into durable storage or a scheduled job if needed.

## Migration Notes

This slice adds one preference column:

```bash
npx supabase db push
```

Migration:

- `supabase/migrations/20260601103000_add_unknown_salary_preference.sql`

Existing `saved_jobs` can store live Remotive jobs through the existing generic job fields.

## References

- Roadmap: `context/foundation/roadmap.md`
- Archived previous slice: `context/archive/2026-06-01-onboarding-preferences/`
- Remotive API documentation: `https://remotive.com/api-documentation`
- Remotive API endpoint verified on 2026-06-01: `https://remotive.com/api/remote-jobs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Remotive Fetch And Normalization

#### Automated

- [x] 1.1 `npm run lint` passes — 5e8c9fe
- [x] 1.2 `npm run build` passes — 5e8c9fe
- [x] 1.3 Fetcher can map a representative Remotive payload without throwing — 4ceeee0
- [x] 1.4 Remotive fetch path uses a server-side cache/TTL rather than refetching on every dashboard render — 4ceeee0

#### Manual

- [ ] 1.5 A logged-in user sees Remotive-sourced live jobs on `/dashboard`
- [ ] 1.6 Remotive jobs display source attribution and link back to Remotive job URLs
- [ ] 1.7 If Remotive fetch fails, the dashboard still renders a clear fallback state

### Phase 2: Dashboard Live Job Loop

#### Automated

- [x] 2.1 `npm run lint` passes — 5e8c9fe
- [x] 2.2 `npm run build` passes — 5e8c9fe
- [x] 2.3 Runtime smoke check: `/dashboard` redirects unauthenticated requests to `/auth/signin` — 4ceeee0
- [ ] 2.4 Hosted Supabase migration for `include_unknown_salary` is applied

#### Manual

- [ ] 2.5 A logged-in user sees at least one Remotive job on `/dashboard` with realistic title/company/location
- [ ] 2.6 Preferences can reduce the live list or show the existing empty-state message
- [ ] 2.7 Salary filters respect min amount, currency, and the unknown-salary checkbox
- [ ] 2.8 Saving a live job status persists after redirect/refresh
- [ ] 2.9 The dashboard remains usable on desktop and mobile widths after live data loads
