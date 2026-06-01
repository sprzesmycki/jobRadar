# Onboarding Preferences Implementation Plan

## Overview

Implement the first thin vertical product slice after authentication: user preferences, demo job matching, and saved job status tracking. The goal is to validate the product loop end-to-end before building real ingestion, CV parsing, and AI cover-letter generation.

## Current State Analysis

JobRadar already has Astro SSR, Supabase Auth, middleware-protected `/dashboard`, and a deployed Cloudflare Worker. The dashboard was still a starter page and did not persist product data or expose the PRD's first required user input.

### Key Discoveries:

- `src/middleware.ts` protects `/dashboard` and populates `Astro.locals.user`.
- `src/lib/supabase.ts` exposes the Supabase SSR client used by auth API routes.
- `AGENTS.md` defines `npm run lint` and `npm run build` as the baseline verification gate.
- No dedicated test runner exists yet.

## Desired End State

After this change, an authenticated user can save job preferences, see matched demo offers from the three PRD sources, and save/update a status for a job. Supabase stores preferences and saved jobs under row-level security so each user only sees their own data.

## What We're NOT Doing

- Real job scraping or API ingestion.
- CV upload, parsing, storage, or AI matching.
- Cover-letter generation.
- FastAPI backend or VPS deployment.
- Full end-to-end test infrastructure.

## Implementation Approach

Use server-rendered Astro forms and API routes for the first slice. Add Supabase migrations for durable per-user state, keep matching deterministic and local for now, and explicitly document that demo jobs are a scaffold for the future ingestion/backend slice.

## Phase 1: Data Contracts And Handlers

### Overview

Create the persistence layer and form endpoints that let a logged-in user save preferences and saved job status.

### Changes Required:

#### 1. Supabase migrations

**Files**:

- `supabase/migrations/20260601100000_create_job_preferences.sql`
- `supabase/migrations/20260601101000_create_saved_jobs.sql`

**Intent**: Add per-user tables for search preferences and saved job statuses.

**Contract**: Tables use `user_id` references to `auth.users(id)`, enable RLS, and define select/insert/update policies scoped to `auth.uid() = user_id`.

#### 2. Server-side data helpers

**Files**:

- `src/lib/preferences.ts`
- `src/lib/saved-jobs.ts`

**Intent**: Keep dashboard data reads and empty/error handling out of the page template.

**Contract**: Helpers return typed data plus user-facing migration-not-applied error messages.

#### 3. Form endpoints

**Files**:

- `src/pages/api/preferences.ts`
- `src/pages/api/saved-jobs.ts`
- `src/pages/api/auth/signin.ts`

**Intent**: Save preferences and job statuses through authenticated server routes; redirect sign-in into the product dashboard.

**Contract**: Endpoints require a Supabase user, redirect unauthenticated users to sign-in, and upsert user-owned rows.

### Success Criteria:

#### Automated Verification:

- Migration files exist for `job_preferences` and `saved_jobs`.
- `npm run lint` passes.
- `npm run build` passes.

#### Manual Verification:

- Hosted Supabase migrations are applied with `npx supabase db push`.
- A logged-in user can save preferences without an RLS error.
- A logged-in user can save a job status without an RLS error.

**Implementation Note**: Automated code work is complete in commit `17836c1`; manual Supabase verification remains pending before production deploy.

---

## Phase 2: Dashboard Vertical Loop

### Overview

Replace the starter dashboard with a usable JobRadar screen that demonstrates the full user loop with demo jobs.

### Changes Required:

#### 1. Demo matching model

**File**: `src/lib/jobs.ts`

**Intent**: Provide deterministic demo offers from JustJoinIT, Remotive, and Adzuna while real ingestion is out of scope.

**Contract**: Exposes matched jobs with score, matched skills, missing skills, and a concise explanation.

#### 2. Dashboard UI

**File**: `src/pages/dashboard.astro`

**Intent**: Render preferences, summary stats, matched demo jobs, and saved-status controls for the authenticated user.

**Contract**: Reads preferences and saved jobs server-side; posts forms to the new API endpoints; shows an empty-state when filters remove all jobs.

#### 3. Documentation

**File**: `README.md`

**Intent**: Document migration commands needed before testing/deploying data-writing features.

**Contract**: Mentions `npx supabase link --project-ref <project-ref>` and `npx supabase db push`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes.
- `npm run build` passes.
- Runtime smoke check: `/` returns 200 locally.
- Runtime smoke check: `/dashboard` redirects unauthenticated requests to `/auth/signin`.

#### Manual Verification:

- A logged-in user sees the dashboard after sign-in.
- Preferences saved in the form are visible after redirect/refresh.
- Job status saved in the list is visible after redirect/refresh.
- The dashboard remains usable on a mobile-width viewport.

**Implementation Note**: Automated code work is complete in commit `17836c1`; logged-in/manual checks remain pending until Supabase migrations are applied.

---

## Testing Strategy

### Unit Tests:

- No unit test runner exists yet. This slice relies on the current repo gate: lint and build.

### Integration Tests:

- Manual integration test through Supabase is required after migrations are applied.

### Manual Testing Steps:

1. Apply Supabase migrations.
2. Sign in to the deployed app.
3. Save preferences and confirm the form retains the values after redirect.
4. Save a job as `interested`, then change it to `applied`.
5. Check mobile layout for the preferences/sidebar and job list.

## Performance Considerations

The current job list is static and tiny. Real ingestion must introduce pagination/filtering before using live data.

## Migration Notes

Run migrations against the hosted Supabase project before deploying this slice:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

## References

- PRD: `context/foundation/prd.md`
- Stack contract: `context/foundation/tech-stack.md`
- Infrastructure contract: `context/foundation/infrastructure.md`
- Implementation commit: `17836c1 feat: add onboarding preferences slice`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data Contracts And Handlers

#### Automated

- [x] 1.1 Migration files exist for `job_preferences` and `saved_jobs` — 17836c1
- [x] 1.2 `npm run lint` passes — 17836c1
- [x] 1.3 `npm run build` passes — 17836c1

#### Manual

- [ ] 1.4 Hosted Supabase migrations are applied with `npx supabase db push`
- [ ] 1.5 A logged-in user can save preferences without an RLS error
- [ ] 1.6 A logged-in user can save a job status without an RLS error

### Phase 2: Dashboard Vertical Loop

#### Automated

- [x] 2.1 `npm run lint` passes — 17836c1
- [x] 2.2 `npm run build` passes — 17836c1
- [x] 2.3 Runtime smoke check: `/` returns 200 locally — 17836c1
- [x] 2.4 Runtime smoke check: `/dashboard` redirects unauthenticated requests to `/auth/signin` — 17836c1

#### Manual

- [ ] 2.5 A logged-in user sees the dashboard after sign-in
- [ ] 2.6 Preferences saved in the form are visible after redirect/refresh
- [ ] 2.7 Job status saved in the list is visible after redirect/refresh
- [ ] 2.8 The dashboard remains usable on a mobile-width viewport
