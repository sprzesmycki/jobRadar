# AI Code Review Pipeline (z.ai/GLM) Implementation Plan

## Overview

Add a CI/CD pipeline that runs an AI code-review agent (z.ai/GLM) on every pull request to `main`, leaving an LLM review comment plus a pass/fail label. This closes the 10xChampion evidence path A (M5L2+M5L3). The reviewer is a custom agent on the project's existing z.ai integration — not Claude Code Action — so it reuses the key already in use and matches the "agent składany z SDK" path from the lesson.

## Current State Analysis

- The z.ai integration exists twice: `_zhipu_jwt` + `AsyncOpenAI(base_url=..., api_key=token)` is duplicated in `backend/app/services/scoring.py:26-71` and `backend/app/services/cover_letter.py:21-80`. The architect report (`context/architect-report.md` §5) flagged this as ACL leak #1.
- The structured-output pattern is proven in `scoring.py:85-99`: prompt for raw JSON, strip ```` ``` ```` fences, `json.loads`, validate with a Pydantic model. No `response_format`.
- Config exposes `settings.ai_provider_api_key` (env `AI_PROVIDER_API_KEY`) and `settings.ai_model_id` (env `AI_MODEL_ID`, default `GLM-4.5-Air`) — `backend/app/core/config.py:45-46`.
- Backend tests (`backend/tests/test_contracts.py`, `test_cv_extraction.py`) do NOT reference `_zhipu_jwt`, `AsyncOpenAI`, or the z.ai client — they cover health/auth/CORS/cv-bucket. Extraction is therefore behavior-preserving and safe; `uv run pytest` (25 passed) is the regression gate.
- CI already runs on PRs to `main` (`.github/workflows/ci.yml`, green history). The repo is `sprzesmycki/jobRadar`; PR #19 is open and usable as the evidence carrier.
- Backend commands run via `uv` from `backend/`; CI already uses `astral-sh/setup-uv@v6`.

## Desired End State

Opening or updating a PR to `main` triggers a `AI Code Review` workflow whose `review` job posts a comment titled "🤖 AI Code Review" (per-criterion table + verdict + summary + findings) and sets label `ai-cr:passed` or `ai-cr:failed`. Verify by: `uv run pytest` green (27 passed); a local dry-run of the reviewer against a fixture diff produces a valid `ReviewResult`; a real run on PR #19 yields the comment + label and the three evidence screenshots.

### Key Discoveries:

- Duplicated z.ai client: `backend/app/services/scoring.py:26-71`, `backend/app/services/cover_letter.py:21-80`.
- JSON parse/fence-strip pattern to mirror: `backend/app/services/scoring.py:85-99`.
- Config fields: `backend/app/core/config.py:45-46`.
- Tests don't patch `_zhipu_jwt` → refactor is safe: `backend/tests/test_contracts.py`.
- z.ai facts (memory `project-zai-api`): base URL `https://api.z.ai/api/coding/paas/v4`; JWT header `{"alg":"HS256","sign_type":"SIGN"}`; models GLM-5.1 > GLM-4.7 > GLM-4.5-Air.

## What We're NOT Doing

- No promptfoo evals / multi-model comparison (M5L3 zad. 3) — follow-up, not required for evidence.
- No hard merge gate on score/verdict — review is advisory this iteration.
- No agent tools (read plan, Linear/Jira) — the "drabina sprawczości" from M5L3.
- No business-alignment / architectural-fit review (needs broader context than the diff).
- No Claude Code Action / Anthropic key; no TypeScript reviewer.

## Implementation Approach

Four phases, each independently testable. Phase 1 dedups the z.ai client so the reviewer has one factory to consume. Phase 2 builds the reviewer as pure functions + a thin z.ai/CLI shell, unit-tested with a mocked client (no network in CI tests). Phase 3 wires the composite action and workflow (M5L3 split: workflow owns trigger + side effects, action owns the review). Phase 4 is the manual evidence run gated on a repo secret the assistant cannot set.

## Critical Implementation Details

