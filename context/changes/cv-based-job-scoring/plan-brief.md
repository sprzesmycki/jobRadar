# CV-Based Job Scoring — Plan Brief

> Full plan: `context/changes/cv-based-job-scoring/plan.md`

## What & Why

Implement AI-powered CV-to-job match scoring so users can see a percentage, brief explanation, and missing skills on every job offer without manually evaluating each one. This is the core trust-building feature of JobRadar — if the score feels arbitrary, the whole product feels broken.

## Starting Point

A `POST /v1/jobs/score` endpoint exists in the FastAPI backend but returns `501 Not Implemented`. The dashboard already renders `matchScore`, `matchReason`, and `missingSkills` per job card — but these come from a client-side rule-based function using keyword overlap. No AI integration exists yet, and no `job_scores` cache table has been created.

## Desired End State

A user with an uploaded CV opens the dashboard, sees all job cards load immediately, then watches score badges fill in from "Scoring…" to real percentages within a few seconds. Clicking "Details" on any card reveals a 1–2 sentence explanation and matched/missing skills. The scores persist in cache — the next visit shows them instantly. Re-uploading a CV clears the cache and triggers fresh scoring. A user without a CV sees an inline "Upload CV to see match" prompt instead of badges.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Scoring engine | AI via z.ai (OpenAI-compatible, GLM models) | Keyword overlap alone can't produce trustworthy explanations | Plan |
| CV data sent to AI | Extracted fields only (skills, role_hints, experience_highlights) | NFR-privacy forbids sending raw PDF text to external services | Plan |
| Job description fetch | Include in existing list API call | One fetch, no extra latency — Remotive and Adzuna list endpoints provide descriptions | Plan |
| Score caching | New `job_scores` table (user_id + external_id unique) | Avoid re-scoring on every page load (cost + latency) | Plan |
| Cache invalidation | Auto-delete all user scores on CV re-upload | Stale scores against a new CV would silently mislead the user | Plan |
| Score timing | Async after page load (skeleton → real scores) | Page renders immediately; scoring happens in background | Plan |
| Score display | % badge on card + full breakdown in inline detail panel | Keeps cards scannable; detail on demand matches US-01 intent | Plan |
| No-CV state | Show job list with "Upload CV" prompt in place of badges | User still gets value from the job list; clear CTA to unlock scoring | Plan |
| AI SDK | `openai` Python SDK with `base_url="https://api.z.ai/v1"` | z.ai exposes an OpenAI-compatible API — no proprietary package needed | Plan |
| Model | Configurable via `AI_MODEL_ID` env var, default `glm-5.1` | Allows tuning without code changes | Plan |

## Scope

**In scope:**
- Backend scoring service (z.ai call, JSON output, error handling)
- `job_scores` Supabase cache table + RLS
- Cache invalidation on CV re-upload
- `description` field added to `JobListing` type + Remotive/Adzuna adapters
- Astro `POST /api/jobs/score-batch` endpoint (cache check + backend call + store)
- Dashboard async score badges (skeleton → real)
- Inline detail panel per job card (explanation + matched/missing skills)
- No-CV state handling

**Out of scope:**
- Cover letter generation (S-06)
- Saved offers list page (S-07)
- Score-based sorting or filtering in the job list
- Score TTL / freshness check beyond CV re-upload
- JustJoinIT job descriptions (list API doesn't provide them)

## Architecture / Approach

SSR dashboard fetches jobs AND queries `job_scores` cache. Jobs with cached scores render with baked-in badges on first paint. Jobs without cached scores render skeleton badges. A client-side `<script>` fires `POST /api/jobs/score-batch` for pending jobs; the Astro endpoint checks cache → calls FastAPI backend in parallel → stores results → returns to client. Client updates DOM. FastAPI backend calls z.ai using the `openai` SDK, validates JSON response, returns `JobScoringResponse`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Backend scoring service | `POST /v1/jobs/score` returns real AI scores | z.ai JSON output may need prompt tuning to reliably return valid schema |
| 2. DB cache table | `job_scores` table + cache invalidation on CV re-upload | Migration must apply cleanly to production Supabase |
| 3. Job source description | `description` field in job listings (Remotive + Adzuna) | JustJoinIT list API has no descriptions — scorer must handle `null` gracefully |
| 4. Frontend scoring API | Astro batch endpoint with cache + backend calls | Parallel scoring of 20 jobs must not exceed backend or z.ai rate limits |
| 5. Dashboard UI | Async badges, detail panel, no-CV state | DOM update script must not break save-job form or preferences |

**Prerequisites:** `AI_PROVIDER_API_KEY` set in backend env (z.ai token); Supabase production accessible for migration.
**Estimated effort:** ~2–3 sessions across 5 phases.

## Open Risks & Assumptions

- z.ai GLM model may return inconsistent JSON formatting — system prompt must be explicit about schema; Phase 1 includes validation with fallback to `502`.
- Scoring 20 jobs in parallel hits z.ai 20 times simultaneously — watch for rate limit responses; add a simple concurrency cap (e.g. `p-limit(5)`) if needed.
- JustJoinIT jobs score on title + technologies only (no description) — explanation quality will be lower; this is acceptable for MVP.

## Success Criteria (Summary)

- User sees real AI match percentages and explanations on job cards, not rule-based placeholders.
- Scores load asynchronously — page is never blocked waiting for AI calls.
- Raw CV text never appears in any network request payload (privacy guardrail maintained).
