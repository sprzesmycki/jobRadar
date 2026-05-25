---
bootstrapped_at: 2026-05-25T19:05:10Z
starter_id: django
starter_name: Django
project_name: job-radar
language_family: python
package_manager: uv
cwd_strategy: native-cwd
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: "pip-audit --format json"
---

## Hand-off

```yaml
---
starter_id: django
package_manager: uv
project_name: job-radar
hints:
  language_family: python
  team_size: solo
  deployment_target: fly
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---
```

**Why this stack**: A solo developer shipping a job aggregation and CV matching web app in 3 weeks needs a batteries-included Python starter that handles auth, ORM, and migrations from day 1. Django is the recommended default for `(web-app, python)` and clears all four agent-friendly gates; bootstrapper confidence is verified, so scaffolding will be smooth. Auth is critical per PRD (FR-001, FR-002) — Django's built-in auth system eliminates significant setup friction. The `has_ai` flag is true (CV-to-job matching and cover letter generation per FR-006–FR-008), but the PRD explicitly scopes this to external AI APIs rather than own model training, which the Python ecosystem handles cleanly. Deployment targets Fly.io — the Django card's first deployment default — with GitHub Actions and auto-deploy on merge to main.

## Pre-scaffold verification

| Signal      | Value                                    | Severity | Notes                          |
| ----------- | ---------------------------------------- | -------- | ------------------------------ |
| npm package | not run                                  | n/a      | Python starter — no npm check  |
| GitHub repo | django/django last pushed 2026-05-25     | fresh    | from card docs_url (djangoproject.com → django/django) |

## Scaffold log

**Resolved invocation**: `uv init --no-readme . && uv add django && uv run django-admin startproject job_radar .`
**Strategy**: native-cwd
**Exit code**: 0
**Pre-flight files-to-touch**: manage.py, job_radar/__init__.py, job_radar/settings.py, job_radar/urls.py, job_radar/wsgi.py, job_radar/asgi.py
**Files written by CLI**: 11 (manage.py, job_radar/__init__.py, job_radar/settings.py, job_radar/urls.py, job_radar/wsgi.py, job_radar/asgi.py, pyproject.toml, uv.lock, .python-version, main.py, .gitignore)
**Pre-existing files preserved**: context/, CLAUDE.md, .claude/, .agents/, .idea/, .git/, init.md, skills-lock.json

## Post-scaffold audit

**Tool**: pip-audit --format json
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
**Direct vs transitive**: not distinguished by pip-audit

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

None.

#### LOW / INFO findings

None.

**Full dependency list audited**: asgiref 3.11.1, django 6.0.5, sqlparse 0.5.5 (direct); pip-audit and its transitive deps (dev-only).

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | verified             |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | fly                  |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | true                 |
| has_background_jobs     | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
