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

## Docker

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
docker compose down
```

## VPS Deployment

Assumptions:

- The VPS has Docker Engine and Docker Compose v2.
- A reverse proxy such as Caddy, Nginx, or Traefik terminates TLS and forwards to `127.0.0.1:8000`.
- The public backend origin is added to Cloudflare/frontend configuration only after HTTPS works.
- Cloudflare Worker origins and local dev origins are listed in `ALLOWED_ORIGINS`.

First deploy on the VPS:

```bash
git pull --ff-only
cd backend
cp .env.example .env
# edit .env on the VPS; set BACKEND_HOST_PORT=8000 unless your reverse proxy uses another loopback port
docker compose -f compose.yaml -f compose.production.yaml build backend
docker compose -f compose.yaml -f compose.production.yaml up -d backend
docker compose -f compose.yaml -f compose.production.yaml logs --tail=100 backend
curl http://127.0.0.1:8000/healthz
```

Redeploy after code changes:

```bash
cd backend
docker compose -f compose.yaml -f compose.production.yaml build backend
docker compose -f compose.yaml -f compose.production.yaml up --no-deps -d backend
```

Restart:

```bash
cd backend
docker compose -f compose.yaml -f compose.production.yaml restart backend
```

Logs:

```bash
cd backend
docker compose -f compose.yaml -f compose.production.yaml logs --tail=200 backend
```

Rollback for the first MVP version is git-based:

```bash
git log --oneline -5
git switch main
git pull --ff-only
# or check out the last known-good commit if needed
cd backend
docker compose -f compose.yaml -f compose.production.yaml build backend
docker compose -f compose.yaml -f compose.production.yaml up --no-deps -d backend
```

Before public beta, replace this with tagged Docker images and record the deployed image tag plus git SHA in `context/deployment/deploy-plan.md`.

## Secrets

Backend-only secrets live in `backend/.env` on the VPS:

- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_PROVIDER_API_KEY`
- future provider keys for parsing/scoring/generation

`BACKEND_HOST_PORT` defaults to `18080` for local development to avoid collisions with other services. On the VPS, set `BACKEND_HOST_PORT=8000` or whichever loopback port your reverse proxy forwards to.

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
