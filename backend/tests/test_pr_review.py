import json

import pytest
from openai import OpenAIError
from pydantic import ValidationError

from scripts import pr_review
from scripts.pr_review import (
    ReviewCriterion,
    ReviewFinding,
    ReviewResult,
    build_messages,
    parse_review_json,
    render_markdown,
    verdict_to_label,
)


def _sample_result() -> ReviewResult:
    return ReviewResult(
        per_criterion=[ReviewCriterion(name="correctness", score=3, note="SQL injection")],
        overall_verdict="REJECTED",
        summary="String-concatenated query is unsafe.",
        findings=[
            ReviewFinding(severity="high", file="users.py", note="Use a parameterized query")
        ],
    )


def test_parse_review_json_strips_fences_and_validates():
    payload = {
        "per_criterion": [{"name": "correctness", "score": 8, "note": "fine"}],
        "overall_verdict": "APPROVED",
        "summary": "looks good",
        "findings": [],
    }
    raw = "```json\n" + json.dumps(payload) + "\n```"
    result = parse_review_json(raw)
    assert result.overall_verdict == "APPROVED"
    assert result.per_criterion[0].name == "correctness"


def test_parse_review_json_rejects_out_of_range_score():
    payload = {
        "per_criterion": [{"name": "correctness", "score": 11, "note": "bad"}],
        "overall_verdict": "APPROVED",
        "summary": "s",
    }
    with pytest.raises(ValidationError):
        parse_review_json(json.dumps(payload))


def test_verdict_to_label_maps_all_verdicts():
    assert verdict_to_label("APPROVED") == "ai-cr:passed"
    assert verdict_to_label("COMMENTED") == "ai-cr:failed"
    assert verdict_to_label("REJECTED") == "ai-cr:failed"


def test_render_markdown_contains_verdict_criterion_table_and_finding():
    md = render_markdown(_sample_result())
    assert "`REJECTED`" in md
    assert "correctness" in md
    assert "| Criterion | Score | Note |" in md
    assert "Use a parameterized query" in md


def test_build_messages_embeds_title_diff_and_criteria():
    messages = build_messages("My Title", "My Body", "the-diff-body", "the-criteria")
    user = messages[1]["content"]
    assert "My Title" in user
    assert "the-diff-body" in user
    assert "the-criteria" in user


def test_main_writes_outputs_with_mocked_run_review(tmp_path, monkeypatch):
    diff_file = tmp_path / "pr.diff"
    diff_file.write_text("diff --git a/x b/x\n+bad", encoding="utf-8")
    criteria_file = tmp_path / "criteria.md"
    criteria_file.write_text("## correctness\n- **1:** bad\n- **10:** good", encoding="utf-8")
    out_json = tmp_path / "review.json"
    out_md = tmp_path / "review.md"

    async def fake_run_review(api_key, model, messages):
        return json.dumps(
            {
                "per_criterion": [{"name": "correctness", "score": 2, "note": "unsafe"}],
                "overall_verdict": "REJECTED",
                "summary": "bad",
                "findings": [],
            }
        )

    monkeypatch.setattr(pr_review, "run_review", fake_run_review)
    monkeypatch.setenv("AI_PROVIDER_API_KEY", "id.secret")

    rc = pr_review.main(
        [
            "--diff-file",
            str(diff_file),
            "--title",
            "T",
            "--body",
            "B",
            "--criteria-file",
            str(criteria_file),
            "--out-json",
            str(out_json),
            "--out-md",
            str(out_md),
        ]
    )
    assert rc == 0
    assert out_json.exists()
    assert out_md.exists()
    assert json.loads(out_json.read_text())["overall_verdict"] == "REJECTED"


def test_main_returns_1_when_key_missing(tmp_path, monkeypatch):
    diff_file = tmp_path / "pr.diff"
    diff_file.write_text("x", encoding="utf-8")
    criteria_file = tmp_path / "criteria.md"
    criteria_file.write_text("c", encoding="utf-8")
    monkeypatch.delenv("AI_PROVIDER_API_KEY", raising=False)

    rc = pr_review.main(
        [
            "--diff-file",
            str(diff_file),
            "--criteria-file",
            str(criteria_file),
            "--out-json",
            str(tmp_path / "review.json"),
            "--out-md",
            str(tmp_path / "review.md"),
        ]
    )
    assert rc == 1


def _cli_argv(tmp_path):
    return [
        "--diff-file",
        str(tmp_path / "pr.diff"),
        "--criteria-file",
        str(tmp_path / "criteria.md"),
        "--out-json",
        str(tmp_path / "review.json"),
        "--out-md",
        str(tmp_path / "review.md"),
    ]


def test_main_empty_diff_approves_without_calling_model(tmp_path, monkeypatch):
    (tmp_path / "pr.diff").write_text("   \n", encoding="utf-8")  # whitespace only
    (tmp_path / "criteria.md").write_text("c", encoding="utf-8")

    async def boom(*args, **kwargs):
        raise AssertionError("run_review must not be called for an empty diff")

    monkeypatch.setattr(pr_review, "run_review", boom)
    monkeypatch.setenv("AI_PROVIDER_API_KEY", "id.secret")

    rc = pr_review.main(_cli_argv(tmp_path))
    assert rc == 0
    assert json.loads((tmp_path / "review.json").read_text())["overall_verdict"] == "APPROVED"


def test_main_returns_1_on_api_error(tmp_path, monkeypatch):
    (tmp_path / "pr.diff").write_text("diff --git a/x b/x\n+bad", encoding="utf-8")
    (tmp_path / "criteria.md").write_text("c", encoding="utf-8")

    async def fake_run_review(*args, **kwargs):
        raise OpenAIError("upstream 503")

    monkeypatch.setattr(pr_review, "run_review", fake_run_review)
    monkeypatch.setenv("AI_PROVIDER_API_KEY", "id.secret")

    rc = pr_review.main(_cli_argv(tmp_path))
    assert rc == 1
    assert not (tmp_path / "review.json").exists()


def test_main_returns_1_on_malformed_model_json(tmp_path, monkeypatch):
    (tmp_path / "pr.diff").write_text("diff --git a/x b/x\n+bad", encoding="utf-8")
    (tmp_path / "criteria.md").write_text("c", encoding="utf-8")

    async def fake_run_review(*args, **kwargs):
        return "sorry, I cannot produce JSON"

    monkeypatch.setattr(pr_review, "run_review", fake_run_review)
    monkeypatch.setenv("AI_PROVIDER_API_KEY", "id.secret")

    rc = pr_review.main(_cli_argv(tmp_path))
    assert rc == 1
