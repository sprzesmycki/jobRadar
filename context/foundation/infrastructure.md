---
project: job-radar
researched_at: 2026-05-30T00:00:00+02:00
recommended_platform: Cloudflare Workers + Supabase + self-hosted VPS
runner_up: Cloudflare Workers + Supabase + Railway backend
context_type: mvp
tech_stack:
  language: TypeScript frontend, Python backend
  framework: Astro 6 + React 19, FastAPI
  runtime: Cloudflare Workers workerd, Docker on VPS
  database: Supabase Postgres
  auth: Supabase Auth
  storage: Supabase Storage
  branch: main
---

## Recommendation

**Deploy JobRadar on Cloudflare Workers for the Astro app, Supabase for Auth/Postgres/Storage, and the owner's VPS for the Python FastAPI backend.**

This is the best fit for the current codebase because `astro.config.mjs` uses `output: "server"` with `@astrojs/cloudflare`, and the current `wrangler.jsonc` points at the Astro 6 Cloudflare adapter entrypoint. Cloudflare's current Astro guidance says this setup server-renders pages in a Worker, while `astro dev` and `astro preview` use the `workerd` runtime, so local and production behavior stay close. Supabase covers product primitives without building auth, database, and private CV storage from scratch; the VPS keeps Python PDF/CV parsing and AI orchestration in a conventional Docker environment instead of forcing heavy Python dependencies onto an edge runtime.

Interview assumptions recorded for this decision:

- No user-facing WebSocket requirement in the MVP.
- Background jobs are needed, but they can run in the Python backend container or cron-like backend process on the VPS.
- Cost minimization matters; the existing VPS should be used before adding a paid backend PaaS.
- External managed services are acceptable; co-location under one vendor is not required.
- Global frontend latency is useful, but the first real user base can tolerate a single backend region.

## Platform Comparison

| Platform shape                                  | CLI-first | Managed / serverless | Agent-readable docs | Stable deploy API | MCP / integration | Fit                                                               |
| ----------------------------------------------- | --------- | -------------------- | ------------------- | ----------------- | ----------------- | ----------------------------------------------------------------- |
| Cloudflare Workers + Supabase + VPS FastAPI     | Pass      | Partial              | Pass                | Pass              | Pass              | Recommended                                                       |
| Cloudflare Workers + Supabase + Railway backend | Pass      | Pass                 | Pass                | Pass              | Partial           | Runner-up                                                         |
| Cloudflare Workers + Supabase + Render backend  | Partial   | Pass                 | Partial             | Pass              | Partial           | Third                                                             |
| Vercel + Supabase + VPS FastAPI                 | Pass      | Pass                 | Pass                | Pass              | Pass, beta        | Viable but less aligned                                           |
| Netlify + Supabase + VPS FastAPI                | Pass      | Pass                 | Partial             | Pass              | Pass              | Viable for static/JAMstack, weaker for this Astro Workers starter |
| Fly.io full backend/frontend                    | Pass      | Partial              | Pass                | Pass              | Partial           | Rejected; previous Fly apps were intentionally destroyed          |

Cloudflare wins because the scaffold already targets Workers with Astro 6, Wrangler is first-class, Cloudflare publishes agent-readable docs including `llms.txt`, and Cloudflare has an official MCP server. The tradeoff is that Cloudflare only manages the frontend runtime here; the Python backend still needs VPS discipline.

Railway is the cleanest fallback for the Python backend if the VPS becomes a maintenance problem. Current Railway docs support `railway up`, project tokens for CI, JSON logs, deployment listing, and rollback/redeploy concepts. It adds at least a small monthly platform cost once the app moves beyond free experimentation, but removes most VPS operations.

Render is a reasonable third option for FastAPI because it supports Python web services, API-triggered deploys, rollbacks, and a CLI. Its free web service tier is explicitly not for production applications, so it is a fallback for preview or hobby use, not the preferred MVP production backend.

Vercel is strong operationally and has an official MCP server in beta, but the current Astro starter is tuned for Cloudflare Workers, not Vercel. Moving would be a frontend platform change with little upside for this project.

Netlify has good previews, CLI deploys, and an official MCP server, but its current credit-based pricing and Astro Workers mismatch make it less attractive than Cloudflare for this stack.

Fly.io remains a technically good container platform, but it was already rejected for this project after the Django/Fly direction was abandoned. Reintroducing it would add cost and contradict the cleanup decision unless the VPS path fails.

