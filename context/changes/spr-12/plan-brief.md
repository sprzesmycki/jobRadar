# Saved Offers List — Plan Brief

> Full plan: `context/changes/spr-12/plan.md`

## What & Why

Add a dedicated `/saved` page so the user can view all saved offers in one place, track their application status, and remove entries they no longer need. This closes the saved-job loop started in S-01 — without this view, the "save a job" action (FR-009) has no payoff (FR-010 requires it as must-have).

## Starting Point

The `saved_jobs` table is fully in place with all needed columns (title, company, source, url, status, created_at). The dashboard already saves jobs and shows a count stat, but there is no dedicated list view and the existing `getSavedJobs()` function only fetches three fields.

## Desired End State

`/saved` is a protected page linked from the dashboard header and the "Saved jobs" stat card. The user sees all saved offers sorted newest-first, can filter by status tab, update any offer's status inline, and remove entries via an inline confirm toggle.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Page location | New `/saved` route | Keeps the dashboard focused on the live feed; FR-010 reads better as a standalone page than a tab. |
| Status update mechanism | Reuse `POST /api/saved-jobs` with `redirect_to` field | Zero new endpoint work; the upsert logic is already correct. |
| Delete mechanism | New `POST /api/saved-jobs/remove` endpoint | HTML forms cannot issue DELETE; a dedicated POST endpoint is the clean solution. |
| Delete confirmation UX | `<details>/<summary>` inline confirm | No React island, no JS — CSS-only toggle that prevents accidental deletes. |
| Scores in the list | Yes, via second `getJobScores()` query | Reuses existing function; two sequential queries is the established dashboard pattern. |
| Default sort | Newest first (`created_at DESC`) | Most recently saved offer is top of mind; no extra UI needed. |
| Filter tabs | All / Interested / Applied / Rejected via `?status=` URL param | Server-side filter keeps the page fully server-rendered; no client state. |

## Scope

**In scope:**
- New `getSavedJobsList()` lib function returning full row data
- `/saved` Astro page with filter tabs, match scores, status forms, remove toggle
- `POST /api/saved-jobs/remove` delete endpoint
- `redirect_to` field support in `POST /api/saved-jobs`
- Dashboard header nav link + clickable stat card

**Out of scope:**
- Notes editing (S-08)
- Sorting controls
- Search within the saved list
- Bulk actions
- Cover letter generation from the saved list

## Architecture / Approach

Pure server-rendered Astro page following the same pattern as `dashboard.astro`. Two sequential Supabase queries (saved_jobs → job_scores) merged in the page frontmatter. Status updates post to the existing endpoint with a `redirect_to` field; deletes post to a new sibling endpoint. Filter tabs and empty state are handled server-side via URL params.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Data Layer + Read-Only Page | `/saved` renders a filtered, scored list | Query expansion must not break existing `getSavedJobs` Map usage |
| 2. Actions: Status + Remove | Status update and remove work from the saved list | `redirect_to` must not open an open-redirect; validate it starts with `/` |
| 3. Dashboard Navigation | Stat card + header link point to `/saved` | Header insertion must not break mobile layout |

**Prerequisites:** None beyond what's already deployed (saved_jobs table, auth, middleware).
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- Offers removed from the live job feed can no longer have their score updated — this is acceptable since the score is cached in `job_scores`.
- The `saved_jobs` table stores a minimal snapshot (title, company, source, url) — if a job's title or company changes on the source, the saved list may show stale data. Acceptable for MVP.

## Success Criteria (Summary)

- User can reach `/saved` from two entry points on the dashboard and see all saved offers with correct status, score, and date
- Status updates and removes work without leaving `/saved`
- Dashboard status update flow is not regressed
