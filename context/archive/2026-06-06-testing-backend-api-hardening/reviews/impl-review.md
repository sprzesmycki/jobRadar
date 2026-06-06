<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Backend API Hardening — Phase 1 Implementation Plan

- **Plan**: context/changes/testing-backend-api-hardening/plan.md
- **Scope**: All phases (1, 2, 3)
- **Date**: 2026-06-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension            | Verdict |
|----------------------|---------|
| Plan Adherence       | PASS    |
| Scope Discipline     | WARNING |
| Safety & Quality     | PASS    |
| Architecture         | PASS    |
| Pattern Consistency  | WARNING |
| Success Criteria     | PASS    |

## Findings

### F1 — Rate limit test vulnerable to test-repeat flakiness

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline / Safety & Quality (test reliability)
- **Location**: backend/tests/test_contracts.py:407
- **Detail**: `test_cover_letter_rate_limit_returns_429` relies on the in-process `MemoryStorage` counter for `"ratelimit-test-user"` being at zero on test start. Currently safe because the user-id is unique to this test. However, if the test is run twice within the same process and minute window (e.g., `pytest --count=2`, a test retry plugin, or re-running a single test without a fresh process), the counter carries over and the second run 429s on request 1 instead of request 4.
- **Fix**: Generate a unique user-id per test run using `uuid.uuid4()` — requires no reset logic and fully eliminates the dependency on counter state.
  - Strength: Zero coupling to slowapi internals; works correctly under any test runner configuration.
  - Tradeoff: User-id is dynamic, but the test never asserts what it is — only that 3 requests succeed and the 4th is throttled.
  - Confidence: HIGH — the counter isolation by user-id is already the mechanism in use; making the id truly unique closes the only remaining gap.
  - Blind spot: None significant.
- **Decision**: FIXED — replaced static "ratelimit-test-user" with uuid.uuid4()-based unique id

### F2 — `get_settings` overridden to itself (semantic oddity)

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/tests/test_contracts.py:448
- **Detail**: `app.dependency_overrides[get_settings] = get_settings` registers the real function as its own override. It works, but looks like a copy-paste error. The `monkeypatch.setenv` + `cache_clear` already ensures the real `get_settings()` picks up the env var — the override is a no-op and can be removed.
- **Fix**: Remove `app.dependency_overrides[get_settings] = get_settings` from the rate-limit test.
- **Decision**: FIXED — removed the self-override line

### F3 — `body` parameter naming inconsistent with sibling routes

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/app/api/routes/cover_letter.py:16
- **Detail**: The body parameter was renamed to `body: CoverLetterRequest` to make room for `request: Request`. Sibling routes `cv.py:17` and `scoring.py:14` still use `request:` for their body parameter. Minor naming inconsistency in the route layer.
- **Fix**: Accept as-is — renaming back to `request` would conflict with the FastAPI `Request` param that slowapi requires. The plan explicitly called for this rename. No action needed.
- **Decision**: PENDING

### F4 — Unplanned `authed_client` fixture change

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: backend/tests/test_contracts.py:26-38
- **Detail**: `authed_client`'s `fake_user` was updated to accept `request: FastAPIRequest` and set `request.state.user_id = "user-123"`. Not mentioned in the plan, but it is a required consequence of Phase 3 Change 4 — without it, all `authed_client` cover-letter tests share the IP-based rate-limit counter (`testclient`) and would exhaust it before the explicit rate-limit test runs. The change is correct and intentional.
- **Fix**: No code change needed. Document as an addendum in the plan or accept silently — the motivation is clear in the commit history.
- **Decision**: SKIPPED — correct and intentional; commit history explains it
