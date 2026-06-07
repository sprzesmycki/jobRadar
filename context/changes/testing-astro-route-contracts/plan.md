# Astro API Route Contract Tests — Implementation Plan

## Overview

Bootstrap Vitest for the frontend, fix three confirmed bugs (R1: no error response on scoring failure; R2: incomplete response-shape validation; R3: no error state in the dashboard), write automated tests for the server-side fixes, and wire the tests to CI. The cover-letter route is the reference model throughout — scoring catches up to it in both error handling and dashboard feedback.

## Current State Analysis

- **No frontend test infra**: no Vitest, no test scripts, no test files, no config.
- **`astro:env/server` is a Vite virtual module**: Vitest requires a custom Vite plugin to resolve it — `vi.mock` alone does not work for virtual modules.
- **Route uses `createClient(headers, cookies)`**, not `context.locals`: the mock point is `@/lib/supabase`'s `createClient`, not the Cloudflare adapter's `locals`.
- **R1** (`score-batch.ts:225-239`): always returns HTTP 200; client cannot distinguish failure from "not yet scored."
- **R2** (`score-batch.ts:87-97`): only `score` is validated at runtime; `explanation: null` renders as the string `"null"` in the dashboard.
- **R3** (`dashboard.astro:657-662`): `fireBatch` catch block sets badge to `"—"` and stops; no error DOM element, no user message.

## Desired End State

`npm test` passes with 6 tests across two test files. CI runs a `frontend-tests` job alongside `backend-tests`. R1 and R2 are guarded by automated tests that will catch regressions. R3 is implemented and manually verified. The scoring error flow matches cover-letter: server returns 502 on total failure → client reveals a global banner.

### Key Discoveries

- `src/pages/api/jobs/score-batch.ts:101` — `createClient(context.request.headers, context.cookies)`: Supabase client is constructed from request state, not injected via `locals`.
- `src/pages/api/jobs/score-batch.ts:192` — `const backendUrl = BACKEND_API_URL ?? ""`: consumed as a module-level import from `astro:env/server`.
- `src/pages/dashboard.astro:103-108` — server-side error amber banner: the existing styling pattern to follow for the R3 rose banner.
- `src/pages/api/jobs/cover-letter.ts:135-157` — timeout, 502 responses, three-state DOM: the reference model for this entire change.
- `package.json:59` — Vite 7.3.2 pinned as override: verify Vitest `@latest` compatibility at install time.

## What We're NOT Doing

- Testing the cover-letter route (already correct; not a regression risk in this change).
- jsdom or Playwright tests for `fireBatch` client-side logic (deferred to Phase 3 of the rollout).
- Unifying the three TypeScript `ScoreResult`/`JobScore`/`ScoreEntry` interfaces (maintenance smell, not a bug — out of scope).
- Testing Cloudflare-specific bindings (KV, R2, Durable Objects) — these routes use only fetch + Supabase client.

## Implementation Approach

Two phases: Phase 1 proves the test infra works end-to-end with a clean R2 fix and three tests. Phase 2 layers in R1 (server-side) and R3 (client-side), which are the two sides of the same error flow — server emits 502, client shows banner.

Mock stack:
- `vi.mock("@/lib/supabase", ...)` at test-file level — intercepts `createClient` before the route runs.
- Vite plugin in `vitest.config.ts` — serves `astro:env/server` as a static mock module.
- `vi.stubGlobal("fetch", vi.fn())` per test — intercepts the internal FastAPI fetch inside `scoreOneJob`.

## Critical Implementation Details

**`vi.hoisted` for module-level mock variables.** `vi.mock` is hoisted by Vitest's transformer, but any variable referenced inside the factory must also be hoisted — otherwise the factory captures an undefined reference. Use `vi.hoisted(() => ({ mockCreateClient: vi.fn() }))` and destructure the result before the `vi.mock` call. This is the correct pattern; a plain `const mockCreateClient = vi.fn()` at module scope will be undefined at hoist time.

