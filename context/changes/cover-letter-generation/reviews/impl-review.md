<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Cover Letter Generation

- **Plan**: context/changes/cover-letter-generation/plan.md
- **Scope**: All phases (1–4 of 4)
- **Date**: 2026-06-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 7 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — tone/language in CoverLetterRequest silently dropped

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/app/schemas/ai.py:9–10
- **Detail**: CoverLetterRequest exposes tone and language fields but the route drops them silently. Plan explicitly deferred to future.
- **Fix A ⭐ Recommended**: Add comment to schema fields noting they're accepted but not yet consumed.
- **Decision**: FIXED via Fix A — comment added to ai.py

### F2 — Fence-strip rfind can truncate letter with embedded backticks

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/app/services/cover_letter.py:105–110
- **Detail**: rfind finds last backtick fence occurrence; could truncate embedded content. Replaced with scoring.py pattern.
- **Fix**: Replace rfind block with text.split("```")[1].strip()
- **Decision**: FIXED — replaced with sibling scoring.py split pattern

### F3 — createAuthedClient added to supabase.ts but not used

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/supabase.ts:28–40
- **Detail**: Dead export — neither cover-letter.ts nor score-batch.ts calls it.
- **Fix**: Remove the unused export.
- **Decision**: FIXED — removed createAuthedClient

### F4 — score-batch.ts got unplanned bearer auth upgrade

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/api/jobs/score-batch.ts:107–132
- **Detail**: Unplanned change to a file outside feature boundary.
- **Fix**: Document as addendum in plan.md.
- **Decision**: FIXED — addendum added to plan.md

### F5 — Dashboard: `<template>` replaced by data-cover-letter-payload on button

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/dashboard.astro:540–543
- **Detail**: Functionally equivalent and simpler implementation. Covered by F4 addendum.
- **Decision**: SKIPPED — already covered by plan addendum

### F6 — profile.summary used as "Candidate name" via undocumented mapping

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/app/services/cover_letter.py:52
- **Detail**: TS client maps full_name → summary; service labels it "Candidate name". Silent coupling.
- **Fix**: Add one-line comment on the mapping.
- **Decision**: FIXED — comment added to cover_letter.py

### F7 — Error div not cleared before retry fetch

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:697–724
- **Detail**: Error div not hidden before retry; transient overlap on double failure.
- **Fix**: errorDiv?.setAttribute("hidden", "") at top of fetchCoverLetter.
- **Decision**: FIXED

### F8 — No CHECK (content <> '') on migration content column

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260605160000_create_cover_letters.sql:7
- **Detail**: Defense-in-depth gap. Backend validates, but no schema-level guard.
- **Fix**: Follow-up migration with ALTER TABLE ... ADD CONSTRAINT content_nonempty CHECK (content <> '').
- **Decision**: FIXED — migration 20260606100000_cover_letters_content_nonempty.sql created

### F9 — NotImplementedPayload re-exported through schemas/ai.py

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/app/schemas/ai.py:17
- **Detail**: Pre-existing issue; generic schema leaked through domain module.
- **Fix**: Remove from ai.py __all__ and imports.
- **Decision**: FIXED — removed import and __all__ entry
