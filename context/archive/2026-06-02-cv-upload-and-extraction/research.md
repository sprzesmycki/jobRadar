---
date: 2026-06-02T13:55:28+02:00
researcher: Codex
git_commit: f4f6acdad21598b38d857eeff3b479f61c3f41ae
branch: plan/cv-upload-and-extraction
repository: przeprogramowani
topic: "S-04 CV upload and private extraction"
tags: [research, cv, supabase-storage, fastapi, astro]
status: complete
last_updated: 2026-06-02
last_updated_by: Codex
---

# Research: S-04 CV upload and private extraction

**Date**: 2026-06-02T13:55:28+02:00
**Researcher**: Codex
**Git Commit**: f4f6acdad21598b38d857eeff3b479f61c3f41ae
**Branch**: plan/cv-upload-and-extraction
**Repository**: przeprogramowani

## Research Question

How should JobRadar implement roadmap S-04 so a logged-in user can upload a PDF CV, keep it private, extract useful profile data, and display/save that data without breaking the Astro + Supabase + VPS FastAPI architecture?

## Summary

S-04 should be implemented as a vertical slice across the existing dashboard, Supabase, and FastAPI service. The current app already has authenticated server routes, Supabase SSR session handling, a protected `/dashboard`, and a backend placeholder at `POST /v1/cv/extract`. The safest MVP path is:

- upload the PDF from an Astro server route using the logged-in user's Supabase session,
- store the file in a private Supabase Storage bucket under a user-owned path,
- call the FastAPI backend with the user's Supabase access token and the storage reference,
- have the backend validate the token, verify the storage path belongs to that user, download the PDF using the backend-only service-role key, and extract structured data,
- upsert only structured profile data in Postgres through the user's Supabase session,
- render the saved profile in the dashboard.

This keeps service-role credentials on the VPS only and avoids storing raw extracted CV text in Postgres for S-04.

## Detailed Findings

### Product And Privacy Contract

- `context/foundation/prd.md` defines FR-003 as a must-have: the user can upload their CV as a PDF file.
- The PRD guardrail says full CV content must not be public or logged by external services.
- The PRD non-functional requirement says external services must not retain full CV content after a request.
- `context/foundation/tech-stack.md` assigns CV parsing and AI orchestration to the separate FastAPI service on the owner's VPS, not the Cloudflare Worker.
- `context/foundation/infrastructure.md` explicitly calls out CV privacy across Supabase Storage, Cloudflare Worker, and VPS as a high-impact risk.

Implication: S-04 must treat the PDF as sensitive data. The PDF can live in a private Supabase bucket, but the extracted text should not be dumped into logs or broad database fields. Store only structured profile data needed for later scoring.

### Existing Frontend Flow

- `src/pages/dashboard.astro` is the main authenticated work surface. It already loads the current user from `Astro.locals`, creates a Supabase SSR client, fetches preferences/saved jobs, and renders left-column forms plus right-column job cards.
- `src/pages/api/preferences.ts` and `src/pages/api/saved-jobs.ts` show the established form POST pattern: create Supabase SSR client, validate user with `supabase.auth.getUser()`, parse `FormData`, perform a Supabase write, and redirect back to `/dashboard` with status/error query params.
- `src/lib/supabase.ts` creates a server Supabase client from request cookies using `@supabase/ssr`.
- `src/middleware.ts` protects authenticated routes, so S-04 should reuse `/dashboard` or add any new protected route to middleware if a separate page is created.

Implication: a new `src/pages/api/cv/upload.ts` endpoint fits the codebase better than a client-side React uploader for this slice. It also keeps backend URL handling and auth token forwarding server-side.

### Existing Backend Flow

