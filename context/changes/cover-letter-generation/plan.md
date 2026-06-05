# Cover Letter Generation Implementation Plan

## Overview

Implement AI-powered cover letter generation (S-06) so users can generate a personalized cover letter for any job offer with one click. The backend 501 stub at `POST /v1/cover-letter` gets replaced with a real z.ai service; generated letters are cached per user+job in a new `cover_letters` table and displayed in an inline panel below each job card.

## Current State Analysis

- `backend/app/api/routes/cover_letter.py` — 501 stub returning `NotImplementedPayload`, already registered in `main.py` at `/v1/cover-letter`.
- `backend/app/schemas/ai.py` — `CoverLetterRequest` exists with `job: JobInput`, `profile: ProfileInput`, `tone: str`, `language: str`. No `CoverLetterResponse` schema yet.
- `backend/app/schemas/common.py` — `ProfileInput` has `summary`, `skills`, `experience` but no `role_hints` field.
- `backend/app/services/scoring.py` — full z.ai service implementation; exact structural template for the cover letter service.
- `src/pages/api/jobs/score-batch.ts` — Astro scoring API; authentication + cache + backend call pattern to replicate.
- `src/pages/dashboard.astro:503–517` — Actions section with one "Details" button; only rendered when `jobsSource !== "fallback" && cvProfile` (so CV is always present when this section shows).
- `supabase/migrations/20260605120000_create_job_scores.sql` — `job_scores` cache table; exact schema template for `cover_letters`.

## Desired End State

User clicks "Cover letter" on any job card. An inline panel opens below the card showing "Generating…" while the API fires. Within ~10 seconds, the full cover letter text appears with a "Copy" button. On subsequent clicks the panel toggles without refetching. After re-uploading a CV, cached letters are cleared so the next click generates a fresh letter.

### Key Discoveries

- `backend/app/services/scoring.py:26–43` — z.ai uses a custom JWT (`{id}.{secret}` key format + HMAC-SHA256); `_zhipu_jwt()` must be copied verbatim into the cover letter service.
- `backend/app/services/scoring.py:59–71` — base URL is `https://api.z.ai/api/coding/paas/v4`, **not** the OpenAI compatibility URL. Model: `GLM-4.5-Air` from `settings.ai_model_id`.
- Cover letter output is **plain prose**, not JSON — response parsing is simpler than scoring: strip markdown fences if present, return raw string.
- `src/pages/api/cv/upload.ts` — the cache invalidation DELETE for `job_scores` is already there as a pattern; `cover_letters` invalidation goes in the same place.
- `src/pages/dashboard.astro:503–517` — the Actions button grid already uses `grid-cols-3 gap-2 lg:grid-cols-1`; the new button fits without layout changes.

## What We're NOT Doing

- No "Regenerate" button — CV re-upload clears the cache, which is the natural refresh trigger.
- No SSR pre-load of cached letters on dashboard render — load on first click only (letters are large text blocks; scoring pre-loads because badges are always visible).
- No tone/language selector in the UI — defaults to `professional` / `en`; schema supports it for future.
- No cover letter editing in the panel — read-only display + copy.
- No per-phase score invalidation when a cover letter is generated.

## Implementation Approach

Four-phase delivery mirroring the S-05 scoring pattern: backend service first, DB cache second, Astro API third, UI last. Each phase is independently verifiable before the next begins.

## Critical Implementation Details

**Plain-text response, not JSON**: The scoring service parses a JSON object; the cover letter service returns raw prose. The system prompt must NOT instruct the model to output JSON. Strip markdown fences if present (```` ```...``` ````), then return the raw text.

**Temperature**: Use `0.7` (not `0.2` as in scoring) — cover letters benefit from slightly more variation.

**`role_hints` in ProfileInput**: Adding `role_hints: list[str] | None = None` to the shared `ProfileInput` schema is backward-compatible (default None). The scoring service ignores it; the cover letter service uses it in the user message to help the AI align tone with career direction.

---

## Phase 1: Backend Cover Letter Service

### Overview

Add `CoverLetterResponse` schema, extend `ProfileInput` with `role_hints`, implement `generate_cover_letter` service function (mirrors `scoring.py`), and replace the 501 stub in the route.

### Changes Required

