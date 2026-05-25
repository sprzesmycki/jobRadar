---
project: job-radar
researched_at: 2026-05-25T21:53:21Z
recommended_platform: Fly.io
runner_up: Railway
context_type: mvp
tech_stack:
  language: python
  framework: django
  runtime: python-wsgi-gunicorn
  package_manager: uv
---

## Recommendation

**Deploy on Fly.io.**

Fly.io is the recommended platform for this Django 6.0.5 + uv stack. It supports full WSGI persistent processes (no cold-start problem), provides a comprehensive CLI (`flyctl`) for all operational tasks, has a documented Django guide, and supports multi-region deployment — directly addressing the "global users" requirement from the interview. The main setup friction is that `fly launch` does not yet detect uv projects, requiring a custom Dockerfile upfront. This is a one-time 30–60 minute cost, after which the full CLI-driven deployment loop is smooth. Cost floor for a solo MVP without managed Postgres: ~$2–6/month.

---

## Platform Comparison

| Platform | CLI-first | Managed | Agent docs | Deploy API | MCP | **Score** | Django fit |
|---|---|---|---|---|---|---|---|
| **Fly.io** | Pass | Pass | Partial | Pass | Partial | **8/10** | ✓ Full WSGI, multi-region |
| **Railway** | Pass | Pass | Pass | Pass | Partial | **9/10** | ✓ Native uv, auto-detect |
| **Render** | Partial | Pass | Pass | Partial | Partial | **7/10** | ✓ Native uv GA, simpler |
| Vercel | Pass | Pass | Pass | Pass | Partial | 9/10* | ✗ Serverless-only, cold starts |
| Cloudflare Workers | — | — | — | — | — | dropped | ✗ No TCP, no transactions |
| Netlify | — | — | — | — | — | dropped | ✗ No Python runtime |

*Vercel scores 9 on agent-friendly criteria but is incompatible with a conventional Django monolith: serverless-only, 3–7s cold starts, no `manage.py` on platform, WebSockets blocked.

