<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Astro API Route Contract Tests

- **Plan**: context/changes/testing-astro-route-contracts/plan.md
- **Scope**: All Phases (1–2 of 2)
- **Date**: 2026-06-07
- **Verdict**: NEEDS ATTENTION (triaged → all fixes applied)
- **Findings**: 0 critical  2 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Worst-case handler duration can exceed CDN/proxy timeout

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/jobs/score-batch.ts:200-208
- **Detail**: 1500ms inter-job delay + 30s timeout per job = worst-case 156s handler. Cloudflare cuts at 100s, nginx at 60s. A full 5-miss batch with stalled backend is killed mid-flight after scoring but before upsert — results lost silently.
- **Fix A ⭐ Recommended**: Remove the 1500ms server-side delay; let fireBatch's 2s retry cadence provide rate limiting.
  - Strength: Simple removal; covers the common case. Matches cover-letter.ts which has no inter-call delay.
  - Tradeoff: Backend sees burst calls — worth checking if FastAPI has its own rate limiting.
  - Confidence: MED
  - Blind spot: FastAPI rate limits not verified.
- **Fix B**: Add per-request wall-clock deadline (~60s); break early and return partial results.
  - Strength: Guarantees return before proxy cuts it.
  - Tradeoff: Non-trivial branching; needs new test coverage.
  - Confidence: LOW
  - Blind spot: Partial upsert path is untested.
- **Decision**: SKIPPED

### F2 — Missing `export const prerender = false` in score-batch.ts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/jobs/score-batch.ts (top of file)
- **Detail**: cover-letter.ts (the explicit reference model) has `export const prerender = false;` at line 5. score-batch.ts does not. Inert in output: "server" mode but breaks silently on migration to output: "hybrid".
- **Fix**: Add `export const prerender = false;` after the imports.
- **Decision**: FIXED

### F3 — Upsert error not checked; silent persistence failure

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/jobs/score-batch.ts:233
- **Detail**: `supabase.from("job_scores").upsert(...)` return value not destructured. A transient error silently drops the persist step; same jobs re-score on next load wasting AI quota. Pre-existing gap shared with cover-letter.ts.
- **Fix**: Destructure `const { error: upsertError }` and add `if (upsertError) console.error(...)`.
- **Decision**: FIXED

### F4 — Retry-exhaustion guard leaves badges permanently in "Scoring…" state

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:636 (fireBatch early-return guard)
- **Detail**: `attempt > 6` branch returns without cleaning DOM. Jobs beyond the 35th scored slot remain frozen on "Scoring…" with animate-pulse running indefinitely. Edge case but visually broken when hit.
- **Fix**: Reveal error banner and set pending badges to "—" in the `attempt > 6` branch.
- **Decision**: FIXED

### F5 — Test module not reset between tests; shared module state

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/__tests__/api/score-batch.test.ts (global afterEach)
- **Detail**: `await import(...)` without `vi.resetModules()` between tests. Safe today (no module-level state) but fragile if a singleton is added.
- **Fix**: Add `vi.resetModules()` to the `afterEach` block.
- **Decision**: FIXED