#### 1. Extend ProfileInput

**File**: `backend/app/schemas/common.py`

**Intent**: Add `role_hints` to `ProfileInput` so cover letter generation can reference the candidate's career direction. Backward-compatible — scoring ignores it.

**Contract**: Add `role_hints: list[str] | None = None` field to `ProfileInput`.

#### 2. Add CoverLetterResponse schema

**File**: `backend/app/schemas/ai.py`

**Intent**: Define the response shape returned by the cover letter route and service.

**Contract**: Add `CoverLetterResponse(BaseModel)` with a single field `content: str`. Add `"CoverLetterResponse"` to `__all__`.

#### 3. Cover letter service

**File**: `backend/app/services/cover_letter.py` (new file)

**Intent**: Encapsulate the z.ai call for cover letter generation: build system + user prompts from `JobInput` + `ProfileInput`, call z.ai, strip any markdown fences from the response, return `CoverLetterResponse`. Raise `HTTPException(503)` if API key missing; `HTTPException(502)` on API error or empty response.

**Contract**: Single async function `generate_cover_letter(job: JobInput, profile: ProfileInput, settings: Settings) -> CoverLetterResponse`.

- Copy `_zhipu_jwt()` from `scoring.py` verbatim.
- `AsyncOpenAI(base_url="https://api.z.ai/api/coding/paas/v4", api_key=_zhipu_jwt(settings.ai_provider_api_key))`.
- System prompt: instruct model to write a professional cover letter in plain text, no JSON, no markdown, 3–4 paragraphs.
- User message: job title, company, description (with "not provided" fallback), required technologies, candidate name (from `profile.summary` if set), skills, role hints, experience highlights.
- `temperature=0.7`.
- Strip markdown code fences if response starts with ` ``` `.
- Return `CoverLetterResponse(content=text)`.

#### 4. Cover letter route

**File**: `backend/app/api/routes/cover_letter.py`

**Intent**: Replace the 501 stub with the real implementation that calls `generate_cover_letter` and returns `CoverLetterResponse`.

**Contract**: Change decorator to `response_model=CoverLetterResponse, status_code=200`. Inject `settings: Annotated[Settings, Depends(get_settings)]`. Call `await generate_cover_letter(request.job, request.profile, settings)`. Remove `NotImplementedPayload` import and `JSONResponse` usage.

### Success Criteria

#### Automated Verification

- `uv run ruff check .` exits 0 in `backend/`
- `uv pip install -e .` installs without conflict
- `curl -X POST http://localhost:8000/v1/cover-letter` with valid auth + realistic job+profile body returns `200` with a `content` field

#### Manual Verification

- The returned `content` is a multi-paragraph cover letter that mentions the job title and at least one skill from the profile.
- Calling with `AI_PROVIDER_API_KEY` unset returns `503`.

**Implementation Note**: Pause after manual verification passes before proceeding to Phase 2.

---

## Phase 2: Database Cache Table

### Overview

Create `cover_letters` cache table with RLS (mirrors `job_scores`), and add cache invalidation to the CV upload flow.

### Changes Required

#### 1. Migration

**File**: `supabase/migrations/20260605160000_create_cover_letters.sql` (new)

**Intent**: Create `cover_letters` table that stores one generated cover letter per user per job, with RLS so each user can only read/write their own.

**Contract**:

