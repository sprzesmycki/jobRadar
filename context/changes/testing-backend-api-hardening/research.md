---
date: 2026-06-06T00:00:00+00:00
researcher: sebastian.przesmycki
git_commit: d39879f8472187645fbdc4aba6e3802310af2fb8
branch: main
repository: sprzesmycki/jobRadar
topic: "Backend API hardening — R4 error leakage, R5 IDOR, R7 rate limiting"
tags: [research, backend, security, fastapi, pytest, testing]
status: complete
last_updated: 2026-06-06
last_updated_by: sebastian.przesmycki
---

# Research: Backend API hardening — R4 error leakage, R5 IDOR, R7 rate limiting

**Date**: 2026-06-06  
**Researcher**: sebastian.przesmycki  
**Git Commit**: d39879f8472187645fbdc4aba6e3802310af2fb8  
**Branch**: main  
**Repository**: sprzesmycki/jobRadar

## Research Question

For Phase 1 of the test plan, three risks need grounding in the actual codebase before a plan can be written:

- **R4**: Does the FastAPI error path expose raw CV text in a validation error response?
- **R5**: Can an authenticated user access another user's CV data, scores, or cover letters via the FastAPI API?
- **R7**: Does any rate limiting exist for the cover letter endpoint? If not, Phase 1 becomes "add + test the guard".

---

## Summary

| Risk | Guard exists? | Finding | Phase 1 action |
|---|---|---|---|
| R4 | Partial | CV extract endpoint is safe (no raw text in request body). Scoring/cover-letter `ProfileInput` fields (text-bearing) have no custom 422 sanitization — Pydantic's default handler echoes `input` | Add custom validation exception handler; write test to confirm |
| R5 | Partial — reframing needed | No GET endpoints for stored data exist in FastAPI (all routes are stateless POST). Existing CV path-prefix ownership check works. The `_user` unused on scoring/cover-letter is a smell but not a practical IDOR on stateless compute | Test that the existing CV path guard works; document `_user` as smell |
| R7 | None | Zero rate limiting: no library, no middleware, no 429 anywhere in backend or frontend | Add rate limiting (recommend `slowapi`), then write test |

---

## Detailed Findings

### R4 — CV error leakage

#### What the CV extract endpoint accepts

`POST /v1/cv/extract` (`backend/app/api/routes/cv.py:16`) accepts only storage metadata — never raw CV text:

```python
class CvExtractionRequest(BaseModel):       # backend/app/schemas/cv.py:12
    cv: CvStorageReference

class CvStorageReference(BaseModel):
    bucket: str = Field(min_length=1)
    path: str = Field(min_length=1)
    content_type: str = "application/pdf"
```

A Pydantic 422 on this endpoint echoes `bucket`, `path`, and `content_type` only — no CV content. The service-layer error handlers (lines 42–77) use hard-coded sanitized messages; the only dynamic part is `str(exc)` on `CvExtractionError` (line 76), which comes from the extraction library, not the CV body.

**Conclusion for CV extract endpoint**: This specific endpoint is safe from Pydantic 422 leakage. The request body never contains raw CV text.

#### Where the real R4 risk lives

The scoring and cover-letter endpoints accept `ProfileInput` (`backend/app/schemas/common.py:19`), which contains CV-derived text:

```python
class ProfileInput(BaseModel):
    summary: str | None = None
    skills: list[str] = Field(default_factory=list)
    experience: list[str] = Field(default_factory=list)   # list of experience strings
    role_hints: list[str] | None = None
```

If a client sends `experience` as a plain string instead of a list (type mismatch), FastAPI's **default Pydantic 422 handler echoes `input`**:

```json
{
  "detail": [
    {
      "type": "list_type",
      "loc": ["body", "profile", "experience"],
      "msg": "Input should be a valid list",
      "input": "<any text the client sent — could be full CV content>"
    }
  ]
}
```

