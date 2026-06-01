---
starter_id: 10x-astro-starter
package_manager: npm
project_name: job-radar
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
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

## Why this stack

JobRadar should be a product UI, not a Django-template app: the MVP needs a polished authenticated workflow, CV upload, preference management, job dashboards, async AI/CV processing states, and a frontend that can evolve quickly. The revised stack is Astro + React islands + TypeScript deployed to Cloudflare Workers through the Astro Cloudflare adapter, Supabase for Auth/Postgres/Storage, and a separate FastAPI backend in a Docker container on the owner's existing VPS for Python-heavy CV parsing, matching, and AI orchestration. This keeps the frontend agent-friendly and Cloudflare-cheap while avoiding Python-on-edge package risk; Supabase supplies mature auth, relational data, and file storage without building those primitives from scratch.
