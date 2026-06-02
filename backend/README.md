# JobRadar Backend

FastAPI service for Python-heavy CV parsing, matching, and AI orchestration. F-01 only establishes the service boundary and deployment path; CV extraction, scoring, and cover-letter generation intentionally return `501 not_implemented` until S-04, S-05, and S-06.

## Local Setup

```bash
cp .env.example .env
uv run pytest
uv run ruff check .
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/healthz
curl http://127.0.0.1:8000/readyz
```

## Local Docker

Local Compose:

```bash
cp .env.example .env
docker compose build
docker compose up -d backend
docker compose logs --tail=100 backend
curl http://127.0.0.1:18080/healthz
```

Compose uses the explicit project name `jobradar-backend` so it does not collide with unrelated Docker Compose projects named `backend`.

Stop local service:

```bash
docker compose stop backend
```

## VPS Deployment On `sprzesmycki.dev`

Production follows the `sprzesmycki-dev` sibling-app convention:

- Checkout path: `/opt/jobradar`.
- Central Caddy from `/opt/sprzesmycki-dev` owns ports 80/443.
- This repo does not ship or run a Caddy service.
- Production Compose is the root `docker-compose.prod.yml`.
- Services are prefixed as `jobradar-api` and `jobradar-webhook`.
- The stack joins the external Docker network `sprzesmycki_default`.
- Production services use `expose`, not host `ports`.

First deploy on the VPS:

```bash
cd /opt/jobradar
git pull --ff-only
cp .env.prod.example .env.prod
# edit .env.prod on the VPS; never commit it
docker compose -f docker-compose.prod.yml --env-file .env.prod build jobradar-api jobradar-webhook
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d jobradar-api jobradar-webhook
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=100 jobradar-api
```

Redeploy after code changes:

```bash
cd /opt/jobradar
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Restart:

```bash
cd /opt/jobradar
docker compose -f docker-compose.prod.yml --env-file .env.prod restart jobradar-api
```

Logs:

```bash
cd /opt/jobradar
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=200 jobradar-api
tail -f /opt/jobradar/deploy.log
```

Rollback for the first MVP version is git-based:

```bash
git log --oneline -5
git switch main
git pull --ff-only
# or check out the last known-good commit if needed
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Before public beta, replace this with tagged Docker images and record the deployed image tag plus git SHA in `context/deployment/deploy-plan.md`.

### Caddy Route In `sprzesmycki-dev`

Add these blocks to `/opt/sprzesmycki-dev/Caddyfile`, before the apex catch-all:

```caddy
    handle /jobradar/api/* {
        uri strip_prefix /jobradar/api
        reverse_proxy jobradar-api:8000
    }

    handle /hooks/deploy-jobradar {
        reverse_proxy jobradar-webhook:9000
    }
```

After the `sprzesmycki-dev` Caddyfile change is merged and deployed, reload Caddy:

```bash
ssh hetzner 'docker exec sprzesmycki-dev-caddy-1 caddy reload --config /etc/caddy/Caddyfile'
```

Smoke test:

```bash
curl https://sprzesmycki.dev/jobradar/api/healthz
curl https://sprzesmycki.dev/jobradar/api/readyz
```

## Secrets

Backend-only secrets live in `/opt/jobradar/.env.prod` on the VPS:

- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_PROVIDER_API_KEY`
- future provider keys for parsing/scoring/generation

`BACKEND_HOST_PORT` defaults to `18080` for local development only. Production does not use host port bindings because Caddy reaches `jobradar-api:8000` through `sprzesmycki_default`.

Frontend/Cloudflare code must not import backend-only secrets. The Astro app may use only Supabase anon/public credentials.

Do not log:

- raw CV text,
- bearer tokens,
- service-role keys,
- AI prompts containing CV content,
- generated private profile data unless explicitly redacted.

## API Contract

Public:

- `GET /healthz`
- `GET /readyz`

Authenticated with `Authorization: Bearer <Supabase access token>`:

- `GET /v1/me`
- `POST /v1/cv/extract`
- `POST /v1/jobs/score`
- `POST /v1/cover-letter`

The product endpoints return `501 not_implemented` in F-01 by design.