**Supabase mock `from()` must return a fresh chain per call.** `score-batch.ts` calls `from("cv_profiles").select().eq().maybeSingle()` and `from("job_scores").select().eq().in()` separately. If `from` returns a singleton chain, the two queries share state and `.in()` / `.maybeSingle()` collide. The factory must return a new chain object on each `from(table)` invocation.

**`context.redirect` must return a `Response`.** `score-batch.ts:129` does `return context.redirect("/auth/signin")`. The mock must return `new Response(null, { status: 302, headers: { Location: url } })` — if it returns `void`, the route returns `undefined` and Vitest throws.

**R1 502 fires only when ALL cache-miss jobs fail.** The condition is `misses.length > 0 && missResults.every((r) => r.result === null)`. Cache hits (from `cachedMap`) are not in `missResults` and do not affect the condition. Partial batches (some scored, some null) return 200.

**R3 banner clear before each retry.** Following the F7 cover-letter fix: clear the banner at the top of `fireBatch`, before the `fetch` call. This prevents stale error state from persisting across retries.

---

## Phase 1: Vitest bootstrap, R2 validation fix, and CI wiring

### Overview

Install Vitest, write the config, create shared mock helpers, fix R2, and write 3 contract tests. Wire a `frontend-tests` CI job. By the end: `npm test` passes with 3 tests and CI runs both frontend and backend tests on every push.

### Changes Required

#### 1. Install Vitest and add test scripts

**File**: `package.json`

**Intent**: Add `vitest` and `@vitest/coverage-v8` to `devDependencies`. Add `test` and `test:coverage` scripts so the test runner is accessible via `npm test`.

**Contract**: Run `npm install -D vitest@latest @vitest/coverage-v8@latest` and check for peer-dep conflicts against the `vite: "^7.3.2"` override. If a conflict is reported, use the Vitest version that declares Vite 7 as a supported peer. Add `"test": "vitest run"` and `"test:coverage": "vitest run --coverage"` to `scripts`.

#### 2. Vitest configuration

**File**: `vitest.config.ts` (new at repo root)

**Intent**: Configure Vitest for the node environment, resolve the `@/*` path alias, and provide a Vite plugin that intercepts `astro:env/server` imports so route files can be imported in tests without Astro's build pipeline.

**Contract**:

```typescript
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    {
      name: "mock-astro-env",
      resolveId(id: string) {
        if (id === "astro:env/server") return "\0astro:env/server";
      },
      load(id: string) {
        if (id === "\0astro:env/server")
          return `
            export const SUPABASE_URL = "";
            export const SUPABASE_KEY = "";
            export const BACKEND_API_URL = "http://localhost:8000";
            export const ADZUNA_APP_ID = "";
            export const ADZUNA_APP_KEY = "";
            export const ADZUNA_COUNTRY = "us";
          `;
      },
    },
  ],
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    globals: true,
  },
});
```

The `"\0"` prefix is the Rollup/Vite convention for virtual module IDs — it prevents the resolver from treating the id as a real file path.

#### 3. Supabase mock factory

**File**: `src/__tests__/helpers/mock-supabase.ts` (new)

**Intent**: Export a `createMockSupabase(opts?)` factory that returns a typed mock Supabase client. Each call to `from(table)` returns a fresh chain so `cv_profiles` and `job_scores` queries don't collide. Tests can configure per-call return values or assert call counts on the returned `vi.fn()` instances.

**Contract**: The factory accepts an optional object with `user`, `session`, `cvData`, and `cachedScores`. Defaults: `user = { id: "user-1", email: "test@example.com" }`, `session = { access_token: "fake-token" }`, `cvData = { skills: [], experience_highlights: [], role_hints: [] }`, `cachedScores = []`. `from(table)` returns a new chain on each call where:
- `select()`, `eq()` → return `this` (chainable)
- `maybeSingle()` → resolves `{ data: cvData }` (used by the `cv_profiles` query)
- `in()` → resolves `{ data: cachedScores }` (used by the `job_scores` select query)
- `upsert()` → resolves `{ data: null }` (used by the `job_scores` upsert)

