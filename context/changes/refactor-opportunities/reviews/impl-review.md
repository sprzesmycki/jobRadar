<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Refactor opportunities — guard dla kontraktu CV (C1 + C3b)

- **Plan**: context/changes/refactor-opportunities/plan.md
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-07-05
- **Verdict**: NEEDS ATTENTION (both warnings fixed during triage)
- **Findings**: 0 critical  2 warnings  1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Live verification

- `npm run build` → green
- `npm test` → 15 passed (3 files)
- Guard deliberate-break (`skills`→`skillz`, `role_hints`→`role_hintz` in database.types.ts): `npm run build` stays green (does not typecheck); `npm run typecheck` (astro check) → errors. Guard confirmed via typecheck. The `Pick<Row, …>` enumerates every selected column, so any rename errors at the type alias, not only at consumers.
- CI enforces the guard: `ci.yml` runs `npm run typecheck` (commit 8a62cdf).

## Findings

### F1 — Guard success-criteria cite `npm run build`, which does not typecheck

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/refactor-opportunities/plan.md:180-182, 227, 256-258
- **Detail**: `npm run build` (astro build) does not run the typechecker; renaming a column left build green while `npm run typecheck` (astro check) caught it. The guard is enforced only by `npm run typecheck`, added to CI in commit 8a62cdf AFTER the plan closed (81d7265). Progress 4.3 was checked against a command that never demonstrated the guard.
- **Fix**: Correct Phase-4 automated criteria + Progress 4.1/4.3 to cite `npm run typecheck`; note CI gate 8a62cdf enforces it.
- **Decision**: FIXED — updated plan.md Phase-4 criteria (180-182) and Progress 4.1/4.3.

### F2 — Unplanned dependency-cruiser bundled into Phase-3 commit

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: package.json:44 (commit ccef121) + .dependency-cruiser.cjs (untracked)
- **Detail**: ccef121 ("generacja Database types") also added `dependency-cruiser` to devDeps; `.dependency-cruiser.cjs` (a repo-map Wide-Scan config, unrelated to Database-types generation) sat untracked. Neither is in this change's plan/research/brief.
- **Fix**: Remove `dependency-cruiser` devDep + delete the `.cjs` config from this change.
- **Decision**: FIXED — removed from package.json + package-lock.json (npm install --ignore-scripts) and deleted .dependency-cruiser.cjs. Working-tree change, pending commit.

### F3 — Residual type-drift window (deferred `supabase gen types --check` gate)

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/refactor-opportunities/plan.md:211
- **Detail**: The guard only catches a rename if `database.types.ts` is regenerated post-migration. The `supabase gen types --check` CI forcing-function is deferred, matching the plan's stated "okno resztkowe".
- **Fix**: Track `supabase gen types --check` as a named follow-up.
- **Decision**: SKIPPED — already documented as intentional residual risk in the plan.
