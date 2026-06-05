---
bootstrapped_at: 2026-05-28T13:20:00Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: job-radar
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
---
starter_id: 10x-astro-starter
package_manager: npm
project_name: job-radar
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: true
    conventions: true
    docs_current: true
    can_judge_agent: true
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: true
---
```

JobRadar should be a product UI, not a Django-template app: the MVP needs a polished authenticated workflow, CV upload, preference management, job dashboards, async AI/CV processing states, and a frontend that can evolve quickly. The revised stack is Astro + React islands + TypeScript on Cloudflare Pages for the user-facing app, Supabase for Auth/Postgres/Storage, and a separate FastAPI backend in a Docker container on the owner's existing VPS for Python-heavy CV parsing, matching, and AI orchestration. This keeps the frontend agent-friendly and Cloudflare-cheap while avoiding Python-on-edge package risk; Supabase supplies mature auth, relational data, and file storage without building those primitives from scratch.

## Pre-scaffold verification

| Signal      | Value   | Severity | Notes                                                                          |
| ----------- | ------- | -------- | ------------------------------------------------------------------------------ |
| npm package | not run | n/a      | Starter is cloned from GitHub, not created through an npm create package       |
| GitHub repo | not run | n/a      | GitHub CLI is intentionally disabled for this environment per user instruction |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold` followed by `npm install` in `.bootstrap-scaffold`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: starter files moved into repository root; `context/` preserved
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold`
**.gitignore handling**: append-merged
**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: direct findings include `@astrojs/check` (MODERATE) and `wrangler` (MODERATE); the HIGH finding is transitive (`devalue`)

#### CRITICAL findings

None.

#### HIGH findings

- `devalue` transitive dependency, GHSA-77vg-94rm-hx3p, DoS via sparse array deserialization. Fix is available through dependency updates.

#### MODERATE findings

- `@astrojs/check` direct dependency via `@astrojs/language-server`.
- `wrangler` direct dev dependency via `miniflare`.
- Transitive findings include `@astrojs/language-server`, `@cloudflare/vite-plugin`, `miniflare`, `volar-service-yaml`, `ws`, `yaml`, and `yaml-language-server`.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| bootstrapper_confidence | first-class                                                                                       |
| quality_override        | false                                                                                             |
| path_taken              | custom                                                                                            |
| self_check_answers      | typed=true, from_official_starter=true, conventions=true, docs_current=true, can_judge_agent=true |
| team_size               | solo                                                                                              |
| deployment_target       | cloudflare-pages                                                                                  |
| ci_provider             | github-actions                                                                                    |
| ci_default_flow         | auto-deploy-on-merge                                                                              |
| has_auth                | true                                                                                              |
| has_payments            | false                                                                                             |
| has_realtime            | false                                                                                             |
| has_ai                  | true                                                                                              |
| has_background_jobs     | true                                                                                              |

## Next steps

Next: configure the app for the concrete Supabase project and the VPS-hosted FastAPI backend. Useful manual steps in the meantime:

- Review `CLAUDE.md.scaffold` against the existing project instructions and decide whether any starter-specific guidance should be merged.
- Configure Supabase Auth, Postgres, and private Storage buckets before building user flows.
- Add the FastAPI backend scaffold and Docker Compose setup for the VPS in a follow-up branch.
- Address the npm audit findings per risk tolerance; the full audit summary is above.
