---
project: JobRadar
version: 1
status: draft
created: 2026-06-01
updated: 2026-06-05
prd_version: 1
main_goal: market-feedback
top_blocker: external
---

# Roadmap: JobRadar

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

JobRadar helps an employed mid/senior developer avoid manually scanning many job boards by aggregating remote offers and ranking them against their own CV and preferences. The product promise is not just a job list: it is a workflow where preferences narrow the feed, CV data explains fit, and the user can quickly prepare a tailored cover letter.

## North star

**S-03: User can see real offers from the target sources filtered by preferences** — this is the smallest remaining end-to-end slice whose successful delivery proves that JobRadar is more than a demo dashboard. A north star here means the first user-visible capability that validates the product's core assumption; it is placed as early as prerequisites allow because CV scoring has little value without real offers to score.

## At a glance

| ID   | Change ID                       | Outcome (user can ...)                                                                                         | Prerequisites | PRD refs                                                 | Status   |
| ---- | ------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------- | -------- |
| F-01 | python-cv-ai-service-foundation | (foundation) FastAPI service contract and deployment path exists for CV parsing, scoring, and AI orchestration | —             | FR-003, FR-006, FR-007, FR-008, NFR-privacy, NFR-latency | done     |
| S-01 | onboarding-preferences          | User can register, sign in, save preferences, see demo matches, and save a job status                          | —             | FR-001, FR-002, FR-004, FR-009                           | done     |
| S-02 | first-live-job-source           | User can see live offers from one source filtered by saved preferences                                         | S-01          | US-01, FR-005                                            | done     |
| S-03 | three-source-job-aggregation    | User can see aggregated offers from JustJoinIT, Remotive, and Adzuna with source labels and deduplication      | S-02          | US-01, FR-005                                            | done     |
| S-04 | cv-upload-and-extraction        | User can upload a PDF CV and see extracted profile data saved privately                                        | S-01, F-01    | FR-003, NFR-privacy                                      | done     |
| S-05 | cv-based-job-scoring            | User can see CV-to-job match percentages, explanations, and missing skills on real offers                      | S-03, S-04    | US-01, FR-006, FR-007                                    | proposed |
| S-06 | cover-letter-generation         | User can generate a personalized cover letter for a real offer using CV data and job requirements              | S-05          | US-02, FR-008, NFR-latency, NFR-privacy                  | blocked  |
| S-07 | saved-offers-list               | User can view saved offers in one place and return to application status context                               | S-01, S-03    | FR-010                                                   | proposed |
| S-08 | saved-offer-notes               | User can add notes to a saved offer                                                                            | S-07          | FR-011                                                   | proposed |

## Streams

Navigation aid — groups items that share a prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                | Chain                                | Note                                                                           |
| ------ | -------------------- | ------------------------------------ | ------------------------------------------------------------------------------ |
| A      | Offer feed           | `S-01` -> `S-02` -> `S-03`           | Proves that the product has real job supply before investing in CV-heavy work. |
| B      | CV intelligence      | `F-01` -> `S-04` -> `S-05` -> `S-06` | Adds private CV parsing, scoring, and generation once real offers exist.       |
| C      | Application tracking | `S-07` -> `S-08`                     | Extends the saved-job loop after real offers make saved state useful.          |

## Baseline

What's already in place in the codebase as of `2026-06-01` (auto-researched + user-confirmed).
Foundations below assume these are present and do not re-scaffold them.

- **Frontend:** present — Astro 6 + React 19 + TypeScript, configured in `package.json` and `astro.config.mjs`.
- **Backend / API:** partial — Astro server routes exist under `src/pages/api/`; planned FastAPI service is not present yet.
- **Data:** present — Supabase client and migrations exist for `job_preferences` and `saved_jobs`.
- **Auth:** present — Supabase Auth routes and `/dashboard` middleware protection are implemented.
- **Deploy / infra:** partial — Cloudflare Workers and GitHub Actions are configured; VPS/FastAPI deployment is not present.
- **Observability:** absent — no dedicated logging, metrics, tracing, or error reporting integration was found.

## Foundations

### F-01: Python CV and AI Service Foundation