- **Do NOT use `response_format=json_object`** — z.ai/GLM is driven by prompt-for-JSON + fence stripping, exactly as `scoring.py` does. Deviating risks HTML/401 or unsupported-param errors.
- **`fetch-depth: 0` is load-bearing** — the workflow computes `git diff origin/<base>...HEAD`; a shallow checkout yields an empty diff.
- **`workflow_dispatch` has no PR context** — the comment and label steps must be guarded with `if: github.event_name == 'pull_request'`, or they fail on manual runs.

---

## Phase 1: Shared z.ai client

### Overview

Extract the duplicated JWT + client construction into one factory and point both existing services at it. Behavior-preserving.

### Changes Required:

#### 1. New shared factory

**File**: `backend/app/services/zai.py`

**Intent**: House the single z.ai client construction so `scoring.py`, `cover_letter.py`, and the new reviewer all consume it — retiring ACL leak #1.

**Contract**: Exposes `ZAI_BASE_URL: str = "https://api.z.ai/api/coding/paas/v4"`, `_zhipu_jwt(api_key: str) -> str` (moved verbatim from `scoring.py`), and `zai_client(api_key: str) -> AsyncOpenAI` returning `AsyncOpenAI(base_url=ZAI_BASE_URL, api_key=_zhipu_jwt(api_key))`.

#### 2. Rewire scoring

**File**: `backend/app/services/scoring.py`

**Intent**: Replace the local JWT + client build with the shared factory; drop now-unused imports.

**Contract**: Remove local `_zhipu_jwt` (lines 26-43) and the `base64`/`hashlib`/`hmac`/`time` imports; change `from openai import AsyncOpenAI, OpenAIError` → `from openai import OpenAIError`; add `from app.services.zai import zai_client`; replace `token = ...` / `client = AsyncOpenAI(...)` (lines 70-71) with `client = zai_client(settings.ai_provider_api_key)`. The two guard checks (missing key / missing `.`) stay untouched.

#### 3. Rewire cover_letter

**File**: `backend/app/services/cover_letter.py`

**Intent**: Same substitution as scoring.

**Contract**: Delete its local `_zhipu_jwt`, drop unused `base64`/`hashlib`/`hmac`/`time`, `from openai import OpenAIError`, add `from app.services.zai import zai_client`, replace its `token`/`client = AsyncOpenAI(...)` pair with `client = zai_client(settings.ai_provider_api_key)`. Keep its guards.

#### 4. Factory test

**File**: `backend/tests/test_zai.py`

**Intent**: Lock the JWT shape and base URL so the moved code stays correct.

**Contract**: Test that `_zhipu_jwt("id.secret")` returns 3 dot-separated segments, the decoded header equals `{"alg":"HS256","sign_type":"SIGN"}`, and payload `api_key == "id"` with `exp > timestamp`; test that `zai_client("id.secret")` is an `AsyncOpenAI` whose `base_url` equals `ZAI_BASE_URL`.

### Success Criteria:

#### Automated Verification:

- New factory test passes: `cd backend && uv run pytest tests/test_zai.py -v`
- Full backend suite green (no regression from the rewire): `cd backend && uv run pytest -q` (27 passed)
- Lint/format clean: `cd backend && uv run ruff check .`

#### Manual Verification:

- `grep -rn "_zhipu_jwt" backend/app` shows the definition only in `zai.py` (no duplicate in scoring/cover_letter).

**Implementation Note**: After automated verification passes, pause for human confirmation before Phase 2.

---

## Phase 2: Reviewer (z.ai agent)

### Overview

The review agent: Pydantic models, pure transforms (parse/render/label/prompt), a thin z.ai orchestration call, and a CLI entrypoint. Plus the rubric file and a fixture diff. Unit-tested with a mocked client — no network in CI.

### Changes Required:

#### 1. Reviewer module

**File**: `backend/scripts/pr_review.py` (and empty `backend/scripts/__init__.py` so tests can import it)

