# Saved Offers List Implementation Plan

## Overview

Add a dedicated `/saved` page where the user can view all saved offers, filter by status (All / Interested / Applied / Rejected), update each offer's status, and remove entries. No schema changes needed — the `saved_jobs` table already holds all required data. This closes the saved-job loop started in S-01 (FR-010).

## Current State Analysis

- `saved_jobs` table: fully in place with columns `external_id, title, company, source, url, status, notes, snapshot, created_at, updated_at`. RLS policies restrict all reads/writes to the owning user.
- `getSavedJobs()` (`src/lib/saved-jobs.ts:9`): returns `Map<string, {external_id, status, notes}>` — sufficient for the dashboard badge, but lacks `title, company, source, url, created_at` needed for a list view.
- `getJobScores()` (`src/lib/job-scores.ts:11`): returns `Map<string, JobScore>` keyed by `external_id` — can be reused to attach match % to each saved row.
- `POST /api/saved-jobs`: upserts a saved job, redirects to `/dashboard?saved=job`. Needs to support redirecting back to `/saved` after status updates from the new page.
- No dedicated saved-offers page exists; only `dashboard.astro` and `index.astro` are under `src/pages/`.
- Dashboard header (lines 65-76): sign-out only, no secondary nav.
- Dashboard stat card (lines 324-327): "Saved jobs" count, not clickable.

## Desired End State

`/saved` is a protected page accessible via the dashboard header and the "Saved jobs" stat card. It lists all saved offers sorted newest-first, with filter tabs. Each row shows: title (linked to original job URL), company, source badge, status badge, match score (if available), and date saved. Inline status buttons let the user update status without leaving the page. An inline `<details>`-based confirm reveals a Remove button that permanently deletes the entry and redirects back.

### Key Discoveries

- `getSavedJobs` uses `external_id` as the map key — adding a `getSavedJobsList` sibling avoids touching the existing function's signature or breaking the dashboard.
- `getJobScores` accepts an array of `external_id`s — two sequential queries (saved jobs, then scores) then merge in the page is the right pattern, matching how the dashboard does it.
- The status form uses `POST /api/saved-jobs`; a hidden `redirect_to` field is the cleanest way to redirect back to `/saved` after update without duplicating the endpoint.
- Delete requires its own `POST /api/saved-jobs/remove` endpoint because HTML forms cannot issue DELETE requests.
- Inline confirm via `<details>/<summary>` is CSS-only, no JavaScript, no React island.
- Filter tabs can be implemented as a server-side `.eq("status", filterParam)` addition to the Supabase query when a filter is active — no client-side JS needed.

## What We're NOT Doing

- No notes editing in this slice (S-08 handles that).
- No sorting controls — newest-first is the only sort.
- No search within the saved list.
- No bulk status update or bulk delete.
- No cover letter generation from the saved list (that flow stays on the dashboard).

## Implementation Approach

Three phases in dependency order: (1) data layer + read-only page, (2) write actions (status update, remove), (3) dashboard navigation pointing to the new page. Each phase is independently verifiable.

## Phase 1: Data Layer + `/saved` Page (Read-Only)

### Overview

Extend the saved-jobs lib with a full-row query function, create `src/pages/saved.astro` protected by middleware, and render a filtered, sorted list of saved offers with match scores where available.

### Changes Required

#### 1. Extend `src/lib/saved-jobs.ts`

**File**: `src/lib/saved-jobs.ts`

**Intent**: Add a `SavedJobFull` interface and a `getSavedJobsList()` function that fetches all columns needed for the list view, sorted newest-first, with optional status filter.

**Contract**: New export `SavedJobFull` interface adds `title: string`, `company: string`, `source: string`, `url: string`, `created_at: string` to the existing `SavedJob` fields. New export `getSavedJobsList(supabase, userId, statusFilter?: string)` returns `{ jobs: SavedJobFull[], errorMessage: string | null }`. When `statusFilter` is one of `'interested' | 'applied' | 'rejected'`, it appends `.eq("status", statusFilter)` to the query; otherwise fetches all. Results ordered by `created_at DESC`. On Supabase error, returns empty array + error message (same pattern as `getSavedJobs`).

#### 2. Create `src/pages/saved.astro`

**File**: `src/pages/saved.astro`

**Intent**: Protected page that renders the saved offers list with filter tabs, row data, and status forms. Auth follows the same pattern as `dashboard.astro` (use `Astro.locals.user`, throw if missing).