## Shortlisted Platforms

### 1. Cloudflare Workers + Supabase + VPS FastAPI (Recommended)

Best match for the checked-in stack: Astro 6 SSR on Workers, Supabase for managed data/auth/storage, and existing VPS capacity for Python. Keeps frontend deploys CLI-first with Wrangler and avoids new backend hosting costs.

### 2. Cloudflare Workers + Supabase + Railway Backend

Best fallback if the VPS becomes too manual. It keeps the Cloudflare/Supabase frontend and data decision intact while moving the FastAPI container to a PaaS with a strong CLI and logs.

### 3. Cloudflare Workers + Supabase + Render Backend

Acceptable fallback for a small Python service, especially if Render's service model is preferred. Lower rank because production use likely needs a paid instance and the free tier is not positioned as production-ready.

## Anti-Bias Cross-Check: Cloudflare Workers + Supabase + VPS FastAPI

### Devil's Advocate - Weaknesses

1. The frontend is managed, but the backend is not. A VPS can become an undocumented single-server dependency unless deployment, env vars, logs, backups, and OS patching are written down early.
2. Astro 6 + Cloudflare Workers is current and aligned, but it is still stricter than Node. Dependencies that assume Node APIs, CommonJS, or filesystem behavior may fail in `workerd`.
3. Supabase Auth plus a separate FastAPI backend creates a JWT validation and CORS boundary. If this is casual, the backend can accidentally trust unauthenticated requests or reject legitimate Cloudflare preview domains.
4. CV privacy crosses three systems: Supabase Storage, Cloudflare Worker, and VPS. A single mistaken public bucket, signed URL TTL, or backend log can leak sensitive CV text.
5. Manual direct deploys are good for first production, but without a small runbook they become invisible state: nobody knows which Worker version, Docker image, or migration is live.

### Pre-Mortem - How This Could Fail

Six months after launch, the decision failed because the team treated "free VPS" as "no operations." The Astro frontend deployed cleanly to Cloudflare, but the FastAPI container was updated by hand over SSH with no tagged images, no rollback command, and secrets edited directly on the server. A Supabase RLS policy was added for the frontend, but the backend kept using a service-role key for convenience and logged parsed CV fragments during debugging. Cloudflare preview URLs were not added to the allowed CORS list, so authentication appeared flaky in review builds and fixes were tested directly in production. Meanwhile, a Python PDF parsing dependency started leaking memory on the VPS. Because the process manager and logs were not documented, the app silently failed during long CV parsing runs and users saw stale match scores. The architecture was still basically sound, but the missing runbook, secret boundaries, and backend observability turned a cheap MVP setup into a fragile one-person production system.

### Unknown Unknowns

- Astro 6's Cloudflare adapter changed the Wrangler entrypoint to `@astrojs/cloudflare/entrypoints/server`; older Cloudflare/Astro tutorials that point at `dist/_worker.js/index.js` are stale for this project.
- In Astro 6, `astro dev` and `astro preview` run closer to `workerd`; this is good, but it means local failures may come from runtime compatibility rather than normal Node dev-server behavior.
- Cloudflare Pages commands and Workers commands are not interchangeable. This repo's `wrangler.jsonc` is a Workers-style deploy target, so the first deploy should use `npx wrangler deploy`, not `wrangler pages deploy`.
- Supabase's free tier is attractive for MVP, but free projects can be paused after inactivity and have small DB/storage limits; production beta should have an explicit paid-plan trigger.
- The VPS backend needs a domain and TLS story. If Cloudflare proxies that domain, request headers, body size limits, and CORS behavior should be tested with a real CV upload before public beta.

## Operational Story