- **Outcome:** (foundation) a minimal FastAPI service contract and deployment path exists for Python-heavy CV parsing, scoring, and AI orchestration.
- **Change ID:** python-cv-ai-service-foundation
- **PRD refs:** FR-003, FR-006, FR-007, FR-008, NFR-privacy, NFR-latency
- **Unlocks:** S-04, S-05, S-06; privacy and latency verification paths for CV/AI work
- **Prerequisites:** —
- **Parallel with:** S-02, S-03, S-07
- **Blockers:** VPS access and deployment secret handling must be available when this starts.
- **Unknowns:**
  - Which AI provider and PDF parsing path meet the privacy guardrail? — Owner: user/team. Block: no for the foundation, yes for S-06.
- **Risk:** This is sequenced before CV/AI slices because putting PDF parsing and AI orchestration into Cloudflare edge code would fight the accepted stack contract.
- **Status:** done

## Slices

### S-01: Onboarding Preferences

- **Outcome:** User can register, sign in, save job preferences, see demo matched jobs, and save a job status.
- **Change ID:** onboarding-preferences
- **PRD refs:** FR-001, FR-002, FR-004, FR-009
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:**
  - Mobile viewport verification is recorded in `context/archive/2026-06-01-onboarding-preferences/plan.md`. — Owner: team. Block: no.
- **Risk:** This slice was implemented before the roadmap existed; keep it visible so later slices do not re-build auth, preferences, or saved status.
- **Status:** done

### S-02: First Live Job Source

- **Outcome:** User can see live offers from one real source filtered by saved preferences.
- **Change ID:** first-live-job-source
- **PRD refs:** US-01, FR-005
- **Prerequisites:** S-01
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:**
  - Which source should be integrated first after checking current API/access constraints? — Owner: team. Block: no; `/10x-plan` should research this before coding.
- **Risk:** Starting with one source keeps the slice vertical and testable while avoiding a fake "aggregation" milestone that still has no real offers.
- **Status:** done

### S-03: Three-Source Job Aggregation

- **Outcome:** User can see aggregated offers from JustJoinIT, Remotive, and Adzuna with source labels, deduplication, and preference filtering.
- **Change ID:** three-source-job-aggregation
- **PRD refs:** US-01, FR-005
- **Prerequisites:** S-02
- **Parallel with:** F-01
- **Blockers:** External source access terms and API availability may vary per provider.
- **Unknowns:**
  - What are the current API, rate-limit, and usage constraints for JustJoinIT, Remotive, and Adzuna? — Owner: team. Block: yes.
- **Risk:** This is the real aggregation promise; it follows S-02 so source-specific failures are isolated before all three providers are wired.
- **Status:** done

### S-04: CV Upload and Extraction

- **Outcome:** User can upload a PDF CV and see extracted profile data saved privately.
- **Change ID:** cv-upload-and-extraction
- **PRD refs:** FR-003, NFR-privacy
- **Prerequisites:** S-01, F-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - What extracted CV fields are enough for reliable first scoring: skills only, experience bullets, or structured profile summary? — Owner: team. Block: no.
- **Risk:** CV work starts after the product has real offers, because CV parsing is only valuable when it feeds a real matching loop.
- **Status:** done

### S-05: CV-Based Job Scoring

- **Outcome:** User can see CV-to-job match percentages, concise explanations, and missing skills on real offers.
- **Change ID:** cv-based-job-scoring
- **PRD refs:** US-01, FR-006, FR-007
- **Prerequisites:** S-03, S-04
- **Parallel with:** S-07
- **Blockers:** —
- **Unknowns:**
  - What scoring prompt/rubric is trustworthy enough that percentages are not arbitrary? — Owner: team. Block: no.
- **Risk:** This is where product trust is won or lost; it waits for both real offers and extracted CV data so the score is grounded.
- **Status:** proposed

### S-06: Cover Letter Generation

- **Outcome:** User can generate a personalized cover letter for a real offer using both CV data and job requirements.
- **Change ID:** cover-letter-generation
- **PRD refs:** US-02, FR-008, NFR-latency, NFR-privacy
- **Prerequisites:** S-05
- **Parallel with:** S-07
- **Blockers:** AI provider privacy posture and timeout behavior must be acceptable.
- **Unknowns:**
  - Which AI provider configuration prevents raw CV content from being retained in external logs? — Owner: user/team. Block: yes.
  - How will progress feedback be shown for operations longer than 2 seconds? — Owner: team. Block: no.
