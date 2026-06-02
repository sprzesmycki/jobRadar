---
topic: python-cv-ai-service-foundation
researcher: codex
created: 2026-06-02
updated: 2026-06-02
---

# Research: Python CV and AI Service Foundation

## Scope

Roadmap F-01 requires a minimal FastAPI service contract and deployment path for Python-heavy CV parsing, scoring, and AI orchestration. This should not implement full CV parsing, match scoring, or cover-letter generation yet; it should create the backend surface and operational rules that make those later slices safe.

## Product And Architecture Baseline

- `context/foundation/prd.md` makes CV upload, CV-to-job scoring, missing skills, and cover-letter generation must-have product capabilities.
- `context/foundation/tech-stack.md` selects Astro 6 + React 19 on Cloudflare Workers, Supabase Auth/Postgres/Storage, and a separate FastAPI backend in Docker on the owner's VPS.
- `context/foundation/infrastructure.md` recommends Cloudflare Workers + Supabase + VPS FastAPI and calls out the main risks: VPS snowflake operations, service-role key leakage, CV log leakage, CORS/JWT mismatch, and missing deploy runbook.
- `context/foundation/roadmap.md` marks F-01 as proposed and lists it as a prerequisite for S-04 CV upload/extraction.

## Current Codebase Baseline

- There is no `backend/` directory yet.
- Frontend/server routes are Astro endpoints under `src/pages/api/`.
- Supabase client setup is in `src/lib/supabase.ts`, using server-only `SUPABASE_URL` and `SUPABASE_KEY`.
- `astro.config.mjs` keeps Supabase anon credentials and Adzuna credentials server-only. No service-role key exists in frontend env schema.
- `wrangler.jsonc` deploys the Astro SSR worker with `@astrojs/cloudflare/entrypoints/server`.
- `context/deployment/deploy-plan.md` exists for frontend deploy documentation; backend runbook should either extend it or add `backend/README.md` with concrete VPS commands.

## External Documentation Checks

- FastAPI's current container docs recommend building a Docker image from an official Python base image, copying requirements and app code, and running the FastAPI app inside the container. They also call out proxy header handling when running behind TLS termination. Source: https://fastapi.tiangolo.com/deployment/docker/
- FastAPI deployment concepts emphasize deployment concerns such as HTTPS, startup, restarts, replication/process count, memory, and previous steps before starting containers. Source: https://fastapi.tiangolo.com/deployment/concepts/
- Docker Compose production docs recommend production-specific Compose overrides, removing development bind mounts, changing host ports/env vars, adding restart policies, and redeploying with `docker compose build <service>` plus `docker compose up --no-deps -d <service>`. Source: https://docs.docker.com/compose/how-tos/production/
- Supabase JWT docs say Auth JWTs identify the user and can be verified through the project's JWKS endpoint when asymmetric keys are used. They recommend relying on Supabase `getClaims()` or high-quality JWT libraries rather than implementing verification algorithms by hand. For HS256/shared-secret projects, they recommend validation through the Auth server and strongly warn against exposing shared secrets. Source: https://supabase.com/docs/guides/auth/jwts

## Architecture Decisions For This Change

- Add a `backend/` service inside this repository, not a separate repo. This keeps the MVP contract, Dockerfile, tests, and docs visible to the same agent workflow.
- Use FastAPI with Pydantic settings and schemas. Keep endpoint implementations as foundation stubs where full product logic belongs to later slices.
- Use Docker Compose for local and VPS deployment. Compose is acceptable because the current target is a single owned VPS.
- Add only placeholder env names to committed files. Do not commit `.env`, Supabase service-role key, AI keys, or VPS credentials.
- Keep Supabase service-role and AI provider keys only in backend env. Frontend may call backend with a user Supabase access token, but frontend must not receive service-role credentials.
- Prefer token verification via a small backend auth dependency. Initial implementation can support Auth-server validation using Supabase URL + anon/publishable key; if the project is on asymmetric signing keys, it can switch to JWKS verification later.
- Add CORS as explicit env configuration for Cloudflare production and local dev origins.

## Proposed Backend Surface

Foundation endpoints:

- `GET /healthz` returns service health, version, and environment marker.
- `GET /readyz` verifies required configuration is present without exposing secret values.
- `GET /v1/me` returns authenticated user claims/id and proves Supabase token validation works.
- `POST /v1/cv/extract` accepts a contract shape for a CV object or storage reference and returns `501 Not Implemented` until S-04.
- `POST /v1/jobs/score` accepts a job + extracted profile contract and returns `501 Not Implemented` until S-05.
- `POST /v1/cover-letter` accepts a job + profile + tone constraints contract and returns `501 Not Implemented` until S-06.

The `501` endpoints are intentional: they document the service API boundary without pretending the product logic is done.

## Open Implementation Risks

- JWT validation depends on Supabase signing-key mode. The backend should avoid requiring the service-role key for ordinary user-authenticated requests.
- Local verification may need Python dependency installation. If dependencies are not installed locally, `docker compose build` becomes the baseline verification.
- VPS deployment cannot be fully verified without VPS access and a target domain. The plan should include a manual deployment gate for the owner.
- CV privacy is not solved by scaffolding alone. Later slices must still implement private storage, no raw CV logs, and redaction.

## Recommendation

Proceed with a foundation implementation that creates:

1. `backend/` FastAPI app with health/readiness/auth proof endpoints.
2. typed request/response schemas for future CV, scoring, and generation endpoints.
3. Dockerfile, Compose files, `.env.example`, and a VPS runbook.
4. backend tests for health/readiness/config/auth failure and placeholder endpoints.
5. root documentation updates that explain how frontend/Cloudflare and backend/VPS boundaries fit together.
