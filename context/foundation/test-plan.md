---
project: JobRadar
created: 2026-06-06
version: 1
context_type: test-plan
test_base_profile: sparse
---

# Test Plan — JobRadar

## §1 Strategy

Three load-bearing principles every rollout phase obeys:

1. **Cost × signal.** Every test added — classic or AI-native — must answer: *what is the cheapest test that gives a real signal for this risk?* Do not promote to e2e because it "feels safer". Do not layer an AI judge on top of a deterministic check that already catches the regression.

2. **User concerns are evidence.** Risks the team has lived through, or explicitly fears, carry the same weight as PRD lines or hot-spot data.

3. **Risks are scenarios, not code locations.** §2 names failure modes and their evidence sources. File paths and function names are anchors for `/10x-research` to supply — not for this plan to assert. A risk row that names `src/foo/bar.ts:42` is an ungrounded anchor and must be removed.

---

## §2 Risk Map

### Top Risks

| # | Risk (failure scenario) | Impact | Likelihood | Source(s) — evidence, not anchors |
|---|---|---|---|---|
| R1 | Batch scoring call to FastAPI fails silently; dashboard shows infinite spinner or stale scores with no error signal | High | High | Interview Q4; hot-spot dir `src/pages/api` (40 touches/30d), `score-batch.ts` (4 commits/30d) |
| R2 | FastAPI response shape changes; Astro mapping silently produces wrong or empty scores without surfacing an error | High | Medium | Interview Q3; hot-spot dir `src/lib` (31 touches/30d), `src/lib/jobs.ts` (7 commits); `backend/app/schemas/ai.py` (3 commits) |
| R3 | API failure in scoring or cover letter causes the dashboard to show a permanent loading state with no user-visible error message | High | Medium | Interview Q1; PRD NFR (30s latency/progress feedback); no frontend tests exist |
| R4 | FastAPI error response body or backend log contains raw CV text, violating the privacy guardrail | High | Low-Medium | Interview Q1; PRD NFR-privacy ("no external log may contain raw CV text"); hot-spot dir `backend/app` (46 touches/30d) |
| R5 | Authenticated user A calls a CV/scoring/cover-letter route with user B's resource ID and receives user B's data (IDOR) | High | Medium | Authorization lens; auth is implemented but resource-ownership validation is untested |
| R6 | Generated cover letter contains no job-specific or CV-specific references; meets US-02 AC on paper but fails in practice | Medium | Medium | PRD US-02 AC; hot-spot dir `backend/app` (covers letter service); no output quality test |
| R7 | Repeated cover letter requests from the same user exhaust LLM API quota with no rate limiting | Medium | Low | Resource-abuse lens; no rate limiting mentioned in plans or AGENTS.md |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context needed | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| R1 | When FastAPI returns an error for one job in a batch, the Astro route returns a clear partial-failure response — not 200 with empty scores or a hung connection | "200 response = batch succeeded" | How `score-batch.ts` awaits FastAPI; does it await all jobs or stream? What is the response shape? Timeout behavior? | Integration test: mock FastAPI returning error for one item, verify response status and shape | Happy-path only; never testing partial failure or timeout |
| R2 | Given a known FastAPI response fixture, the mapped job score objects reaching the dashboard have the expected keys and types | "Backend returns the same shape it always has" | FastAPI scoring response schema; how `src/lib/jobs.ts` maps it; which keys `dashboard.astro` reads | Unit test: Astro route with mock FastAPI response; verify mapped output shape | Coupling test to real FastAPI; testing the backend instead of the mapping logic |
| R3 | When an Astro API route returns 5xx, the dashboard renders a user-visible error message — not a spinner | "Error boundaries catch everything" | How `dashboard.astro` handles fetch errors; is there a loading state flag? What renders on fetch rejection? | Component or route-level integration test; mock fetch to return error, assert error state renders | Testing that the error boundary exists, not that it displays a message |
| R4 | A malformed CV upload request that triggers a validation error returns a response body containing no raw CV text | "We handle errors properly" | Where FastAPI CV endpoint error-handles; does Pydantic validation error echo the request body? | Backend integration test: send invalid CV request; assert response body contains no raw CV text fields | Testing only the success path; never testing what error responses look like |
| R5 | User A's JWT cannot retrieve user B's saved scores, CV data, or cover letters via direct API call | "Route is authenticated therefore secure" | How Astro API routes pass user_id to FastAPI; does FastAPI validate ownership against requesting user_id? | Backend integration test: two user fixtures, cross-user resource access attempt, assert 403 | Testing only that unauthenticated requests are rejected; never testing cross-user access |
| R6 | Cover letter text contains ≥1 named requirement from the offer and ≥1 specific item from the CV, verified against the prompt inputs | "AI will naturally personalize it" | Prompt structure in the cover letter service; what fields are injected; is job description + CV text both present? | Deterministic: verify prompt includes required fields. AI-native: LLM judge checks output references specific inputs | Asserting cover letter is non-empty rather than that it references something specific |
| R7 | Repeated cover letter requests from the same user within a window return 429 after the threshold | "Users won't abuse it" | Any rate limiting middleware in FastAPI or Astro routes; is there a per-user quota? | Backend integration test: rapid successive requests from same user fixture; assert 429 | Testing first request succeeds only; never testing the limit |

