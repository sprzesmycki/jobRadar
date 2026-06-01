---
project: job-radar
created_at: 2026-06-01T00:00:00+02:00
status: deployed
source_contracts:
  tech_stack: context/foundation/tech-stack.md
  infrastructure: context/foundation/infrastructure.md
target:
  frontend: Cloudflare Workers
  worker_name: job-radar
  data_auth_storage: Supabase
  backend: deferred FastAPI Docker service on owner VPS
branch_policy:
  work_branch: reset-stack-astro-supabase
  production_branch: main
---

# First Deployment Plan

This plan covers the first production deployment for the current Astro/Supabase frontend. It does not deploy the future Python FastAPI backend; the backend is explicitly deferred until a `backend/` service, Docker Compose file, and VPS runbook exist.

## Decision

Deploy the Astro 6 app as a Cloudflare Worker using the checked-in `wrangler.jsonc` and `@astrojs/cloudflare` adapter. Use Supabase hosted Auth/Postgres/Storage as the first managed data layer. Use manual, local CLI deployment for the first release, then decide later whether to automate deploys from `main`.

Important command boundary: this project uses `npx wrangler deploy`, not `wrangler pages deploy`.

## Current State

- Branch: `main`.
- Production branch: `main`.
- Worker name: `job-radar`.
- Cloudflare config: `wrangler.jsonc`.
- Build output: Astro server output through `@astrojs/cloudflare`.
- Required runtime values: `SUPABASE_URL`, `SUPABASE_KEY`.
- GitHub CLI must not be used in this repo.
- Unrelated local state: `.claude/` deletions are user-owned and are not part of this deployment plan.

## Human Gates

Stop and wait for human approval at each gate:

1. **Cloudflare account gate**: user confirms Cloudflare login/API token is available for the intended account.
2. **Supabase project gate**: user creates or selects the Supabase project and provides only the public project URL and anon key through local env/CLI prompts, not chat.
3. **Merge gate**: user confirms this branch is merged to `main`, or explicitly approves deploying from this branch for a smoke test.
4. **Production deploy gate**: user approves `npx wrangler deploy` after dry-run, lint, and build pass.
5. **Destructive gate**: deleting Cloudflare Workers, Supabase projects, buckets, tables, or secrets is manual-only and out of scope for automated execution.

## Manual Prerequisites

User actions before deploy:

1. Log in to Cloudflare with the intended account:

   ```bash
   npx wrangler login
   npx wrangler whoami
   ```

2. Create or select a Supabase hosted project.

3. Copy these values from Supabase dashboard to local shell or Cloudflare secret prompts:

   ```bash
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_KEY=<anon-key>
   ```

4. Do not expose the Supabase service-role key to Cloudflare Worker/frontend code. The service-role key is reserved for the future VPS backend only.

## Pre-Deploy Checks

Run from repo root:

```bash
git switch reset-stack-astro-supabase
git status --short --branch
npm install
npm run lint
npm run build
npx wrangler deploy --dry-run --message "dry run before first job-radar deployment"
```

Expected result:

- `npm run lint` exits 0. Existing `astro-eslint-parser` projectService warnings are acceptable.
- `npm run build` exits 0.
- `npx wrangler deploy --dry-run` exits 0 and does not create or update production.
- `git status` shows only intentional changes. User-owned `.claude/` deletions may remain unstaged and must not be added accidentally.

## Merge And Branch Handling

Preferred path:

```bash
git push -u origin reset-stack-astro-supabase
```

Then user opens the compare/PR page manually in the browser and merges to `main`. Do not use `gh`.

After merge:

```bash
git switch main
git pull
git log --oneline -5
npm install
npm run lint
npm run build
```

If user explicitly approves deploying from the feature branch before merge, record that exception in the Deployment Record section below.

## Configure Cloudflare Secrets

Recommended for first deploy: set secrets interactively via Wrangler so values never enter shell history or chat.

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

