---
date: 2026-06-07T00:00:00+00:00
researcher: claude-sonnet-4-6
git_commit: 25469139d77ed8b47f37422ba7e2075e4aa0961d
branch: main
repository: przeprogramowani
topic: "Astro API route contract tests — ground R1, R2, R3 from test-plan Phase 2"
tags: [research, codebase, astro, vitest, score-batch, cover-letter, dashboard, error-handling]
status: complete
last_updated: 2026-06-07
last_updated_by: claude-sonnet-4-6
---

# Research: Astro API Route Contract Tests (Phase 2)

**Date**: 2026-06-07  
**Researcher**: claude-sonnet-4-6  
**Git Commit**: 25469139d77ed8b47f37422ba7e2075e4aa0961d  
**Branch**: main  
**Repository**: przeprogramowani

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md`. Verify the real failure paths, code anchors, and test-infrastructure requirements for R1 (batch scoring silent failure), R2 (response shape mapping), and R3 (dashboard loading/error states). Determine what Vitest bootstrap is needed for Astro 6 + Cloudflare Workers.

## Summary

All three risks are confirmed and non-speculative. The central finding is an **asymmetry between the cover-letter and score-batch flows**: cover-letter has a 95 s timeout, proper error status codes (502), and a three-state dashboard UI (loading / content / error); score-batch has none of these. Every FastAPI failure in scoring collapses silently to `null` in the `scores` map, the route always returns HTTP 200, and the dashboard renders `"—"` with no user message. R2 adds a second layer: only the `score` field is validated at runtime; the other three fields (`explanation`, `matched_skills`, `missing_skills`) pass through a bare TypeScript cast and can silently produce wrong output if the backend schema drifts.

Phase 2 therefore has two responsibilities: **write the tests** that expose these gaps AND **apply the fixes** that make the tests pass. The test infrastructure requires a full Vitest bootstrap — no test runner, scripts, config, or test files exist on the frontend yet.

---

## Detailed Findings

### R1 — Batch scoring silent failure

**Anchor**: `src/pages/api/jobs/score-batch.ts`

The route scores one job at a time inside a sequential loop (SCORE_CAP = 5, 1.5 s delay between jobs):

```
src/pages/api/jobs/score-batch.ts:189-203  — sequential loop, cap logic
src/pages/api/jobs/score-batch.ts:60-68    — fetch call to FastAPI /v1/jobs/score (NO timeout)
src/pages/api/jobs/score-batch.ts:71-98    — per-job error handling: network error → null, non-200 → null, bad JSON → null, bad shape → null
src/pages/api/jobs/score-batch.ts:225-239  — route always returns HTTP 200; scores map contains null for failed jobs
```

Every error path for an individual job returns `null` and is absorbed into the `scores` map. The HTTP 200 response body for a fully-failed batch looks identical to a "no jobs yet scored" response — there is no signal to the client that anything went wrong.

**No timeout**: the fetch call at line 60–68 carries no `signal: AbortSignal.timeout(...)`. The cover-letter route at `src/pages/api/jobs/cover-letter.ts:135` uses `AbortSignal.timeout(95_000)`. Score-batch can hang indefinitely.

**Client-side** (`src/pages/dashboard.astro:634-665`, `fireBatch` function):

```
dashboard.astro:636    — exits after 6 retries (2 s apart), no user feedback on exhaustion
dashboard.astro:651-656 — receives 200 + null scores, calls applyScores({}) — silent
dashboard.astro:657-662 — network error catch: sets badge to "—", removes animate-pulse — NO error message
```

The "Scoring…" pulse badge silently becomes "—" regardless of whether the score is not-yet-computed or permanently failed.

**What a correct test must catch**: mock `fetch` (the internal FastAPI call) to return a 502 for one job in the batch → assert the Astro route returns a non-200 status OR the response body includes an explicit `error` field for that job. Currently the route returns 200 with `{ scores: { "job-id": null } }` — which is the wrong behavior the implementation must fix.

**Reference: cover-letter is the working model**:
- `src/pages/api/jobs/cover-letter.ts:135` — 95 s timeout
- `src/pages/api/jobs/cover-letter.ts:137-157` — returns HTTP 502 with `{ error: "..." }` on any FastAPI failure
- `dashboard.astro:716, 721` — client checks `!res.ok || data.error`, reveals error div

---

### R2 — Response shape mapping: incomplete runtime validation

**FastAPI schema anchor**: `backend/app/schemas/scoring.py:11-16`

```python
class JobScoringResponse(BaseModel):
    score: int           # 0-100, required
    explanation: str     # required
    matched_skills: list[str]   # default []
    missing_skills: list[str]   # default []