All methods are `vi.fn()`.

#### 4. Route context mock factory

**File**: `src/__tests__/helpers/mock-context.ts` (new)

**Intent**: Export `createMockContext({ method?, body?, authHeader? })` that returns a minimal context object matching what `score-batch.ts` destructures from its `context` argument (`request`, `cookies`, `redirect`).

**Contract**: Returns `{ request: Request, cookies: { set, get, delete, has }, redirect }`. `request` is constructed with the given method (default `"POST"`), body (JSON-stringified), and an `Authorization` header if `authHeader` is supplied. `cookies` methods are `vi.fn()`. `redirect` is a plain function: `(url: string) => new Response(null, { status: 302, headers: { Location: url } })`.

#### 5. R2 fix: extend ScoreResult validation to all four fields

**File**: `src/pages/api/jobs/score-batch.ts:87-97`

**Intent**: The current guard validates only `score`. If the FastAPI response has `explanation: null`, `matched_skills: null`, or `missing_skills: null`, the bare `as ScoreResult` cast silently accepts it — `explanation: null` renders as the string `"null"` in the dashboard. Extend the validation to reject any response that fails the type contract for all four fields.

**Contract**: Replace the single `typeof data.score !== "number"` check with a compound condition that additionally checks `typeof data.explanation !== "string"`, `!Array.isArray(data.matched_skills)`, and `!Array.isArray(data.missing_skills)`. If any check fails, log the bad shape and return `null` — consistent with the existing behaviour.

#### 6. R2 contract tests

**File**: `src/__tests__/api/score-batch.test.ts` (new)

**Intent**: Three tests that exercise the shape validation at the route level: one happy path asserting that all four fields pass through to the response, and two that assert `null` is returned for a job when `explanation` or `matched_skills` is wrong in the FastAPI response.

**Contract**: Use `vi.hoisted` to create `mockCreateClient` before the `vi.mock("@/lib/supabase", ...)` call. Use `vi.stubGlobal("fetch", vi.fn())` per test; call `vi.unstubAllGlobals()` in `afterEach`. Import `{ POST }` from `@/pages/api/jobs/score-batch`. Use `createMockContext({ authHeader: "Bearer fake-token", body: { jobs: [oneJob] } })` as the route context. Assert `response.status` and parse `await response.json()` for the `scores` map values.

Three test cases:
1. FastAPI returns valid `{ score: 85, explanation: "Good match", matched_skills: ["TS"], missing_skills: [] }` → `response.status === 200` and `scores["job-1"].score === 85`.
2. FastAPI returns `{ score: 85, explanation: null, matched_skills: [], missing_skills: [] }` → `scores["job-1"] === null`.
3. FastAPI returns `{ score: 85, explanation: "ok", matched_skills: null, missing_skills: [] }` → `scores["job-1"] === null`.

#### 7. CI: add `frontend-tests` job

**File**: `.github/workflows/ci.yml`

**Intent**: Add a `frontend-tests` job that installs dependencies and runs `npm test`, mirroring the `backend-tests` job structure. Runs in parallel — no `needs:` dependency on the existing `ci` job.

**Contract**: Job uses `ubuntu-latest`, `actions/checkout@v5`, `actions/setup-node@v5` with `node-version: 22` and `cache: npm`, then runs `npm ci` and `npm test`. No `env:` block needed — `astro:env/server` values are mocked by the Vite plugin.

### Success Criteria

#### Automated Verification

- `npm test` exits 0 with 3 passing tests
- `npm run typecheck` passes (no new TS errors from test files or `vitest.config.ts`)
- `npm run lint` passes

#### Manual Verification

- Run `npm test -- --reporter=verbose` and confirm test names match the three R2 scenarios
- CI `frontend-tests` job appears green on the next push

---

## Phase 2: R1 + R3 error flow fix and tests

### Overview

