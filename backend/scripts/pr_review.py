"""AI code reviewer: turn a PR diff + rubric into a structured, rendered review.

Pure transforms (parse/render/label/prompt) plus a thin z.ai orchestration call and a
CLI entrypoint the composite action invokes. Mirrors the prompt-for-JSON + fence-strip
pattern from ``app.services.scoring`` — no ``response_format``.
"""

import argparse
import asyncio
import json
import os
import sys

from pydantic import BaseModel, Field

from app.services.zai import zai_client

_SYSTEM_PROMPT = """\
You are a senior code reviewer. Given a pull request title, body, a scoring rubric, and a \
unified diff, return ONLY a JSON object with these exact keys:
- "per_criterion": array of objects, one per rubric criterion, each with keys "name" (string), \
"score" (integer 1-10), and "note" (string, one sentence)
- "overall_verdict": one of "APPROVED", "COMMENTED", or "REJECTED"
- "summary": 1-3 sentence plain-English summary of the review
- "findings": array of objects, each with keys "severity" (string), "file" (string), and \
"note" (string) — may be empty

Respond with valid JSON and nothing else. No markdown fences, no commentary.
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
    """Strip optional ``` / ```json fences then validate as a ReviewResult."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    return ReviewResult.model_validate(json.loads(raw))


def verdict_to_label(verdict: str) -> str:
    """Map a verdict to a PR label. Only APPROVED passes."""
    return "ai-cr:passed" if verdict == "APPROVED" else "ai-cr:failed"


def render_markdown(result: ReviewResult) -> str:
    """Render a ReviewResult to the PR comment markdown."""
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
        lines += ["", "### Findings", ""]
        for f in result.findings:
            lines.append(f"- **{f.severity}** `{f.file}` — {f.note}")

    lines += [
        "",
        "---",
        "_This review is advisory and non-blocking._",
    ]
    return "\n".join(lines)


def build_messages(title: str, body: str, diff: str, criteria: str) -> list[dict]:
    """Assemble the system + user messages for the reviewer."""
    user = (
        f"PR title: {title}\n"
        f"PR body: {body or '(none)'}\n\n"
        f"Scoring rubric:\n{criteria}\n\n"
        f"Unified diff:\n```diff\n{diff}\n```"
    )
    return [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]


async def run_review(api_key: str, model: str, messages: list[dict]) -> str:
    """Call z.ai and return the raw message content."""
    client = zai_client(api_key)
    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.1,
    )
    return response.choices[0].message.content or ""


def _empty_diff_result() -> ReviewResult:
    return ReviewResult(
        per_criterion=[],
        overall_verdict="APPROVED",
        summary="No reviewable changes in this diff.",
        findings=[],
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="AI code reviewer (z.ai/GLM).")
    parser.add_argument("--diff-file", required=True)
    parser.add_argument("--title", default="")
    parser.add_argument("--body", default="")
    parser.add_argument("--criteria-file", required=True)
    parser.add_argument("--out-json", required=True)
    parser.add_argument("--out-md", required=True)
    args = parser.parse_args(argv)

    api_key = os.environ.get("AI_PROVIDER_API_KEY", "")
    model = os.environ.get("AI_MODEL_ID", "GLM-4.5-Air")
    if not api_key:
        print("AI_PROVIDER_API_KEY is not set.", file=sys.stderr)
        return 1
    if "." not in api_key:
        print("AI_PROVIDER_API_KEY must be in '{id}.{secret}' format.", file=sys.stderr)
        return 1

    with open(args.diff_file, encoding="utf-8") as f:
        diff = f.read()

    if not diff.strip():
        result = _empty_diff_result()
    else:
        with open(args.criteria_file, encoding="utf-8") as f:
            criteria = f.read()
        messages = build_messages(args.title, args.body, diff, criteria)
        raw = asyncio.run(run_review(api_key, model, messages))
        result = parse_review_json(raw)

    with open(args.out_json, "w", encoding="utf-8") as f:
        f.write(result.model_dump_json())
    with open(args.out_md, "w", encoding="utf-8") as f:
        f.write(render_markdown(result))

    print(f"verdict={result.overall_verdict}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
