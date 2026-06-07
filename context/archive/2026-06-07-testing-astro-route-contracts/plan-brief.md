# Astro API Route Contract Tests — Plan Brief

> Full plan: `context/changes/testing-astro-route-contracts/plan.md`
> Research: `context/changes/testing-astro-route-contracts/research.md`

## What & Why

Bootstrap the frontend test runner (Vitest) and fix three confirmed bugs in the job-scoring flow. The scoring route always returns HTTP 200 even when FastAPI is completely unreachable, validates only one of four response fields, and gives users no error feedback — the dashboard just silently shows `"—"`. This is Phase 2 of the test rollout.

## Starting Point

No frontend test infrastructure exists today (no Vitest, no scripts, no config, no test files). The cover-letter route was implemented after scoring and applied lessons (timeout, 502 responses, three-state UI) that were never backfilled to scoring. This change backfills all three gaps.

## Desired End State

`npm test` passes with 6 Vitest tests, a `frontend-tests` CI job runs alongside `backend-tests`, and the scoring error flow matches cover-letter: server returns 502 on total failure → dashboard shows a global rose banner. R2 shape validation is enforced for all four fields.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| R1 response contract on total failure | HTTP 502 + `{ error: "..." }` | Mirrors cover-letter exactly; semantically correct HTTP | Plan |
| R1 partial-failure contract | Keep HTTP 200 | SCORE_CAP=5 partial batches are expected; changing this would be too aggressive | Research |
| R1 per-job fetch timeout | 30 s via `AbortSignal.timeout` | Shorter than cover-letter's 95 s (LLM call); enough for a scoring compute call | Plan |
| R2 validation fix | Extend check to all 4 fields; return null on any mismatch | Consistent with existing bad-shape path; prevents silent `"null"` string in dashboard | Research |
| R3 error UI shape | Global banner above job list | Matches existing server-side amber banner pattern; simpler than per-job indicators | Plan |
| R3 test strategy | Implement + manual verify; defer automated test to Playwright phase | Client-side dashboard JS is poorly suited to jsdom; Playwright tests it properly | Plan |
| Vitest mock approach | `vi.mock("@/lib/supabase")` + Vite plugin for `astro:env/server` | Route uses `createClient(headers, cookies)` not `locals`; `astro:env/server` is a Vite virtual module | Research |
| Fetch mock | `vi.stubGlobal("fetch", vi.fn())` per test | Sufficient for a handful of route-level tests; MSW deferred until suite grows | Plan |
| CI wiring | Phase 1 of this change | Test without CI is a partial win; lock the floor immediately | Plan |

## Scope

**In scope:**
- Full Vitest bootstrap (config, mock helpers, scripts, CI job)
- R2 fix: extend `ScoreResult` runtime validation to all 4 fields
- R1 fix: 30 s timeout + HTTP 502 on total scoring failure
- R3 fix: global scoring error banner + `fireBatch` non-2xx handling
- 6 Vitest tests (3 R2 contract, 3 R1 error-path)

**Out of scope:**
- Cover-letter route tests (already correct; no regression risk)
- jsdom/Playwright tests for `fireBatch` client JS (Phase 3 rollout)
- Unifying the three TypeScript `ScoreResult` / `JobScore` / `ScoreEntry` interfaces
- Cloudflare binding tests (KV, R2, Durable Objects)

## Architecture / Approach

Mock stack for route tests: `vi.mock("@/lib/supabase")` intercepts the Supabase client factory; a Vite plugin in `vitest.config.ts` resolves the `astro:env/server` virtual module; `vi.stubGlobal("fetch")` intercepts the internal FastAPI call in `scoreOneJob`. Route handlers are imported directly and called with a plain mock context object — no Astro or Cloudflare runtime needed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Bootstrap + R2 + CI | Vitest running, 3 tests passing, CI locked in, R2 validation fixed | Vite 7 + Vitest version peer-dep conflict |
| 2. R1 + R3 error flow | 6 tests passing, scoring returns 502 on failure, dashboard shows error banner | `fireBatch` retry loop interaction with new banner-clear logic |

**Prerequisites:** None — this is a greenfield test setup.  
**Estimated effort:** ~2 focused sessions across 2 phases.

## Open Risks & Assumptions

- Vitest's current `@latest` may or may not declare Vite 7 as a supported peer; check at install time and use `--legacy-peer-deps` if needed.
- `vi.hoisted` is required for the `mockCreateClient` variable used inside `vi.mock` — using a plain `const` will result in an undefined reference at hoist time (non-obvious Vitest gotcha, documented in Critical Implementation Details).
- R3 manual verification relies on temporarily breaking `BACKEND_API_URL`; the test environment must support `.env` overrides.

## Success Criteria (Summary)

- `npm test` exits 0 with 6 tests; CI `frontend-tests` is green.
- Scoring route returns HTTP 502 (not 200) when FastAPI is completely unreachable.
- Dashboard shows a rose error banner (not just `"—"`) when scoring fails.
