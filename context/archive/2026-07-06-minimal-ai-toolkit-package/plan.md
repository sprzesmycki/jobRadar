# Minimal GitHub Packages AI Toolkit Skeleton — Implementation Plan

## Overview

Build a minimal Model 1 (GitHub Packages) AI-toolkit package skeleton as a deliberate **learning exercise** from M5L4 (Shared AI Registry). It is NOT solving real team friction — the Mom Test (`context/team/mom-test-validation.md`) returned "no build" for a solo, one-repo user. The value here is understanding the distribution mechanism, not shipping it.

The deliverable is the Task-3 starter from M5L4 (`docs/m5l4.md:456`): a source-of-truth package containing versioned AI artifacts plus an idempotent installer/uninstaller. Scope is trimmed to the **core installer** (files + sentinel markers + manifest) — no token-auth injection, no workflow patching.

## Current State Analysis

- No `ai-toolkit/` directory exists yet — this is a greenfield scaffold inside the repo.
- All required patterns are fully specified in `docs/m5l4.md`: `publishConfig` (`:116`), consumer `.npmrc` (`:128`), sentinel `applyRules` (`:271`), manifest shape (`:293`), installer anatomy (Deep Dive `:489`).
- The repo already uses `.claude/skills/*/SKILL.md` layout and a root `CLAUDE.md` with rules — so the installer's *target* conventions match this very repo, which makes local sandbox verification realistic.
- Nothing will be published to a real registry (no team, no consumers), so all verification is local: run the installer against a throwaday sandbox directory and assert the filesystem result.

## Desired End State

A self-contained `ai-toolkit/` package at the repo root with six files. Running `node ai-toolkit/install.js <sandbox>` copies the example skill into `<sandbox>/.claude/skills/`, injects team rules into `<sandbox>/CLAUDE.md` between sentinel markers, and writes a manifest. Running it twice produces the same result (idempotent). Running `node ai-toolkit/uninstall.js <sandbox>` removes exactly what was installed, leaving any user content outside the sentinel block untouched. `npm pack --dry-run` inside `ai-toolkit/` succeeds.

### Key Discoveries:

- Sentinel injection must be idempotent — locate `BEGIN`/`END` pair, replace only the block between them (`docs/m5l4.md:271`).
- Manifest drives uninstall — remove exactly the recorded files rather than guessing from directory contents (`docs/m5l4.md:310`).
- Copy mode (not symlink) is mandatory for `npx`-style installs because the cache is ephemeral (`docs/m5l4.md:493`); we use copy for the same reason and to keep the exercise runnable from anywhere.
- The example `SKILL.md` and `rules/CLAUDE.md` are placeholder artifacts — their *content* is not the point; the *distribution mechanism* is.

## What We're NOT Doing

