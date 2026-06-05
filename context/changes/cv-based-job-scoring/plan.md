# CV-Based Job Scoring Implementation Plan

## Overview

Implement AI-powered CV-to-job scoring using z.ai (OpenAI-compatible, GLM models) so users see a match percentage, brief explanation, and missing skills on every job offer. Scores are cached in a new `job_scores` table and loaded asynchronously — the page renders immediately, then scores fill in. When no CV is uploaded, score badges are replaced with an inline "Upload CV" prompt.

## Current State Analysis

- `POST /v1/jobs/score` exists in FastAPI backend (`backend/app/api/routes/scoring.py`) but returns `501 Not Implemented`.
- `JobInput` and `ProfileInput` schemas are already defined in `backend/app/schemas/common.py`.
- CV data is in `cv_profiles` table (skills, role_hints, experience_highlights — keyword-extracted).
- Dashboard already renders `job.matchScore`, `job.matchReason`, `job.missingSkills` from a client-side rule-based `matchJobs()` in `src/lib/jobs.ts`. This serves demo-data fallback; AI scoring replaces it for real jobs.
- `JobListing` type has no `description` field. Remotive and Adzuna list endpoints include descriptions; JustJoinIT list API does not.
- No `job_scores` table exists yet.
- `AI_PROVIDER_API_KEY` placeholder already in `backend/.env.example`. No AI SDK installed.

## Desired End State

User logs into dashboard, job cards load immediately, then within a few seconds each card's score badge fills in with a real AI-computed percentage and a 1–2 sentence explanation. Clicking "Details" on any job opens an inline panel showing full explanation, matched skills, and missing skills. On re-upload of CV, all cached scores are cleared so the next page load recomputes fresh. Jobs without a user-uploaded CV show an "Upload CV to see scores" prompt instead of a badge.

### Key Discoveries

- `backend/app/api/routes/scoring.py:12` — placeholder endpoint, full replacement required.
- `backend/app/schemas/common.py:10-22` — `JobInput` and `ProfileInput` already correct shape for the scoring call.
- `src/lib/job-sources/types.ts:3-14` — `JobListing` interface missing `description` field.
- `src/pages/dashboard.astro:335-421` — job card loop; `job.matchScore`, `job.matchReason`, `job.missingSkills` already rendered here. DOM update points are predictable.
- `src/pages/api/cv/upload.ts` — CV upsert happens here; cache invalidation DELETE goes here.
- z.ai uses OpenAI Python SDK with `base_url="https://api.z.ai/v1"`. No z.ai-specific package needed.
- JustJoinIT candidate-API list response has no `body`/`description` field → `description` will be `null` for JustJoinIT jobs; the scoring service must handle `null` description gracefully.

## What We're NOT Doing

- No cover letter generation (S-06).
- No saved-offers list page (S-07).
- No real-time WebSocket score push — simple fetch + DOM update is enough.
- No per-job score freshness TTL — cache is valid until CV is re-uploaded.
- No score for jobs fetched from the demo fallback (rule-based scores remain for demo data).
- No full-text CV sent to AI — only extracted structured fields (privacy guardrail).
- No score sorting or filter by score in the job list (sorting by score is out of scope for this slice).

## Implementation Approach

Five-phase delivery: (1) backend AI service, (2) DB cache table + invalidation, (3) description field in job sources, (4) Astro scoring API endpoint, (5) dashboard async UI. Each phase is independently testable before the next begins.

Scoring call: Astro API reads `cv_profiles` from Supabase, builds `ProfileInput`, passes it with `JobInput` to `POST /v1/jobs/score` on the FastAPI backend. The backend calls z.ai with a structured JSON prompt and validates the response. Results are stored in `job_scores` (unique per user+job). The dashboard SSR pre-loads cached scores; the client fires a batch score request for uncached jobs and updates the DOM.

## Critical Implementation Details

