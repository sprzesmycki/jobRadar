<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: CV-Based Job Scoring

- **Plan**: context/changes/cv-based-job-scoring/plan.md
- **Scope**: All 5 phases (full plan)
- **Date**: 2026-06-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 1 critical | 5 warnings | 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | WARNING |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — CSS selector injection via jobId in applyScores

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:551, 566, 571
- **Detail**: jobId values from the API response are interpolated directly into CSS attribute selectors (e.g. `[data-job-id="${jobId}"]`). A job ID containing `"` or `]` breaks out of the attribute selector and can silently target unintended DOM elements. jobId comes from external job board APIs — untrusted input.
- **Fix A ⭐ Recommended**: Replace each selector with `[data-job-id="${CSS.escape(jobId)}"]`.
  - Strength: One-line fix per call site; CSS.escape() is canonical and widely supported.
  - Tradeoff: None significant.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Fix B**: Use `querySelectorAll("[data-job-id]")` and filter by `.dataset.jobId === jobId`.
  - Strength: Avoids the injection class entirely.
  - Tradeoff: O(n) iteration on every score update.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — CSS.escape() added to all three querySelector calls in applyScores.

### F2 — debug/token.ts exposes raw JWT; not in plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline / Safety & Quality
- **Location**: src/pages/api/debug/token.ts
- **Detail**: Unplanned file returning the authenticated user's full access_token + curl example in JSON. Protected by `import.meta.env.DEV` returning 404 in production. If that guard fails (misconfigured staging, undefined DEV), it leaks a live auth token on any GET request with no further protection.
- **Fix A ⭐ Recommended**: Delete the file before merging to main.
  - Strength: Eliminates the risk class entirely.
  - Tradeoff: Loses local dev convenience.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Fix B**: Add `if (import.meta.env.PROD) return new Response(null, {status: 404})` as a secondary guard.
  - Strength: Preserves dev convenience.
  - Tradeoff: Still present in codebase; depends on PROD/DEV being correctly set.
  - Confidence: MEDIUM
  - Blind spot: Haven't verified SSR Cloudflare env variable behavior.
- **Decision**: FIXED via Fix A — file deleted via git rm.

### F3 — score-batch.ts: no payload size guard or runtime validation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/jobs/score-batch.ts:145
- **Detail**: `body.jobs as JobPayload[]` is a TypeScript assertion, not runtime validation. No max-length cap. All IDs still hit the DB in the `.in()` query regardless of SCORE_CAP. Missing `technologies` field causes `technologies.join(",")` to throw a runtime TypeError.
- **Fix**: Add `if (jobs.length > 50) return new Response(JSON.stringify({error: "too many jobs"}), {status: 400})` and filter elements missing required fields.
- **Decision**: FIXED — added length guard (max 50) and runtime filter for required fields before processing.

### F4 — _zhipu_jwt: malformed API key gives unhandled 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/app/services/scoring.py:28
- **Detail**: `api_key.split(".", 1)` raises ValueError if AI_PROVIDER_API_KEY doesn't contain a `.`. Bubbles as unhandled 500 instead of the informative 503 the missing-key check would produce.
- **Fix**: Guard with `if "." not in settings.ai_provider_api_key: raise HTTPException(503, "AI_PROVIDER_API_KEY must be '{id}.{secret}' format")` before the split.
- **Decision**: FIXED — added format guard before the split in score_job.

### F5 — setSession with empty refresh_token in Bearer path

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/pages/api/jobs/score-batch.ts:119
- **Detail**: `supabase.auth.setSession({ access_token: bearerToken, refresh_token: "" })` is not the documented Supabase server-side auth pattern. An empty refresh_token may trigger a silent token refresh attempt depending on client version, causing unpredictable RLS failures.
- **Fix A ⭐ Recommended**: Drop `setSession`; use `supabase.auth.getUser(bearerToken)` for validation and pass the token in the Supabase client's global Authorization header.
  - Strength: Matches documented pattern used in other API routes.
  - Tradeoff: Requires restructuring the Bearer branch.
  - Confidence: HIGH
  - Blind spot: Need to verify RLS policies still fire correctly.
- **Fix B**: Accept current behavior for MVP.
  - Strength: No code change.
  - Tradeoff: Fragile against Supabase client version changes.
  - Confidence: LOW
  - Blind spot: Haven't tested against Supabase client v3.
- **Decision**: ACCEPTED via Fix B — accepted for MVP; revisit if RLS failures appear in production.

### F6 — npm run typecheck doesn't exist; progress criteria rubber-stamped

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/cv-based-job-scoring/plan.md (items 2.2, 3.1, 4.1, 5.1)
- **Detail**: Progress items claim "npm run typecheck passes" but the script doesn't exist in package.json. `npm run build` does include Astro type generation (passed), but the cited command is not runnable.
- **Fix**: Add `"typecheck": "astro check"` to package.json scripts.
- **Decision**: FIXED — added `"typecheck": "astro check"` to package.json scripts.

### F7 — fireBatch retry: up to 42 seconds of retries, no backoff

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:594–623
- **Detail**: fireBatch retries up to 21 times with 2-second delays (42s total). On persistent backend failure, the page keeps firing POSTs for 40+ seconds with no exponential backoff.
- **Fix**: Reduce max attempts to 5–8 for the error case, or add exponential backoff capped at 15s.
- **Decision**: FIXED — reduced max attempts from 20 to 6 (max ~12 seconds retry window).

### F8 — job_scores DELETE is fire-and-forget with no logging

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/cv/upload.ts:232
- **Detail**: If the job_scores DELETE fails silently, users see stale scores from their previous CV indefinitely. Intentional per plan, but with no logging there's no way to detect this in production.
- **Fix**: `const { error } = await ...; if (error) console.error("job_scores invalidation failed:", error.message)`
- **Decision**: FIXED — added console.error logging when the delete fails.
