# Backend API Hardening — Phase 1 Implementation Plan

## Overview

Extend the existing `backend/tests/test_contracts.py` suite with three security properties: strip `input` from Pydantic 422 responses to prevent CV-derived text leakage (R4), lock in the existing CV path ownership guard with tests (R5), and add per-user rate limiting to the cover letter endpoint and verify it returns 429 (R7).

Phases 1 and 2 are independent and can be done in either order. Phase 3 adds a new library (`slowapi`) and requires three application code changes before the test can be written.

## Current State Analysis

- `POST /v1/cv/extract` (`backend/app/api/routes/cv.py:16`) — safe from Pydantic 422 leakage; request body contains only storage metadata. Ownership guard at `cv.py:35–40` already works: path must start with `user.user_id`.
- `POST /v1/cover-letter` and `POST /v1/jobs/score` — accept `ProfileInput.experience: list[str]` which can contain CV-derived text. FastAPI's default Pydantic handler echoes `input` in 422 responses. No custom `RequestValidationError` handler exists.
- `backend/app/main.py` — registers only `CORSMiddleware`. No rate limiting, no custom exception handlers.
- `slowapi` — not installed. Not in `backend/pyproject.toml` or `uv.lock`.
- Test suite — `backend/tests/test_contracts.py` has 13 tests. Auth seam: `app.dependency_overrides[get_current_user]`. External mocks via `monkeypatch.setattr`. No `conftest.py`.

## Desired End State

Three new test assertions pass in `backend/tests/test_contracts.py`:
1. A type-invalid `ProfileInput` request to `/v1/cover-letter` returns 422 with no `input` field in the error body — simulated CV text is not echoed back.
2. A request to `/v1/cv/extract` with another user's storage path returns 403 with code `cv_path_forbidden`. A request with the same user's path passes the guard and reaches the storage layer.
3. Four rapid cover letter requests from the same user return 200, 200, 200, 429 in that order.

### Key Discoveries

- `backend/app/schemas/common.py:19` — `ProfileInput.experience: list[str]` is the R4 exposure surface; no type constraints prevent echoing via 422 `input` field.
- `backend/app/api/routes/cv.py:35–40` — the only resource ownership check in the FastAPI backend; already correct.
- `backend/app/api/routes/cover_letter.py:16` — `_user: Annotated[AuthenticatedUser, Depends(get_current_user)]` is declared but the identity is discarded; must be used to set request state for slowapi key extraction.
- `backend/app/core/security.py:21–84` — `get_current_user` does not currently take `Request`; needs it to set `request.state.user_id`.

## What We're NOT Doing

- Not testing Supabase RLS — no GET routes for stored data exist in FastAPI; classical IDOR does not apply at this layer.
- Not applying rate limiting to the scoring endpoint — only the cover letter endpoint is in Phase 1 scope.
- Not implementing Redis-backed rate limiting — in-process `MemoryStorage` is acceptable for MVP single-worker VPS deployment.
- Not exposing `input` values selectively per endpoint — app-wide 422 sanitization is simpler and correct.
- Not modifying the API contract — the 422 response still returns `type`, `loc`, and `msg`; only `input` and `url` (Pydantic docs link) are stripped.

## Implementation Approach

Three self-contained phases. Each phase delivers a passing `uv run pytest` state. Phase 3 wires a new dependency through three files before adding the test; the other two phases are smaller.

## Critical Implementation Details

**slowapi `Request` parameter positioning**: `@limiter.limit("3/minute")` requires `request: Request` to be a positional (not keyword-only) parameter in the route function. Because `cover_letter.py` already uses `request` as the name for `CoverLetterRequest`, that parameter must be renamed to `body` before adding the `Request` parameter. The function call inside the route body must also be updated: `body.job`, `body.profile`.

**Decorator ordering for slowapi + FastAPI router**: The decorator closest to the function is `@limiter.limit(...)` and the outer decorator is `@router.post(...)`. This is the documented slowapi pattern; reversing it silently disables rate limiting.