Operational caveat: current Cloudflare docs state `wrangler secret put` creates a new Worker version and deploys it immediately. If that behavior is undesirable before the first code deploy, use Cloudflare dashboard secrets or deploy once without secrets, then set secrets, then redeploy.

Alternative for one-shot deploy only if a local untracked file is used carefully:

```bash
npx wrangler deploy --secrets-file .env.production --message "first production deploy"
```

Do not commit `.env.production`.

## Deploy

After human approval:

```bash
npx wrangler deploy --message "first production deploy"
```

Capture from command output:

- Worker URL.
- Deployment/version ID if printed.
- Account ID if printed.
- Git SHA deployed.

## Post-Deploy Verification

Run immediately after deploy:

```bash
curl -I https://job-radar.<workers-subdomain>.workers.dev/
curl -I https://job-radar.<workers-subdomain>.workers.dev/auth/signin
curl -I https://job-radar.<workers-subdomain>.workers.dev/dashboard
```

Expected result:

- `/` returns 200.
- `/auth/signin` returns 200.
- `/dashboard` redirects unauthenticated users to `/auth/signin`.
- No secret values appear in Cloudflare logs, terminal output, or client HTML.

Manual browser smoke test:

1. Open the Worker URL.
2. Confirm the landing page renders.
3. Open `/auth/signup` and `/auth/signin`.
4. If Supabase email confirmation is enabled, expect sign-up to require inbox confirmation.
5. Confirm authenticated access to `/dashboard` after sign-in.

## Rollback

If the deployment fails before users depend on it:

```bash
npx wrangler deployments list
npx wrangler rollback
```

For a specific version:

```bash
npx wrangler rollback <VERSION_ID> --message "rollback after failed first deployment"
```

Rollback only affects Worker code/config versions. Supabase data, auth settings, storage buckets, and future database migrations are not rolled back by Wrangler.

## Logs And Debugging

CLI/runtime inspection:

```bash
npx wrangler deployments list
npx wrangler tail
```

Use Cloudflare dashboard for deployment logs if CLI output is insufficient. Use Supabase dashboard for Auth/database/storage logs.

## Deployment Record

Fill this section during execution:

| Field | Value |
|---|---|
| Approved by | Sebastian Przesmycki |
| Deploy date | 2026-06-01T07:16:10.795Z |
| Deployed branch | main |
| Git SHA | 336316e |
| Worker URL | https://job-radar.sebastian-przesmycki.workers.dev |
| Cloudflare account | 613da7471c8cb968dfaf0b26b6b8a247 |
| Worker version/deployment ID | 1e4aee1f-26ae-471a-ad99-fbfe8e607678 |
| Supabase project ref | Configured via `.dev.vars`; value intentionally not recorded |
| Verification result | PASS: `/` 200, `/auth/signin` 200, `/dashboard` 302 to `/auth/signin` |
| Rollback version | c7f9a869-7c1d-4635-953f-2222180cb1fb |
| Notes | First deploy provisioned Cloudflare KV namespace `job-radar-session` for `SESSION`; Worker also has `IMAGES`, `ASSETS`, `SUPABASE_URL`, and `SUPABASE_KEY` bindings. Secrets were provided from local `.dev.vars` and not written to this file. |

## Deferred Work

- Add `backend/` FastAPI service.
- Add Dockerfile, Docker Compose, health endpoint, and VPS deploy/rollback runbook.
- Add private Supabase Storage bucket and RLS/storage policies for CV files.
- Add production custom domain once the Worker smoke test is stable.
- Decide whether CI deploys from `main` or deployment remains manual for MVP.

## References Checked

- Cloudflare Workers versions and deployments, checked 2026-06-01: https://developers.cloudflare.com/workers/configuration/versions-and-deployments/
- Cloudflare Workers secrets, checked 2026-06-01: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Wrangler Worker commands, checked 2026-06-01: https://developers.cloudflare.com/workers/wrangler/commands/workers/
- Astro Cloudflare adapter, checked 2026-06-01: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- Cloudflare Astro Workers guide, checked 2026-06-01: https://developers.cloudflare.com/workers/frameworks/framework-guides/astro/