```

**TypeScript mirror** (score-batch):

```
src/pages/api/jobs/score-batch.ts:14-19  — ScoreResult interface
src/lib/job-scores.ts:3-9               — JobScore interface (Supabase-cached variant)
dashboard.astro:582-587                  — ScoreEntry type (client-side use)
```

All three TypeScript types define the same four fields and currently match the Pydantic schema. They are separate declarations with no shared source of truth — a drift risk if the backend schema changes.

**Runtime validation gap** (`src/pages/api/jobs/score-batch.ts:87-97`):

```typescript
const data = (await res.json()) as ScoreResult;
if (typeof data.score !== "number") {   // ← only this field is checked
  return null;
}
return data;
```

The `as ScoreResult` cast provides no runtime enforcement. If FastAPI returns:

| Field | If null/undefined | Dashboard outcome |
|---|---|---|
| `score` | Returns `null` → job not shown | Error caught ✓ |
| `explanation` | Cast succeeds → `expEl.textContent = "null"` (string) | **Silent wrong output** |
| `matched_skills` | Cast succeeds → optional chain at `dashboard.astro:614` hides it | Silent empty output |
| `missing_skills` | Cast succeeds → optional chain at `dashboard.astro:621` hides it | Silent empty output |

**Dashboard field access anchors**:

```
dashboard.astro:601  — score.score + "% match"
dashboard.astro:608  — expEl.textContent = score.explanation
dashboard.astro:614-619 — score.matched_skills?.length → render badges
dashboard.astro:621-626 — score.missing_skills?.length → render badges
```

**What the test must catch**: given a known FastAPI response fixture where `explanation` is `null`, the route must return `null` for that job (i.e., validation fails) rather than passing the malformed object through to the dashboard. This requires extending the runtime check to all four fields.

---

### R3 — Dashboard scoring error state: absent

**Anchor**: `src/pages/dashboard.astro:657-662`

```javascript
} catch {
  document.querySelectorAll<HTMLElement>("[data-score-pending='true']").forEach((el) => {
    el.textContent = "—";
    el.classList.remove("animate-pulse");
  });
  // ← no error element revealed, no message, user cannot distinguish failure from "no score"
}
```

Loading state exists (`data-score-pending="true"`, `animate-pulse` at `dashboard.astro:375-388`). Error state does **not** exist.

**Working reference — cover-letter three-state DOM** (`dashboard.astro:470-492`):

```html
<div data-cover-letter-loading={job.id} hidden>…Generating…</div>
<div data-cover-letter-content={job.id} hidden>…content…</div>
<div data-cover-letter-error={job.id} hidden class="text-rose-400">
  Failed to generate. Try again.
