<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Onboarding Preferences

Date: 2026-06-01
Plan: `context/changes/onboarding-preferences/plan.md`
Scope: completed automated work in commit `17836c1`

## Verdict

**NEEDS MANUAL VERIFICATION**

The implementation matches the plan's intended vertical slice and passes the automated gates. No critical safety or scope-drift issues were found in the implemented files. The remaining blocker is operational/manual: hosted Supabase migrations and logged-in persistence checks have not yet been run.

## Dimension Verdicts

| Dimension           | Verdict | Evidence                                                                                                        |
| ------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| Plan Adherence      | PASS    | Implementation commit touched the planned dashboard, API routes, helpers, migrations, and README.               |
| Scope Discipline    | PASS    | Demo matching is explicit; no real scraping, CV parsing, AI scoring, cover-letter, or FastAPI work was added.   |
| Safety & Quality    | PASS    | API routes call `supabase.auth.getUser()` before writes; RLS policies scope rows by `auth.uid()`.               |
| Architecture        | PASS    | Shared reads live in `src/lib/`; form writes live in `src/pages/api/`; UI stays in `src/pages/dashboard.astro`. |
| Pattern Consistency | PASS    | Uses existing Supabase SSR client and redirect-based form flow.                                                 |
| Success Criteria    | WARNING | Automated checks passed; manual Supabase/UI checks remain pending.                                              |

## Evidence

- `supabase/migrations/20260601100000_create_job_preferences.sql` creates `job_preferences` with RLS policies for select/insert/update by owner.
- `supabase/migrations/20260601101000_create_saved_jobs.sql` creates `saved_jobs` with RLS policies and a unique `(user_id, external_id)` constraint.
- `src/pages/api/preferences.ts` validates the authenticated user before upserting preferences.
- `src/pages/api/saved-jobs.ts` validates the authenticated user before upserting saved jobs.
- `src/pages/dashboard.astro` renders preference form, matched demo jobs, saved status controls, and empty/error states.
- `src/lib/jobs.ts` keeps current matching deterministic and scoped to demo jobs.

## Automated Verification

- `npm run lint` — PASS, with known `astro-eslint-parser` `projectService` warnings.
- `npm run build` — PASS, with known sitemap warning because `site` is not configured.
- Local smoke: `/` — PASS, HTTP 200.
- Local smoke: `/dashboard` unauthenticated — PASS, HTTP 302 to `/auth/signin`.

## Findings

### F1 — Hosted Supabase state not verified yet

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `context/changes/onboarding-preferences/plan.md`

The implementation can build and route correctly, but the data-writing flow depends on applying migrations to the hosted Supabase project. Until that is done, production users will see migration-related errors from the dashboard helpers or API routes.

**Fix**: Run `npx supabase link --project-ref <project-ref>` and `npx supabase db push`, then verify preference save and saved-job status while logged in.

## Recommendation

Proceed to Supabase migration and manual verification before merge/deploy/archive.