**z.ai SDK wiring**: Use `openai` Python SDK (`from openai import OpenAI`) with `base_url="https://api.z.ai/v1"` and `api_key=settings.ai_provider_api_key`. The model ID must be passed as a string (e.g. `"glm-5.1"`), controlled via `AI_MODEL_ID` env var. Response must be parsed as JSON — use `response_format={"type": "json_object"}` in the completions call if supported, otherwise parse the text content.

**Score response contract**: The scoring service must return `{"score": int, "explanation": str, "matched_skills": list[str], "missing_skills": list[str]}` as JSON. Include explicit schema instructions in the system prompt to prevent free-form text responses.

**Cache invalidation placement**: The DELETE on `job_scores` must happen AFTER a successful upsert to `cv_profiles` in `src/pages/api/cv/upload.ts` — not before — to avoid clearing the cache on a failed re-upload.

---

## Phase 1: Backend Scoring Service

### Overview

Add `openai` dependency, wire z.ai credentials to config, implement `ScoringService` that calls z.ai and returns a structured score, then replace the 501 stub in the scoring route.

### Changes Required

#### 1. Backend dependency

**File**: `backend/pyproject.toml`

**Intent**: Add the `openai` package so the scoring service can call z.ai via its OpenAI-compatible API.

**Contract**: Add `"openai>=1.0.0,<2.0.0"` to the `dependencies` list.

#### 2. AI settings in config

**File**: `backend/app/core/config.py`

**Intent**: Expose `AI_PROVIDER_API_KEY` and `AI_MODEL_ID` environment variables through the existing `Settings` class so the scoring service can read them without hardcoding.

**Contract**: Add two fields to `Settings`:
- `ai_provider_api_key: str | None = Field(default=None, validation_alias="AI_PROVIDER_API_KEY")`
- `ai_model_id: str = Field(default="glm-5.1", validation_alias="AI_MODEL_ID")`

#### 3. Scoring response schema

**File**: `backend/app/schemas/scoring.py`

**Intent**: Add a `JobScoringResponse` Pydantic model that the scoring route and service share.

**Contract**: New model with fields `score: int` (0–100), `explanation: str`, `matched_skills: list[str]`, `missing_skills: list[str]`. Update `__all__` to include it.

#### 4. Scoring service

**File**: `backend/app/services/scoring.py` (new file)

**Intent**: Encapsulate the z.ai call: build the prompt from `JobInput` + `ProfileInput`, call z.ai, parse and validate the JSON response, return `JobScoringResponse`. Raise `HTTPException(503)` if the API key is missing, `HTTPException(502)` if the z.ai call fails or returns unparseable JSON.

**Contract**: Single async function `score_job(job: JobInput, profile: ProfileInput, settings: Settings) -> JobScoringResponse`. Uses `openai.AsyncOpenAI(base_url="https://api.z.ai/v1", api_key=settings.ai_provider_api_key)`. Prompt instructs the model to return only valid JSON matching the schema. Validates parsed dict against `JobScoringResponse` before returning.

#### 5. Scoring route implementation

**File**: `backend/app/api/routes/scoring.py`

**Intent**: Replace the 501 stub with the real implementation that calls `score_job` and returns `JobScoringResponse`.

**Contract**: Change response model to `JobScoringResponse`, status code to `200`. Call `await score_job(request.job, request.profile, get_settings())`. Remove `NotImplementedPayload` import.

#### 6. Backend env example

**File**: `backend/.env.example`

**Intent**: Document the two new AI env vars so anyone deploying the backend knows what to set.

**Contract**: Add `AI_PROVIDER_API_KEY=` and `AI_MODEL_ID=glm-5.1` entries below the existing `SUPABASE_*` entries.

### Success Criteria

#### Automated Verification

- `uv run ruff check .` exits 0 in `backend/`
- `uv pip install -e .` installs without conflict (openai dep resolves)
- `curl -X POST http://localhost:8000/v1/jobs/score` with a valid auth token + request body returns `200` with `score`, `explanation`, `matched_skills`, `missing_skills` fields