There is **no custom validation exception handler** registered on the app (`backend/app/main.py` — only `CORSMiddleware` is registered). There is **no sanitization** of validation error responses anywhere.

**Conclusion**: R4 test must cover `POST /v1/cover-letter` (and optionally `/v1/jobs/score`) — send a `ProfileInput` with `experience` as a raw string containing simulated CV text, assert that the 422 response body does NOT echo it. This will currently **fail** — the fix is a custom `RequestValidationError` handler that strips `input` fields from the 422 response.

#### Relevant files

- `backend/app/api/routes/cv.py:16–77` — CV extract route, full error handling
- `backend/app/api/routes/cover_letter.py:13–19` — cover letter route (no error sanitization)
- `backend/app/api/routes/scoring.py:13–19` — scoring route (same)
- `backend/app/schemas/cv.py:12–13` — CvExtractionRequest (metadata only)
- `backend/app/schemas/common.py:19–23` — ProfileInput (text-bearing fields)
- `backend/app/schemas/ai.py:6–11` — CoverLetterRequest (wraps ProfileInput)
- `backend/app/main.py` — no custom exception handler, only CORSMiddleware

---

### R5 — IDOR

#### Important reframing: FastAPI has no GET endpoints serving stored data

All FastAPI routes are **stateless POST compute endpoints**. There are no GET endpoints that return a stored user resource by ID:

| Route | Method | Stores data? | Resource ID in request? |
|---|---|---|---|
| `POST /v1/cv/extract` | POST | No (returns computed result) | No (storage path only) |
| `POST /v1/jobs/score` | POST | No (returns computed result) | No |
| `POST /v1/cover-letter` | POST | No (returns computed result) | No |

The test plan's R5 framing ("user A's JWT cannot **retrieve** user B's saved scores, CV data, or cover letters") assumes stored data accessible by resource ID. **That retrieval pattern does not exist on the FastAPI backend.** Stored data access likely happens via Supabase directly from the Astro frontend, protected by Supabase RLS — outside FastAPI's scope.

#### What DOES exist: ownership check on the CV path

`backend/app/api/routes/cv.py:35–40` validates that the storage path prefix matches the requesting user:

```python
parts = PurePosixPath(request.cv.path).parts
if not parts or parts[0] != user.user_id:
    raise HTTPException(status_code=403, detail={"code": "cv_path_forbidden", ...})
```

This guard works correctly. User A with `user_id="user-a"` cannot request path `user-b/cv.pdf`.

#### The `_user` smell on scoring/cover-letter

Both scoring (`backend/app/api/routes/scoring.py:16`) and cover-letter (`backend/app/api/routes/cover_letter.py:16`) routes declare `_user: Annotated[AuthenticatedUser, Depends(get_current_user)]`. The underscore convention signals the parameter is intentionally unused — authentication is enforced but the identity is discarded. Since these are stateless compute endpoints (inputs come in the request body, nothing is fetched from storage), there is no practical IDOR vector. However, this means no per-user audit trail and no foundation for per-user rate limiting.

#### Phase 1 R5 recommendation

Reframe R5 for Phase 1 as: **verify that the existing CV path ownership guard works** — test that user A cannot extract a CV stored under user B's path (assert 403). This is the only ownership check that exists in FastAPI. Document the `_user` smell as a known gap.

Testing "IDOR on stored cover letters/scores" requires Supabase RLS testing — out of scope for Phase 1 (no DB in tests).

#### Relevant files

- `backend/app/api/routes/cv.py:35–40` — path ownership guard (working)
- `backend/app/api/routes/scoring.py:16` — `_user` unused (smell)
- `backend/app/api/routes/cover_letter.py:16` — `_user` unused (smell)
- `backend/app/core/security.py:21–84` — `get_current_user` dependency, JWT → `AuthenticatedUser`

---

### R7 — Rate limiting

**No rate limiting exists anywhere in the codebase.**

