# Requirements — AI code review pipeline (z.ai/GLM)

Brainstorming notes that scope the change. Input to `/10x-plan`. Decisions here are locked with the owner.

## Goal

Close the **10xChampion** certification block via evidence path A (M5L2+M5L3): a CI/CD pipeline that runs an AI code-review agent on every pull request to `main` and leaves an LLM review comment. Evidence produced: pipeline view with a visible job, job logs, and an LLM review comment on a real PR.

## Overall concept

- GitHub Actions workflow run for every pull request to `main`.
- Composite action for the review itself so the main workflow is easy to reason about (M5L3 pattern: workflow owns trigger + side effects, action owns the review).
- **Custom review agent on z.ai/GLM** (the "agent składany z SDK" path from M5L3), NOT Claude Code Action — reuses the z.ai key already paid for and the project's existing integration. No new Anthropic key, no TypeScript re-implementation of the JWT auth.

## Input parameters (to the agent)

- pull request title
- pull request body
- `git diff` of the PR against its base branch
- review criteria rubric (6 dimensions, 1–10)

## Code review criteria

Six dimensions, each scored 1–10 with an explicit "1" state and "10" state so scoring is not arbitrary: **correctness, idiomaticity, complexity, test/risk coverage, documentation, security**. Lives in `context/foundation/review-criteria.md`.

## z.ai integration (reuse, don't duplicate)

- Base URL exactly `https://api.z.ai/api/coding/paas/v4`.
- Auth: JWT from a `{id}.{secret}` key (HMAC-SHA256, header `{"alg":"HS256","sign_type":"SIGN"}`). Raw key is never a Bearer token.
- Model from env `AI_MODEL_ID` (backend default `GLM-4.5-Air`); key from env `AI_PROVIDER_API_KEY`.
- Structured output: prompt for raw JSON, strip ```` ``` ```` fences, `json.loads`, validate with Pydantic — the proven pattern in `backend/app/services/scoring.py`. Do NOT use `response_format=json_object`.
- **Dedup decision:** the JWT + client construction is currently duplicated in `scoring.py` and `cover_letter.py` (flagged as ACL leak #1 in the architect report). Extract a shared `zai_client()` factory into `backend/app/services/zai.py`; point both services and the reviewer at it. Behavior-preserving; backend tests are the regression gate.

## Reviewer output

`ReviewResult` = per-criterion scores (name, score 1–10, note) + `overall_verdict` (`APPROVED` | `NEEDS_ATTENTION` | `REJECTED`) + summary + findings (may be empty). Rendered to `review.md` (per-criterion table + verdict + summary + findings) for the PR comment.

## Expected side-effects

- PR comment with the rendered review summary.
- Label `ai-cr:passed` (green) when verdict is `APPROVED`; `ai-cr:failed` (red) when `NEEDS_ATTENTION` or `REJECTED`. Prior label removed before adding the new one so re-runs don't stack both.

## Expected behavior

- Triggers: `pull_request` [opened, synchronize] to `main`; on-demand re-run when label `ai-cr:review` is added; `workflow_dispatch` for manual testing (logs only, no comment when there is no PR context).
- **Non-blocking** this iteration: comment + label only, no merge gate.
- Empty diff → post a "no reviewable changes" note instead of hallucinating a verdict (`fetch-depth: 0` guards the diff computation).
- Missing/invalid `AI_PROVIDER_API_KEY` or non-conforming model JSON → the job fails loudly (no silent pass).

## Parked for later (out of scope)

- promptfoo evals comparing 2–3 GLM models (M5L3 zad. 3) — follow-up, strengthens submission but not required for evidence.
- Hard merge gate on `score`/verdict.
- Agent tools (read plan, Linear/Jira side effects) — the "drabina sprawczości" from M5L3.
- business alignment / architectural fit review (require broader context than the diff).

## Manual gate (owner action)

Add repo secret `AI_PROVIDER_API_KEY` (the z.ai key held locally) via `gh secret set AI_PROVIDER_API_KEY --repo sprzesmycki/jobRadar`. The assistant's `gh` token lacks admin scope, so it cannot set the secret. This is required before the pipeline can produce the evidence run.

## Verification

1. Local dry-run of the reviewer against a fixture diff (no GitHub) — assert `ReviewResult` shape; a seeded flaw yields `REJECTED`/low score.
2. Backend suite green after the `zai.py` extraction (`cd backend && uv run pytest`).
3. Real pipeline run on an open PR (#19 or a fresh throwaway PR) → LLM comment + label → capture the three evidence screenshots.
