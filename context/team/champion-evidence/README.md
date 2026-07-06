# 10xChampion Evidence — Path A (M5L2 + M5L3)

AI code review pipeline on z.ai/GLM, running in CI on every PR to `main`.

## Live proof

- **PR:** https://github.com/sprzesmycki/jobRadar/pull/20
- **Workflow:** https://github.com/sprzesmycki/jobRadar/actions/workflows/ai-review.yml
- **Successful run:** https://github.com/sprzesmycki/jobRadar/actions/runs/28781629430 — `completed / success`
- **Verdict:** `APPROVED` → label `ai-cr:passed`

## Screenshots to add (Phase 4.4)

Save these three PNGs next to this file:

1. `01-run-page.png` — the run page showing the green `review` job.
2. `02-job-logs.png` — the `review` job logs showing the `verdict=` line.
3. `03-pr-comment.png` — the PR conversation showing the "🤖 AI Code Review" comment + the `ai-cr:passed` label.

## Posted review

See [`review-comment.md`](./review-comment.md) for the exact comment the pipeline left on the PR.