R1 (server) and R3 (client) are two sides of the same error flow: when all scoring calls fail, the server should return 502 and the client should show a global error banner. Both fixes ship together. Three additional Vitest tests cover the server-side R1 behaviour; R3 is verified manually.

### Changes Required

#### 1. R1 fix: add 30 s timeout to FastAPI fetch

**File**: `src/pages/api/jobs/score-batch.ts:60-68` (`attempt` arrow function)

**Intent**: The `fetch` call to FastAPI has no timeout — a stalled backend can hang the route indefinitely. Add a 30 s per-attempt timeout. Cover-letter uses 95 s (single slow LLM call); scoring is a shorter compute task, so 30 s is appropriate.

**Contract**: Add `signal: AbortSignal.timeout(30_000)` to the options object passed to `fetch(...)` inside `attempt`. The existing retry logic already wraps both `attempt()` calls in try/catch — on timeout, both throw `AbortError` and `scoreOneJob` returns `null`, unchanged.

#### 2. R1 fix: return 502 when all cache-miss scoring calls fail

**File**: `src/pages/api/jobs/score-batch.ts` (after the `missResults` loop, before the merge step)

**Intent**: After scoring all cache-miss jobs, if every result is `null` (all FastAPI calls failed), the client has no way to know — the current response is HTTP 200 with all-null scores, identical to "not yet scored." Return HTTP 502 with an explicit error body in this case.

**Contract**: Insert after the scoring loop (after `missResults` is populated, before the merge into `scores`):

```typescript
if (misses.length > 0 && missResults.every((r) => r.result === null)) {
  return new Response(
    JSON.stringify({ error: "Scoring unavailable — all calls failed" }),
    { status: 502, headers: { "Content-Type": "application/json" } },
  );
}
```

Partial failures (some scored, some null) continue to return 200 as before.

#### 3. R1 tests

**File**: `src/__tests__/api/score-batch.test.ts` (extend existing file)

**Intent**: Three tests exercising the new 502 path and confirming partial failure is not affected.

**Contract**:

1. `"returns 502 when all FastAPI calls return an error status"`: mock `fetch` to return `new Response("error", { status: 502 })` → assert `response.status === 502` and `(await response.json()).error` is a non-empty string.

2. `"returns 502 when FastAPI times out"`: mock `fetch` to reject with `new DOMException("The operation was aborted", "AbortError")` → assert `response.status === 502`.

3. `"returns 200 with partial scores when some jobs score and some fail"`: mock `fetch` to resolve successfully on the first call (valid score fixture) and return 502 on the second → assert `response.status === 200`, `scores["job-1"]` has a `score` number, `scores["job-2"] === null`.

#### 4. R3 fix: add global scoring error banner to dashboard

**File**: `src/pages/dashboard.astro` (in the jobs section, near the heading above the job list)

**Intent**: When `fireBatch` receives a 502 or a network error, users see `"—"` badges with no explanation. Add a global rose-colored banner that appears on failure and is hidden again at the start of each retry attempt.

**Contract**: Add a `<div>` element with `id="scoring-error-banner"` and the `hidden` attribute. Use `bg-rose-900/30 text-rose-300` colour classes to distinguish it from the amber server-side error banner at `dashboard.astro:103-108`. Message: `"Job scoring is currently unavailable — try refreshing the page."` Place it immediately before the jobs list (after any server-side error banners, before `<ul>` or job card loop).

#### 5. R3 fix: update `fireBatch` to reveal and clear the banner

**File**: `src/pages/dashboard.astro:634-665` (`fireBatch` function body)

**Intent**: `fireBatch` currently has no `!res.ok` check — a 502 from the route reaches `res.json()`, which throws because the body is `{ error: "..." }` without a `scores` key. Update the function to handle non-2xx responses explicitly, following the F7 cover-letter pattern (clear before retry).

**Contract**: Three changes to `fireBatch`:

1. At the very top of `fireBatch` (before `fetch`): get the banner by `document.getElementById("scoring-error-banner")` and call `.setAttribute("hidden", "")` on it — clears stale error state before each attempt.