- **Risk:** Generation is sequenced after scoring because a cover letter without grounded CV/job matching risks becoming a generic AI template.
- **Status:** blocked

### S-07: Saved Offers List

- **Outcome:** User can view saved offers in one place and return to application status context.
- **Change ID:** saved-offers-list
- **PRD refs:** FR-010
- **Prerequisites:** S-01, S-03
- **Parallel with:** S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The list is useful once saved jobs come from real offers; before that it would mostly organize demo data.
- **Status:** proposed

### S-08: Saved Offer Notes

- **Outcome:** User can add notes to a saved offer.
- **Change ID:** saved-offer-notes
- **PRD refs:** FR-011
- **Prerequisites:** S-07
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is nice-to-have and stays behind the must-have path so it does not delay aggregation, CV scoring, or cover letters.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                       | Suggested issue title                                    | Ready for `/10x-plan` | Notes                                                                                  |
| ---------- | ------------------------------- | -------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| S-01       | onboarding-preferences          | Complete onboarding preferences vertical slice           | no                    | Archived after implementation and manual verification.                                 |
| S-02       | first-live-job-source           | Add the first live job source to the dashboard           | no                    | Ready immediately after S-01 is merged or intentionally continued as a stacked branch. |
| S-03       | three-source-job-aggregation    | Aggregate JustJoinIT, Remotive, and Adzuna offers        | no                    | Blocked until current source API/access constraints are researched.                    |
| F-01       | python-cv-ai-service-foundation | Establish FastAPI service foundation for CV and AI work  | yes                   | Can run in parallel with offer-feed work if the branch strategy is clear.              |
| S-04       | cv-upload-and-extraction        | Upload and extract private CV data                       | no                    | Needs F-01 and the existing auth/profile loop.                                         |
| S-05       | cv-based-job-scoring            | Score real offers against uploaded CV data               | no                    | Needs real offers and extracted CV data.                                               |
| S-06       | cover-letter-generation         | Generate personalized cover letters from CV and job data | no                    | Blocked on AI provider privacy and timeout behavior.                                   |
| S-07       | saved-offers-list               | Show saved offers in a dedicated list                    | no                    | Wait until saved offers represent real jobs.                                           |
| S-08       | saved-offer-notes               | Add notes to saved offers                                | no                    | Nice-to-have after saved offer list.                                                   |

## Open Roadmap Questions

1. **Which source should be integrated first for `S-02` after checking current API/access constraints?** — Owner: team. Block: S-02 planning research only.
2. **What are the current API, rate-limit, and usage constraints for JustJoinIT, Remotive, and Adzuna?** — Owner: team. Block: S-03.
3. **Which AI provider and PDF parsing path satisfy the privacy guardrail for raw CV content?** — Owner: user/team. Block: S-06.

## Parked

- **Submitting applications on behalf of the user** — Why parked: PRD Non-Goals explicitly keeps final application submission outside JobRadar.
- **Training or fine-tuning a custom matching model** — Why parked: PRD Non-Goals require external services only for MVP.
- **Social and team features** — Why parked: PRD Non-Goals exclude workspaces, public profiles, shared offers, and social recommendations.
- **CV generation or editing** — Why parked: PRD Non-Goals say JobRadar reads an existing CV but does not create or format one.

## Done

- **S-01: User can register, sign in, save job preferences, see demo matched jobs, and save a job status.** — Archived 2026-06-01 → `context/archive/2026-06-01-onboarding-preferences/`. Lesson: —.
- **S-02: User can see live offers from one real source filtered by saved preferences.** — Archived 2026-06-01 → `context/archive/2026-06-01-first-live-job-source/`. Lesson: —.
- **S-03: User can see aggregated offers from JustJoinIT, Remotive, and Adzuna with source labels, deduplication, and preference filtering.** — Archived 2026-06-02 → `context/archive/2026-06-01-three-source-job-aggregation/`. Lesson: —.
- **F-01: (foundation) a minimal FastAPI service contract and deployment path exists for Python-heavy CV parsing, scoring, and AI orchestration.** — Archived 2026-06-02 → `context/archive/2026-06-02-python-cv-ai-service-foundation/`. Lesson: —.
- **S-04: User can upload a PDF CV and see extracted profile data saved privately.** — Archived 2026-06-05 → `context/archive/2026-06-02-cv-upload-and-extraction/`. Lesson: —.