**Circular import prevention**: `limiter` must live in `backend/app/core/rate_limit.py`, not in `main.py`. Routes import from `core.rate_limit`; `main.py` also imports from `core.rate_limit`. If `limiter` lived in `main.py`, routes importing it would create a circular dependency.

---

## Phase 1: R4 — Sanitize Pydantic 422 responses

### Overview

Register an app-wide `RequestValidationError` handler in `main.py` that strips `input` (and `url`) from every Pydantic validation error entry. Write one test that proves no submitted field value is echoed in a 422 body.

### Changes Required

#### 1. Custom validation exception handler

**File**: `backend/app/main.py`

**Intent**: Register a `RequestValidationError` handler on the app instance so that Pydantic's default behavior of echoing the submitted value in `input` is replaced with a sanitized response. This is the single point that covers all current and future endpoints.

**Contract**: Import `RequestValidationError` from `fastapi.exceptions`. Import `Request` from `fastapi` and `JSONResponse` from `fastapi.responses`. Decorate with `@app.exception_handler(RequestValidationError)`. Return status 422 with `{"detail": [...]}` where each entry keeps `type`, `loc`, and `msg` but omits `input` and `url`.

```python
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [
        {k: v for k, v in err.items() if k not in {"input", "url"}}
        for err in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": errors})
```

#### 2. Test: 422 body contains no input echo

**File**: `backend/tests/test_contracts.py`

**Intent**: Send a type-invalid `ProfileInput` to `/v1/cover-letter` and assert the 422 response body does not contain the submitted text.

**Contract**: Use the existing `authed_client` fixture. POST with a valid `JobInput` and `profile.experience` set to a plain string (not a list). Assert `response.status_code == 422`, assert no `"input"` key appears in any `detail` entry, and assert the literal submitted string is absent from `response.text`.

Minimum request body — the `job` object satisfies all `min_length=1` constraints:
```json
{
  "job": {"external_id": "j1", "source": "test", "title": "Dev", "company": "Acme"},
  "profile": {"experience": "cv text that must not appear in response"}
}
```

### Success Criteria

#### Automated Verification

- `uv run pytest backend/tests/test_contracts.py -k test_cover_letter_422_does_not_echo_input` passes
- `uv run pytest backend/tests/` passes with no regressions across all 13 existing tests
- `uv run ruff check .` (backend) passes

#### Manual Verification

- No manual steps required for this phase.

**Implementation Note**: After all automated verification passes, proceed to Phase 2 without a manual pause.

---

## Phase 2: R5 — Lock in the CV path ownership guard

### Overview

Tests only. Two tests verify `cv.py:35–40`: cross-user path returns 403, same-user path passes the guard and reaches the storage layer. No application code changes.

### Changes Required

#### 1. Test: cross-user path rejected

**File**: `backend/tests/test_contracts.py`

**Intent**: Prove that an authenticated user cannot request extraction of a CV stored under another user's storage path.

**Contract**: In the test body, override `app.dependency_overrides[get_current_user]` to return `AuthenticatedUser(user_id="user-a", email="a@test.com", role="authenticated", claims={})`. Use a bare `TestClient(app)` (or the `client` fixture) — do not use `authed_client` since a custom user_id is needed. POST to `/v1/cv/extract` with `{"cv": {"bucket": "cvs", "path": "user-b/cv.pdf", "content_type": "application/pdf"}}`. Clear `app.dependency_overrides` in a `finally` block. Assert `response.status_code == 403` and `response.json()["detail"]["code"] == "cv_path_forbidden"`.

#### 2. Test: same-user path passes ownership check

**File**: `backend/tests/test_contracts.py`

**Intent**: Prove that the ownership check does not block a legitimate request from the resource owner. The request should proceed past the guard and reach the storage layer.