**Contract**: Reads `?status=` URL param for the active filter tab (accepts `interested`, `applied`, `rejected`; falls back to all). Calls `getSavedJobsList(supabase, user.id, filterParam)` for rows and `getJobScores(supabase, user.id, jobs.map(j => j.external_id))` for scores. Renders using `Layout` with the same `bg-slate-950` shell and `max-w-7xl` container as the dashboard. Structure:
- Page header: "Saved offers" title + "← Back to jobs" link to `/dashboard`
- Filter tab row: four links (`All`, `Interested`, `Applied`, `Rejected`) using `?status=` param; active tab styled with `text-cyan-300 border-b border-cyan-300`
- Empty state: if `jobs.length === 0`, show a card with "No saved offers" message and, if a filter is active, a "Clear filter" link
- Offer list: one `<article>` per row (see row shape below)
- Each row: title as `<a href={job.url} target="_blank">`, company + source badge, status badge (`bg-emerald-400/10 text-emerald-200` for interested/applied, `bg-slate-700/50 text-slate-400` for rejected), match score badge if in scores map (`bg-cyan-400/10 text-cyan-200`), date saved formatted as `YYYY-MM-DD`

### Success Criteria

#### Automated Verification

- TypeScript compiles with no errors: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification

- `/saved` redirects unauthenticated users to `/auth/signin`
- With saved offers present: list renders with correct title, company, source, status badge, and date for each row
- Match score badge appears for offers that have a score in `job_scores`; absent for offers without a score
- Filter tab "Applied" shows only applied offers; "All" shows all
- Empty state displays when no offers match the current filter

**Implementation Note**: After completing this phase, pause for manual verification before proceeding to Phase 2.

---

## Phase 2: Actions — Status Update + Remove

### Overview

Wire the status-update form (reusing `POST /api/saved-jobs`) to redirect back to `/saved`, and add a `POST /api/saved-jobs/remove` endpoint with an inline confirm UI.

### Changes Required

#### 1. Add `redirect_to` support to `src/pages/api/saved-jobs.ts`

**File**: `src/pages/api/saved-jobs.ts`

**Intent**: Read an optional `redirect_to` form field; after a successful upsert, redirect to that path if it starts with `/`, otherwise fall back to `/dashboard?saved=job`. This lets the `/saved` page status forms redirect back to `/saved` without duplicating the endpoint.

**Contract**: After the successful upsert at line 60, replace the hard-coded redirect target with: `const redirectTo = readText(form, "redirect_to"); return context.redirect(redirectTo.startsWith("/") ? redirectTo + "?saved=job" : "/dashboard?saved=job");`. Error redirects remain unchanged (always go to `/dashboard?error=...`).

#### 2. Add status form to each row in `src/pages/saved.astro`

**File**: `src/pages/saved.astro`

**Intent**: Add an inline status fieldset per row using the same three-button pattern as the dashboard, posting to `/api/saved-jobs` with a `redirect_to=/saved` hidden field.

**Contract**: Inside each row `<article>`, add a `<form method="POST" action="/api/saved-jobs">` with hidden inputs for `external_id, source, title, company, url, redirect_to` (value `/saved`). Status buttons follow the same `class:list` logic as dashboard lines 516-524: active button is `border-cyan-400 bg-cyan-400 text-slate-950`, inactive is `border-slate-700 text-slate-200 hover:border-cyan-400`. Buttons are stacked vertically on desktop, 3-column on mobile.

#### 3. Create `src/pages/api/saved-jobs/remove.ts`

**File**: `src/pages/api/saved-jobs/remove.ts`

**Intent**: Accept a POST from the remove form, authenticate the user, delete the `saved_jobs` row matching `(user_id, external_id)`, and redirect back to `/saved`.

**Contract**: Exports `POST: APIRoute`. Reads `external_id` from form data; validates it is non-empty. Calls `supabase.from("saved_jobs").delete().eq("user_id", user.id).eq("external_id", externalId)`. On success, redirects to `/saved?removed=job`. On Supabase error, redirects to `/saved?error=<encoded message>`. If unauthenticated, redirects to `/auth/signin`.

#### 4. Add inline remove UI to each row in `src/pages/saved.astro`

**File**: `src/pages/saved.astro`

**Intent**: Add a `<details>/<summary>` remove toggle per row that reveals a confirmation form posting to `/api/saved-jobs/remove`.

**Contract**: Inside each row, after the status form, add:
```html
<details class="mt-2">
  <summary class="cursor-pointer text-xs text-slate-500 hover:text-slate-300">Remove</summary>
  <form method="POST" action="/api/saved-jobs/remove" class="mt-2 flex items-center gap-2">
    <input type="hidden" name="external_id" value={job.external_id} />
    <span class="text-xs text-slate-400">Remove this offer?</span>
    <button type="submit" class="rounded-md border border-rose-700 px-3 py-1 text-xs text-rose-300 hover:bg-rose-900/30">Confirm</button>
  </form>
</details>
```

