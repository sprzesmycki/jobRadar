# Minimal GitHub Packages AI Toolkit Skeleton — Plan Brief

> Full plan: `context/changes/minimal-ai-toolkit-package/plan.md`

## What & Why

Build the Task-3 starter from M5L4 (Shared AI Registry): a minimal Model 1 (GitHub Packages) AI-toolkit package with an idempotent installer/uninstaller. This is a **deliberate learning exercise** — the Mom Test returned "no build" for a solo, one-repo user, so the goal is understanding the distribution mechanism, not shipping a real tool.

## Starting Point

No `ai-toolkit/` exists yet — greenfield scaffold in this repo. Every pattern is fully specified in `docs/m5l4.md`, and the installer's target layout (`.claude/skills/*/SKILL.md` + root `CLAUDE.md`) matches this repo, making local sandbox verification realistic.

## Desired End State

A self-contained `ai-toolkit/` with six files. `node install.js <sandbox>` copies the example skill, injects team rules into the target `CLAUDE.md` between sentinel markers, and writes a manifest — idempotently. `node uninstall.js <sandbox>` reverses it exactly, preserving user content outside the sentinel block. `npm pack --dry-run` succeeds.

## Key Decisions Made

| Decision            | Choice                          | Why                                                        | Source |
| ------------------- | ------------------------------- | ---------------------------------------------------------- | ------ |
| Distribution model  | Model 1 (GitHub Packages)       | Lowest barrier; Models 2/3 = "dystrybucja pod CV" for solo | Plan   |
| Package scope       | `@twoj-zespol/ai-toolkit`       | Neutral placeholder, signals "swap for real scope"        | Plan   |
| Installer scope     | Core: files + sentinel + manifest | Shows the 3 model-agnostic patterns; fully locally testable | Plan   |
| Auth handling       | Excluded                        | Untestable without real CI/registry; no consumer exists   | Plan   |
| Install mode        | Copy only (no symlink)          | Deep-dive symlink mode out of scope                       | Plan   |
| Verification        | Local sandbox dir               | Nothing is published; assert filesystem result            | Plan   |

## Scope

**In scope:** `package.json` + `publishConfig`, one example skill, injectable rules, illustrative publish workflow, `install.js` (copy + sentinel + manifest), `uninstall.js` (manifest-driven).

**Out of scope:** token auth / `.npmrc` injection / `preinstall`, workflow patching, symlink mode, real publication, CodeArtifact/Terraform/API+CLI, version automation, dependency resolution/presets.

## Architecture / Approach

Zero-dependency Node scripts using only `fs`/`path`. Source-of-truth package holds artifacts by type (`skills/`, `rules/`); the installer copies them into a consumer target and records a manifest; the uninstaller reads that manifest to remove exactly what it added. The sentinel-marker splice into `CLAUDE.md` is the one non-trivial piece (idempotent replace, corrupted-block guard).

## Phases at a Glance

| Phase                  | What it delivers                          | Key risk                                    |
| ---------------------- | ----------------------------------------- | ------------------------------------------- |
| 1. Static skeleton     | 6-file package structure + manifest       | `npm pack` file whitelist wrong             |
| 2. Installer           | copy + idempotent sentinel + manifest     | Sentinel non-idempotent / corrupted-block   |
| 3. Uninstaller         | manifest-driven clean removal             | Removing user content outside the block     |

**Prerequisites:** Node available; write access to repo root. No external accounts.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- This is explicitly a learning artifact — if it's ever used for real, auth handling and a real scope must be added before it works against GitHub Packages.
- Sandbox verification stands in for real publication; publishing is never exercised.

## Success Criteria (Summary)

- `install → install → uninstall` on a seeded sandbox leaves it clean, with user content outside the sentinel block untouched.
- Rules inject exactly once and stay single across repeated installs.
- `npm pack --dry-run` lists only the whitelisted files.
