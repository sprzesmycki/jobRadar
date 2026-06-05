# Plan Brief: CV Upload and Extraction

## Goal

Deliver S-04 as a vertical slice: authenticated user uploads a PDF CV, the file is stored in a private Supabase bucket, FastAPI extracts structured profile data, and the dashboard shows the saved extracted profile.

## Non-Negotiables

- No Supabase service-role key in frontend, Cloudflare Worker public env, or `src/`.
- No raw extracted CV text in logs.
- No raw extracted CV text persisted in Postgres for S-04.
- Private Supabase Storage bucket with RLS scoped to the authenticated user's folder.
- Backend verifies the authenticated user owns the requested storage path before downloading.

## Chosen Approach

Use the existing server-rendered dashboard pattern:

1. Add Supabase migration for `cv_profiles` and private `cvs` bucket policies.
2. Add `src/pages/api/cv/upload.ts` to validate a PDF upload, store it under `<user_id>/...pdf`, call FastAPI `/v1/cv/extract`, and upsert the returned structured profile through the user's Supabase session.
3. Replace the FastAPI `/v1/cv/extract` placeholder with deterministic `pypdf` extraction from Supabase Storage.
4. Render the current CV profile in `src/pages/dashboard.astro`.
5. Verify with Supabase migration push, backend tests, frontend lint/build, and manual upload.

## Main Risks

- Storage RLS mistakes can make upload fail or leak private files.
- Cloudflare Worker request/body limits may affect larger PDFs; S-04 caps PDF size around 5-6 MB.
- Scanned PDFs may not extract text; show a clear failure instead of a fake profile.
- Backend token/path validation must be strict because it uses the service-role key to download private files.
