# AI Code Review Pipeline (z.ai/GLM) — Design

- **Date:** 2026-07-06
- **Goal:** Close the **10xChampion** certification block via evidence path A (M5L2+M5L3): a CI/CD pipeline that runs an AI code-review agent on every pull request and leaves an LLM review comment.
- **Champion evidence produced:** pipeline view with a visible job, job logs, and an LLM review comment on a real PR (the exact categories named in M5L1 Krok 4 and M5L3 zadania).

## Context

JobRadar already has:

- A working CI (`.github/workflows/ci.yml`) that runs on PRs to `main` (green history).
- An existing z.ai/GLM integration in the Python backend: JWT auth from a `{id}.{secret}` key (`_zhipu_jwt`), base URL `https://api.z.ai/api/coding/paas/v4`, model via `AI_MODEL_ID` (default `GLM-5.1`), the `openai` SDK (`AsyncOpenAI`), key in `AI_PROVIDER_API_KEY`. See `backend/app/services/scoring.py`.
- An open PR (#19) usable as the evidence carrier.

Missing: a workflow step where an LLM reviews the diff and comments on the PR.

Decision (locked with the user): build a **custom review agent on z.ai/GLM** (the "agent składany z SDK" path from M5L3), reusing the existing Python z.ai integration rather than introducing an Anthropic key or a TypeScript re-implementation of the JWT auth.

## Architecture

Follows the M5L3 split: the **workflow** owns the trigger and side effects; the **composite action** owns the review itself; the **reviewer script** is the agent.

```
.github/workflows/ai-review.yml         # trigger (PR→main), compute diff, comment, label
.github/actions/ai-reviewer/action.yml  # composite action: run reviewer, output verdict
backend/scripts/pr_review.py            # agent: (diff + criteria) → z.ai GLM → structured JSON + review.md
backend/app/services/zai.py             # NEW shared z.ai client factory (dedups _zhipu_jwt)
context/foundation/review-criteria.md   # 6 review criteria scored 1–10 (the rubric)
```

### Components (each has one purpose)

1. **`backend/app/services/zai.py` — shared z.ai client.**
   - `zai_client() -> AsyncOpenAI`: builds the JWT from `AI_PROVIDER_API_KEY` and returns an `AsyncOpenAI` pointed at the z.ai base URL. Exposes `_zhipu_jwt` (moved here).
   - `scoring.py` and `cover_letter.py` are refactored to import it, removing the two duplicate JWT/client constructions the architect report (L5) flagged as ACL leak #1. The reviewer becomes the third consumer of the single factory.
   - Depends on: `openai`, `AI_PROVIDER_API_KEY`, `AI_MODEL_ID`.

2. **`backend/scripts/pr_review.py` — the review agent.**
   - Inputs (CLI args / env): PR title, PR body, unified `git diff` (path or stdin), rubric file path.
   - Builds a prompt: criteria rubric + PR metadata + diff.
   - Calls z.ai GLM via `zai_client()` with a JSON-shaped response (Pydantic model validated, same pattern as `scoring.py`).
   - Output schema:
     ```
     ReviewResult {
       per_criterion: [ { name: str, score: int (1..10), note: str } ],   # 6 rows
       overall_verdict: "APPROVED" | "NEEDS_ATTENTION" | "REJECTED",
       summary: str,
       findings: [ { severity, file, note } ]                             # may be empty
     }
     ```
   - Writes two artifacts: `review.json` (machine, drives the label) and `review.md` (human, becomes the PR comment: a per-criterion table + verdict + summary + findings).
   - Depends on: `zai.py`, the rubric file. No GitHub knowledge — pure diff → verdict.

3. **`.github/actions/ai-reviewer/action.yml` — composite action.**
   - `inputs`: `api-key`, `diff-path`, `pr-title`, `pr-body`.
   - Steps: set up `uv`, `uv sync` in `backend/`, run `pr_review.py`.
   - `outputs`: `verdict` (from `review.json`), and the path to `review.md`.
   - Keeps the main workflow thin and makes the reviewer reusable across repos later (M5L3 rationale). Pinned to a local path (`./.github/actions/ai-reviewer`) for a single repo; extractable to a separate repo later.

4. **`.github/workflows/ai-review.yml` — the pipeline.**
   - Triggers: `pull_request` [opened, synchronize] to `main`; `workflow_dispatch` (manual test); re-run when label `ai-cr:review` is added.
   - Permissions: `pull-requests: write`, `contents: read`.
   - Steps: `actions/checkout` with `fetch-depth: 0` → compute `git diff origin/${{ github.base_ref }}...HEAD` to a file → invoke the composite action → `gh pr comment <n> --body-file review.md` → `gh pr edit <n>` to set the label. **Verdict → label:** `APPROVED` → `ai-cr:passed`; `NEEDS_ATTENTION` or `REJECTED` → `ai-cr:failed`. The prior of the two labels is removed before adding the new one so re-runs don't stack both.
   - Secret: `AI_PROVIDER_API_KEY` (the z.ai key).
   - **Non-blocking:** comment + label only; no merge gate in this iteration.

5. **`context/foundation/review-criteria.md` — the rubric.**
   - 6 criteria, each with an explicit "1" state and "10" state so scoring is not arbitrary (M5L3): correctness, idiomaticity, complexity, test/risk coverage, documentation, security.

## Data flow

```
PR opened/updated → ai-review.yml triggers
  → checkout (full history) → git diff vs base → diff file
  → composite action: uv sync → pr_review.py → z.ai GLM → review.json + review.md
  → gh pr comment (review.md)  +  gh pr edit --add-label (from verdict)
→ screenshots (pipeline + job logs + PR comment) = 10xChampion evidence
```

## Error handling

- **Missing/invalid `AI_PROVIDER_API_KEY`:** reviewer exits non-zero with a clear message; the job fails visibly (no silent pass). z.ai `OpenAIError` is caught and surfaced, same as `scoring.py`.
- **Empty diff** (e.g. shallow checkout misconfigured): reviewer posts a "no reviewable changes" note instead of hallucinating a verdict; `fetch-depth: 0` is the guard.
- **Model returns non-conforming JSON:** Pydantic validation fails → job fails with the raw payload logged, so a prompt/model regression is loud, not silent.
- **Label doesn't exist yet:** workflow creates `ai-cr:passed` / `ai-cr:failed` / `ai-cr:review` labels idempotently (or a one-time setup step).

## Testing / verification

1. **Local dry-run (no GitHub):** run `pr_review.py` against a saved fixture diff in `backend/tests/fixtures/`. Assert: valid `ReviewResult` JSON; a diff seeded with an obvious flaw yields `REJECTED` or a low score. This is the fast inner loop.
2. **Backend regression:** `uv run pytest` stays green after the `zai.py` extraction (covers `scoring.py` / `cover_letter.py` refactor).
3. **Real pipeline run:** trigger via `workflow_dispatch` and on PR #19 (or a fresh throwaway PR); confirm the LLM comment lands and the label is set. Capture the three evidence screenshots.

## Out of scope (deliberate)

- **promptfoo evals** (M5L3 zad. 3, multi-model comparison) — a follow-up that strengthens the submission but is not required for Champion evidence.
- **Hard merge gate** on `score` / verdict — deferred; the review is advisory this iteration.
- **Agent tools** (read plan, Linear/Jira side effects) — the "drabina sprawczości" from M5L3, later.

## Manual gate (user action required)

Add repo secret `AI_PROVIDER_API_KEY` (the z.ai key already held locally) via GitHub Settings → Secrets or `gh secret set AI_PROVIDER_API_KEY`. The assistant's `gh` token lacks admin scope, so it cannot set the secret.