- `backend/app/api/routes/cv.py` already exposes `POST /v1/cv/extract`, but it returns `501 not_implemented`.
- `backend/app/schemas/cv.py` already defines `CvStorageReference` and `CvExtractionRequest` with `{ bucket, path, content_type }`.
- `backend/app/core/security.py` validates a Supabase bearer token by calling Supabase Auth `/auth/v1/user`, then returns an `AuthenticatedUser`.
- `backend/app/core/config.py` already includes `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `ALLOWED_ORIGINS`.
- `backend/tests/test_contracts.py` currently asserts the CV endpoint is a placeholder, so S-04 must replace that test with real extraction behavior and new failure-mode tests.

Implication: F-01 intentionally prepared the exact backend boundary S-04 needs. The endpoint should change from placeholder to a real authenticated extraction endpoint.

### Supabase Storage Evidence

- Supabase Storage buckets are private by default, and private buckets require access control for all operations, including downloads.
- Supabase documents that downloading from private buckets can be done with a user's JWT through SDK download or via a short-lived signed URL.
- Supabase Storage access control uses RLS policies on `storage.objects`; uploads need an `INSERT` policy for the relevant authenticated users.
- Supabase standard uploads are appropriate for small files; docs recommend resumable uploads for files above 6 MB.

Implication: create a private CV bucket with PDF MIME and size limits, plus storage RLS policies scoped to `auth.uid()` path prefixes. For MVP, enforce a frontend/server validation cap around 5-6 MB so standard upload remains reliable.

### PDF Extraction Evidence

- `pypdf` supports programmatic text extraction from PDF pages and is a light dependency suitable for a first deterministic parser.
- PDF text extraction can be imperfect depending on how the PDF encodes text; scanned/image-only PDFs may extract empty or very poor text.
- PyMuPDF is a stronger fallback if layout/text extraction quality becomes a blocker, but it is a heavier dependency.

Implication: use `pypdf` for S-04 to prove the vertical slice. Return a clear `422` for empty/scanned PDFs rather than pretending extraction succeeded.

## Code References

- `src/pages/dashboard.astro` - existing authenticated dashboard, preference form, status messages, and card layout.
- `src/pages/api/preferences.ts` - server form POST pattern for Supabase writes.
- `src/pages/api/saved-jobs.ts` - second example of authenticated form POST plus redirect feedback.
- `src/lib/supabase.ts` - Supabase SSR client factory using request cookies.
- `backend/app/api/routes/cv.py` - current CV extraction placeholder endpoint.
- `backend/app/schemas/cv.py` - existing storage-reference request schema.
- `backend/app/core/security.py` - Supabase bearer-token validation dependency.
- `backend/app/core/config.py` - backend-only service-role key config already exists.
- `backend/tests/test_contracts.py` - tests that must change from placeholder expectations to real extraction expectations.
- `supabase/migrations/20260601100000_create_job_preferences.sql` - established RLS style for user-owned rows.

## Architecture Insights

- The Astro app should own browser/session UX and Supabase user-token writes.
- The FastAPI backend should own PDF parsing and any future AI/CV-heavy logic.
- The service-role key is already backend-only; S-04 should not add it to `src/`, `astro.config.mjs`, `.env.example`, Cloudflare Worker secrets, or client code.
- The backend should not trust only the storage path sent by the frontend. It must compare the authenticated Supabase user id to the first path segment before downloading.
- Storing raw extracted CV text is not required for S-04 and would create avoidable privacy risk. Store structured fields and retain the private PDF for future re-extraction.

## Historical Context

- `context/archive/2026-06-02-python-cv-ai-service-foundation/plan.md` created the FastAPI service and placeholder contract specifically to unlock S-04, S-05, and S-06.
- `context/foundation/lessons.md` requires every slice to have `change.md`, `plan.md`, and `plan-brief.md` before moving operationally.
- Previous slices use dashboard-first vertical delivery instead of isolated backend-only work, so S-04 should show user-visible extracted data before it is considered complete.

## Related Research

- `context/foundation/prd.md`
- `context/foundation/tech-stack.md`
- `context/foundation/infrastructure.md`
- `context/archive/2026-06-02-python-cv-ai-service-foundation/research.md`
- Supabase Storage bucket fundamentals: https://supabase.com/docs/guides/storage/buckets/fundamentals
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- Supabase standard uploads: https://supabase.com/docs/guides/storage/uploads/standard-uploads
- pypdf text extraction docs: https://pypdf.readthedocs.io/en/3.17.4/user/extract-text.html

## Open Questions

- Should S-04 display extracted profile data only on `/dashboard`, or should a dedicated profile/CV page be added later? Recommendation: dashboard only for S-04, dedicated page later if the CV profile grows.
- How much profile detail is needed for S-05 scoring? Recommendation: skills, role/title hints, links, contact email, and short experience highlights are enough for the first scoring plan.
- Should the original PDF be replace-only or versioned? Recommendation: replace-only active CV for MVP, with storage path including a timestamp so old files can be deleted during upload replacement.