Exhaustive search results:

| Search target | Result |
|---|---|
| Python rate limit libraries (slowapi, limits, fastapi-limiter, aiolimiter) | Not installed — not in `backend/pyproject.toml`, not in `uv.lock` |
| HTTP 429 status codes | Not found anywhere in `backend/` |
| `HTTPException(status_code=429` | Not found |
| Request counting via Redis/cache | Not found |
| Middleware beyond CORS | Not found (`backend/app/main.py` has only `CORSMiddleware`) |
| Rate limiting in Astro cover letter route | Not found — `src/pages/api/jobs/cover-letter.ts` has caching on `external_id` but no request counting |

**Phase 1 must add rate limiting before any test can be written for R7.** Recommended approach: `slowapi` (FastAPI-native, integrates via `Depends`, supports per-user key extraction). Alternative: in-memory counter using a dict — simpler but not safe under concurrent workers.

The per-user key for rate limiting should be `user.user_id` from the `get_current_user` dependency — the user identity IS available at the route level even though it's currently unused.

#### Relevant files

- `backend/app/main.py` — app definition, middleware registration
- `backend/app/api/routes/cover_letter.py:13–19` — where rate limiting should be added
- `backend/pyproject.toml` — add `slowapi` dependency here

---

### Existing test suite — patterns for new tests

**Location**: `backend/tests/test_contracts.py`, `backend/tests/test_cv_extraction.py`  
**No conftest.py** — all fixtures are inline in `test_contracts.py`.

#### Key fixtures

```python
# Unauthenticated client
@pytest.fixture
def client() -> Iterator[TestClient]:
    app.dependency_overrides.clear()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

# Authenticated client (user_id = "user-123")
@pytest.fixture
def authed_client() -> Iterator[TestClient]:
    async def fake_user() -> AuthenticatedUser:
        return AuthenticatedUser(
            user_id="user-123",
            email="test@example.com",
            role="authenticated",
            claims={"id": "user-123", "email": "test@example.com"},
        )
    app.dependency_overrides[get_current_user] = fake_user
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
```

#### How auth is mocked

FastAPI dependency override — `app.dependency_overrides[get_current_user] = fake_user`. No real JWT tokens are created. The `AuthenticatedUser` is injected directly.

#### How external services are mocked

`monkeypatch.setattr` on the module path:
- Storage: `monkeypatch.setattr(cv_route, "download_storage_object", fake_fn)`
- LLM (OpenAI): `monkeypatch.setattr("app.services.scoring.AsyncOpenAI", MockAsyncOpenAI)`
- Supabase auth: `monkeypatch.setattr(security, "validate_supabase_token", fake_fn)`

#### Pattern for cross-user IDOR test (R5)

For testing cross-user access, a second user fixture is needed. The simplest approach is a parameterized override within the test itself:

```python
def test_cv_extract_rejects_cross_user_path(client: TestClient) -> None:
    # Override auth to return user-a
    async def user_a() -> AuthenticatedUser:
        return AuthenticatedUser(user_id="user-a", email="a@test.com", role="authenticated", claims={})
    app.dependency_overrides[get_current_user] = user_a
    # Request a path belonging to user-b
    response = client.post("/v1/cv/extract", json={
        "cv": {"bucket": "cvs", "path": "user-b/cv.pdf", "content_type": "application/pdf"}
    })
    app.dependency_overrides.clear()
    assert response.status_code == 403
```

#### Settings override pattern

Tests that need environment variables must override `get_settings` and clear the `@lru_cache`:

```python
app.dependency_overrides[get_settings] = lambda: Settings(SUPABASE_URL="...", ...)
get_settings.cache_clear()
```

#### Relevant files

- `backend/tests/test_contracts.py` — all fixtures, 13 integration tests
- `backend/tests/test_cv_extraction.py` — 3 unit tests, real PDF fixture
- `backend/pyproject.toml` — pytest config (`testpaths = ["tests"]`, `pythonpath = ["."]`)
- `docs/test-fixtures/test-cv-jane-kowalska.pdf` — real CV for extraction tests