#### Manual Verification

- Calling `POST /v1/jobs/score` with a realistic job + profile returns a score between 0–100 and a non-empty explanation sentence.
- Calling with `AI_PROVIDER_API_KEY` unset returns `503` with a clear message.

**Implementation Note**: Pause after manual verification passes before moving to Phase 2.

---

## Phase 2: Database — job_scores Cache Table

### Overview

Create the `job_scores` cache table with RLS, and add cache invalidation to the CV upload flow.

### Changes Required

#### 1. Migration

**File**: `supabase/migrations/20260605120000_create_job_scores.sql` (new)

**Intent**: Create `job_scores` table that stores one AI score per user per job, with RLS so each user can only read/write their own scores.

**Contract**:
```sql
CREATE TABLE public.job_scores (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_id  text NOT NULL,
  source       text NOT NULL,
  job_hash     text NOT NULL,
  score        integer NOT NULL CHECK (score >= 0 AND score <= 100),
  explanation  text NOT NULL,
  matched_skills text[] NOT NULL DEFAULT '{}',
  missing_skills text[] NOT NULL DEFAULT '{}',
  scored_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_id)
);
ALTER TABLE public.job_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own scores" ON public.job_scores
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

`job_hash` is a SHA-256 hex of `title + company + (description ?? "") + technologies.join(",")` — used by the scoring API to detect stale entries and re-score if the job content changed.

#### 2. Cache invalidation on CV re-upload

**File**: `src/pages/api/cv/upload.ts`

**Intent**: After a successful upsert to `cv_profiles`, delete all of the user's cached job scores so the next dashboard load recomputes fresh scores against the new CV.

**Contract**: After the `cv_profiles` upsert succeeds (currently around line 180–200 in upload.ts), add a Supabase delete: `supabase.from("job_scores").delete().eq("user_id", user.id)`. Ignore delete errors — a stale cache is preferable to blocking CV upload.

#### 3. TypeScript type for score result

**File**: `src/lib/job-scores.ts` (new)

**Intent**: Central place for the `JobScore` TypeScript type and the `getJobScores` helper that reads the cache from Supabase.

**Contract**: Export `JobScore` interface with `external_id, score, explanation, matched_skills, missing_skills`. Export `getJobScores(supabase, userId, externalIds): Promise<Map<string, JobScore>>` that queries `job_scores` and returns a map keyed by `external_id`.

### Success Criteria

#### Automated Verification

- `npx supabase db push` (or `supabase migration up`) applies the migration without error
- `npm run typecheck` passes with the new `src/lib/job-scores.ts`

#### Manual Verification

- Supabase table editor shows `job_scores` with correct columns and RLS enabled.
- Uploading a new CV (replacing an existing one) clears the user's rows from `job_scores`.

**Implementation Note**: Pause after manual verification before Phase 3.

---

## Phase 3: Job Source Description Field

### Overview

Add `description` to `JobListing` and populate it from Remotive and Adzuna adapters where the list API provides it. JustJoinIT list API does not include descriptions; that field stays `null`.

### Changes Required

#### 1. Type update

**File**: `src/lib/job-sources/types.ts`

**Intent**: Extend `JobListing` with an optional `description` field so the scoring flow has job body text when available.

**Contract**: Add `description?: string | null` to the `JobListing` interface after the `url` field.

#### 2. Remotive adapter

**File**: `src/lib/job-sources/remotive.ts`

**Intent**: Map the Remotive API `description` or `job_description` field into `JobListing.description`. Truncate to 2000 characters to keep payloads bounded.

**Contract**: In the mapping function, assign `description: (offer.description ?? offer.job_description ?? null)?.slice(0, 2000) ?? null`.

#### 3. Adzuna adapter

**File**: `src/lib/job-sources/adzuna.ts`

**Intent**: Map the Adzuna API `description` field into `JobListing.description`. Truncate to 2000 characters.

**Contract**: Same pattern as Remotive: `description: offer.description?.slice(0, 2000) ?? null`.

#### 4. JustJoinIT adapter

**File**: `src/lib/job-sources/justjoinit.ts`

**Intent**: No change to the API call. Explicitly set `description: null` in the mapping function to satisfy the updated `JobListing` type.

**Contract**: Add `description: null` to the returned object in `mapJustJoinItOffer`.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes (all adapters satisfy updated `JobListing` type)
- `npm run lint` exits 0

#### Manual Verification

- In the browser console or a quick Node script, confirm that Remotive and Adzuna job objects have non-null `description` strings for at least some offers.
- JustJoinIT job objects have `description: null`.

**Implementation Note**: Pause after manual verification before Phase 4.

---

## Phase 4: Frontend Scoring API Endpoint

### Overview

New Astro API endpoint that checks the `job_scores` cache, calls the FastAPI backend for uncached jobs in parallel, stores results, and returns scores to the client.

### Changes Required

#### 1. Score-batch endpoint

**File**: `src/pages/api/jobs/score-batch.ts` (new)

**Intent**: Accept a POST with an array of job objects, return AI scores for each — from cache where available, from backend for the rest.

**Contract**:
- Method: `POST`, authenticated (redirect to signin if no session).
- Request body: `{ jobs: Array<{ id: string, source: string, title: string, company: string, description: string | null, technologies: string[] }> }`.
- Response: `{ scores: Record<string, { score, explanation, matched_skills, missing_skills } | null> }` — `null` for any job that failed scoring.
- Logic:
  1. Read `cv_profiles` for the current user. If none, return empty scores object with `{ noCV: true }`.
  2. Query `job_scores` for all incoming `id`s → cache hits.
  3. For cache misses: `Promise.all(misses.map(job => scoreOneJob(job, cvProfile)))`. Each `scoreOneJob` calls `POST ${BACKEND_API_URL}/v1/jobs/score` with the user's Bearer token, retries once on network error, returns `null` on failure.
  4. Upsert all successful new scores to `job_scores`.
  5. Merge cache hits + new scores, return.
- `job_hash` computation: `crypto.subtle.digest("SHA-256", textEncoder.encode(title + company + (description ?? "") + technologies.join(",")))` → hex string.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes
- `npm run lint` exits 0
- `curl -X POST /api/jobs/score-batch` with a valid session cookie + body returns `200` with a `scores` object

#### Manual Verification

- First call scores and caches results (verify new rows in `job_scores` table).
- Second identical call returns same scores from cache (no new rows, faster response).
- Call with no CV profile returns `{ scores: {}, noCV: true }`.

**Implementation Note**: Pause after manual verification before Phase 5.

---

## Phase 5: Dashboard UI — Async Score Badges + Detail Panel

### Overview

Update the dashboard to: (1) pre-load cached scores in SSR, (2) show score skeletons for uncached jobs, (3) fire a client-side batch score request that fills in skeletons, (4) add a detail panel per card showing full breakdown, (5) handle no-CV state.

### Changes Required

#### 1. SSR score pre-load

**File**: `src/pages/dashboard.astro`

**Intent**: Query `job_scores` during SSR for all job IDs in the current list so cached scores render on first paint without a flash.

**Contract**: After `getMatchedJobs`, call `getJobScores(supabase, user.id, jobs.map(j => j.id))` (from `src/lib/job-scores.ts`). Pass resulting `Map` into the template as `cachedScores`.

#### 2. Job card score badge

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the hard-coded `{job.matchScore}% match` badge with three conditional states: (a) no CV uploaded → "Upload CV" prompt, (b) cached score available → render baked-in score badge, (c) pending → render skeleton badge with `data-score-pending` and `data-job-payload` attributes.

**Contract**:
- When `cvProfile` is `null`: render `<a href="/dashboard#cv-upload" class="...">Upload CV to see match</a>` inline where the badge was.
- When `cachedScores.has(job.id)`: render `<span class="... score-badge" data-job-id={job.id}>{score}% match</span>`.
- Otherwise: render `<span class="... score-badge animate-pulse" data-job-id={job.id} data-score-pending="true">Scoring…</span>` and a `<script>`-readable `<template data-job-payload={job.id}>` element with the serialized job data needed for the batch call.

#### 3. Detail panel toggle

**File**: `src/pages/dashboard.astro`

**Intent**: Add a "Details" button to each job card that reveals an inline panel with full score breakdown (explanation, matched skills, missing skills). Panel is hidden by default; no modal/dialog needed.

**Contract**:
- Below the `matchReason` paragraph, add a `<button type="button" data-detail-toggle={job.id}>Details</button>`.
- Add a `<div id={"detail-" + job.id} hidden class="...">` containing: explanation text, matched skills chips, missing skills chips. Placeholders for explanation/skills are rendered from `cachedScores` if available; otherwise show skeleton spans with `data-detail-pending` attributes.
- JS (inline `<script>` tag): `document.addEventListener('click', e => { if (e.target.dataset.detailToggle) { document.getElementById('detail-' + e.target.dataset.detailToggle).toggleAttribute('hidden') } })`.

#### 4. Client-side async scoring script

**File**: `src/pages/dashboard.astro` (inline `<script>` block)

**Intent**: After page load, collect all pending job payloads, call `/api/jobs/score-batch`, then update DOM score badges and detail panels with returned scores.

**Contract**:
- On `DOMContentLoaded`: collect all elements with `data-score-pending="true"` → build job payload array from adjacent `<template data-job-payload>` elements.
- If no pending jobs, exit.
- `fetch('/api/jobs/score-batch', { method: 'POST', body: JSON.stringify({ jobs: pendingJobs }) })`.
- On success: for each returned score, update the corresponding `.score-badge` text, remove `animate-pulse`, populate the `#detail-<id>` panel's explanation and skills.
- On `noCV: true` response: no-op (SSR already rendered the "Upload CV" prompt).
- On fetch error: replace skeleton badges with "—" (silent failure, no alert).

