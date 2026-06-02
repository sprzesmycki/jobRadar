# Implementation Plan: Python CV and AI Service Foundation

## Summary

Add the foundational FastAPI backend for JobRadar: a small typed Python service, Docker-based local/VPS deployment path, health/readiness endpoints, Supabase-authenticated boundary proof, and placeholder contracts for CV extraction, job scoring, and cover-letter generation.

This is a foundation change rather than a vertical user slice. It unlocks later vertical slices by making the Python/VPS boundary real and documented before sensitive CV and AI logic is added.

## Current State

- Astro 6 + React 19 frontend runs on Cloudflare Workers.
- Supabase handles Auth/Postgres/Storage client setup in the Astro app.
- No Python backend exists in the repository.
- Roadmap F-01 is proposed and blocks S-04, S-05, and S-06.
- The infrastructure decision already selected VPS-hosted FastAPI in Docker for Python-heavy CV and AI work.

## Design

### 1. Backend App Scaffold

Create `backend/` as a first-class service:

- `backend/pyproject.toml`
- `backend/app/main.py`
- `backend/app/core/config.py`
- `backend/app/core/security.py`
- `backend/app/api/routes/health.py`
- `backend/app/api/routes/me.py`
- `backend/app/api/routes/cv.py`
- `backend/app/api/routes/scoring.py`
- `backend/app/api/routes/cover_letter.py`
- `backend/app/schemas/*.py`
- `backend/tests/`

Use FastAPI + Pydantic settings + pytest/httpx. Keep module names simple and predictable for agents.

### 2. Service Contract

Add these routes:

- `GET /healthz`
  - public, no auth
  - returns app name, status, version, environment
- `GET /readyz`
  - public, no auth
  - returns whether required config is present, without exposing secret values
- `GET /v1/me`
  - requires Supabase bearer token
  - returns user id/email/role claims or validation result
- `POST /v1/cv/extract`
  - requires auth
  - returns `501 Not Implemented` with a stable response shape
- `POST /v1/jobs/score`
  - requires auth
  - returns `501 Not Implemented` with a stable response shape
- `POST /v1/cover-letter`
  - requires auth
  - returns `501 Not Implemented` with a stable response shape

The placeholder endpoints should make later slice planning concrete without faking product logic.

### 3. Auth And Secret Boundary

Backend env should include placeholders only:

- `JOBRADAR_ENV`
- `JOBRADAR_VERSION`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGINS`
- future placeholders: `OPENAI_API_KEY` or generic `AI_PROVIDER_API_KEY`

Rules:

- service-role key is backend-only and must never appear in `astro.config.mjs`, frontend env, or `src/`.
- user-facing backend routes require a Supabase user access token.
- auth dependency should not implement cryptography by hand; use Supabase Auth validation or a maintained JWT library.
- do not log raw CV text, bearer tokens, service-role key values, or AI prompts containing CV content.

### 4. Docker And VPS Runbook

Add:

- `backend/Dockerfile`
- `backend/compose.yaml`
- `backend/compose.production.yaml`
- `backend/.env.example`
- `backend/README.md`

Runbook must document:

- local build/run commands,
- healthcheck command,
- VPS deploy command,
- log command,
- restart command,
- rollback strategy for the first MVP version,
- required reverse proxy/TLS assumptions,
- required CORS origins,
- secret placement.

### 5. Verification

Automated baseline:

- backend unit/API tests pass,
- Docker image builds,
- container responds on `/healthz`,
- root `npm run lint` and `npm run build` still pass,
- grep check confirms `SUPABASE_SERVICE_ROLE_KEY` is absent from `src/` and frontend env schema.

Manual baseline:

- owner confirms VPS target/domain or accepts local-only verification for this phase,
- owner confirms backend secrets are not committed,
- owner confirms runbook commands are understandable enough to execute on VPS later.

## Files

- `backend/pyproject.toml`
- `backend/app/**`
- `backend/tests/**`
- `backend/Dockerfile`
- `backend/compose.yaml`
- `backend/compose.production.yaml`
- `backend/.env.example`
- `backend/README.md`
- `.gitignore` if backend env/cache patterns are missing
- `README.md` or `context/deployment/deploy-plan.md` for cross-service note
- `context/foundation/roadmap.md` only if F-01 status is updated after implementation

## Verification Commands

- `cd backend && uv run pytest`
- `cd backend && uv run ruff check .`
- `cd backend && docker compose build`
- `cd backend && docker compose up -d backend`
- `curl http://127.0.0.1:8000/healthz`
- `npm run lint`
- `npm run build`
- `rg -n "SUPABASE_SERVICE_ROLE_KEY|service_role" src astro.config.mjs .env.example`

If `uv`, Docker, or local Python tooling is unavailable, record the skipped command and reason in the implementation notes; do not silently mark it verified.

## Risks

- Supabase JWT signing mode may require different validation paths; the implementation should make this explicit and testable.
- A runnable local backend does not prove VPS deploy readiness; the runbook and manual gate are required.
- Adding service-role env placeholders increases leakage risk if frontend env rules are not kept strict.
- Placeholder endpoints can be mistaken for product completion; route responses must clearly say `not_implemented`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Backend Scaffold And Contracts

#### Automated

- [x] 1.1 FastAPI app starts with `/healthz` and `/readyz` — b43e6a2
- [x] 1.2 Pydantic schemas exist for CV extraction, job scoring, and cover-letter requests/responses — b43e6a2
- [x] 1.3 Placeholder product endpoints return explicit `501 not_implemented` — b43e6a2
- [x] 1.4 Backend tests pass for health, readiness, auth failure, and placeholder routes — b43e6a2

#### Manual

- [x] 1.5 Team confirms placeholder endpoints are acceptable for F-01 and do not imply S-04/S-05/S-06 completion — b43e6a2

### Phase 2: Auth, Secrets, And CORS Boundary

#### Automated

- [x] 2.1 `/v1/me` rejects missing/invalid bearer tokens — aaf236c
- [x] 2.2 Backend config validates required Supabase and CORS env without printing secret values — aaf236c
- [x] 2.3 Grep check confirms service-role key is absent from frontend code and frontend env schema — aaf236c
- [x] 2.4 Root `npm run lint` passes — aaf236c
- [x] 2.5 Root `npm run build` passes — aaf236c

#### Manual

- [x] 2.6 Team confirms service-role and AI provider keys remain backend-only — aaf236c

### Phase 3: Docker And VPS Runbook

#### Automated

- [ ] 3.1 Backend Docker image builds
- [ ] 3.2 Compose service responds on `/healthz`
- [ ] 3.3 Production Compose override includes restart policy and no source-code bind mount
- [ ] 3.4 Backend README documents local run, VPS deploy, logs, restart, rollback, CORS, TLS, and secrets

#### Manual

- [ ] 3.5 Owner confirms VPS/domain assumptions or accepts local-only verification for this foundation branch
- [ ] 3.6 Owner confirms runbook is executable enough for first VPS deployment