**Intent**: Turn a PR title/body/diff + rubric into a structured review, render it to markdown, and expose a CLI the composite action calls.

**Contract**: Provides:
- `ReviewCriterion(BaseModel)`: `name: str`, `score: int` (Field ge=1, le=10), `note: str`.
- `ReviewFinding(BaseModel)`: `severity: str`, `file: str`, `note: str`.
- `ReviewResult(BaseModel)`: `per_criterion: list[ReviewCriterion]`, `overall_verdict: str`, `summary: str`, `findings: list[ReviewFinding] = []`.
- `parse_review_json(raw: str) -> ReviewResult` — strips ```` ``` ```` / ```` ```json ```` fences then `ReviewResult.model_validate(json.loads(...))` (mirror `scoring.py:85-99`).
- `verdict_to_label(verdict: str) -> str` — `"ai-cr:passed"` iff `verdict == "APPROVED"`, else `"ai-cr:failed"`.
- `render_markdown(result: ReviewResult) -> str` — "## 🤖 AI Code Review" heading, `**Verdict: \`<v>\`**`, summary, a `| Criterion | Score | Note |` table, an optional Findings list, and a trailing advisory/non-blocking note.
- `build_messages(title, body, diff, criteria) -> list[dict]` — system prompt demanding the exact JSON keys + a user message embedding title, body, criteria, and a fenced diff.
- `async def run_review(api_key: str, model: str, messages: list[dict]) -> str` — calls `zai_client(api_key).chat.completions.create(model=model, messages=messages, temperature=0.1)` and returns the raw content.
- `def main(argv: list[str] | None = None) -> int` — argparse (`--diff-file`, `--title`, `--body`, `--criteria-file`, `--out-json`, `--out-md`); reads `AI_PROVIDER_API_KEY`/`AI_MODEL_ID` from env; returns 1 with a stderr message if the key is missing or lacks `.`; on empty diff writes a "no reviewable changes" `review.md` + an `APPROVED` `review.json` and returns 0; otherwise `asyncio.run(run_review(...))`, `parse_review_json`, writes `review.json` (`model_dump_json`) + `review.md` (`render_markdown`), prints `verdict=<v>`, returns 0.

#### 2. Rubric

**File**: `context/foundation/review-criteria.md`

**Intent**: The six scored dimensions with explicit 1-state and 10-state so scoring isn't arbitrary (M5L3).

**Contract**: Markdown with a `## <name>` block per dimension (correctness, idiomaticity, complexity, test/risk coverage, documentation, security), each listing a **1:** worst-state line and a **10:** best-state line. Read verbatim into the prompt at runtime.

#### 3. Fixture

**File**: `backend/tests/fixtures/sample.diff`

**Intent**: A small diff with an obvious flaw for local sanity runs.

**Contract**: A unified diff introducing a SQL-injection-style change (string-concatenated query). Not asserted by the mocked unit test; used for the Phase 2 manual dry-run and Phase 4.

#### 4. Reviewer tests

**File**: `backend/tests/test_pr_review.py`

**Intent**: Cover the pure transforms and the CLI file-IO path without hitting the network.

**Contract**: Assert `parse_review_json` strips fences and validates; rejects an out-of-range score (score=11 raises); `verdict_to_label` maps all three verdicts; `render_markdown` contains the verdict, a criterion name, the table header, and a finding line; `build_messages` embeds title/diff/criteria. For the CLI: monkeypatch `pr_review.run_review` with a fake coroutine + set `AI_PROVIDER_API_KEY`, call `main([...])` over tmp files, assert rc==0 and that `review.json`/`review.md` are written; a second test asserts `main` returns 1 when the key env var is absent.

### Success Criteria:

#### Automated Verification:

- Reviewer tests pass: `cd backend && uv run pytest tests/test_pr_review.py -v`
- Full suite green: `cd backend && uv run pytest -q`
- Lint clean: `cd backend && uv run ruff check scripts tests`

#### Manual Verification:

