# AI Code Review Pipeline (z.ai/GLM) — Plan Brief

> Full plan: `context/changes/ci-cd-code-review/plan.md`
> Requirements: `context/changes/ci-cd-code-review/requirements.md`

## What & Why

Add a CI/CD pipeline that runs an AI code-review agent (z.ai/GLM) on every pull request to `main` and leaves an LLM review comment plus a pass/fail label. This closes the **10xChampion** certification block via evidence path A (M5L2+M5L3): a working review pipeline whose run, logs, and PR comment are the required proof.

## Starting Point

JobRadar already has a green CI on PRs to `main` and a working z.ai/GLM integration in the Python backend — but that integration's JWT + client construction is duplicated across `scoring.py` and `cover_letter.py` (architect report's ACL leak #1). What's missing is any step where an LLM reviews the diff and comments on the PR.

## Desired End State

Opening or updating a PR to `main` triggers an `AI Code Review` workflow that comments a per-criterion scorecard + verdict on the PR and sets `ai-cr:passed` / `ai-cr:failed`. A real run on PR #19 yields the three evidence screenshots.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Evidence path | A — CI/CD review pipeline | ~90% of the assets already exist (CI + z.ai) vs building a live registry. | Requirements |
| Review engine | Custom agent on z.ai/GLM | Reuses the key already paid for; no Anthropic key or TS JWT re-impl. | Requirements |
| z.ai client | Extract shared `zai_client()` | One factory for scoring/cover_letter/reviewer; retires ACL leak #1. | Requirements |
| Structured output | Prompt-for-JSON + fence strip | Proven in `scoring.py`; z.ai/GLM is unreliable with `response_format`. | Plan |
| Merge gate | Non-blocking (comment + label) | Evidence needs the comment; a gate would block the owner's own merges. | Requirements |
| Evals (promptfoo) | Deferred | Strengthens submission but not required for Champion evidence. | Requirements |

## Scope

**In scope:** shared `zai.py` factory + rewire two services; Python reviewer (models, pure transforms, z.ai call, CLI); rubric file; composite action; PR workflow (comment + label); manual evidence run.

**Out of scope:** promptfoo evals; hard merge gate; agent tools (read plan / Linear); business-alignment review; Claude Code Action / Anthropic key.

## Architecture / Approach

M5L3 split: the **workflow** (`.github/workflows/ai-review.yml`) owns the trigger and side effects (compute diff, comment, label); the **composite action** (`.github/actions/ai-reviewer/`) owns the review itself; the **reviewer** (`backend/scripts/pr_review.py`) is the agent, reusing `backend/app/services/zai.py`. Data flow: PR event → diff vs base → reviewer → z.ai/GLM → `review.json` + `review.md` → `gh pr comment` + label.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shared z.ai client | `zai.py` factory; scoring + cover_letter rewired | Regression in production AI paths (mitigated: `uv run pytest`) |
| 2. Reviewer | `pr_review.py` + rubric + fixture + unit tests | Model returns non-conforming JSON (Pydantic fails loudly) |
| 3. CI wiring | Composite action + PR workflow + open PR | `git diff` empties without `fetch-depth: 0` |
| 4. Real run + evidence | Secret set, run fired, 3 screenshots | Owner-only secret gate blocks the run |

**Prerequisites:** branch `feat/ai-code-review-pipeline` (exists); repo secret `AI_PROVIDER_API_KEY` for Phase 4 (owner sets it).
**Estimated effort:** ~1 session for Phases 1–3 (automated), + a short manual Phase 4.

## Open Risks & Assumptions

- z.ai/GLM must return well-formed JSON under the review prompt; if flaky, tighten the system prompt (parse failures fail the job loudly, not silently).
- The assistant's `gh` token lacks admin scope — the owner must set the secret (Phase 4.1).
- `workflow_dispatch` runs have no PR context; comment/label steps are guarded to `pull_request` events only.

## Success Criteria (Summary)

- `cd backend && uv run pytest` green (27 passed) after the refactor + reviewer.
- A real PR shows the "🤖 AI Code Review" comment and an `ai-cr:*` label.
- Three evidence screenshots (pipeline + job logs + PR comment) saved for the submission.