2. After `await fetch(...)`, before `await res.json()`: add `if (!res.ok) { reveal banner; set pending badges to "—"; remove animate-pulse; return; }`.

3. In the existing `catch` block (network errors): also reveal the banner in addition to the existing badge update.

### Success Criteria

#### Automated Verification

- `npm test` exits 0 with 6 passing tests (3 from Phase 1 + 3 new)
- `npm run typecheck` passes
- `npm run lint` passes
- `uv run ruff check .` passes (unchanged; confirms no accidental backend edits)

#### Manual Verification

- Set `BACKEND_API_URL` in `.env` to an unreachable address (e.g. `http://127.0.0.1:9999`); run `npm run dev`; log in with a CV uploaded; navigate to dashboard → scoring badges animate briefly → after `fireBatch` exhausts retries, the rose error banner appears above the job list
- Reload the page → banner is not visible on load (hidden by default); it only appears after a failed batch attempt
- Restore `BACKEND_API_URL` to the real backend → scoring works normally, no banner appears

---

## Testing Strategy

### Unit / Integration Tests (Vitest, node environment)

- R2: valid fixture → all 4 fields present in mapped output; `explanation: null` → `null` for that job; `matched_skills: null` → `null` for that job
- R1: all FastAPI calls fail → route 502; FastAPI timeout → route 502; partial failure (1 of 2 jobs fails) → route 200 with mixed scores

### Manual Testing Steps

1. Run `npm run dev`
2. Set `BACKEND_API_URL` to an unreachable endpoint (e.g. `http://127.0.0.1:9999` in `.env`)
3. Log in, navigate to `/dashboard` — confirm scoring badges pulse
4. Wait for `fireBatch` to exhaust retries — confirm rose error banner is visible
5. Reload page — confirm banner is hidden, badges pulse again, then banner reappears after retries exhaust
6. Restore `BACKEND_API_URL` to real backend — confirm normal scoring flow, no banner

## Migration Notes

The R1 change (HTTP 200 → 502 on total failure) is a breaking change to the `/api/jobs/score-batch` response contract. The only consumer is `fireBatch` in `dashboard.astro`, which is updated in Phase 2 of this same change. No external clients consume this route.

## References

- Related research: `context/changes/testing-astro-route-contracts/research.md`
- Cover-letter reference model: `src/pages/api/jobs/cover-letter.ts:135-157`
- Backend test patterns: `backend/tests/test_contracts.py`
- Cover-letter F7 fix (clear error div before retry): `context/archive/2026-06-05-cover-letter-generation/reviews/impl-review.md`
- Score-batch F3 fix (runtime payload validation pattern): `context/archive/2026-06-05-cv-based-job-scoring/reviews/impl-review.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest bootstrap, R2 validation fix, and CI wiring

#### Automated

- [x] 1.1 `npm test` exits 0 with 3 passing tests — c49d49f
- [x] 1.2 `npm run typecheck` passes with no new errors — c49d49f
- [x] 1.3 `npm run lint` passes — c49d49f

#### Manual

- [x] 1.4 Run `npm test -- --reporter=verbose`; confirm the three R2 test names are visible in output
- [x] 1.5 CI `frontend-tests` job appears green on the next push

### Phase 2: R1 + R3 error flow fix and tests

#### Automated

- [x] 2.1 `npm test` exits 0 with 6 passing tests (3 from Phase 1 + 3 new R1 tests) — cfff32b
- [x] 2.2 `npm run typecheck` passes — cfff32b
- [x] 2.3 `npm run lint` passes — cfff32b
- [x] 2.4 `uv run ruff check .` passes — cfff32b

#### Manual

- [x] 2.5 `BACKEND_API_URL` pointed at unreachable host → rose error banner appears above job list after retries exhaust — cfff32b
- [x] 2.6 Page reload → banner hidden on load, reappears after failed retries — cfff32b
- [x] 2.7 `BACKEND_API_URL` restored to real backend → scoring works normally, no banner — cfff32b