Also handle `?removed=job` URL param in the page header to show a "Offer removed" success notice (same emerald banner pattern as dashboard).

### Success Criteria

#### Automated Verification

- TypeScript compiles: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification

- Clicking "Applied" on a saved-list row updates status and reloads `/saved` with the new status reflected
- "Remove" summary expands to reveal confirmation form; clicking "Confirm" deletes the row and shows the success banner
- Removing the last offer in a filtered view shows the empty state
- Status update on `/dashboard` still redirects to `/dashboard?saved=job` (no regression)

**Implementation Note**: After completing this phase, pause for manual verification before proceeding to Phase 3.

---

## Phase 3: Dashboard Navigation

### Overview

Make the "Saved jobs" stat card clickable and add a "Saved" nav link to the dashboard header.

### Changes Required

#### 1. Link the "Saved jobs" stat card in `src/pages/dashboard.astro`

**File**: `src/pages/dashboard.astro`

**Intent**: Wrap the existing "Saved jobs" stat card `<div>` (lines 324-327) in an `<a href="/saved">` so it acts as a navigation shortcut.

**Contract**: The `<div class="rounded-md border border-slate-800 bg-slate-900 p-4">` at line 324 becomes `<a href="/saved" class="block rounded-md border border-slate-800 bg-slate-900 p-4 hover:border-slate-600">`. Inner markup unchanged.

#### 2. Add "Saved" nav link to the dashboard header

**File**: `src/pages/dashboard.astro`

**Intent**: Add an `<a>` nav link to `/saved` in the header's right-side `<div class="flex items-center gap-3">` (line 65), before the email/sign-out group.

**Contract**: Insert `<a href="/saved" class="text-sm font-medium text-slate-300 hover:text-cyan-200">Saved</a>` as the first child of the `flex items-center gap-3` div (line 65). No layout changes beyond this insertion.

### Success Criteria

#### Automated Verification

- TypeScript compiles: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification

- Clicking "Saved jobs" stat card navigates to `/saved`
- "Saved" link in dashboard header is visible and navigates to `/saved`
- Header layout is not broken on mobile or desktop

---

## Testing Strategy

### Manual Testing Steps

1. Sign in, confirm `/saved` is reachable from the header and the stat card
2. Save 2-3 offers from the dashboard; verify they appear in `/saved` with correct data
3. Apply all four filter tabs; verify counts match expected subset
4. Update a status from the saved list; verify badge updates on reload
5. Remove an offer; verify it disappears from the list and the dashboard count decrements
6. Update a status from the dashboard; verify it still redirects to `/dashboard?saved=job`

## References

- PRD: `context/foundation/prd.md` — FR-010
- Roadmap: `context/foundation/roadmap.md` — S-07
- Existing saved-jobs lib: `src/lib/saved-jobs.ts`
- Existing scores lib: `src/lib/job-scores.ts`
- Dashboard reference: `src/pages/dashboard.astro:324-327` (stat card), `:65` (header), `:498-528` (status form pattern)
- Migration: `supabase/migrations/20260601101000_create_saved_jobs.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data Layer + /saved Page (Read-Only)

#### Automated

- [ ] 1.1 TypeScript compiles with no errors: `npm run typecheck`
- [ ] 1.2 Linting passes: `npm run lint`

#### Manual

- [ ] 1.3 `/saved` redirects unauthenticated users to `/auth/signin`
- [ ] 1.4 List renders with correct title, company, source, status badge, and date for each row
- [ ] 1.5 Match score badge appears for scored offers; absent for unscored offers
- [ ] 1.6 Filter tabs work; empty state displays correctly when no offers match

### Phase 2: Actions — Status Update + Remove

#### Automated

- [ ] 2.1 TypeScript compiles: `npm run typecheck`
- [ ] 2.2 Linting passes: `npm run lint`

#### Manual

- [ ] 2.3 Status update from saved list reloads `/saved` with new status reflected
- [ ] 2.4 Remove confirm flow deletes the row and shows success banner
- [ ] 2.5 Removing last offer in filtered view shows empty state
- [ ] 2.6 Dashboard status update still redirects to `/dashboard?saved=job` (no regression)

### Phase 3: Dashboard Navigation

#### Automated

- [ ] 3.1 TypeScript compiles: `npm run typecheck`
- [ ] 3.2 Linting passes: `npm run lint`

#### Manual

- [ ] 3.3 "Saved jobs" stat card navigates to `/saved`
- [ ] 3.4 "Saved" header nav link is visible and navigates to `/saved`
- [ ] 3.5 Header layout is not broken on mobile or desktop