**Dropped platforms:**
- **Cloudflare Workers** — Python support is open beta; Django requires a community adapter (`django-cf`); TCP socket is blocked (no PostgreSQL via psycopg2/asyncpg); transactions are disabled in D1 (breaks Django's `atomic()`, the test runner, and `select_for_update`). Architectural mismatch, not a scoring matter.
- **Netlify** — No Python function runtime; cannot run Django WSGI. The platform is static + JavaScript/Go serverless only. Hard incompatibility.

---

### Shortlisted Platforms

#### 1. Fly.io (Recommended)

Fly.io runs Django in a Docker container on persistent VMs ("Machines"). `flyctl` covers the full operational loop: `fly deploy` (build + push + deploy), `fly logs` (live log tailing), `fly ssh console` (management commands like `migrate`), `fly scale` (vertical + horizontal), and `fly releases` + `fly deploy --image` for rollbacks. Always-on by default (`auto_stop_machines = "off"` in `fly.toml`) with opt-in scale-to-zero. Multi-region support via `fly regions add` aligns with the global-reach preference from the interview. The main gap is uv: `fly launch` does not detect uv projects (as of 2026-05-25), requiring a custom Dockerfile. Docs are available per-page as markdown via GitHub but there is no `llms.txt` index (404). The `fly mcp server` command exists but is marked `[experimental]`.

**Why it won over Railway:** the multi-region capability is genuinely relevant for a job aggregation app targeting global remote developers. Railway is single-region per service at MVP. The tech-stack hand-off also selected `deployment_target: fly`, confirming alignment with the earlier stack decision.

#### 2. Railway

Railway is the highest-scoring platform on the agent-friendly criteria matrix. Railpack (Railway's build system) natively detects `uv.lock` and handles Python + Django auto-detection without a custom Dockerfile — the smoothest onboarding path for this stack. Always-on persistent processes. `railway.com/llms.txt` is available. The official MCP server (`@railway/mcp-server`, beta as of August 2025) enables Claude Code to deploy, view logs, and manage env vars. Fell to runner-up because: single-region per service (no native multi-region), MCP server is self-described "work in progress", no CLI rollback command, and no automatic PostgreSQL backups on the Hobby plan.

#### 3. Render

Render is the simplest path to production for this specific stack: native Python runtime with uv support (GA June 2025), zero-config `uv sync` for builds, `llms.txt` + `llms-full.txt` for agent-readable docs, and a GA MCP server (`mcp.render.com`). Fell to third because: CLI rollback is not implemented (API/dashboard only, which limits agent-driven rollback), free tier has 15-minute sleep and 1-minute cold starts (requiring the $7/month Starter plan for any real usage), and the Render MCP server cannot trigger deploys — it is read-heavy and cannot complete the full operational loop from an agent session.

---

## Anti-Bias Cross-Check: Fly.io

### Devil's Advocate — Weaknesses

1. **No uv support in `fly launch`** — `fly launch` fails to detect uv projects and falls back to Poetry assumptions. A custom Dockerfile is required on day 1, pulling the uv binary from `ghcr.io/astral-sh/uv`. This is 30–60 minutes of setup friction before writing any product code.
2. **Managed Postgres pricing cliff** — Fly's Managed Postgres (MPG) starts at $38/month. The practical alternative (self-managed Fly Postgres VM at ~$2–5/month) requires manual backup configuration that most solo developers skip until something goes wrong.
3. **No `llms.txt` or dedicated LLM manifest** — `fly.io/llms.txt` returns 404. Agents need per-page GitHub fetching for Fly docs, increasing the risk of stale or incorrect CLI invocations.
4. **MCP server is experimental** — `fly mcp server` is marked `[experimental]`; the GitHub repo had 31 stars at research time. Agent-driven Fly.io operations will rely on CLI parsing, not structured MCP tool calls.
5. **Rollback has no dedicated single command** — Rollback requires: `fly releases` → identify image tag → `fly deploy --image registry.fly.io/appname:<tag>`. A 3-step process with failure surface at each step.

### Pre-Mortem — How This Could Fail

The developer spends the first two hours of week 1 fighting the custom Dockerfile. `fly launch` generates a broken Dockerfile assuming Poetry; they copy a community uv template, push, and deploy successfully. Weeks 1–3 proceed well. At week 3, they add `SECRET_KEY` as a Fly secret but `collectstatic` in the Dockerfile still needs it at build time — it's not available as a build arg. They add a dummy key to the Dockerfile, forget to rotate it, and ship with a hardcoded dummy `SECRET_KEY` in the image. Meanwhile, CV uploads (PDFs) are written to the container filesystem because the developer missed the ephemeral-filesystem note in the docs. On the first redeploy, all uploaded CVs are wiped. The feature that drives the whole product — CV-to-job matching — stops working. The debug session eats the rest of week 3 and the developer ships late or not at all.

### Unknown Unknowns

- **`SECRET_KEY` at Docker build time** — `collectstatic` runs during `RUN` (build), but Fly secrets are runtime-only. The fix (`ENV SECRET_KEY=dummy-build-only` in the Dockerfile) is non-obvious and doesn't appear in the official Django guide; it surfaces only in community threads.
- **Tigris object storage is beta** — CV uploads (PDF, FR-003) need external object storage since container filesystems are ephemeral. Tigris is Fly's native storage option, but it carries a beta status as of 2026-05-25. Using a beta service for the product's core user data (CVs) is a risk to name and plan around.
- **Inter-region private network bandwidth became paid (February 2026)** — if the app and Managed Postgres land in different regions (even accidentally), there is now a bandwidth charge. The pricing page fine print is the only place this is documented.
- **`fly launch` does not add `release_command` for migrations** — without `release_command = "python manage.py migrate --noinput"` in `fly.toml`, DB schema and app code diverge silently after the first migration-bearing deploy.
- **Django 6.0 is stricter on `ALLOWED_HOSTS`** — the correct Fly config (`['<appname>.fly.dev']`) is not in the official guide; the naive fix (`ALLOWED_HOSTS = ['*']`) in production is a security issue that passes local testing silently.

---

## Operational Story

- **Preview deploys**: Fly.io does not have automatic branch/PR preview deployments in the same way as Vercel/Netlify. Use `fly deploy --app <preview-app-name>` to manually push to a separate app named e.g. `job-radar-preview`. Preview apps are not automatically protected; add Fly access tokens or external auth if needed.
- **Secrets**: All env vars and tokens live in Fly secrets (`fly secrets set KEY=value`). Secrets are encrypted at rest and injected at runtime. They are not visible after setting — `fly secrets list` shows key names only. Rotation: `fly secrets set KEY=newvalue` with no downtime. Never stored in `fly.toml` (that file is committed to the repo).
- **Rollback**: `fly releases --app job-radar` to list past releases with image tags → `fly deploy --image registry.fly.io/job-radar:<tag> --strategy immediate` to revert. Typical time-to-revert: ~30 seconds (no rebuild — image already in registry). DB migrations applied in the forward direction do not auto-roll back; handle via Django migration reversals before rolling back app code.
- **Approval**: Migrations (`fly ssh console --pty -C "python manage.py migrate"`), adding/removing regions (`fly regions add/remove`), scaling beyond a single machine (`fly scale count N`) — these require human decision. `fly deploy` from CI may run unattended; destructive operations (DB drop, secret rotation) are human-only.
- **Logs**: `fly logs --app job-radar` tails live logs. Filter by instance: `fly logs -i <instance-id>`. Filter by region: `fly logs -r lax`. Logs are not persisted beyond a short rolling window by default; for structured log querying, pipe to a log sink (Papertrail, Logtail, or Fly's Prometheus integration).

---

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Custom Dockerfile blocks week-1 setup | Devil's advocate | H | M | Use the community uv+Django Dockerfile template from fly.io/docs/django/ before starting; add to repo on day 1 |
| `SECRET_KEY` hardcoded in Dockerfile for `collectstatic` | Unknown unknowns | H | H | Add `ENV SECRET_KEY=dummy-build-only-not-production` in Dockerfile; set real key via `fly secrets set SECRET_KEY=<value>` before first deploy |
| CV uploads (PDFs) wiped on redeploy | Pre-mortem | H | H | Configure Tigris (or S3-compatible) as `DEFAULT_FILE_STORAGE` before accepting any user uploads; never use container local storage for user files |
| Tigris in beta for core user data | Unknown unknowns | M | H | Monitor Tigris GA announcement; have S3 (AWS) as a fallback config ready; keep a local backup script for early beta users |
| Managed Postgres $38/month cost floor | Devil's advocate | H | M | Use self-managed Fly Postgres VM ($2–5/month); set up `pg_dump` cron from day 1; document backup procedure in CLAUDE.md |
| Migrations not running on deploy | Unknown unknowns | H | M | Add `release_command = "python manage.py migrate --noinput"` to `fly.toml` before first real deploy |
| DB schema / app divergence after failed migration | Pre-mortem | M | H | Test migrations in a staging app (`job-radar-staging`) before deploying to production; keep `--noinput` in release_command |
| `ALLOWED_HOSTS` misconfiguration | Unknown unknowns | M | L | Set `ALLOWED_HOSTS = [os.environ.get('FLY_APP_NAME', '') + '.fly.dev', 'your-custom-domain.com']` from day 1 |
| No persistent log archive for debugging | Research finding | M | M | Add a log sink (Logtail free tier or Papertrail) in week 1; configure Django's `logging` to stdout so Fly captures all app logs |
| Inter-region bandwidth charges (post-Feb 2026) | Unknown unknowns | L | M | Deploy app and Postgres in the same region (`fly.toml` and Postgres cluster: both `fra` or `lax`); verify with `fly regions list` |
| Emergency rollback is 3-step manual process | Devil's advocate | L | M | Document rollback procedure in CLAUDE.md; keep last 3 release image tags noted after each deploy |

---

## Getting Started

1. **Install flyctl**: `curl -L https://fly.io/install.sh | sh` → `fly auth login`
2. **Write a uv-aware Dockerfile** — `fly launch` does not detect uv; create `Dockerfile` manually:
   ```dockerfile
   FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim
   WORKDIR /app
   COPY pyproject.toml uv.lock ./
   ENV SECRET_KEY=dummy-build-only-not-production
   RUN uv sync --frozen --no-dev
   COPY . .
   RUN uv run python manage.py collectstatic --noinput
   CMD ["uv", "run", "gunicorn", "job_radar.wsgi:application", "--bind", "0.0.0.0:8000"]
   ```
3. **Create `fly.toml`** with release command: `fly launch --no-deploy` to scaffold the config, then add `release_command = "python manage.py migrate --noinput"` and set `auto_stop_machines = "off"` under `[machines]`.
4. **Set secrets before first deploy**: `fly secrets set SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(50))")` and `fly secrets set DATABASE_URL=<your-postgres-url>`.
5. **Deploy**: `fly deploy` — Fly builds the image remotely, pushes, runs the release command (`migrate`), then starts the machine. Verify with `fly logs` and `fly open`.

---

## Out of Scope

The following were not evaluated in this research:
- Docker image optimization (multi-stage builds, layer caching)
- CI/CD pipeline setup (GitHub Actions auto-deploy on merge — configured separately per `ci_default_flow: auto-deploy-on-merge` in tech-stack.md)
- Production-scale architecture (multi-region active-active, HA Postgres, DR)