---

## Code References

- `backend/app/api/routes/cv.py:16–77` — full CV extract route with error handling
- `backend/app/api/routes/cv.py:35–40` — path ownership guard (the only resource ownership check in FastAPI)
- `backend/app/api/routes/cover_letter.py:13–19` — cover letter route; `_user` unused; no rate limiting
- `backend/app/api/routes/scoring.py:13–19` — scoring route; `_user` unused
- `backend/app/schemas/cv.py:12–13` — CvExtractionRequest (metadata only)
- `backend/app/schemas/common.py:19–23` — ProfileInput (text-bearing fields susceptible to 422 echo)
- `backend/app/schemas/ai.py:6–11` — CoverLetterRequest
- `backend/app/core/security.py:21–84` — `get_current_user` → `AuthenticatedUser`
- `backend/app/main.py` — app, CORSMiddleware only, no rate limiting, no custom exception handlers
- `backend/pyproject.toml` — pytest config, no rate limiting deps
- `backend/tests/test_contracts.py` — fixture patterns, auth override, monkeypatch patterns

---

## Architecture Insights

1. **All FastAPI routes are stateless compute POST endpoints.** No stored-data GET endpoints exist. Data persistence happens via Supabase, accessed directly from the Astro frontend (protected by Supabase RLS, which is outside FastAPI's test surface).

2. **Authentication is enforced everywhere but authorization is only enforced once.** The CV extract route (`cv.py:35–40`) is the only place that validates resource ownership. Scoring and cover-letter routes authenticate the user but discard the identity (`_user`). Since these are stateless, this isn't a practical IDOR — but it means no per-user rate limiting or audit trail is possible without refactoring.

3. **FastAPI's default 422 handler echoes `input` values.** This is Pydantic v2's default behavior. For endpoints accepting `ProfileInput` (which may contain CV-derived text), a malformed request leaks the submitted text. Fix: register a custom `RequestValidationError` handler that strips or omits `input` from the response.

4. **The test suite uses dependency injection override as the auth seam** — not JWT mocks. This is the correct FastAPI testing pattern and is easy to extend for multi-user scenarios.

---

## Historical Context

- No prior change folders exist for rate limiting or IDOR testing.
- `context/foundation/test-plan.md` (created 2026-06-06) is the first formal risk map and source for this phase.

---

## Open Questions

1. **R4 / CvExtractionError**: The `str(exc)` in `cv.py:76` is passed directly to the 422 response. If `CvExtractionError` ever includes extracted PDF text in its message (e.g., from a parsing library exception), that would leak CV content via a service error (not a Pydantic 422). The extraction service (`backend/app/services/cv_extraction.py`) should be reviewed to confirm `CvExtractionError` messages never contain document content.

2. **R5 / Supabase RLS**: Resource-ownership protection for stored data (scores, cover letters) is entirely in Supabase RLS. Phase 1 cannot test this with the current test setup (no DB). A future phase should add a Supabase-connected integration test environment.

3. **R7 / Rate limiting implementation**: `slowapi` is the standard choice for FastAPI. However, it uses in-process state by default — multiple uvicorn workers would have independent counters. For MVP (single worker on VPS), this is acceptable. If the VPS ever scales to multiple workers, a Redis-backed limiter is required. Phase 1 should document this constraint.

4. **R7 / Astro-layer rate limiting**: The cover letter request may also flow through `src/pages/api/jobs/cover-letter.ts` on the Astro side. Rate limiting at the FastAPI layer protects the LLM quota but does not limit Astro-layer compute. If the Astro route were the abuse vector (rather than direct FastAPI calls), the rate limit guard would need to be at the Astro layer as well. Phase 1 scope is FastAPI only — document the gap.
