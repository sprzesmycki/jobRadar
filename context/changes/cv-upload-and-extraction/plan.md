# Implementation Plan: CV Upload and Extraction

## Summary

Implement roadmap S-04 as the first CV intelligence vertical slice. A logged-in user can upload a PDF CV from the dashboard, the app stores it in private Supabase Storage, the VPS FastAPI service extracts structured profile data from the PDF, and the dashboard shows the saved extracted profile.

This slice intentionally does not add AI scoring or cover-letter generation. It creates the private CV data foundation that S-05 can consume.

## Current State

- S-01, S-02, S-03, and F-01 are merged and archived.
- `/dashboard` is authenticated and already uses Supabase SSR plus form POST endpoints for preferences and saved jobs.
- Supabase migrations currently cover `job_preferences` and `saved_jobs`; there is no CV table or Storage bucket policy yet.
- FastAPI backend is deployed on the VPS and publicly verified under `https://sprzesmycki.dev/jobradar/api`.
- Backend route `POST /v1/cv/extract` exists but still returns `501 not_implemented`.
- Backend config already has `SUPABASE_SERVICE_ROLE_KEY`, but frontend config does not and must not.

## Design Decisions

### 1. Vertical Slice Boundary

S-04 is complete only when the user-visible flow works end to end:

1. User opens `/dashboard`.
2. User selects a PDF CV and submits.
3. Astro validates auth, file type, and file size.
4. Astro uploads the file to private Supabase Storage.
5. Astro forwards the user's Supabase access token and storage reference to FastAPI.
6. FastAPI validates the token, checks storage path ownership, downloads the PDF with backend-only service-role credentials, extracts structured data, and returns it.
7. Astro upserts the structured profile in `cv_profiles`.
8. Dashboard reloads and shows extracted profile data.

### 2. Data Model

Add migration `supabase/migrations/<timestamp>_create_cv_profiles.sql`:

- private Storage bucket:
  - bucket id: `cvs`
  - public: `false`
  - allowed MIME type: `application/pdf`
  - file size limit: around `6 MB`
- `public.cv_profiles` table:
  - `user_id uuid primary key references auth.users(id) on delete cascade`
  - `storage_bucket text not null default 'cvs'`
  - `storage_path text not null`
  - `file_name text not null`
  - `file_size integer not null`
  - `content_type text not null default 'application/pdf'`
  - `full_name text`
  - `email text`
  - `phone text`
  - `links text[] not null default '{}'`
  - `skills text[] not null default '{}'`
  - `role_hints text[] not null default '{}'`
  - `experience_highlights text[] not null default '{}'`
  - `extracted_at timestamptz not null default now()`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`

RLS:

- `cv_profiles`: select/insert/update/delete only where `auth.uid() = user_id`.
- `storage.objects`: authenticated users can insert/select/update/delete only objects in bucket `cvs` where the first path segment equals `auth.uid()::text`.

Do not add a raw text column in S-04. The private PDF remains the source of truth for future re-extraction.

### 3. Frontend / Astro

Add:

- `src/lib/cv-profile.ts`
  - `getCvProfile(supabase, userId)`
  - structured type for profile rows
- `src/pages/api/cv/upload.ts`
  - follows the existing `preferences.ts` and `saved-jobs.ts` route pattern
  - validates logged-in user with `supabase.auth.getUser()`
  - obtains current session access token for backend call
  - validates `File` instance, `application/pdf`, `.pdf` name fallback, and size cap
  - uploads to `cvs/<user.id>/<timestamp>-<safe-name>.pdf`
  - calls `${BACKEND_API_URL}/v1/cv/extract` with bearer token and JSON `{ cv: { bucket, path, content_type } }`
  - upserts returned structured profile into `cv_profiles`
  - redirects to `/dashboard?saved=cv` or `/dashboard?error=...`

Update:

- `astro.config.mjs`
  - add server-secret `BACKEND_API_URL`
- `.env.example`
  - add placeholder `BACKEND_API_URL=https://sprzesmycki.dev/jobradar/api`
- `src/pages/dashboard.astro`
  - fetch current CV profile
  - add a compact CV upload/profile panel in the existing sidebar
  - show extracted skills/links/highlights if present
  - show clear empty/error states

### 4. Backend / FastAPI

Replace the placeholder in `backend/app/api/routes/cv.py`:

- request model remains storage-reference based
- response model becomes a structured extraction response:
  - `full_name`
  - `email`
  - `phone`
  - `links`
  - `skills`
  - `role_hints`
  - `experience_highlights`
  - `page_count`
  - `text_character_count`
- reject unsupported bucket/content type
- require `cv.path` to start with `<authenticated_user.user_id>/`
- require `SUPABASE_SERVICE_ROLE_KEY` to be configured
- download from Supabase Storage using backend-only service-role authorization
- parse PDF with `pypdf`
- return `422` if no useful text is extracted
- never log raw extracted text or file bytes

Add backend helper modules as needed, likely:

- `backend/app/services/storage.py`
- `backend/app/services/cv_extraction.py`

### 5. Extraction Strategy

Use deterministic extraction for S-04:

