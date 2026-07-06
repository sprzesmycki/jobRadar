<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI Code Review Pipeline (z.ai/GLM)

- **Plan**: context/changes/ci-cd-code-review/plan.md
- **Scope**: Phases 1–4 (full plan)
- **Date**: 2026-07-06
- **Verdict**: NEEDS ATTENTION → all 5 findings resolved during triage (2026-07-06)
- **Findings**: 0 critical, 2 warnings, 3 observations (all FIXED)
- **Post-fix state**: 38 tests pass, ruff clean, both YAML files parse

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Reviewer has no error handling at external boundaries

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (reliability) / Pattern Consistency
- **Location**: backend/scripts/pr_review.py — run_review + main parse call; parse_review_json (L51-59)
- **Detail**: scoring.py wraps its z.ai call in try/except OpenAIError→HTTPException and its parse in except (JSONDecodeError, ValueError). pr_review.py guards neither. A transient API error or malformed/empty model response raises an unhandled traceback; main() exits nonzero, review.md/json never written, action verdict + comment steps skipped → red job, no comment. Advisory check so it fails loud, hence WARNING not CRITICAL.
- **Fix A ⭐ Recommended**: Guard both boundaries; on error print concise stderr message and return 1.
  - Strength: Mirrors scoring.py resilience with a minimal same-shape edit; never fabricates a review.
  - Tradeoff: A transient outage still reds the job and leaves no PR comment.
  - Confidence: HIGH — identical pattern already in scoring.py.
  - Blind spot: None significant.
- **Fix B**: On error, write a fallback COMMENTED review + return 0.
  - Strength: PR always gets a comment; flaky z.ai never reds CI.
  - Tradeoff: A real infra failure masquerades as a "COMMENTED" review.
  - Confidence: MED.
  - Blind spot: Whether a silently-degraded review is worse than a red job.
- **Decision**: FIXED via Fix A (guarded run_review + parse_review_json in main; stderr + return 1)

### F2 — Prompt injection via untrusted PR content can flip the verdict/label

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (security)
- **Location**: backend/scripts/pr_review.py:build_messages (~L95-106); ai-review.yml label step (L55-58)
- **Detail**: PR title/body/diff embedded in the prompt; the model's overall_verdict drives the ai-cr:passed/failed label. A crafted body/diff can earn a green ai-cr:passed that misleads reviewers. Plan lists injection hardening as out-of-scope and keeps the check non-blocking, so impact is bounded — but should be a recorded, conscious acceptance.
- **Fix ⭐ Recommended**: Record as accepted, deferred risk in change.md; keep ai-cr:* labels non-required in branch protection.
  - Strength: Matches the plan's stated scope; zero code churn now.
  - Tradeoff: The weakness persists until a hardening iteration.
  - Confidence: HIGH — consistent with "What We're NOT Doing".
  - Blind spot: If ai-cr:passed later becomes a required check, the risk silently becomes load-bearing.
- **Decision**: FIXED (accepted-risk note added to change.md; labels to stay non-required)

### F3 — verdict_to_label unused in main; rule duplicated in workflow bash

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency / Architecture
- **Location**: backend/scripts/pr_review.py:62-64; ai-review.yml:55-58
- **Detail**: verdict_to_label is defined and unit-tested but never called — the workflow re-implements the same mapping in shell. Two copies of one rule can drift.
- **Fix**: Emit the label from main (print label=... to stdout/$GITHUB_OUTPUT) and consume it in the workflow, or drop the unused function.
- **Decision**: FIXED (main prints label=; action outputs label; workflow applies it; redundant JSON re-parse removed)

### F4 — Test gaps: empty-diff branch and (post-F1) error paths untested

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria (test coverage)
- **Location**: backend/tests/test_pr_review.py
- **Detail**: Suite covers transforms + happy main path, but not the empty-diff branch (_empty_diff_result / main:151-152). test_contracts.py tests 502/503 paths for sibling services.
- **Fix**: Add an empty-diff main test; once F1 lands, add a raising-run_review / malformed-JSON test asserting a clean return 1.
- **Decision**: FIXED (added empty-diff, API-error, malformed-JSON tests; suite 7→10)

### F5 — Necessary test_contracts.py edit not documented in the plan

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: backend/tests/test_contracts.py
- **Detail**: Four monkeypatch targets moved scoring/cover_letter.AsyncOpenAI → zai.AsyncOpenAI — a required consequence of the Phase 1 dedup. Correct and minimal, but undocumented in the plan.
- **Fix**: Add a one-line note to the plan (Phase 1) that the refactor also repoints test_contracts.py's patch targets.
- **Decision**: FIXED (added "#### 5. Repoint test monkeypatch targets" note to plan.md Phase 1)