#### 5. Remove client-side matchJobs dependency for real jobs

**File**: `src/lib/jobs.ts`

**Intent**: `getMatchedJobs` should return `JobListing[]` (not `MatchedJob[]`) for real-source jobs, since AI scoring replaces client-side scoring. Keep `matchJobs()` only for the demo fallback path.

**Contract**: When `jobsSource !== "fallback"`, return jobs as `JobListing[]` with `matchScore: 0, matchReason: "", missingSkills: [], matchedSkills: []` as placeholder values — the UI will update them via the async scoring script. When `jobsSource === "fallback"`, keep the existing `matchJobs()` call so demo data still shows rule-based scores. Update the `MatchedJob` type or add a `ScoredJobListing = JobListing & { matchScore: number; matchReason: string; missingSkills: string[] }` as appropriate.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes
- `npm run lint` exits 0
- `npm run build` exits 0

#### Manual Verification

- Page loads and all job cards are visible before any score arrives (no blocking spinner).
- Score badges start as "Scoring…" with pulse animation for uncached jobs.
- Within a few seconds, badges update with real AI percentages.
- Clicking "Details" reveals the explanation, matched skills, and missing skills for each job.
- User without CV sees "Upload CV to see match" prompt on every job card.
- Re-uploading CV and refreshing dashboard shows fresh scores (old cache cleared).
- No regression in job filtering, save-job flow, or preferences form.