- `pypdf` extracts page text.
- Normalize whitespace and cap in-memory text handling to a reasonable bound.
- Extract emails, phone-like strings, and links with conservative regexes.
- Extract skills from a curated technical keyword list aligned with the offer sources and preferences.
- Derive role hints from common title keywords.
- Derive experience highlights from short text snippets containing role/project/technology signals.

This is not the final scoring model. The goal is a useful structured profile that S-05 can use or improve.

### 6. Error Handling

Frontend redirect messages:

- missing Supabase config -> existing style
- no file -> "Choose a PDF CV first."
- wrong file type -> "CV must be a PDF file."
- too large -> "CV must be 6 MB or smaller."
- backend unavailable -> "CV extraction service is unavailable."
- empty/scanned PDF -> "Could not extract text from this PDF. Try a text-based CV PDF."

Backend error codes:

- `401` auth errors from existing dependency
- `403` storage path does not belong to user
- `415` unsupported content type
- `422` no extractable text
- `503` Supabase service-role/download config missing

### 7. Security And Privacy

- Service-role key remains only in backend env.
- Frontend calls backend with the user's Supabase access token, not service credentials.
- Backend uses service-role only after user token validation and path ownership verification.
- Storage bucket is private and path-scoped by RLS.
- Database stores structured profile only, not raw extracted text.
- No raw CV text in tests, logs, frontend errors, or context docs.

## Files To Change

- `supabase/migrations/<timestamp>_create_cv_profiles.sql`
- `astro.config.mjs`
- `.env.example`
- `src/lib/cv-profile.ts`
- `src/pages/api/cv/upload.ts`
- `src/pages/dashboard.astro`
- `backend/pyproject.toml`
- `backend/app/schemas/cv.py`
- `backend/app/api/routes/cv.py`
- `backend/app/services/storage.py`
- `backend/app/services/cv_extraction.py`
- `backend/tests/test_contracts.py`
- possibly `backend/README.md` for the new env/endpoint note

## Verification Commands

Local code gates:

- `npm run lint`
- `npm run build`
- `cd backend && uv run pytest`
- `cd backend && uv run ruff check .`
- `rg -n "SUPABASE_SERVICE_ROLE_KEY|service_role" src astro.config.mjs .env.example`

Supabase/manual gates:

- `npx supabase db push`
- verify private bucket `cvs` exists
- upload a text-based PDF through `/dashboard`
- confirm `cv_profiles` row is visible only for the logged-in user
- confirm Supabase Storage object path starts with the logged-in user id

Backend deployment gates after merge:

- rebuild backend container on VPS
- verify `/jobradar/api/healthz`
- upload a PDF in production dashboard
- confirm backend logs do not include raw CV text

## Risks

- Supabase Storage RLS can fail subtly if bucket policies are too broad or path parsing is wrong.
- Cloudflare Worker body limits and runtime behavior can affect multipart uploads; the MVP size cap keeps this within normal PDF CV size.
- Scanned PDFs may not extract text with `pypdf`.
- Deterministic skill extraction may miss synonyms, but S-05 can improve this after the vertical slice exists.
- If `BACKEND_API_URL` is missing in Cloudflare secrets, upload will fail after storage upload; implementation should either delete the uploaded object on backend failure or clearly report the failure.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Supabase CV Storage And Profile Schema

#### Automated

- [x] 1.1 Migration creates private `cvs` bucket with PDF and size restrictions
- [x] 1.2 Migration creates `cv_profiles` with user-owned RLS
- [x] 1.3 Migration creates Storage RLS policies scoped to `<auth.uid()>/...`

#### Manual

- [x] 1.4 Owner runs `npx supabase db push`
- [x] 1.5 Supabase dashboard confirms bucket is private

### Phase 2: Backend Extraction Endpoint

#### Automated

- [x] 2.1 `/v1/cv/extract` no longer returns placeholder 501
- [x] 2.2 Endpoint rejects missing auth, wrong bucket/content type, and foreign storage paths
- [x] 2.3 Endpoint downloads private PDF using backend-only service-role config
- [x] 2.4 Endpoint extracts structured profile data with `pypdf`
- [x] 2.5 Backend tests pass
- [x] 2.6 Ruff check passes

#### Manual

- [x] 2.7 Backend logs checked for absence of raw CV text

### Phase 3: Astro Upload And Dashboard UI

#### Automated

- [x] 3.1 `BACKEND_API_URL` server env is configured in Astro
- [x] 3.2 `/api/cv/upload` validates file/auth, uploads to Supabase Storage, calls backend, and upserts profile
- [x] 3.3 Dashboard renders upload form and extracted profile summary
- [x] 3.4 `npm run lint` passes
- [x] 3.5 `npm run build` passes
- [x] 3.6 Grep check confirms service-role key stays out of frontend

#### Manual

- [x] 3.7 Local dashboard upload with text-based PDF succeeds
- [x] 3.8 Mobile and desktop dashboard layout remain acceptable

### Phase 4: Production Rollout

#### Automated

- [ ] 4.1 Branch pushed and merged after verification

#### Manual

- [ ] 4.2 Owner sets Cloudflare `BACKEND_API_URL` if missing
- [ ] 4.3 Owner rebuilds backend container on VPS after merge
- [ ] 4.4 Production dashboard upload succeeds
- [ ] 4.5 S-04 archived with roadmap status updated to `done`
