# 10xChampion Evidence — Path A (M5L2 + M5L3)

AI code review pipeline on z.ai/GLM, running in CI on every PR to `main`.

## Live proof

- **PR:** https://github.com/sprzesmycki/jobRadar/pull/20
- **Workflow:** https://github.com/sprzesmycki/jobRadar/actions/workflows/ai-review.yml
- **Successful run:** https://github.com/sprzesmycki/jobRadar/actions/runs/28781629430 — `completed / success`
- **Verdict:** `APPROVED` → label `ai-cr:passed`

## Screenshots

Captured (public repo, run `28781629430`):

1. `01-run-page.png` — the run page showing the green `review` job + `Success`.
2. `02-job-logs.png` — the `review` job step list, all steps green (`Run ./.github/actions/ai-reviewer`, `Comment on PR`, `Apply verdict label`). NOTE: captured logged-out, so the raw log text with the literal `verdict=APPROVED` line is not shown — GitHub gates log text behind sign-in. The confirmed log line is `verdict=APPROVED` (run `28781629430`, `review` job, 09:34:50Z). For a version showing that exact line, re-capture the expanded "Apply verdict label" step while signed in.
3. `03-pr-comment.png` — the PR #20 conversation showing the "🤖 AI Code Review" `Verdict: APPROVED` comment + the `ai-cr:passed` label in the sidebar.

## Posted review

See [`review-comment.md`](./review-comment.md) for the exact comment the pipeline left on the PR.