- **Preview deploys**: For the first deploy, use manual branch-local verification: `npm run lint`, `npm run build`, and `npx wrangler deploy --dry-run` if available for the installed Wrangler. Full PR previews can come later through Cloudflare/Git integration or CI, but are not required for first production.
- **Production deploy**: Frontend deploys from the local or CI checkout with `npx wrangler deploy` after the branch is merged to `main`. The Worker name is `job-radar`.
- **Backend deploy**: FastAPI deploys to the VPS as a Docker Compose service behind a reverse proxy. First version can be `docker compose up -d --build`; before public beta this should become a tagged image plus a small deploy script.
- **Secrets**: `SUPABASE_URL` and the Supabase anon key live as Cloudflare Worker secrets or environment variables. Supabase service-role key, AI provider keys, and scraper/API credentials live only on the VPS. No service-role key may be imported by frontend code.
- **Rollback**: Frontend rollback is Cloudflare deployment rollback from the dashboard or Wrangler/API once deployment IDs are captured. Backend rollback is a previous Docker image tag or previous compose revision. Supabase migrations do not automatically roll back and require manual review.
- **Approval**: An agent may run lint/build, inspect logs, prepare deploy commands, and deploy preview/non-production. Production deploy, secret rotation, deleting Cloudflare/Supabase resources, and dropping data require human approval.
- **Logs**: Frontend build/runtime logs through Wrangler/Cloudflare dashboard; backend logs through `docker compose logs --tail=200 backend` on the VPS; Supabase auth/database/storage logs through Supabase dashboard or CLI where available.

## Risk Register

| Risk                                                 | Source           | Likelihood | Impact | Mitigation                                                                                                                              |
| ---------------------------------------------------- | ---------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| VPS becomes an undocumented production snowflake     | Pre-mortem       | M          | H      | Add `backend/README.md`, `docker-compose.yml`, `.env.example`, log command, deploy command, and rollback command before opening beta.   |
| Service-role key leaks into Worker/frontend code     | Devil's advocate | M          | H      | Keep service-role and AI keys only in VPS env; add code-review rule and grep check for service-role variable names in `src/`.           |
| Astro dependency fails under `workerd`               | Unknown unknowns | M          | M      | Keep `npm run build` and `astro preview` in the verification gate; avoid Node-only packages in frontend/server-rendered Astro code.     |
| Wrong Cloudflare deploy command used                 | Unknown unknowns | M          | M      | Document this repo as Workers deploy via `npx wrangler deploy`; do not use `wrangler pages deploy` unless the architecture changes.     |
| Supabase free tier pauses or hits limits             | Research finding | M          | M      | Track DB/storage/auth usage; move to Pro before public beta or when CV storage approaches free-tier limits.                             |
| CV files or parsed CV text leak through storage/logs | Devil's advocate | M          | H      | Private Supabase Storage bucket, short-lived signed URLs, no raw CV logs, and backend log redaction around parsing/AI calls.            |
| CORS/JWT mismatch between Worker and FastAPI         | Devil's advocate | M          | M      | Validate Supabase JWTs in FastAPI; explicitly allow production and preview origins; test auth-to-backend flow before deploy signoff.    |
| Direct manual deploy hides what is live              | Pre-mortem       | M          | M      | Record Worker deployment ID, git SHA, Docker image tag, and migration status in `context/deployment/deploy-plan.md` after first deploy. |

## Getting Started

1. Keep this branch on `reset-stack-astro-supabase`, finish verification, then merge to `main`.
2. Create a Cloudflare API token scoped to Workers for the `job-radar` Worker; do not grant DNS or billing permissions to the token.
3. Configure Cloudflare secrets for the Worker: `SUPABASE_URL` and `SUPABASE_KEY` using the hosted Supabase anon key.
4. Run `npm run lint`, `npm run build`, then deploy the frontend with `npx wrangler deploy`.
5. Before implementing the Python backend, add `backend/` with FastAPI, Docker Compose, `.env.example`, health endpoint, and explicit deploy/rollback commands for the VPS.

## Evidence Links

- Cloudflare Astro Workers guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/
- Astro Cloudflare adapter guide: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- Cloudflare Wrangler Pages command reference: https://developers.cloudflare.com/workers/wrangler/commands/pages/
- Cloudflare MCP server: https://github.com/cloudflare/mcp
- Supabase pricing: https://supabase.com/pricing
- Railway CLI deploy docs: https://docs.railway.com/cli/deploying
- Railway pricing docs: https://docs.railway.com/pricing/plans
- Render CLI docs: https://render.com/docs/cli
- Render free-tier docs: https://render.com/free
- Fly.io pricing docs: https://fly.io/docs/about/pricing/
- Vercel MCP docs: https://vercel.com/docs/agent-resources/vercel-mcp
- Netlify pricing docs: https://www.netlify.com/pricing/

## Out of Scope

The following were not implemented by this research:

- Docker image configuration for the FastAPI backend.
- CI/CD pipeline setup beyond correcting the `main` branch trigger.
- Production-scale architecture such as multi-region backend HA, disaster recovery, or formal SLOs.