### Negative Space

- **Job-source adapters (Remotive, Adzuna):** Thin wrappers; upstream APIs change frequently. No test budget. Interview Q5.
- **Supabase auth flows:** Tested by Supabase SDK. No test budget. Interview Q5.
- **CV generator / editor:** PRD Non-Goal; not in scope.
- **Social and admin features:** PRD Non-Goal and MVP exclusion.

---

## §3 Phased Rollout

| # | Phase | Goal | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Backend API hardening | Extend existing pytest suite to verify privacy, IDOR, and resource-abuse properties | R4, R5, R7 | Backend integration (pytest, TestClient) | change opened | context/changes/testing-backend-api-hardening/ |
| 2 | Astro API route contract tests | Add Vitest; test batch scoring error handling, response shape mapping, and dashboard error states | R1, R2, R3 | Frontend integration (Vitest + fetch mock) | not started | — |
| 3 | Cover letter quality gate | Deterministic prompt-structure test + AI-native personalization check; wire both phases into CI | R6 | Backend unit (pytest); AI-native judge | not started | — |

---

## §4 Stack

- **Language / runtime:** TypeScript (Astro 6 + React 19) on Cloudflare Workers; Python 3.x (FastAPI) on VPS
- **Frontend test runner:** none yet — Phase 2 bootstraps Vitest
- **Backend test runner:** pytest configured (`backend/pyproject.toml`, `testpaths = ["tests"]`); 2 test files (`test_contracts.py`, `test_cv_extraction.py`) in `backend/tests/`; CI job `backend-tests` runs `uv run pytest`
- **Test-base profile:** `sparse` — pytest configured for backend with 2 test files in `backend/tests/`; frontend has no test runner and zero test files
- **Existing CI gate:** `npm run lint + npm run build` (frontend) + `uv run pytest` (backend, parallel job)
- **Stack grounding tools (current session):**
  - Docs: Context7 MCP — available; usable for Astro, Vitest, FastAPI, pytest specifics; checked: 2026-06-06
  - Search: Exa MCP — available; usable for checking current tool support/status; checked: 2026-06-06
  - Runtime/browser: not available in current session
  - Provider/platform: Linear MCP — available for issue tracking; checked: 2026-06-06

---

## §5 Hot-Spot Scope

Scan scoped to `src/` and `backend/app/` (hand-written code). Excluded: `node_modules/`, `dist/`, `.next/`, `backend/.venv/`, lockfiles, generated output.

**Top directories (30 days, 2026-05-07 → 2026-06-06):**

| Directory | Touches | Relevance |
|---|---|---|
| `backend/app` | 46 | Scoring, CV, cover letter services — all untested at contract level |
| `src/pages` | 40 | Astro routes + API endpoints — zero frontend tests |
| `src/lib` | 31 | Job mapping, Supabase client, job-source adapters |
| `src/components` | 11 | React islands — UI error states |
| `backend/tests` | 9 | Existing test suite churn |

**Top files:** `src/pages/dashboard.astro` (13), `src/pages/api/cv/upload.ts` (7), `src/lib/jobs.ts` (7), `src/pages/api/jobs/score-batch.ts` (4)

---

## §6 Cookbook (TBD — filled in as phases ship)

### Phase 1: Backend API hardening

- TBD — see §3 Phase 1; patterns for CV privacy property test (assert no raw CV text in error response), IDOR cross-user access test (assert 403 on cross-user resource request), rate-limit gate test (assert 429 after threshold)

### Phase 2: Astro API route contract tests

- TBD — see §3 Phase 2; patterns for batch-scoring partial-failure test (mock FastAPI error for one item, verify response shape), response shape contract test (known FastAPI fixture → verify mapped keys), dashboard error-state test (mock 5xx fetch → assert error message renders)

### Phase 3: Cover letter quality gate

- TBD — see §3 Phase 3; patterns for deterministic prompt-structure test (assert job description + CV text present in LLM call inputs), AI-native personalization check (LLM judge: does output reference ≥1 offer requirement and ≥1 CV item?)

---

## §7 Open Items

- R3 ("infinite loading"): Research must verify whether error feedback already exists in `dashboard.astro` before planning — risk may be speculative if error states are already handled. Reframe if needed: "verify error feedback is correct" rather than "add error feedback".
- R7 (rate limit): Research must confirm whether any rate limiting middleware exists in FastAPI or Astro routes. If none exists, Phase 1 becomes "add + test the guard" rather than "test an existing guard".