**Contract**: Same user_id override as test 1 (`user-a`). Use `monkeypatch.setattr(cv_route, "download_storage_object", ...)` where the fake raises `StorageNotConfiguredError("test")` — this is the deterministic storage error already used in existing tests. POST with `cv.path = "user-a/cv.pdf"`. Assert `response.status_code == 503` — the request reached the storage layer, meaning the ownership check passed.

### Success Criteria

#### Automated Verification

- `uv run pytest backend/tests/test_contracts.py -k cv_extract` passes (both new tests and all pre-existing CV tests)
- `uv run pytest backend/tests/` passes

#### Manual Verification

- No manual steps required for this phase.

**Implementation Note**: After all automated verification passes, proceed to Phase 3 without a manual pause.

---

## Phase 3: R7 — Add and test cover letter rate limiting

### Overview

Install `slowapi`, create a shared `Limiter` instance using `user_id` as the rate limit key, wire it to the FastAPI app, inject `user_id` into request state from `get_current_user`, and decorate the cover letter route at `3/minute`. Write a test that exhausts the limit and asserts the 4th request returns 429.

### Changes Required

#### 1. slowapi dependency

**File**: `backend/pyproject.toml`

**Intent**: Add `slowapi` as a runtime dependency and regenerate the lockfile.

**Contract**: Add `"slowapi>=0.0.7"` to `[project.dependencies]`. Run `uv add slowapi` (which updates both `pyproject.toml` and `uv.lock`) rather than editing the file manually.

#### 2. Rate limiter module

**File**: `backend/app/core/rate_limit.py` (new file)

**Intent**: Define the `Limiter` singleton in a module that has no FastAPI app dependency, so both `main.py` and route files can import from it without circular dependencies.

**Contract**: Define `get_user_id_key(request: Request) -> str` returning `getattr(request.state, "user_id", get_remote_address(request))`. The fallback to IP prevents `AttributeError` on unauthenticated or unanticipated requests. Instantiate `limiter = Limiter(key_func=get_user_id_key)`.

```python
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

def get_user_id_key(request: Request) -> str:
    return getattr(request.state, "user_id", get_remote_address(request))

limiter = Limiter(key_func=get_user_id_key)
```

#### 3. Wire limiter to app

**File**: `backend/app/main.py`

**Intent**: Attach the limiter to `app.state` (required by slowapi middleware) and register the `RateLimitExceeded` handler so throttled requests return 429 rather than an unhandled 500.

**Contract**: Import `limiter` from `app.core.rate_limit`. After `app = FastAPI(...)`, assign `app.state.limiter = limiter`. Import `RateLimitExceeded` from `slowapi.errors` and `_rate_limit_exceeded_handler` from `slowapi`; register with `app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)`.

#### 4. Inject user_id into request state

**File**: `backend/app/core/security.py` (`get_current_user` function)

**Intent**: Set `request.state.user_id` so the slowapi key function can read it without decoding the JWT a second time.

**Contract**: Add `request: Request` as the first parameter of `get_current_user`. After resolving `AuthenticatedUser`, add `request.state.user_id = user.user_id` before the return. Existing behavior (header extraction, Supabase token validation, claims parsing) is unchanged.

#### 5. Apply rate limit decorator to cover letter route

**File**: `backend/app/api/routes/cover_letter.py`

**Intent**: Enforce `3/minute` per user on the cover letter generation endpoint.

**Contract**: Import `limiter` from `app.core.rate_limit`. Import `Request` from `fastapi`. Rename the existing `request: CoverLetterRequest` parameter to `body: CoverLetterRequest`. Add `request: Request` as the first positional parameter. Apply `@limiter.limit("3/minute")` between `@router.post(...)` (outer) and the function definition (inner). Update the function body to reference `body.job` and `body.profile`.

```python
@router.post("", response_model=CoverLetterResponse, status_code=200)
@limiter.limit("3/minute")
async def cover_letter(
    request: Request,
    body: CoverLetterRequest,
    _user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CoverLetterResponse:
    return await generate_cover_letter(body.job, body.profile, settings)
```

#### 6. Test: rate limit enforced after threshold

