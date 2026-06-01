# Onboarding Preferences — Plan Brief

> Full plan: `context/changes/onboarding-preferences/plan.md`

## What & Why

Build the first post-login product loop for JobRadar. The user should be able to save search preferences, see a small matched-offer list, and save a job status before we invest in real ingestion, CV parsing, or AI scoring.

## Starting Point

The app already had Supabase Auth, protected `/dashboard`, and a successful Cloudflare Workers deployment. The dashboard was still starter-level and did not capture the PRD's core inputs: roles, technologies, salary, work mode, or saved offer status.

## Desired End State

An authenticated user lands on a JobRadar dashboard, stores job-search preferences in Supabase, sees matched demo jobs from JustJoinIT, Remotive, and Adzuna, and saves a status for an offer. This is a thin vertical slice: it exercises auth, persistence, matching presentation, and saved-offer tracking without pretending real aggregation or AI is done.

## Key Decisions Made

| Decision | Choice | Why |
|---|---|---|
| Slice shape | Vertical product loop | It touches user input, persisted state, matched output, and saved status instead of only laying foundations. |
| Data layer | Supabase migrations with RLS | Matches the selected stack and keeps user data scoped to `auth.uid()`. |
| Jobs source | Demo jobs from target sources | Lets the product loop work before scraper/backend work exists. |
| Matching | Deterministic preference-based score | Gives visible behavior without claiming CV/AI scoring is complete. |
| Tests | Existing lint/build plus manual Supabase smoke | No test runner exists yet; current repo gate is lint/build per `AGENTS.md`. |

## Scope

**In scope:**

- `job_preferences` table and RLS policies.
- `saved_jobs` table and RLS policies.
- Dashboard preferences form.
- Matched demo jobs with score, matched skills, missing skills.
- Save/update offer status.
- README migration instructions.

**Out of scope:**

- CV upload and private storage.
- Real job ingestion from JustJoinIT, Remotive, or Adzuna.
- AI/CV match scoring.
- Cover-letter generation.
- FastAPI backend and VPS deployment.

## Architecture / Approach

Astro server routes receive form posts, reuse the Supabase SSR client, and rely on Supabase RLS for per-user access. Read helpers live in `src/lib/`; demo matching is deterministic and local. The dashboard renders as a server-side Astro page so saved preferences and saved jobs appear immediately after redirects.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Data contracts and handlers | Supabase tables, RLS, and form endpoints | Hosted Supabase migrations must be applied before production use. |
| 2. Dashboard vertical loop | User-visible preference, match, and saved-status UI | Manual logged-in smoke test is still required after migrations. |

**Prerequisites:** Supabase project configured in `.dev.vars`; authenticated user available for manual testing.
**Estimated effort:** One small implementation pass plus one Supabase/manual verification pass.

## Open Risks & Assumptions

- The current Supabase project needs migrations applied with `npx supabase db push`.
- Demo matching is intentionally not the final CV-to-job scoring model.
- No automated integration/e2e runner exists yet, so persistence must be smoke-tested manually for now.

## Success Criteria (Summary)

- A logged-in user can save preferences and see them prefilled after redirect.
- The dashboard shows matched demo jobs with score and missing skills.
- A logged-in user can save/update an offer status and see it reflected on the dashboard.