- **No token auth** — no `ensureGitHubPackagesAuth`, no `.npmrc` auth-line injection, no `preinstall` script, no CI secret handling. (M5L4 Model 1's "real difficulty" — deliberately out of scope.)
- **No workflow patching** — the installer does not touch consumer `actions/setup-node` / `npm ci` steps.
- **No symlink install mode** — copy only.
- **No real publication** — the `publish-ai-toolkit.yml` is illustrative and never run; nothing is pushed to GitHub Packages.
- **No CodeArtifact / Terraform / API+CLI** (Models 2 & 3) — those are `/pack-init`, `/tf-registry`, `/setup-cicd` territory and would be "dystrybucja pod CV" for a solo user.
- **No semantic-release / version automation** — version is a static field in `package.json`.
- **No dependency resolution / presets / migration** (installer Deep Dive extras) — single skill, no `requires`.

## Implementation Approach

Three phases, each independently verifiable against a sandbox directory. Static artifacts first (nothing to run, just structure), then the installer (the one place with real logic), then the uninstaller (which depends on the installer's manifest). Node's built-in `fs`/`path` only — no dependencies, so the package installs and runs with zero external footprint.

## Critical Implementation Details

- **Sentinel corruption case** — if exactly one of `BEGIN`/`END` markers is present in the target `CLAUDE.md` (half-edited by a human), the installer must not silently duplicate rules. Treat as a corrupted block and fail loudly rather than append a second block (`docs/m5l4.md:289`). This is the one non-obvious edge case.
- **Path safety** — the target directory is an argument; both scripts must resolve paths under the given target and never write outside it.

## Phase 1: Static Package Skeleton

### Overview

Create the non-executable structure: package manifest, one example skill, team rules to be injected, and an illustrative publish workflow.

### Changes Required:

#### 1. Package manifest

**File**: `ai-toolkit/package.json`

**Intent**: Declare the package identity and point publication at GitHub Packages. This is the "whole infrastructure config on the producer side" from M5L4.

**Contract**: Valid npm manifest with `name: "@twoj-zespol/ai-toolkit"`, a static `version`, `private: false`, `files` whitelisting `skills/`, `rules/`, `install.js`, `uninstall.js`, and `publishConfig.registry: "https://npm.pkg.github.com"`. No dependencies. No `bin` needed (invoked via `node`).

#### 2. Example skill artifact

**File**: `ai-toolkit/skills/code-review/SKILL.md`

**Intent**: A single placeholder skill that the installer will copy, proving the skills-distribution path. Content is illustrative, not load-bearing.

**Contract**: Standard `SKILL.md` with frontmatter (`name: code-review`, one-line `description`) and a short body. No `requires` field (keeps dependency resolution out of scope).

#### 3. Team rules to inject

**File**: `ai-toolkit/rules/CLAUDE.md`

**Intent**: The rules block the installer splices into a consumer's `CLAUDE.md` between sentinel markers.

**Contract**: Plain markdown, a few lines of example team conventions. Must NOT itself contain the sentinel markers (that is the injection-guard case handled in Phase 2).

#### 4. Illustrative publish workflow

**File**: `ai-toolkit/.github/workflows/publish-ai-toolkit.yml`

**Intent**: Show how CI publishes the package to GitHub Packages on merge to main. Never executed here — documentation-as-code.

**Contract**: GitHub Actions workflow triggered on push to `main`, with `permissions: packages: write`, `actions/setup-node` configured with `registry-url: https://npm.pkg.github.com`, and an `npm publish` step using `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. Mirrors M5L4 `:148` (ephemeral write token).

### Success Criteria:

#### Automated Verification:

- Directory structure exists: `test -f ai-toolkit/package.json && test -f ai-toolkit/skills/code-review/SKILL.md && test -f ai-toolkit/rules/CLAUDE.md && test -f ai-toolkit/.github/workflows/publish-ai-toolkit.yml`
- `package.json` is valid JSON: `node -e "JSON.parse(require('fs').readFileSync('ai-toolkit/package.json'))"`
- Packaging works: `cd ai-toolkit && npm pack --dry-run` exits 0 and lists the whitelisted files
- Rules file does not contain sentinel markers: `! grep -q 'BEGIN @twoj-zespol/ai-toolkit' ai-toolkit/rules/CLAUDE.md`

#### Manual Verification:

- `SKILL.md` and `rules/CLAUDE.md` read as plausible placeholder artifacts (content is illustrative)
- `publishConfig.registry` and workflow token usage match M5L4 Model 1

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 2: Installer (copy mode)

### Overview

`install.js` copies skills into the target's `.claude/skills/`, injects rules into the target `CLAUDE.md` idempotently via sentinel markers, and records a manifest.

### Changes Required:

#### 1. Installer script

**File**: `ai-toolkit/install.js`

**Intent**: Apply the package's artifacts into a consumer project passed as a CLI argument, using copy mode, and record exactly what was written so uninstall is deterministic.

**Contract**: `node install.js <targetDir>`. Behavior:
- Copy `skills/**` → `<targetDir>/.claude/skills/**` (create dirs as needed).
- Read `rules/CLAUDE.md`; splice it into `<targetDir>/CLAUDE.md` between `<!-- BEGIN @twoj-zespol/ai-toolkit -->` and `<!-- END @twoj-zespol/ai-toolkit -->`. If both markers exist, replace only the block (idempotent). If neither exists, append the block. If exactly one exists, throw (corrupted block).
- Write `<targetDir>/.claude/.10x-toolkit-manifest.json` recording `package`, `version` (read from `package.json`), `tool: "claude-code"`, and the explicit list of installed skill files.
- Idempotent: a second run copies the same files and leaves a single rules block.

The sentinel splice is the one non-obvious piece — implement per `docs/m5l4.md:271` (`applyRules`):

```js
function applyRules(existing, teamRules) {
  const BEGIN = "<!-- BEGIN @twoj-zespol/ai-toolkit -->";
  const END = "<!-- END @twoj-zespol/ai-toolkit -->";
  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END);
  if ((start === -1) !== (end === -1)) throw new Error("Corrupted sentinel block");
  const block = `${BEGIN}\n${teamRules.trim()}\n${END}`;
  if (start !== -1 && end !== -1) {
    return existing.slice(0, start) + block + existing.slice(end + END.length);
  }
  return existing.trimEnd() + "\n\n" + block + "\n";
}
```

### Success Criteria:

#### Automated Verification:

- Fresh install into a sandbox creates the skill: run `node ai-toolkit/install.js "$SANDBOX"`, then `test -f "$SANDBOX/.claude/skills/code-review/SKILL.md"`
- Manifest exists and is valid JSON recording the skill file: `node -e "const m=require('$SANDBOX/.claude/.10x-toolkit-manifest.json'); if(!m.files) process.exit(1)"`
- Rules injected once: `grep -c 'BEGIN @twoj-zespol/ai-toolkit' "$SANDBOX/CLAUDE.md"` returns `1`
- Idempotent: run install again; marker count still `1` and skill file still present
- Corrupted-block guard: with a `CLAUDE.md` containing only `BEGIN`, install exits non-zero
- Pre-existing user content in the sandbox `CLAUDE.md` outside the block is preserved (assert a sentinel-free line survives)

#### Manual Verification:

- Injected block reads correctly inside a realistic `CLAUDE.md`
- Copied `SKILL.md` is byte-identical to the source

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 3: Uninstaller

### Overview

`uninstall.js` reverses an install using the manifest, removing exactly what was added and stripping the sentinel block, without touching user content.

### Changes Required:

#### 1. Uninstaller script

**File**: `ai-toolkit/uninstall.js`

**Intent**: Cleanly remove the toolkit from a consumer project by reading the manifest rather than guessing, so removal is safe even if the skill set changed between versions.

**Contract**: `node uninstall.js <targetDir>`. Behavior:
- Read `<targetDir>/.claude/.10x-toolkit-manifest.json`; if absent, exit 0 with a "nothing to remove" message (safe no-op).
- Delete exactly the skill files listed in the manifest (and now-empty skill dirs).
- Strip the sentinel block from `<targetDir>/CLAUDE.md` (remove `BEGIN..END` inclusive), leaving surrounding user content intact. If the resulting file is empty/whitespace, still leave a valid file.
- Delete the manifest file.
- Idempotent: a second run is a safe no-op.

### Success Criteria:

#### Automated Verification:

- Round-trip clean: `install` then `uninstall` into a sandbox seeded with a user line → skill file gone (`! test -f "$SANDBOX/.claude/skills/code-review/SKILL.md"`), no sentinel markers remain (`! grep -q 'BEGIN @twoj-zespol/ai-toolkit' "$SANDBOX/CLAUDE.md"`), manifest gone (`! test -f "$SANDBOX/.claude/.10x-toolkit-manifest.json"`)
- User content preserved: the seeded non-sentinel line still present in `CLAUDE.md` after uninstall
- Safe no-op: `uninstall` on a sandbox with no manifest exits 0

#### Manual Verification:

- After round-trip, the sandbox `CLAUDE.md` is visually clean (no stray blank blocks or orphaned markers)

**Implementation Note**: After completing this phase and all automated verification passes, pause for final manual confirmation.

---

## Testing Strategy

### Unit / Script Tests:

- Sentinel `applyRules`: fresh append, idempotent replace, corrupted-block throw.
- Manifest write/read round-trip.

### Integration Tests (sandbox-driven, the primary verification):

1. Create a temp sandbox dir with a seeded `CLAUDE.md` containing a user line.
2. `install` → assert skill file, manifest, single rules block, preserved user line.
3. `install` again → assert idempotency.
4. `uninstall` → assert everything the toolkit added is gone, user line survives, manifest removed.

### Manual Testing Steps:

1. Run the full install → install → uninstall cycle against a copy of this repo's own `.claude/`-style layout and eyeball the diffs.
2. Confirm `npm pack --dry-run` lists only whitelisted files.

## Migration Notes

Not applicable — greenfield scaffold, no existing data.

## References

- Lesson source: `docs/m5l4.md` (Model 1 `:105`, sentinel `:271`, manifest `:293`, installer anatomy `:489`)
- Opportunity map: `context/team/opportunity-map.md`
- Mom Test verdict (why this is a learning exercise): `context/team/mom-test-validation.md`
- Change identity: `context/changes/minimal-ai-toolkit-package/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Static Package Skeleton

#### Automated

- [x] 1.1 Directory structure exists (package.json, SKILL.md, rules/CLAUDE.md, workflow) — 9fbed3e
- [x] 1.2 package.json is valid JSON — 9fbed3e
- [x] 1.3 npm pack --dry-run exits 0 and lists whitelisted files — 9fbed3e
- [x] 1.4 Rules file does not contain sentinel markers — 9fbed3e

#### Manual

- [x] 1.5 SKILL.md and rules/CLAUDE.md read as plausible placeholder artifacts — 9fbed3e
- [x] 1.6 publishConfig.registry and workflow token usage match M5L4 Model 1 — 9fbed3e

### Phase 2: Installer (copy mode)

#### Automated

- [x] 2.1 Fresh install into sandbox creates the skill file — 82cbb1b
- [x] 2.2 Manifest exists and is valid JSON recording the skill file — 82cbb1b
- [x] 2.3 Rules injected exactly once (marker count = 1) — 82cbb1b
- [x] 2.4 Second install is idempotent (marker count still 1, skill present) — 82cbb1b
- [x] 2.5 Corrupted-block guard: install with only BEGIN marker exits non-zero — 82cbb1b
- [x] 2.6 Pre-existing user content outside the block is preserved — 82cbb1b

#### Manual

- [x] 2.7 Injected block reads correctly inside a realistic CLAUDE.md — 82cbb1b
- [x] 2.8 Copied SKILL.md is byte-identical to source — 82cbb1b

### Phase 3: Uninstaller

#### Automated

- [x] 3.1 Round-trip clean: install then uninstall removes skill, markers, manifest — 0d5ccc1
- [x] 3.2 User content preserved after uninstall — 0d5ccc1
- [x] 3.3 Safe no-op: uninstall with no manifest exits 0 — 0d5ccc1

#### Manual

- [x] 3.4 After round-trip, CLAUDE.md is visually clean (no orphaned markers/blank blocks) — 0d5ccc1
