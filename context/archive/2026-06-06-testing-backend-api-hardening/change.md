---
change_id: testing-backend-api-hardening
title: Phase 1 backend API hardening — error leakage, IDOR, and rate-limit tests
status: archived
created: 2026-06-06
updated: 2026-06-06
archived_at: 2026-06-06T21:21:54Z
---

## Notes

Rollout Phase 1 from context/foundation/test-plan.md: "Backend API hardening".
Risks covered: R4 (CV data leakage via error responses), R5 (IDOR — cross-user resource access), R7 (rate-limit abuse on cover letter endpoint).
Test types planned: backend integration tests using pytest + FastAPI TestClient (extends existing backend/tests/ suite, zero new infrastructure needed).
Risk response intent:
- R4: Prove that a malformed/invalid CV upload request returns an error response body containing no raw CV text. Must challenge: "we handle errors properly" — Pydantic validation errors may echo request body. Avoid: testing only the success path.
- R5: Prove that user A's JWT cannot retrieve user B's CV data, scores, or cover letters via direct API call. Must challenge: "authenticated = authorized" — resource-ownership validation is untested. Avoid: testing only unauthenticated rejection; never test cross-user access.
- R7: Prove that repeated cover letter requests from the same user return 429 after a threshold. Must challenge: "users won't abuse it". Note: research must first confirm whether rate limiting exists — if not, Phase 1 becomes "add + test the guard".
