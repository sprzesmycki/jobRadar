# AI Code Review Pipeline (z.ai/GLM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CI/CD pipeline that runs an AI code-review agent (z.ai/GLM) on every pull request to `main` and leaves an LLM review comment plus a pass/fail label — closing the 10xChampion evidence path A.

**Architecture:** A GitHub Actions workflow owns the trigger and side effects (diff, comment, label); a local composite action owns "the review itself"; a Python reviewer script is the agent. The reviewer reuses the existing z.ai integration, extracted into a shared `zai_client()` factory so the JWT/client construction lives in one place (also retiring the duplication flagged as ACL leak #1 in the architect report).

**Tech Stack:** Python 3.14 + `openai` SDK (z.ai/GLM), Pydantic, pytest, `uv`; GitHub Actions (composite action + workflow), `gh` CLI.

## Global Constraints

- z.ai base URL is exactly `https://api.z.ai/api/coding/paas/v4` — never `/v1`.
- z.ai auth is a JWT built from a `{id}.{secret}` key (HMAC-SHA256, header `{"alg":"HS256","sign_type":"SIGN"}`); the raw key is never a Bearer token.
- Model comes from env `AI_MODEL_ID` (backend default `GLM-4.5-Air`); the z.ai key from env `AI_PROVIDER_API_KEY`.
- Do NOT add `response_format=json_object`; follow the proven pattern in `scoring.py` — prompt for raw JSON, strip ```` ``` ```` fences, `json.loads`, validate with Pydantic.
- All backend commands run via `uv` from the `backend/` directory (`uv run pytest`, `uv sync`).
- GitHub Actions pinned to major tags already used in the repo: `actions/checkout@v5`, `astral-sh/setup-uv@v6`.
- The review is **non-blocking** this iteration: comment + label only, no merge gate.
- Verdict → label: `APPROVED` → `ai-cr:passed`; `NEEDS_ATTENTION` or `REJECTED` → `ai-cr:failed`.

---

### Task 1: Shared z.ai client (`zai.py`) + rewire callers

Extract the duplicated JWT/client construction from `scoring.py` and `cover_letter.py` into one factory, then point both services at it. Behavior-preserving.

**Files:**
- Create: `backend/app/services/zai.py`
- Create: `backend/tests/test_zai.py`
- Modify: `backend/app/services/scoring.py` (remove local `_zhipu_jwt`, lines 26-43; replace client build at lines 70-71; drop now-unused imports `base64`, `hashlib`, `hmac`, `time`)
- Modify: `backend/app/services/cover_letter.py` (same pattern: remove local `_zhipu_jwt`, replace client build, drop now-unused imports)

**Interfaces:**
- Produces: `zai_client(api_key: str) -> AsyncOpenAI` and `_zhipu_jwt(api_key: str) -> str` and module constant `ZAI_BASE_URL: str`, in `app.services.zai`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_zai.py`:

```python
import base64
import json

from openai import AsyncOpenAI

from app.services.zai import ZAI_BASE_URL, _zhipu_jwt, zai_client


def _decode_segment(segment: str) -> dict:
    padded = segment + "=" * (-len(segment) % 4)
    return json.loads(base64.urlsafe_b64decode(padded))


def test_zhipu_jwt_has_three_segments_and_signed_header() -> None:
    token = _zhipu_jwt("myid.mysecret")
    parts = token.split(".")
    assert len(parts) == 3
    header = _decode_segment(parts[0])
    assert header == {"alg": "HS256", "sign_type": "SIGN"}
    payload = _decode_segment(parts[1])
    assert payload["api_key"] == "myid"
    assert payload["exp"] > payload["timestamp"]


def test_zai_client_targets_zai_base_url() -> None:
    client = zai_client("myid.mysecret")
    assert isinstance(client, AsyncOpenAI)
    assert str(client.base_url).rstrip("/") == ZAI_BASE_URL
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_zai.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.zai'`

- [ ] **Step 3: Create `backend/app/services/zai.py`**

```python
import base64
import hashlib
import hmac
import json
import time

from openai import AsyncOpenAI

ZAI_BASE_URL = "https://api.z.ai/api/coding/paas/v4"


def _zhipu_jwt(api_key: str) -> str:
    """Generate a short-lived JWT from a ZhipuAI {id}.{secret} key."""
    api_key_id, api_secret = api_key.split(".", 1)
    ts_ms = int(time.time() * 1000)

    def _b64url(data: dict) -> str:
        return (
            base64.urlsafe_b64encode(json.dumps(data, separators=(",", ":")).encode())
            .rstrip(b"=")
            .decode()
        )

    header = _b64url({"alg": "HS256", "sign_type": "SIGN"})
    payload = _b64url({"api_key": api_key_id, "exp": ts_ms + 3_600_000, "timestamp": ts_ms})
    signing_input = f"{header}.{payload}"
    sig = hmac.new(api_secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"{signing_input}.{sig_b64}"


def zai_client(api_key: str) -> AsyncOpenAI:
    """Build an AsyncOpenAI client authenticated against z.ai from a {id}.{secret} key."""
    return AsyncOpenAI(base_url=ZAI_BASE_URL, api_key=_zhipu_jwt(api_key))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_zai.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Rewire `scoring.py`**

In `backend/app/services/scoring.py`: delete the local `_zhipu_jwt` function (lines 26-43) and remove the top-of-file imports `base64`, `hashlib`, `hmac`, `time` (keep `json`). Add `from app.services.zai import zai_client`. Replace the client construction:

```python
    # was:
    #   token = _zhipu_jwt(settings.ai_provider_api_key)
    #   client = AsyncOpenAI(base_url="https://api.z.ai/api/coding/paas/v4", api_key=token)
    client = zai_client(settings.ai_provider_api_key)
```

Remove `AsyncOpenAI` from the `from openai import ...` line, keeping `OpenAIError` (`from openai import OpenAIError`). Leave the two guard checks (missing key / missing `.`) untouched.

- [ ] **Step 6: Rewire `cover_letter.py`**

Apply the identical change in `backend/app/services/cover_letter.py`: delete its local `_zhipu_jwt`, drop unused `base64`/`hashlib`/`hmac`/`time` imports, `from openai import OpenAIError`, add `from app.services.zai import zai_client`, and replace its `token = ...` / `client = AsyncOpenAI(...)` pair with `client = zai_client(settings.ai_provider_api_key)`. Keep its guard checks.

- [ ] **Step 7: Run the full backend suite (regression gate)**

Run: `cd backend && uv run pytest -q`
Expected: PASS — same count as before plus the 2 new `test_zai.py` tests (previously 25 passed → now 27 passed).

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/zai.py backend/tests/test_zai.py backend/app/services/scoring.py backend/app/services/cover_letter.py
git commit -m "refactor(backend): extract shared zai_client, dedup z.ai JWT"
```

---

### Task 2: Reviewer core — models + pure functions

The testable, network-free heart of the reviewer: the output schema and the pure transforms (parse model JSON, render markdown, map verdict → label, build the prompt).

**Files:**
- Create: `backend/scripts/__init__.py` (empty, makes `scripts` importable in tests)
- Create: `backend/scripts/pr_review.py` (models + pure functions in this task; CLI added in Task 3)
- Create: `backend/tests/test_pr_review.py`

**Interfaces:**
- Produces, in `scripts.pr_review`:
  - `class ReviewCriterion(BaseModel)`: `name: str`, `score: int` (1..10), `note: str`
  - `class ReviewFinding(BaseModel)`: `severity: str`, `file: str`, `note: str`
  - `class ReviewResult(BaseModel)`: `per_criterion: list[ReviewCriterion]`, `overall_verdict: str`, `summary: str`, `findings: list[ReviewFinding]` (default `[]`)
  - `parse_review_json(raw: str) -> ReviewResult`
  - `render_markdown(result: ReviewResult) -> str`
  - `verdict_to_label(verdict: str) -> str`
  - `build_messages(title: str, body: str, diff: str, criteria: str) -> list[dict]`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_pr_review.py`:

```python
import pytest

from scripts.pr_review import (
    ReviewResult,
    build_messages,
    parse_review_json,
    render_markdown,
    verdict_to_label,
)

_SAMPLE_JSON = """```json
{
  "per_criterion": [
    {"name": "correctness", "score": 3, "note": "off-by-one in loop"},
    {"name": "security", "score": 2, "note": "unsanitized SQL"}
  ],
  "overall_verdict": "REJECTED",
  "summary": "Two blocking issues.",
  "findings": [
    {"severity": "high", "file": "app.py", "note": "SQL injection on line 42"}
  ]
}
```"""


def test_parse_review_json_strips_fences_and_validates() -> None:
    result = parse_review_json(_SAMPLE_JSON)
    assert isinstance(result, ReviewResult)
    assert result.overall_verdict == "REJECTED"
    assert result.per_criterion[0].name == "correctness"
    assert result.findings[0].severity == "high"


def test_parse_review_json_rejects_out_of_range_score() -> None:
    with pytest.raises(ValueError):
        parse_review_json('{"per_criterion":[{"name":"x","score":11,"note":"n"}],'
                          '"overall_verdict":"APPROVED","summary":"s"}')


def test_verdict_to_label_maps_all_three_verdicts() -> None:
    assert verdict_to_label("APPROVED") == "ai-cr:passed"
    assert verdict_to_label("NEEDS_ATTENTION") == "ai-cr:failed"
    assert verdict_to_label("REJECTED") == "ai-cr:failed"


def test_render_markdown_contains_table_and_verdict() -> None:
    result = parse_review_json(_SAMPLE_JSON)
    md = render_markdown(result)
    assert "REJECTED" in md
    assert "correctness" in md
    assert "| Criterion |" in md
    assert "SQL injection on line 42" in md


def test_build_messages_includes_diff_and_criteria() -> None:
    messages = build_messages("Add auth", "closes #1", "diff --git a b", "CRIT-TEXT")
    assert messages[0]["role"] == "system"
    user = messages[1]["content"]
    assert "Add auth" in user
    assert "diff --git a b" in user
    assert "CRIT-TEXT" in user
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_pr_review.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scripts'`

- [ ] **Step 3: Create `backend/scripts/__init__.py`**

Empty file:

```python
```

- [ ] **Step 4: Write minimal implementation (models + pure functions)**

Create `backend/scripts/pr_review.py`:

```python
import json

from pydantic import BaseModel, Field

_REVIEW_SYSTEM_PROMPT = """\
You are a senior code reviewer for a pull request. You are given the PR title, \
body, a unified git diff, and a rubric of review criteria. Evaluate the diff \
against every criterion and return ONLY a JSON object with these exact keys:
- "per_criterion": array of objects {"name": <criterion name>, "score": <integer 1-10>, "note": <one sentence>}
- "overall_verdict": one of "APPROVED", "NEEDS_ATTENTION", "REJECTED"
- "summary": 1-3 sentence plain-English summary
- "findings": array of objects {"severity": "low"|"medium"|"high", "file": <path>, "note": <what and where>} (may be empty)

Score 1 = worst, 10 = best. Use "REJECTED" for blocking correctness or security \
issues, "NEEDS_ATTENTION" for non-blocking concerns, "APPROVED" when the change \
is sound. Respond with valid JSON and nothing else. No markdown fences, no commentary.
"""


class ReviewCriterion(BaseModel):
    name: str
    score: int = Field(ge=1, le=10)
    note: str


class ReviewFinding(BaseModel):
    severity: str
    file: str
    note: str


class ReviewResult(BaseModel):
    per_criterion: list[ReviewCriterion]
    overall_verdict: str
    summary: str
    findings: list[ReviewFinding] = []


def parse_review_json(raw: str) -> ReviewResult:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    return ReviewResult.model_validate(json.loads(text))


def verdict_to_label(verdict: str) -> str:
    return "ai-cr:passed" if verdict == "APPROVED" else "ai-cr:failed"


def render_markdown(result: ReviewResult) -> str:
    lines = [
        "## 🤖 AI Code Review",
        "",
        f"**Verdict: `{result.overall_verdict}`**",
        "",
        result.summary,
        "",
        "| Criterion | Score | Note |",
        "| --- | --- | --- |",
    ]
    for c in result.per_criterion:
        lines.append(f"| {c.name} | {c.score}/10 | {c.note} |")
    if result.findings:
        lines += ["", "### Findings"]
        for f in result.findings:
            lines.append(f"- **{f.severity}** `{f.file}` — {f.note}")
    lines += ["", "_Reviewed by JobRadar AI reviewer on z.ai/GLM. Advisory, non-blocking._"]
    return "\n".join(lines)


def build_messages(title: str, body: str, diff: str, criteria: str) -> list[dict]:
    user = (
        f"# Pull request\nTitle: {title}\n\nDescription:\n{body or '(none)'}\n\n"
        f"# Review criteria\n{criteria}\n\n"
        f"# Unified diff\n```diff\n{diff}\n```"
    )
    return [
        {"role": "system", "content": _REVIEW_SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_pr_review.py -v`
Expected: PASS (5 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/__init__.py backend/scripts/pr_review.py backend/tests/test_pr_review.py
git commit -m "feat(review): reviewer models and pure transforms"
```

---

### Task 3: Reviewer CLI + orchestration + rubric + fixture

Wire the pure functions to z.ai and a command-line entrypoint the composite action calls. Add the rubric file and a fixture diff for a mocked end-to-end test.

**Files:**
- Modify: `backend/scripts/pr_review.py` (add `run_review`, `main`, imports)
- Create: `context/foundation/review-criteria.md`
- Create: `backend/tests/fixtures/sample.diff`
- Modify: `backend/tests/test_pr_review.py` (add mocked orchestration test)

**Interfaces:**
- Consumes: `zai_client` from `app.services.zai` (Task 1); `build_messages`/`parse_review_json`/`render_markdown` (Task 2).
- Produces, in `scripts.pr_review`:
  - `async def run_review(api_key: str, model: str, messages: list[dict]) -> str` (returns raw model content)
  - `def main(argv: list[str] | None = None) -> int`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_pr_review.py`:

```python
def test_main_writes_json_and_md(tmp_path, monkeypatch) -> None:
    import scripts.pr_review as pr

    async def fake_run_review(api_key, model, messages):
        return (
            '{"per_criterion":[{"name":"correctness","score":8,"note":"ok"}],'
            '"overall_verdict":"APPROVED","summary":"Looks good.","findings":[]}'
        )

    monkeypatch.setattr(pr, "run_review", fake_run_review)
    monkeypatch.setenv("AI_PROVIDER_API_KEY", "id.secret")

    diff_file = tmp_path / "pr.diff"
    diff_file.write_text("diff --git a b\n+print('hi')\n")
    criteria = tmp_path / "criteria.md"
    criteria.write_text("correctness: does it work")
    out_json = tmp_path / "review.json"
    out_md = tmp_path / "review.md"

    rc = pr.main([
        "--diff-file", str(diff_file),
        "--title", "T", "--body", "B",
        "--criteria-file", str(criteria),
        "--out-json", str(out_json),
        "--out-md", str(out_md),
    ])

    assert rc == 0
    assert '"overall_verdict": "APPROVED"' in out_json.read_text()
    assert "AI Code Review" in out_md.read_text()


def test_main_fails_without_api_key(tmp_path, monkeypatch) -> None:
    import scripts.pr_review as pr

    monkeypatch.delenv("AI_PROVIDER_API_KEY", raising=False)
    diff_file = tmp_path / "pr.diff"
    diff_file.write_text("x")
    criteria = tmp_path / "c.md"
    criteria.write_text("c")

    rc = pr.main([
        "--diff-file", str(diff_file), "--title", "T", "--body", "B",
        "--criteria-file", str(criteria),
        "--out-json", str(tmp_path / "o.json"), "--out-md", str(tmp_path / "o.md"),
    ])
    assert rc == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_pr_review.py -k main -v`
Expected: FAIL with `AttributeError: module 'scripts.pr_review' has no attribute 'main'`

- [ ] **Step 3: Add orchestration + CLI to `backend/scripts/pr_review.py`**

Add these imports at the top of the file (below the existing `import json`):

```python
import argparse
import asyncio
import os
import sys

from app.services.zai import zai_client
```

Append to the end of the file:

```python
async def run_review(api_key: str, model: str, messages: list[dict]) -> str:
    client = zai_client(api_key)
    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.1,
    )
    return (response.choices[0].message.content or "").strip()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="AI code review on z.ai/GLM")
    parser.add_argument("--diff-file", required=True)
    parser.add_argument("--title", default="")
    parser.add_argument("--body", default="")
    parser.add_argument("--criteria-file", required=True)
    parser.add_argument("--out-json", required=True)
    parser.add_argument("--out-md", required=True)
    args = parser.parse_args(argv)

    api_key = os.environ.get("AI_PROVIDER_API_KEY", "")
    if "." not in api_key:
        print("AI_PROVIDER_API_KEY missing or not in '{id}.{secret}' format", file=sys.stderr)
        return 1

    model = os.environ.get("AI_MODEL_ID", "GLM-4.5-Air")
    diff = open(args.diff_file, encoding="utf-8").read()

    if not diff.strip():
        md = "## 🤖 AI Code Review\n\nℹ️ No reviewable code changes detected."
        open(args.out_md, "w", encoding="utf-8").write(md)
        open(args.out_json, "w", encoding="utf-8").write(
            json.dumps({"per_criterion": [], "overall_verdict": "APPROVED",
                        "summary": "No changes.", "findings": []}, indent=2)
        )
        return 0

    criteria = open(args.criteria_file, encoding="utf-8").read()
    messages = build_messages(args.title, args.body, diff, criteria)

    raw = asyncio.run(run_review(api_key, model, messages))
    result = parse_review_json(raw)

    open(args.out_json, "w", encoding="utf-8").write(result.model_dump_json(indent=2))
    open(args.out_md, "w", encoding="utf-8").write(render_markdown(result))
    print(f"verdict={result.overall_verdict}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_pr_review.py -v`
Expected: PASS (7 passed — 5 from Task 2 + 2 new)

- [ ] **Step 5: Create the rubric `context/foundation/review-criteria.md`**

```markdown
# Code Review Criteria

Each criterion is scored 1–10, where 1 is the worst outcome and 10 is the best.

## correctness
- **1:** the change is broken, has clear logic errors, or contradicts its stated intent.
- **10:** the change does exactly what the PR describes, with edge cases handled.

## idiomaticity
- **1:** fights the framework/stack conventions; foreign patterns bolted on.
- **10:** reads like the surrounding code; uses Astro/React/TypeScript/FastAPI idioms already in the repo.

## complexity
- **1:** needlessly clever or duplicated; a simpler solution obviously exists.
- **10:** minimal code that solves the problem; no speculative abstraction.

## test / risk coverage
- **1:** risky behavior changed with no tests and no user-visible verification.
- **10:** the risky paths are covered by tests or a clear verification story.

## documentation
- **1:** non-obvious decisions are undocumented; context files left stale.
- **10:** the change is self-explaining; comments/docs updated where warranted.

## security
- **1:** introduces injection, secret leakage, missing authz, or unsafe input handling.
- **10:** inputs validated, secrets kept in env, access control respected.
```

- [ ] **Step 6: Create the fixture `backend/tests/fixtures/sample.diff`**

A small diff seeding an obvious SQL-injection flaw (used for a local sanity run, not asserted in the mocked test):

```diff
diff --git a/api/users.py b/api/users.py
index 1111111..2222222 100644
--- a/api/users.py
+++ b/api/users.py
@@ -10,3 +10,6 @@ def get_user(conn, user_id):
     cur = conn.cursor()
-    cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
+    cur.execute("SELECT * FROM users WHERE id = " + user_id)
     return cur.fetchone()
```

- [ ] **Step 7: Commit**

```bash
git add backend/scripts/pr_review.py backend/tests/test_pr_review.py context/foundation/review-criteria.md backend/tests/fixtures/sample.diff
git commit -m "feat(review): z.ai orchestration, CLI entrypoint, rubric, fixture"
```

---

### Task 4: Composite action

Wrap "the review itself" as a reusable local composite action so the workflow stays thin (M5L3 pattern).

**Files:**
- Create: `.github/actions/ai-reviewer/action.yml`

**Interfaces:**
- Consumes: `backend/scripts/pr_review.py` (Task 3), `context/foundation/review-criteria.md` (Task 3).
- Produces: action outputs `verdict` and `markdown-path`.

- [ ] **Step 1: Create `.github/actions/ai-reviewer/action.yml`**

```yaml
name: AI Reviewer
description: Run the JobRadar code-review agent on z.ai/GLM

inputs:
  api-key:
    description: z.ai API key in '{id}.{secret}' format
    required: true
  diff-path:
    description: Path to the unified diff file, relative to the workspace
    required: true
  pr-title:
    description: Pull request title
    required: false
    default: ""
  pr-body:
    description: Pull request body
    required: false
    default: ""

outputs:
  verdict:
    description: APPROVED | NEEDS_ATTENTION | REJECTED
    value: ${{ steps.review.outputs.verdict }}
  markdown-path:
    description: Absolute path to the rendered review markdown
    value: ${{ github.workspace }}/review.md

runs:
  using: composite
  steps:
    - name: Set up uv
      uses: astral-sh/setup-uv@v6
      with:
        version: "latest"

    - name: Install backend deps
      shell: bash
      working-directory: backend
      run: uv sync

    - name: Run reviewer
      id: review
      shell: bash
      working-directory: backend
      env:
        AI_PROVIDER_API_KEY: ${{ inputs.api-key }}
      run: |
        uv run python scripts/pr_review.py \
          --diff-file "${{ github.workspace }}/${{ inputs.diff-path }}" \
          --title "${{ inputs.pr-title }}" \
          --body "${{ inputs.pr-body }}" \
          --criteria-file "${{ github.workspace }}/context/foundation/review-criteria.md" \
          --out-json "${{ github.workspace }}/review.json" \
          --out-md "${{ github.workspace }}/review.md"
        verdict=$(uv run python -c "import json,sys;print(json.load(open(sys.argv[1]))['overall_verdict'])" "${{ github.workspace }}/review.json")
        echo "verdict=$verdict" >> "$GITHUB_OUTPUT"
```

- [ ] **Step 2: Validate YAML syntax**

Run: `cd backend && uv run python -c "import yaml,sys; yaml.safe_load(open('../.github/actions/ai-reviewer/action.yml')); print('ok')"`
Expected: `ok` (if PyYAML missing, instead run `python3 -c "import ...` with a venv that has it, or skip — GitHub validates on push).

- [ ] **Step 3: Commit**

```bash
git add .github/actions/ai-reviewer/action.yml
git commit -m "feat(ci): composite action wrapping the AI reviewer"
```

---

### Task 5: Review workflow

The pipeline: trigger on PRs to `main`, compute the diff, run the action, comment, label.

**Files:**
- Create: `.github/workflows/ai-review.yml`

**Interfaces:**
- Consumes: `./.github/actions/ai-reviewer` (Task 4). Requires repo secret `AI_PROVIDER_API_KEY`.

- [ ] **Step 1: Create `.github/workflows/ai-review.yml`**

```yaml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize, labeled]
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  review:
    if: >
      github.event_name == 'workflow_dispatch' ||
      github.event.action == 'opened' ||
      github.event.action == 'synchronize' ||
      (github.event.action == 'labeled' && github.event.label.name == 'ai-cr:review')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - name: Compute diff against base
        run: |
          BASE="${{ github.event.pull_request.base.ref }}"
          BASE="${BASE:-main}"
          git fetch origin "$BASE" --quiet || true
          git diff "origin/$BASE...HEAD" > pr.diff || git diff "origin/$BASE" HEAD > pr.diff
          echo "Diff bytes: $(wc -c < pr.diff)"

      - name: Ensure labels exist
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh label create ai-cr:passed --color 0e8a16 --description "AI review passed" --force || true
          gh label create ai-cr:failed --color d93f0b --description "AI review flagged issues" --force || true
          gh label create ai-cr:review --color 5319e7 --description "Re-run AI review" --force || true

      - name: Run AI review
        id: review
        uses: ./.github/actions/ai-reviewer
        with:
          api-key: ${{ secrets.AI_PROVIDER_API_KEY }}
          diff-path: pr.diff
          pr-title: ${{ github.event.pull_request.title }}
          pr-body: ${{ github.event.pull_request.body }}

      - name: Comment on PR
        if: github.event_name == 'pull_request'
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh pr comment "${{ github.event.pull_request.number }}" --body-file review.md

      - name: Apply verdict label
        if: github.event_name == 'pull_request'
        env:
          GH_TOKEN: ${{ github.token }}
          NUMBER: ${{ github.event.pull_request.number }}
          VERDICT: ${{ steps.review.outputs.verdict }}
        run: |
          if [ "$VERDICT" = "APPROVED" ]; then
            gh pr edit "$NUMBER" --remove-label ai-cr:failed --add-label ai-cr:passed || gh pr edit "$NUMBER" --add-label ai-cr:passed
          else
            gh pr edit "$NUMBER" --remove-label ai-cr:passed --add-label ai-cr:failed || gh pr edit "$NUMBER" --add-label ai-cr:failed
          fi
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ai-review.yml
git commit -m "feat(ci): AI code review workflow on pull requests"
```

- [ ] **Step 3: Push the branch and open a PR**

```bash
git push -u origin feat/ai-code-review-pipeline
gh pr create --base main --head feat/ai-code-review-pipeline \
  --title "feat: AI code review pipeline (z.ai/GLM)" \
  --body "Adds an AI code-review agent on z.ai/GLM that comments on every PR. Closes 10xChampion evidence path A."
```

Expected: PR URL printed. (This PR will NOT yet trigger a successful review until the secret from Task 6 exists — that is the point of Task 6.)

---

### Task 6: Real run + 10xChampion evidence (manual gate)

Produce the three evidence artifacts. This task is manual because it needs a repo secret the assistant's token cannot set.

**Files:** none (operational).

- [ ] **Step 1: Add the repo secret**

The user runs (from a shell authenticated to `sprzesmycki/jobRadar` with admin):

```bash
gh secret set AI_PROVIDER_API_KEY --repo sprzesmycki/jobRadar
# paste the z.ai {id}.{secret} key when prompted
```

- [ ] **Step 2: Trigger the review on the open PR**

Add the retry label to fire the workflow on the PR opened in Task 5:

```bash
gh pr edit <PR-NUMBER> --add-label ai-cr:review
```

Or push any commit to the branch (a `synchronize` event).

- [ ] **Step 3: Verify the run**

```bash
gh run list --workflow "AI Code Review" --limit 3
gh run view <RUN-ID> --log | tail -40
```

Expected: the `review` job completes; logs show `verdict=...`; the PR gets a comment titled "🤖 AI Code Review" and an `ai-cr:passed`/`ai-cr:failed` label.

- [ ] **Step 4: Capture the three screenshots for the submission**

1. The workflow run page showing the pipeline with the `review` job (Actions tab → the run).
2. The job logs (expanded "Run AI review" step showing the reviewer output / verdict).
3. The PR conversation showing the LLM review comment + label.

Store them wherever you keep certification evidence (e.g. `context/team/champion-evidence/`).

---

## Self-Review

**Spec coverage:**
- Shared z.ai client / dedup ACL leak → Task 1. ✅
- Reviewer script (inputs, model, structured JSON, review.json + review.md) → Tasks 2–3. ✅
- Composite action (inputs, verdict output) → Task 4. ✅
- Workflow (triggers, permissions, diff, comment, label, non-blocking) → Task 5. ✅
- Rubric (6 criteria, 1/10 states) → Task 3 Step 5. ✅
- Error handling (missing key, empty diff, bad JSON via Pydantic) → Task 3 (`main` guards + `parse_review_json`). ✅
- Verification (local dry-run fixture, pytest regression, real run) → fixture in Task 3, pytest gates in Tasks 1–3, real run in Task 6. ✅
- Out of scope (evals, merge gate, agent tools) → not planned, as specified. ✅
- Manual secret gate → Task 6 Step 1. ✅

**Placeholder scan:** no TBD/TODO; every code step shows complete code. ✅

**Type consistency:** `zai_client(api_key)` (Task 1) is consumed unchanged in Task 3; `ReviewResult`/`parse_review_json`/`render_markdown`/`build_messages`/`verdict_to_label` (Task 2) are consumed unchanged in Task 3; action output `verdict` (Task 4) is read as `steps.review.outputs.verdict` in Task 5. ✅