- Local dry-run against the fixture with a real key produces a low/`REJECTED` verdict: `cd backend && AI_PROVIDER_API_KEY=<key> uv run python scripts/pr_review.py --diff-file tests/fixtures/sample.diff --title T --body B --criteria-file ../context/foundation/review-criteria.md --out-json /tmp/r.json --out-md /tmp/r.md && cat /tmp/r.md`

**Implementation Note**: After automated verification passes, pause for human confirmation before Phase 3.

---

## Phase 3: CI wiring (composite action + workflow)

### Overview

Wrap the reviewer as a reusable composite action and drive it from a workflow that computes the diff and applies the side effects.

### Changes Required:

#### 1. Composite action

**File**: `.github/actions/ai-reviewer/action.yml`

**Intent**: "The review itself" as a reusable unit so the workflow stays thin.

**Contract**: `using: composite`. Inputs: `api-key` (required), `diff-path` (required, workspace-relative), `pr-title`, `pr-body` (optional). Output: `verdict` sourced from a step that reads `overall_verdict` out of `review.json`. Steps: `astral-sh/setup-uv@v6` → `uv sync` in `backend/` → run `scripts/pr_review.py` with the four `--*` args pointing at `${{ github.workspace }}` paths (diff, `context/foundation/review-criteria.md`, `review.json`, `review.md`), passing `AI_PROVIDER_API_KEY: ${{ inputs.api-key }}`, then `echo "verdict=..." >> "$GITHUB_OUTPUT"`.

#### 2. Workflow

**File**: `.github/workflows/ai-review.yml`

**Intent**: Trigger review on PRs and publish the comment + label.

**Contract**: Name `AI Code Review`. Triggers: `pull_request` types `[opened, synchronize, labeled]` on `main`, plus `workflow_dispatch`. `permissions: contents: read, pull-requests: write, issues: write`. Single `review` job with an `if` that runs on dispatch, `opened`, `synchronize`, or a `labeled` event whose label is `ai-cr:review`. Steps: `actions/checkout@v5` with `fetch-depth: 0` → compute `git diff origin/<base>...HEAD > pr.diff` (base from `github.event.pull_request.base.ref`, default `main`) → `gh label create` the three labels idempotently (`--force`) → `uses: ./.github/actions/ai-reviewer` with the inputs (api-key from `secrets.AI_PROVIDER_API_KEY`, diff-path `pr.diff`, title/body from the event) → **guarded `if: github.event_name == 'pull_request'`**: `gh pr comment <number> --body-file review.md` and a label step that removes the opposite label and adds `verdict_to_label`'s result. Uses `GH_TOKEN: ${{ github.token }}` for all `gh` steps.

#### 3. Open the PR

**File**: (git operation, no file)

**Intent**: Get the branch on GitHub so the workflow exists on `main`'s PR surface.

**Contract**: `git push -u origin feat/ai-code-review-pipeline` then `gh pr create --base main --head feat/ai-code-review-pipeline` with a title/body noting it closes 10xChampion path A.

### Success Criteria:

#### Automated Verification:

- YAML parses: `cd backend && uv run python -c "import yaml;[yaml.safe_load(open(p)) for p in ['../.github/actions/ai-reviewer/action.yml','../.github/workflows/ai-review.yml']];print('ok')"`
- Branch pushed and PR created: `gh pr view --json url -q .url`

#### Manual Verification:

- The `AI Code Review` workflow appears in the Actions tab for the PR (it will not fully succeed until the Phase 4 secret exists — a red run here is expected and is the trigger to do Phase 4).

**Implementation Note**: After automated verification passes, pause for human confirmation before Phase 4.

---

## Phase 4: Real run + 10xChampion evidence (manual gate)

### Overview

Produce the three evidence artifacts. Manual because it needs a repo secret the assistant's token cannot set.

### Changes Required:

#### 1. Repo secret

**Intent**: Give the pipeline the z.ai key.

**Contract**: Owner runs `gh secret set AI_PROVIDER_API_KEY --repo sprzesmycki/jobRadar` and pastes the `{id}.{secret}` key.

#### 2. Trigger + capture