**Implementation Note**: Pause after manual verification before marking S-05 complete.

---

## Testing Strategy

### Manual Testing Steps

1. Upload a real CV → navigate to dashboard → confirm score badges fill in within ~10s.
2. Refresh dashboard → confirm cached scores appear instantly (no Scoring… flash).
3. Click "Details" on a scored job → verify explanation and skill lists are non-empty.
4. Click "Details" on a JustJoinIT job (no description) → verify score and explanation still render (graceful null handling).
5. Log in as a user with no CV → confirm "Upload CV" prompt appears on all job cards.
6. Re-upload CV → refresh dashboard → confirm scores recompute (old cache cleared).
7. Open Network tab → confirm raw CV text is NOT sent in any request payload.

## Migration Notes

- `job_scores` table is additive — no existing data changes.
- Existing `matchScore` display in dashboard.astro is replaced by the new conditional rendering. If Phase 5 is partially deployed, the rule-based score may briefly show; this is acceptable for MVP.
- The demo fallback path (no live job sources) continues to use client-side scoring unchanged.

## References

- Roadmap: S-05 in `context/foundation/roadmap.md`
- PRD: FR-006, FR-007, US-01 in `context/foundation/prd.md`
- Backend scoring placeholder: `backend/app/api/routes/scoring.py:12`
- Job listing type: `src/lib/job-sources/types.ts:3`
- Dashboard job loop: `src/pages/dashboard.astro:335-421`
- CV upload flow: `src/pages/api/cv/upload.ts`
- z.ai OpenAI-compatible API: `https://api.z.ai/v1`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend Scoring Service

