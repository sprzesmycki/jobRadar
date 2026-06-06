# Backend API Hardening — Plan Brief

> Full plan: `context/changes/testing-backend-api-hardening/plan.md`
> Research: `context/changes/testing-backend-api-hardening/research.md`

## What & Why

Phase 1 of the test rollout from `context/foundation/test-plan.md`: add three security properties that the backend currently lacks evidence for. R4 (error leakage) and R7 (rate limiting) require small application code fixes before tests can be written; R5 (ownership) only needs tests because the guard already exists.

## Starting Point

The FastAPI backend has 13 integration tests in `backend/tests/test_contracts.py` covering happy paths and a handful of error cases. No custom Pydantic 422 handler exists, no rate limiting is installed, and no test currently exercises the CV path ownership guard or validates error response shape.

## Desired End State

Four new tests pass in `test_contracts.py`: one proves 422 bodies on the cover letter endpoint contain no submitted field values; two prove the CV path guard correctly rejects and permits by ownership; one proves the 4th rapid cover letter request from the same user returns 429.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| R5 scope | Test existing CV path guard only | No GET routes for stored data exist in FastAPI — classical IDOR doesn't apply at this layer | Research |
| R4 handler scope | App-wide `RequestValidationError` handler | Covers all current and future endpoints; per-router handlers aren't supported in FastAPI without route-level wrappers | Plan |
| R7 rate limit threshold | 3 requests per minute per user | Tight enough to block burst abuse, loose enough for legitimate single-session use | Plan |
| R7 key | `user_id` from `request.state` | IP-based limiting would block all users behind NAT; per-user is the correct unit for LLM quota protection | Plan |
| R7 implementation | `slowapi` with in-process `MemoryStorage` | Standard FastAPI pattern, integrates with dependency injection, acceptable for single-worker MVP VPS | Plan |
| Limiter location | `backend/app/core/rate_limit.py` (new module) | Prevents circular import: routes and `main.py` both need the limiter instance | Plan |

## Scope

**In scope:**
- Custom app-wide 422 sanitization handler (strips `input` and `url` from Pydantic error detail)
- CV path ownership guard tests (cross-user 403, same-user passes to storage layer)
- `slowapi` installation and wiring (new dependency, `Limiter` in app state, `RateLimitExceeded` handler)
- `get_current_user` sets `request.state.user_id` for rate limit key extraction
- Cover letter route: rename `request` → `body`, add `request: Request`, add `@limiter.limit("3/minute")`
- Rate limit test with 4 rapid requests asserting 429 on the 4th

**Out of scope:**
- Supabase RLS testing (no DB in test infra)
- Rate limiting on the scoring endpoint
- Redis-backed distributed rate limiting
- Rate limit window reset testing
- Any changes to scoring or CV extraction route behavior

## Architecture / Approach

All three phases extend the existing pytest + TestClient suite. The auth seam (`app.dependency_overrides[get_current_user]`) and mock seam (`monkeypatch.setattr`) are already established — new tests follow the same patterns. The one structural addition is `backend/app/core/rate_limit.py` as a dependency-injection-safe home for the `slowapi` `Limiter` instance.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. R4 — Sanitize 422 responses | Custom handler strips `input` from all 422 bodies; test proves no echo | Handler must preserve `type`/`loc`/`msg` or existing tests may break |
| 2. R5 — Ownership guard tests | Two tests lock in the existing CV path guard | `StorageNotConfiguredError` mock must match the error the service raises, or the 503 assertion will fail |
| 3. R7 — Rate limiting | `slowapi` wired end-to-end; 4th rapid request returns 429 | `request: Request` parameter positioning and rename of `CoverLetterRequest` param are easy to mis-order |

**Prerequisites:** Python/`uv` environment working; `uv run pytest` already green (13 existing tests pass)  
**Estimated effort:** ~1 session; Phase 3 is the largest but still ~30 lines of application code

## Open Risks & Assumptions

- `slowapi`'s in-process `MemoryStorage` resets on server restart. If the VPS is restarted mid-window, rate limit counters reset. Acceptable for MVP.
- `app.services.cover_letter.AsyncOpenAI` is the monkeypatch target for the rate limit test. If the import path changes, the test silently stops mocking and calls the real LLM — watch for this.
- The `_rate_limit_exceeded_handler` from `slowapi` is a private import (underscore prefix). It's stable across minor versions but technically undocumented as public API.

## Success Criteria (Summary)

- `uv run pytest backend/tests/` passes with 17 tests (13 existing + 4 new), no regressions
- 422 response for a type-invalid cover letter request contains no raw submitted text
- 4th rapid cover letter request from the same user returns HTTP 429