```sql
CREATE TABLE public.cover_letters (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_id  text NOT NULL,
  source       text NOT NULL,
  job_hash     text NOT NULL,
  content      text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_id)
);
ALTER TABLE public.cover_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cover letters" ON public.cover_letters
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

#### 2. Cache invalidation on CV re-upload

**File**: `src/pages/api/cv/upload.ts`

**Intent**: Clear cached cover letters when a user re-uploads their CV, so the next generation uses updated profile data.

**Contract**: After the existing `job_scores` DELETE (which fires after a successful `cv_profiles` upsert), add an identical DELETE on `cover_letters`: `supabase.from("cover_letters").delete().eq("user_id", user.id)`. Ignore errors silently (same pattern as job_scores invalidation).

### Success Criteria

#### Automated Verification

- `npx supabase db push` or migration applies cleanly with no errors
- `npm run lint` exits 0 on frontend

#### Manual Verification

- `cover_letters` table exists in Supabase with correct columns and RLS enabled.
- Uploading a new CV clears all rows for that user from `cover_letters`.

**Implementation Note**: Pause after manual verification passes before proceeding to Phase 3.

---

## Phase 3: Astro API Endpoint

### Overview

Add `src/pages/api/jobs/cover-letter.ts` — a single-job POST endpoint that checks the DB cache, calls the backend on a miss, upserts the result, and returns `{ content }`.

### Changes Required

#### 1. Cover letter API route

**File**: `src/pages/api/jobs/cover-letter.ts` (new file)

**Intent**: Astro API route that bridges the dashboard to the FastAPI cover letter service, with caching and auth mirroring `score-batch.ts`.

**Contract**:

- Exports `export const prerender = false` and `POST` handler.
- Request body: `{ job: { id, source, title, company, description, technologies } }`.
- Response (success): `{ content: string }`.
- Response (no CV): `{ noCV: true }`.
- Response (error): `{ error: string }` with 5xx status.

Auth: same dual-mode as `score-batch.ts` — cookie session OR `Authorization: Bearer` header. `setSession()` required for RLS to work on DB queries when using bearer token.

Pipeline:
1. Parse + validate request body (job object with required fields).
2. Authenticate user (cookie or bearer).
3. Fetch cv_profile: `skills, role_hints, experience_highlights, full_name` — return `{ noCV: true }` if missing.
4. Compute `jobHash` using same `computeJobHash` logic as `score-batch.ts` (Web Crypto SHA-256).
5. Query `cover_letters` by `user_id + external_id` — return `{ content }` immediately if hit.
6. On cache miss: POST to `${BACKEND_URL}/v1/cover-letter` with `{ job: {...}, profile: { summary: full_name ?? undefined, skills, experience: experience_highlights, role_hints } }`.
7. Upsert result into `cover_letters` (onConflict: `user_id,external_id`).
8. Return `{ content }`.

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0
- TypeScript: `npx tsc --noEmit` exits 0

#### Manual Verification

- `POST /api/jobs/cover-letter` with a valid session + job payload returns `{ content: "..." }` with a real cover letter.
- Second call for the same job+user returns the same cached content immediately (no backend call fired — verify via backend logs).
- Call without a CV returns `{ noCV: true }`.

**Implementation Note**: Pause after manual verification passes before proceeding to Phase 4.

---

## Phase 4: Dashboard UI

### Overview

Add a "Cover letter" button to the Actions section of each job card, an inline panel for the generated text, a "Copy" button, and the on-demand fetch logic.

### Changes Required

#### 1. Cover letter button

**File**: `src/pages/dashboard.astro`

**Intent**: Add a "Cover letter" button to the existing Actions button grid (lines 503–517), styled identically to the "Details" button.

**Contract**: Add a second `<button>` inside the `grid-cols-3` div with `type="button"`, `data-cover-letter-toggle={job.id}`, and the same class string as the Details button.

#### 2. Cover letter inline panel

**File**: `src/pages/dashboard.astro`

**Intent**: Add a hidden inline panel below the scoring detail panel for each job, to display the generated cover letter text.

**Contract**: After the existing `id={"detail-" + job.id}` div, add:

```html
<div id={"cover-letter-" + job.id} hidden class="mt-3 rounded-md border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">
  <div data-cover-letter-loading={job.id} hidden>
    <span class="animate-pulse text-slate-400">Generating cover letter…</span>
  </div>
  <div data-cover-letter-content={job.id} hidden>
    <pre class="whitespace-pre-wrap font-sans leading-relaxed" data-cover-letter-text={job.id}></pre>
    <button type="button" data-cover-letter-copy={job.id} class="mt-3 rounded border border-slate-600 px-3 py-1 text-xs text-slate-400 hover:border-cyan-400 hover:text-cyan-200">
      Copy
    </button>
  </div>
  <div data-cover-letter-error={job.id} hidden class="text-rose-400">Failed to generate. Try again.</div>