#### Automated

- [x] 1.1 `uv run ruff check .` exits 0 in `backend/` — 375e9b3
- [x] 1.2 `uv pip install -e .` installs without conflict — 375e9b3
- [x] 1.3 `POST /v1/jobs/score` returns 200 with score fields (curl smoke test) — 375e9b3

#### Manual

- [x] 1.4 Realistic job + profile call returns score 0–100 with non-empty explanation — 375e9b3
- [x] 1.5 Missing `AI_PROVIDER_API_KEY` returns 503 — 375e9b3

### Phase 2: Database — job_scores Cache Table

#### Automated

- [x] 2.1 Migration applies without error
- [x] 2.2 `npm run typecheck` passes with new `src/lib/job-scores.ts`

#### Manual

- [x] 2.3 `job_scores` table visible in Supabase with correct columns and RLS
- [x] 2.4 CV re-upload clears user's job_scores rows

### Phase 3: Job Source Description Field

#### Automated

- [ ] 3.1 `npm run typecheck` passes
- [ ] 3.2 `npm run lint` exits 0

#### Manual

- [ ] 3.3 Remotive and Adzuna jobs have non-null descriptions in at least some offers
- [ ] 3.4 JustJoinIT jobs have `description: null`

### Phase 4: Frontend Scoring API Endpoint

#### Automated

- [ ] 4.1 `npm run typecheck` passes
- [ ] 4.2 `npm run lint` exits 0
- [ ] 4.3 POST `/api/jobs/score-batch` returns 200 with scores object

#### Manual

- [ ] 4.4 First call scores and caches (new rows in job_scores)
- [ ] 4.5 Second identical call returns from cache (no new rows)
- [ ] 4.6 Call with no CV returns `{ scores: {}, noCV: true }`

### Phase 5: Dashboard UI — Async Score Badges + Detail Panel

#### Automated

- [ ] 5.1 `npm run typecheck` passes
- [ ] 5.2 `npm run lint` exits 0
- [ ] 5.3 `npm run build` exits 0

#### Manual

- [ ] 5.4 Job cards visible before scores arrive (no blocking spinner)
- [ ] 5.5 Score badges update from "Scoring…" to real percentages
- [ ] 5.6 "Details" reveals explanation + matched/missing skills
- [ ] 5.7 JustJoinIT (no description) still scores and renders explanation
- [ ] 5.8 No-CV user sees "Upload CV" prompt on all job cards
- [ ] 5.9 CV re-upload → refresh shows fresh recomputed scores
- [ ] 5.10 Raw CV text absent from all network request payloads
- [ ] 5.11 No regression in save-job flow and preferences form
