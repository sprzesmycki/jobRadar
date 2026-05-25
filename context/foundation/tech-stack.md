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

## Why this stack

A solo developer shipping a job aggregation and CV matching web app in 3 weeks needs a batteries-included Python starter that handles auth, ORM, and migrations from day 1. Django is the recommended default for `(web-app, python)` and clears all four agent-friendly gates; bootstrapper confidence is verified, so scaffolding will be smooth. Auth is critical per PRD (FR-001, FR-002) — Django's built-in auth system eliminates significant setup friction. The `has_ai` flag is true (CV-to-job matching and cover letter generation per FR-006–FR-008), but the PRD explicitly scopes this to external AI APIs rather than own model training, which the Python ecosystem handles cleanly. Deployment targets Fly.io — the Django card's first deployment default — with GitHub Actions and auto-deploy on merge to main.