**Intent**: Fire the workflow on the PR and collect proof.

**Contract**: `gh pr edit <PR> --add-label ai-cr:review` (or push a commit) → confirm via `gh run list --workflow "AI Code Review"` and `gh run view <id> --log` → capture three screenshots: (a) the run page with the `review` job, (b) the job logs showing `verdict=`, (c) the PR conversation with the LLM comment + label. Store under `context/team/champion-evidence/`.

### Success Criteria:

#### Automated Verification:

- Run succeeded: `gh run list --workflow "AI Code Review" --limit 1` shows `completed  success`
- Comment exists: `gh pr view <PR> --json comments -q '.comments[].body' | grep -q "AI Code Review"`

#### Manual Verification:

- The PR shows the "🤖 AI Code Review" comment and an `ai-cr:*` label.
- Three evidence screenshots saved for the certification submission.

---

## Testing Strategy

### Unit Tests:

- `test_zai.py`: JWT segment shape + header; `zai_client` base URL.
- `test_pr_review.py`: fence-strip + validation, score range guard, verdict→label, markdown rendering, prompt assembly, CLI file-IO with a mocked `run_review`, and the missing-key exit path.

### Integration Tests:

- Local dry-run of `pr_review.py` against `tests/fixtures/sample.diff` with a real key (manual).
- Real workflow run on PR #19 (Phase 4).

### Manual Testing Steps:

1. `cd backend && uv run pytest -q` → 27 passed.
2. Dry-run the reviewer on the fixture; confirm a low/`REJECTED` verdict and a rendered table.
3. After the secret is set, trigger the workflow; confirm comment + label on the PR.

## Migration Notes

Phase 1 refactors production `scoring.py`/`cover_letter.py`. It is behavior-preserving (same base URL, same JWT). Rollback = revert the Phase 1 commit; the services return to their inlined clients. No data or schema changes anywhere in this plan.

## References

- Requirements: `context/changes/ci-cd-code-review/requirements.md`
- z.ai pattern to mirror: `backend/app/services/scoring.py:85-99`
- Duplicated client (dedup target): `backend/app/services/cover_letter.py:21-80`
- Architect report (ACL leak #1): `context/architect-report.md`
- Lesson source: `docs/m5l3.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared z.ai client

#### Automated

- [x] 1.1 New factory test passes (`uv run pytest tests/test_zai.py`) — e5fbd80
- [x] 1.2 Full backend suite green, 27 passed (`uv run pytest -q`) — e5fbd80
- [x] 1.3 Lint/format clean (`uv run ruff check .`) — e5fbd80

#### Manual

- [x] 1.4 `grep _zhipu_jwt backend/app` shows only the `zai.py` definition — e5fbd80

### Phase 2: Reviewer (z.ai agent)

#### Automated

- [x] 2.1 Reviewer tests pass (`uv run pytest tests/test_pr_review.py`) — 963c258
- [x] 2.2 Full suite green (`uv run pytest -q`) — 963c258
- [x] 2.3 Lint clean (`uv run ruff check scripts tests`) — 963c258

#### Manual

- [x] 2.4 Local dry-run on the fixture yields a low/`REJECTED` verdict — 963c258

### Phase 3: CI wiring (composite action + workflow)

#### Automated

- [x] 3.1 Both YAML files parse — a3967b7
- [x] 3.2 Branch pushed and PR created (`gh pr view --json url`) — a2c4f3b

#### Manual

- [x] 3.3 `AI Code Review` workflow appears in the PR's Actions tab — a2c4f3b

### Phase 4: Real run + 10xChampion evidence (manual gate)

#### Automated

- [x] 4.1 Run completed `success` (`gh run list --workflow "AI Code Review"`) — 314b7e5
- [x] 4.2 PR comment contains "AI Code Review" — 314b7e5

#### Manual

- [x] 4.3 PR shows the comment + `ai-cr:*` label — 314b7e5
- [ ] 4.4 Three evidence screenshots saved under `context/team/champion-evidence/`