**File**: `backend/tests/test_contracts.py`

**Intent**: Prove that the 4th cover letter request from the same user within a minute returns 429.

**Contract**:
- Create an inline auth fixture with `user_id="ratelimit-test-user"` (distinct from `"user-123"` to avoid counter interference from other tests). The unique user_id provides natural isolation since slowapi's in-memory counters are keyed per user.
- Mock the LLM via `monkeypatch.setattr("app.services.cover_letter.AsyncOpenAI", MockAsyncOpenAI)` — same pattern as the existing `test_cover_letter_returns_content_on_success` test.
- Also override `get_settings` to supply test API credentials (same pattern as existing cover letter test).
- Send 3 POST requests to `/v1/cover-letter` with a valid body; assert each returns 200.
- Send a 4th request; assert `response.status_code == 429`.

### Success Criteria

#### Automated Verification

- `uv run pytest backend/tests/test_contracts.py -k rate_limit` passes
- `uv run pytest backend/tests/` passes with no regressions
- `uv run ruff check .` (backend) passes

#### Manual Verification

- Start the FastAPI server locally: `uv run uvicorn app.main:app --reload`
- Make 3 authenticated requests to `POST /v1/cover-letter`; all succeed
- Make a 4th request within 60 seconds; response is 429

**Implementation Note**: After automated verification passes, perform the manual verification step before marking Phase 3 complete.

---

## Testing Strategy

### New tests (all in `backend/tests/test_contracts.py`)

- `test_cover_letter_422_does_not_echo_input` — R4: type-invalid ProfileInput, assert no `input` in 422 body
- `test_cv_extract_rejects_cross_user_path` — R5: cross-user path, assert 403 + `cv_path_forbidden` code
- `test_cv_extract_accepts_own_path` — R5: same-user path, assert 503 (guard passed, storage layer hit)
- `test_cover_letter_rate_limit_returns_429` — R7: 4th rapid request from same user, assert 429

### Regression guard

The full `uv run pytest backend/tests/` run must pass after each phase. The 13 existing tests cover CV extraction, job scoring, cover letter, health, auth, and CORS — these are the regression surface.

### Edge cases not tested in Phase 1

- Rate limit window reset after 60 seconds (requires `time.sleep` or fake clock — out of scope for MVP)
- Rate limit on different users independently (corollary of unique key per user — implicit in test isolation)
- 422 sanitization on the scoring endpoint (same handler covers it; no separate test added)

## Migration Notes

None. No database changes, no schema migrations, no breaking API contract changes (422 response shape still valid; `input` field was always informational).

## References

- Research: `context/changes/testing-backend-api-hardening/research.md`
- Test suite patterns: `backend/tests/test_contracts.py`
- CV ownership guard: `backend/app/api/routes/cv.py:35–40`
- ProfileInput exposure surface: `backend/app/schemas/common.py:19–23`
- App entry point: `backend/app/main.py`
- slowapi docs: https://slowapi.readthedocs.io/en/latest/

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: R4 — Sanitize Pydantic 422 responses

#### Automated

- [x] 1.1 `uv run pytest -k test_cover_letter_422_does_not_echo_input` passes — ed155d4
- [x] 1.2 `uv run pytest backend/tests/` passes (no regressions) — ed155d4
- [x] 1.3 `uv run ruff check .` passes — ed155d4

### Phase 2: R5 — Lock in the CV path ownership guard

#### Automated

- [x] 2.1 `uv run pytest -k cv_extract` passes (new + existing CV tests)
- [x] 2.2 `uv run pytest backend/tests/` passes

### Phase 3: R7 — Add and test cover letter rate limiting

#### Automated

- [ ] 3.1 `uv run pytest -k rate_limit` passes
- [ ] 3.2 `uv run pytest backend/tests/` passes (no regressions)
- [ ] 3.3 `uv run ruff check .` passes

#### Manual

- [ ] 3.4 Local server: 3 requests succeed, 4th returns 429 within the same minute