</div>
```

Client at `dashboard.astro:716-721` reveals the error div on `!res.ok || data.error`. The F7 fix from the cover-letter archive clears the error div at the start of a retry — that same pattern must be applied to the score-batch error state.

**Fix required before a useful test exists**: add an error DOM element per score badge (or a global scoring-error banner), update `fireBatch` to reveal it in the catch block, and update `fireBatch` retry logic to clear it before re-attempting. Only then can a test assert "error message is visible after a failed fetch."

**R3 scope clarification** (from test-plan §7): the open item asked whether error feedback already exists. Research confirms it does **not** for scoring — the risk is live, not speculative.

---

### Vitest bootstrap requirements

**Current state**: zero frontend test infrastructure.

```
package.json         — no test devDependencies, no test scripts
vitest.config.*      — does not exist
src/__tests__/       — does not exist
```

**Stack constraints for test setup**:

```
package.json:27  — astro: 6.3.1
package.json:17  — @astrojs/cloudflare: 13.5.0
astro.config.mjs:11 — output: "server"
astro.config.mjs:16 — adapter: cloudflare()
package.json:59  — vite: "^7.3.2" (override, compatible with modern Vitest)
tsconfig.json:2  — extends astro/tsconfigs/strict
tsconfig.json:10 — path alias @/* → ./src/*
.nvmrc           — Node 22.14.0
```

**Astro API routes are plain Request → Response handlers**:

```typescript
// Pattern at src/pages/api/jobs/score-batch.ts:1-2
import type { APIRoute } from "astro";
export const POST: APIRoute = async ({ request, locals }) => { ... }
```

`locals` carries the Supabase client (from Cloudflare env binding) and the Supabase session. For testing, both must be mocked — no real Cloudflare runtime is needed.

**Recommended Vitest setup approach**:

- Vitest with `environment: "node"` (not jsdom; the routes run server-side)
- Global `fetch` mocked via `vi.stubGlobal("fetch", vi.fn())` or `msw` with node server
- `locals` passed as a plain object mock: `{ supabase: mockClient, session: fakeSession }`
- `Request` constructed with `new Request(url, { method: "POST", body: JSON.stringify({...}) })`
- No Cloudflare Worker runtime required for unit/integration tests against the route handler

**Backend test patterns applicable to frontend** (from `backend/tests/test_contracts.py`):
- Auth mock → equivalent: inject `{ locals: { runtime: { env: {...} }, supabase: mockClient } }`
- `monkeypatch.setattr` for external service → equivalent: `vi.stubGlobal("fetch", mockFn)` for the FastAPI call
- Settings override → equivalent: mock `import.meta.env` in Vitest config

**What Phase 2 must add to `package.json`**:

```json
devDependencies:
  vitest
  @vitest/coverage-v8  (or coverage-istanbul)
scripts:
  "test": "vitest run",
  "test:watch": "vitest"
```

Possibly also `msw` for fetch mocking, though `vi.stubGlobal` is simpler for route-level tests.

---

### Historical context

**`cv-based-job-scoring` archive** established:
- `scoreOneJob` never throws — it returns `null` on failure. The `null` propagation through `scores` is intentional but under-signaled.
- F3 fix added runtime filter for malformed `JobPayload` (jobs missing `technologies`). The equivalent fix for `ScoreResult` (the response side) was not applied — that is R2's gap.
- F7 fix reduced `fireBatch` from 21 retries (42 s) to 6 retries (12 s).

**`cover-letter-generation` archive** established:
- Three-state DOM pattern (loading/content/error) is the team's established UI pattern for async operations.
- F7 fix: error div cleared before retry. Same fix required for score-batch error state when added.

**`ci-test-coverage` archive** explicitly deferred frontend Vitest: "Frontend unit tests (vitest) — nie w scope tego slice" (`plan.md:25`). Phase 2 picks this up.

**`testing-backend-api-hardening` archive** established auth mock pattern:
- `app.dependency_overrides[get_current_user] = fake_user` (backend).
- Frontend equivalent: inject a mock `locals.supabase` and a mock `locals.session` into the `APIRoute` context.
- Custom 422 handler now strips `input`/`url` from all error responses — validated in Phase 1 tests. This is the canonical backend error shape for malformed requests.

---

## Code References

- `src/pages/api/jobs/score-batch.ts:60-68` — FastAPI fetch call, no timeout
- `src/pages/api/jobs/score-batch.ts:71-98` — per-job error handling, all return `null`
- `src/pages/api/jobs/score-batch.ts:87-97` — runtime validation, only `score` checked
- `src/pages/api/jobs/score-batch.ts:189-203` — sequential loop, SCORE_CAP = 5
- `src/pages/api/jobs/score-batch.ts:225-239` — always returns HTTP 200
- `src/pages/api/jobs/cover-letter.ts:135` — 95 s timeout (reference model)
- `src/pages/api/jobs/cover-letter.ts:137-157` — proper 502 error responses (reference model)
- `src/pages/dashboard.astro:375-388` — score badge: loading state, `data-score-pending="true"`
- `src/pages/dashboard.astro:470-492` — cover-letter: three-state DOM (reference model)
- `src/pages/dashboard.astro:601` — `score.score + "% match"` field access
- `src/pages/dashboard.astro:608` — `expEl.textContent = score.explanation` field access
- `src/pages/dashboard.astro:614-626` — `matched_skills` and `missing_skills` field access
- `src/pages/dashboard.astro:634-665` — `fireBatch()` client function
- `src/pages/dashboard.astro:657-662` — catch block: silent "—", no error state
- `src/pages/dashboard.astro:697-725` — `fetchCoverLetter()` with proper error handling
- `src/lib/job-scores.ts:3-9` — `JobScore` interface (Supabase-cached scores)
- `backend/app/schemas/scoring.py:11-16` — `JobScoringResponse`: score, explanation, matched_skills, missing_skills
- `backend/app/schemas/ai.py` — cover-letter schemas only (not scoring)
- `package.json:27` — astro 6.3.1
- `package.json:17` — @astrojs/cloudflare 13.5.0
- `astro.config.mjs:11` — output: "server"
- `tsconfig.json:10` — path alias @/* → ./src/*

---

## Architecture Insights

**The asymmetry is the architecture risk.** Cover-letter and score-batch share the same backend infrastructure (FastAPI, Supabase, Cloudflare Workers runtime) but have divergent error handling. Cover-letter was implemented after score-batch and applied lessons (timeout, 502 responses, three-state UI) that were not backfilled. Phase 2 backfills those gaps for scoring.

**Astro API routes are testable as pure functions.** `APIRoute = async ({ request, locals }) => Response`. The Cloudflare adapter adds `locals.runtime.env` for bindings but each route constructs its own Supabase client from those bindings. Mocking `locals.supabase` directly (passing a pre-built mock client rather than letting the route build one) is simpler and the correct boundary.

**Three TypeScript types for the same shape** (`ScoreResult` in score-batch, `JobScore` in job-scores, `ScoreEntry` in dashboard) are a maintenance smell. Phase 2 does not need to unify them — but the validation fix in score-batch.ts is the only place runtime enforcement exists, and it must cover all four fields.

**Vitest in a Cloudflare Workers project**: because the output mode is `server` and the adapter is `cloudflare`, the production runtime is a Worker. Vitest runs in Node — this is fine for testing route logic (fetch mocking, Supabase client mock, response shape assertions) but means tests cannot cover Cloudflare-specific bindings (KV, R2, Durable Objects) without `@cloudflare/vitest-pool-workers`. The scoring and cover-letter routes do not use KV/R2 — they use fetch (to FastAPI) and the Supabase client (injected via `locals`). Node environment tests are sufficient for Phase 2.

---

## Historical Context (from prior changes)

- `context/archive/2026-06-05-cv-based-job-scoring/plan.md` — scoring response contract; `scoreOneJob` returns `null` on failure; F3/F7 implementation review fixes
- `context/archive/2026-06-05-cover-letter-generation/plan.md` — three-state DOM pattern; F7: error div cleared before retry
- `context/archive/2026-06-05-ci-test-coverage/plan.md` — frontend Vitest explicitly deferred; backend CI job added
- `context/archive/2026-06-06-testing-backend-api-hardening/research.md` — backend auth mock pattern; custom 422 handler shape

---

## Open Questions

1. **R1 fix scope**: Score-batch currently always returns HTTP 200. The test plan says the route should return "a clear partial-failure response." Does this mean: (a) return non-200 when ALL jobs fail, (b) return non-200 when ANY job fails, or (c) return 200 but include a top-level `hasErrors: true` flag? Option (a) aligns closest to the cover-letter model and is least breaking. The plan should decide before implementation.

2. **R3 fix granularity**: The error state could be per-job (a badge-level indicator, similar to how cover-letter has per-job error divs) or global (a single banner at the top of the jobs list). Per-job is more informative; global is simpler. The plan should specify.

3. **Vitest + `@astrojs/cloudflare` locals shape**: The Cloudflare adapter injects `locals.runtime.env` (with bindings) and `locals.runtime.cf` (request metadata). Each route extracts `BACKEND_API_URL` from `locals.runtime.env`. Mocks must provide this shape. The plan should define a reusable mock locals factory so all route tests share the same fixture.

4. **MSW vs vi.stubGlobal for fetch mocking**: MSW provides more realistic intercept behavior (matches on URL, method, headers) but adds a dependency and setup overhead. `vi.stubGlobal("fetch", vi.fn())` is simpler but less expressive. For Phase 2 (testing a handful of routes), `vi.stubGlobal` is likely sufficient; MSW earns its keep if the suite grows to cover many routes. The plan should decide.

5. **Phase 2 test scope boundary**: Does Phase 2 test the client-side `fireBatch()` in dashboard.astro (requires jsdom or browser env), or only the server-side `POST /api/jobs/score-batch` handler (requires node env)? Mixing environments in one Vitest config is possible with `environmentMatchGlobs` but adds complexity. R1 and R2 are fully exercisable at the route level (server-side). R3 is a dashboard UI concern — it requires either jsdom or a playwright test. The plan should decide whether R3 goes into Phase 2 (Vitest + jsdom for the dashboard script block) or Phase 3/later (e2e or playwright).