</div>
```

Include a `<template data-cover-letter-job={job.id}>` sibling with the job payload serialized as JSON (same pattern as score-batch's `<template data-job-payload>`).

#### 3. Cover letter client script

**File**: `src/pages/dashboard.astro`

**Intent**: Add an inline `<script>` that handles "Cover letter" button clicks: toggle if content exists, else fetch → populate → show.

**Contract**: Event-delegate on `document` for `click` events where `e.target.dataset.coverLetterToggle` is set. On each click:

1. Toggle `hidden` on the panel `#cover-letter-{id}`.
2. If panel has no content yet (content div still hidden): show loading, fetch `/api/jobs/cover-letter` with the job payload from the adjacent `<template>`, hide loading on settle.
3. On success: populate `<pre>`, show content div, hide loading.
4. On error: show error div, hide loading.

Separately, delegate `data-cover-letter-copy` clicks to call `navigator.clipboard.writeText(pre.textContent)` and briefly change button text to "Copied!".

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0
- `npx tsc --noEmit` exits 0

#### Manual Verification

- "Cover letter" button appears on each job card (only when CV is uploaded and jobs are from real source).
- Clicking opens the panel and shows "Generating…" while the API fires.
- The generated text appears within ~10s, containing job title and candidate skill references.
- "Copy" copies full text to clipboard.
- Clicking the button again hides the panel; clicking again reveals the already-loaded text without refetching.
- After re-uploading CV, clicking "Cover letter" generates a fresh letter (cache cleared).
- No JS errors in the browser console.

**Implementation Note**: Pause after manual verification passes — this is the final phase.

---

## Testing Strategy

### Manual Testing Steps

1. Upload CV, navigate to dashboard with real job results.
2. Click "Cover letter" on a JustJoinIT job (no description) — verify generation completes and letter is reasonable.
3. Click "Cover letter" on a Remotive job (has description) — verify description is referenced.
4. Click the same button twice — verify second click loads from cache (no backend log entry).
5. Re-upload CV — verify previously cached letter is gone.
6. Click "Copy" — paste into text editor, verify full text.

## Migration Notes

Apply migration `20260605160000_create_cover_letters.sql` to Supabase before deploying Phase 3. Migration is non-destructive (new table only).

## References

- Related scoring implementation: `context/archive/2026-06-05-cv-based-job-scoring/plan.md`
- Backend scoring service (template): `backend/app/services/scoring.py`
- Scoring API route (template): `src/pages/api/jobs/score-batch.ts`
- PRD: `context/foundation/prd.md` — US-02, FR-008

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend Cover Letter Service

#### Automated

- [x] 1.1 `uv run ruff check .` exits 0 in `backend/` — 95c2d84
- [x] 1.2 `uv pip install -e .` installs without conflict — 95c2d84
- [x] 1.3 `POST /v1/cover-letter` returns 200 with `content` field — 95c2d84

#### Manual

- [ ] 1.4 Returned content is a multi-paragraph cover letter referencing job title and a candidate skill
- [ ] 1.5 Missing `AI_PROVIDER_API_KEY` returns 503

### Phase 2: Database Cache Table

#### Automated

- [x] 2.1 Migration applies cleanly — e0f2c5f
- [x] 2.2 `npm run lint` exits 0 — e0f2c5f

#### Manual

- [x] 2.3 `cover_letters` table exists with correct columns and RLS — e0f2c5f
- [x] 2.4 CV re-upload clears cached letters for that user — e0f2c5f

### Phase 3: Astro API Endpoint

#### Automated

- [x] 3.1 `npm run lint` exits 0 — 547da6e
- [x] 3.2 `npx tsc --noEmit` exits 0 — 547da6e

#### Manual

- [x] 3.3 `POST /api/jobs/cover-letter` returns `{ content }` with real letter — 547da6e
- [x] 3.4 Second call for same job returns cached content (no backend call) — 547da6e
- [x] 3.5 Call without CV returns `{ noCV: true }` — 547da6e

### Phase 4: Dashboard UI

#### Automated

- [x] 4.1 `npm run lint` exits 0
- [x] 4.2 `npx tsc --noEmit` exits 0

#### Manual

- [x] 4.3 Button visible on job cards with CV uploaded
- [x] 4.4 Click shows panel with loading state then generated text
- [x] 4.5 Copy button works
- [x] 4.6 Toggle works without refetch on second click
- [x] 4.7 CV re-upload → fresh letter generated on next click
- [x] 4.8 No browser console errors
