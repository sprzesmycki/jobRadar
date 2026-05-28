---
project: job-radar
researched_at: 2026-05-28T00:00:00Z
recommended_platform: Cloudflare Pages + Supabase + self-hosted VPS
runner_up: Cloudflare-native Workers + Supabase
context_type: mvp
tech_stack:
  frontend: astro-react-typescript
  frontend_host: cloudflare-pages
  auth: supabase-auth
  database: supabase-postgres
  storage: supabase-storage
  backend: fastapi-python
  backend_host: owner-vps-docker
---

## Recommendation

Deploy the frontend on Cloudflare Pages, use Supabase for Auth/Postgres/Storage, and run the Python backend as a FastAPI Docker container on the owner's existing VPS. The previous Fly.io Django deployment has been intentionally abandoned and its Fly apps were destroyed to stop costs. This architecture keeps the product UI in a modern TypeScript frontend stack, uses Supabase for managed product primitives, and reserves Python for the parts where it is valuable: CV/PDF parsing, matching, and AI orchestration.

## Platform Comparison

| Platform shape | Fit | Cost | Main risk |
|---|---|---:|---|
| Cloudflare Pages + Supabase + VPS FastAPI | Best current fit | Low existing-cost VPS + Supabase/Cloudflare free tiers at MVP | More moving parts: Cloudflare, Supabase, VPS |
| Cloudflare Pages + Cloudflare Python Workers + Supabase | Good long-term candidate | Potentially lowest | Python Workers are newer; package compatibility risk for PDF/CV work |
| Next.js + Supabase + Vercel | Strong product-app default | Likely paid sooner | Less aligned with Cloudflare-first preference |
| Django + Fly.io | Rejected | Paid Fly resources | Weak frontend fit for desired product UI |

## Operational Story

- **Frontend deploys**: Cloudflare Pages builds the Astro app from GitHub on merge to main. Preview deployments should be enabled for pull requests.
- **Backend deploys**: FastAPI runs in Docker on the existing VPS behind a reverse proxy. Deployment can start as manual `docker compose pull && docker compose up -d`, then move to GitHub Actions over SSH once stable.
- **Database and auth**: Supabase owns Postgres and Auth. Frontend uses the anon key with RLS; FastAPI uses service-role credentials only on the server.
- **Storage**: CV PDFs live in Supabase Storage private buckets. FastAPI receives signed references or server-side paths, never public raw CV URLs.
- **Secrets**: Cloudflare stores frontend public env vars only. Supabase service-role keys and AI provider keys live only on the VPS backend.
- **Rollback**: Cloudflare Pages rollback for frontend; Docker image tag rollback for FastAPI; Supabase migrations must be versioned and reviewed before apply.
- **Logs**: Cloudflare deployment logs for frontend; Docker/VPS logs for FastAPI; Supabase dashboard/logs for database/auth/storage events.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---:|---:|---|
| Service-role key leaks to frontend | Architecture review | M | H | Keep service-role key only in VPS env; enforce code review rule that frontend never imports server secrets |
| CORS/auth mismatch between Astro and FastAPI | Research finding | M | M | Validate Supabase JWTs in FastAPI; explicitly allow only Cloudflare Pages domains |
| VPS becomes undocumented snowflake | Pre-mortem | M | H | Manage backend with Docker Compose, `.env.example`, deploy script, and backup notes in repo |
| CV files exposed publicly | Privacy guardrail | M | H | Use private Supabase Storage bucket and signed URLs with short TTL |
| Supabase free tier or limits become a blocker | Cost review | M | M | Track usage early; document paid upgrade trigger before public beta |
| Python CV parsing dependencies are heavy | Research finding | M | M | Keep Python in conventional VPS container, not edge runtime; pin dependencies and test Docker build in CI |
