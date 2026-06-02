# Implementation Plan: Three-source Job Aggregation

## Summary

Add a source-provider layer for jobs, aggregate normalized offers from Remotive, Adzuna, and JustJoinIT where available, deduplicate them, and keep the existing preference filtering/dashboard loop intact.

This is a vertical slice because the user-visible result is a richer live offer feed with multiple source badges and graceful source-level failure states.

## Current State

- `src/lib/jobs.ts` contains the current Remotive-only live fetch, fallback demo jobs, preference matching, scoring, and `getMatchedJobs()`.
- `src/pages/dashboard.astro` displays jobs from `getMatchedJobs()` and already supports source badges and external links.
- Saved jobs are generic enough for multiple sources: external id, source, title, company, URL.
- Roadmap S-03 is currently marked blocked because provider access constraints need research.

## External Constraints

- Remotive has a public endpoint, attribution requirement, backlink requirement, and low polling guidance.
- Adzuna requires `app_id` and `app_key`; these must be server-only environment variables.
- JustJoinIT has a browser-observed candidate API endpoint that returns offer JSON, but no official third-party API contract was found in this pass.

## Design

### 1. Provider Contract

Introduce source adapters around a shared normalized job contract:

- `src/lib/job-sources/types.ts`
  - `JobSourceName`
  - `SourceFetchResult`
  - `JobSourceAdapter`
  - normalized `RawJob` or existing `DemoJob` replacement
- `src/lib/job-sources/remotive.ts`
- `src/lib/job-sources/adzuna.ts`
- `src/lib/job-sources/justjoinit.ts`
- `src/lib/job-sources/aggregate.ts`

Keep `src/lib/jobs.ts` as the public matching API for the dashboard, but move source fetching out of it.

### 2. Aggregation And Error Boundaries

Each provider returns either normalized jobs or a source warning. Aggregation should:

1. fetch providers with independent try/catch boundaries,
2. combine successful jobs,
3. deduplicate normalized jobs,
4. return source metadata for the dashboard,
5. fall back to cached/stale/demo jobs only when every source fails.

One broken provider must not hide working providers.

### 3. Adzuna Provider

Use server-only env vars:

- `ADZUNA_APP_ID`
- `ADZUNA_APP_KEY`
- optional `ADZUNA_COUNTRY`, default `gb` or `us` based on preferred market decision

If credentials are absent, skip Adzuna and return a warning. Do not expose credentials in frontend-rendered HTML.

### 4. JustJoinIT Provider

Default implementation should be conservative:

- implement the adapter interface,
- include source warning when no stable contract is available,
- fetch live JustJoinIT jobs through the explicitly accepted candidate API endpoint.

If we accept an experimental adapter, keep it small, cached, and easy to disable with an env flag.

### 5. Deduplication

MVP dedupe key:

1. if provider has a stable source id, preserve source-specific id for saved jobs;
2. for cross-source duplicate detection, normalize `title + company`;
3. optionally include canonicalized URL host/path when company/title are weak.

When duplicates are found, prefer the job with:

1. salary listed,
2. more technologies,
3. direct provider URL,
4. deterministic source priority.

### 6. Dashboard

Update dashboard source summary:

- show successful source count, not hardcoded `1`;
- show source warnings near existing job warning messages;
- preserve source badge on every card;
- preserve saved-job status form.

## Files

- `src/lib/jobs.ts`
- `src/lib/job-sources/types.ts`
- `src/lib/job-sources/remotive.ts`
- `src/lib/job-sources/adzuna.ts`
- `src/lib/job-sources/justjoinit.ts`
- `src/lib/job-sources/aggregate.ts`
- `src/pages/dashboard.astro`
- `.env.example`
- `.dev.vars.example` if present or relevant
- `context/foundation/roadmap.md` only if this plan unblocks S-03

## Verification

- `npm run lint`
- `npm run build`
- Runtime smoke: unauthenticated `/dashboard` still redirects to sign-in.
- Runtime authenticated check:
  - Remotive jobs still appear.
  - Dashboard source count reflects successful sources.
  - Adzuna is skipped cleanly without credentials.
  - Source warnings render without breaking layout.
  - Preference filtering still reduces aggregated results.
  - Saved job status still persists for at least one live source.

## Risks

- JustJoinIT may change or block the undocumented candidate API endpoint.
- Adzuna verification needs user-provided API credentials.
- Aggregated source volume can make dashboard slower if provider cache boundaries are not kept.
- Salary and currency normalization will remain approximate until a real exchange-rate source exists.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Provider Research And Source Contract

#### Automated

- [x] 1.1 `npm run lint` passes — ddbe7c1
- [x] 1.2 `npm run build` passes — ddbe7c1
- [x] 1.3 Provider contract compiles with Remotive moved behind an adapter — ad0b1be

#### Manual

- [x] 1.4 Team decides whether JustJoinIT may use an experimental undocumented adapter — ad0b1be
- [x] 1.5 Team provides Adzuna credentials or accepts Adzuna-skip verification for this branch — ad0b1be

### Phase 2: Aggregation Runtime

#### Automated

- [x] 2.1 Aggregator returns Remotive jobs when Remotive succeeds — ad0b1be
- [x] 2.2 Aggregator keeps working jobs when one provider fails — ddbe7c1
- [x] 2.3 Dedupe removes duplicate normalized title/company pairs deterministically — ad0b1be
- [x] 2.4 Preference filters run after aggregation and dedupe — ad0b1be

#### Manual

- [x] 2.5 Dashboard shows more than one successful source when credentials/source access allow it — fe6f969
- [x] 2.6 Dashboard shows source warnings when a provider is skipped or fails — ad0b1be
- [x] 2.7 Saving a job status still persists after redirect/refresh for aggregated jobs
- [x] 2.8 Desktop and mobile layouts remain usable with mixed-source jobs and warnings
