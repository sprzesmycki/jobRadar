<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: CV Upload and Extraction (S-04)

- **Plan**: context/changes/cv-upload-and-extraction/plan.md
- **Scope**: All Phases (1–3)
- **Date**: 2026-06-05
- **Verdict**: APPROVED (all fixes applied during triage)
- **Findings**: 2 critical 6 warnings 2 observations fixed, 1 observation skipped

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS (after fixes) |
| Architecture | PASS |
| Pattern Consistency | PASS (after F2 fix) |
| Success Criteria | PASS |

## Findings

### F1 — Path traversal bypasses storage ownership check

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/app/api/routes/cv.py:33-38
- **Detail**: `path.startswith(f"{user.user_id}/")` doesn't resolve `..` components. A path like `user-123/../other-user/cv.pdf` passes the check; Supabase Storage resolves `..` and serves another user's file using the service-role key.
- **Fix**: Replaced startswith check with `PurePosixPath(request.cv.path).parts[0] != user.user_id`.
- **Decision**: FIXED

### F2 — Separate getSession() for token creates TOCTOU window

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/cv/upload.ts:106-119
- **Detail**: Sequential `getUser()` then `getSession()` calls — both validate from the same immutable request cookies, but the dual-call pattern was misleading and could theoretically allow stale token use.
- **Fix**: Parallelised both calls with `Promise.all([getUser(), getSession()])` and combined auth gate into a single check.
- **Decision**: FIXED

### F3 — Race condition: concurrent upload orphans old storage file

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/cv/upload.ts:137
- **Detail**: Old storage_path read before new upload. Concurrent same-user uploads could orphan a file.
- **Fix**: Added comment documenting the known race condition.
- **Decision**: FIXED

### F4 — Storage cleanup failure silently swallowed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/cv/upload.ts:182-198
- **Detail**: Error-path `storage.remove()` results not checked; silent failures leave orphaned files.
- **Fix**: Added `console.error` on cleanup failures in all four error paths.
- **Decision**: FIXED

### F5 — Over-broad RuntimeError catch maps all errors to 503

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/app/api/routes/cv.py:42-46
- **Detail**: Any `RuntimeError` from storage.py mapped to 503 `storage_not_configured`.
- **Fix**: Introduced `StorageNotConfiguredError(RuntimeError)` subclass in storage.py; cv.py catches only that.
- **Decision**: FIXED

### F6 — Migration uses DROP TRIGGER instead of CREATE IF NOT EXISTS

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Data safety
- **Location**: supabase/migrations/20260602140000_create_cv_profiles.sql:53
- **Detail**: DROP TRIGGER unconditionally destroys trigger before recreating it.
- **Fix**: Replaced drop + create pair with `CREATE TRIGGER IF NOT EXISTS`.
- **Decision**: FIXED

### F7 — isPdf implied as security boundary, is UX-only

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/cv/upload.ts:128
- **Detail**: `file.type` is browser-supplied and spoofable; real enforcement is Supabase Storage's `allowed_mime_types`.
- **Fix**: Added inline comment clarifying UX-only pre-flight.
- **Decision**: FIXED

### F8 — Auth pattern diverges between upload.ts and preferences.ts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/cv/upload.ts
- **Detail**: Resolved via F2 fix — single Promise.all auth pattern is now clean.
- **Decision**: FIXED via F2

### F9 — Dev hint leaks to production UI

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/lib/cv-profile.ts:37
- **Detail**: Error message contained "Apply the Supabase migration" dev hint.
- **Fix**: Replaced with "Your CV profile could not be loaded."
- **Decision**: FIXED

### F10 — No unit test exercises real pypdf extraction path

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Success Criteria
- **Location**: backend/tests/test_contracts.py:243-289
- **Detail**: Contract tests monkeypatch extraction; pypdf API changes would surface only at runtime.
- **Fix**: Added `tests/test_cv_extraction.py` with 3 tests against real PDF fixture. Also fixed `extract_text()` to catch `PdfStreamError` and re-raise as `CvExtractionError`.
- **Decision**: FIXED
