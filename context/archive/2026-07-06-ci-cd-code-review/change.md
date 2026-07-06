---
change_id: ci-cd-code-review
title: AI code review pipeline on z.ai/GLM for pull requests
status: archived
created: 2026-07-06
updated: 2026-07-06
archived_at: 2026-07-06T10:38:00Z
---

## Notes

introducing AI code review pipeline on z.ai/GLM for pull requests (10xChampion evidence path A)

## Accepted risks (deferred)

- **Prompt injection via PR content** (impl-review F2): PR title/body/diff are fed to the model whose `overall_verdict` drives the `ai-cr:passed`/`ai-cr:failed` label. A crafted PR could steer the verdict. Accepted for this iteration because the check is **advisory / non-blocking** — the `ai-cr:*` labels MUST stay non-required in branch protection. Revisit (delimit/label untrusted spans, treat verdict as advisory-only) before any move to make the check required.
