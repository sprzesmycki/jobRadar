# Cover Letter Generation — Plan Brief

> Full plan: `context/changes/cover-letter-generation/plan.md`

## What & Why

Implement S-06: users can generate a personalized cover letter for any job offer by clicking a single button on the job card. The backend stub at `POST /v1/cover-letter` (returning 501) gets replaced with a real z.ai GLM service, and generated letters are cached per user+job so repeat views are instant.

## Starting Point

A `cover_letter.py` route stub already exists and is registered in `main.py`. The `CoverLetterRequest` schema (job + profile + tone + language) is already defined. The scoring service (`scoring.py`) and its Astro counterpart (`score-batch.ts`) provide the exact patterns to clone — z.ai JWT auth, caching, and frontend async update logic are all established.

## Desired End State

User clicks "Cover letter" on a job card. A panel opens inline below the card, shows "Generating…" for a few seconds, then displays the full cover letter text with a "Copy" button. The same letter loads instantly on subsequent clicks. Re-uploading a CV clears cached letters so the next click regenerates.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| UI display surface | Inline panel (like scoring detail) | Matches existing pattern, zero new component needed | Plan |
| Caching | `cover_letters` DB table per user+job | Avoids re-billing z.ai on every view; mirrors `job_scores` pattern | Plan |
| CV data sent to AI | skills + experience + full_name + role_hints | Name and career direction make letters less generic | Plan |
| No description (JustJoinIT) | Graceful degradation — generate from title + technologies | Consistent with scoring behavior, no broken buttons | Plan |
| Tone / language | Hardcode professional / en (schema supports it) | No UI needed for MVP; schema is future-ready | Plan |

## Scope

**In scope:** Backend service + route, `cover_letters` cache table, Astro API endpoint, dashboard button + inline panel + copy button, cache invalidation on CV re-upload.

**Out of scope:** Regenerate button, tone/language selector, cover letter editing, SSR pre-load of cached letters, multi-language output.

## Architecture / Approach

Standard 4-layer pattern matching scoring: FastAPI service calls z.ai → Astro API caches in Supabase → dashboard fetches on demand → inline panel renders. The cover letter service clones `scoring.py` structure but returns plain prose at `temperature=0.7` instead of JSON at `temperature=0.2`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Backend service | 501 stub replaced; z.ai generates real letters | z.ai plain-text response format differs from scoring JSON — need to handle no-fence/fence variants |
| 2. DB cache | `cover_letters` table + CV-upload invalidation | Migration must land before Phase 3 deploys |
| 3. Astro API | `/api/jobs/cover-letter` endpoint with cache | Auth edge case: bearer token must call `setSession()` for RLS |
| 4. Dashboard UI | Button + panel + copy + async JS | Long text in narrow card — needs scrollable pre block |

**Prerequisites:** Phase 1 backend deployed and accessible; Phase 2 migration applied to Supabase before Phase 3 goes live.
**Estimated effort:** ~2–3 sessions across 4 phases.

## Open Risks & Assumptions

- z.ai may wrap plain-text responses in markdown fences — service must strip them.
- JustJoinIT jobs have no description; quality degrades but generation still completes.
- Cover letters can be ~500 words; the inline panel needs to handle long text without breaking the card layout.

## Success Criteria (Summary)

- Clicking "Cover letter" on any job card (with CV uploaded) returns a personalized letter in ≤30s.
- Second click loads the cached letter instantly (no backend call).
- Re-uploading CV clears cached letters so the next generation reflects the updated profile.
