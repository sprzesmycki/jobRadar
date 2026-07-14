# Repository Guidelines

JobRadar is an Astro 6 + React 19 + TypeScript app targeting Cloudflare, with Supabase for Auth/Postgres/Storage and a FastAPI service (`backend/`) on the owner's VPS for Python-heavy CV and AI work. Treat `context/foundation/*.md` as the product and stack contract before changing architecture.

## Hard Rules

- Do not use `gh`; the local GitHub CLI is connected to another account. Use `git`, direct URLs, or manual PR links.
- Never commit secrets. Use `.env` and `.dev.vars` locally; keep only placeholder keys in `.env.example`.
- Keep Supabase service-role and AI provider keys out of frontend code. Frontend code may use only anon/public credentials.
- Do not write to `context/archive/`; archived content is immutable.
- Current `.claude/` deletions are user-owned local changes. Do not restore or commit them unless explicitly asked.

## Commands

- `npm install` installs the scaffolded Astro/Supabase dependencies.
- `cp .env.example .dev.vars` sets local Cloudflare dev placeholders; replace with real Supabase values for auth flows.
- `npm run dev` starts Astro locally.
- `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` are the required verification commands before commits. In `backend/`, run `uv run pytest`.
- `npm audit --json` records dependency advisories; current bootstrap log is at `context/changes/bootstrap-verification/verification.md`.

## Project Structure

- `src/pages/` contains Astro routes and server endpoints; auth API routes live in `src/pages/api/auth/`.
- `src/components/` holds Astro and React UI components; shared primitives live in `src/components/ui/`.
- `src/lib/` contains shared utilities and Supabase client setup; `src/lib/job-sources/` holds the per-portal adapters and the aggregator.
- `src/middleware.ts` protects authenticated routes; update its protected-route list when adding private pages.
- `src/__tests__/` holds the Vitest suite for BFF routes and helpers.
- `backend/` is the FastAPI service (CV extraction, scoring, cover letters); its tests live in `backend/tests/`.
- `supabase/` contains local Supabase config. Product and infrastructure decisions live under `context/foundation/`.

## Style And Conventions

Use TypeScript, ESM, Astro components for server-rendered pages/layout, and React islands for interactive controls. Keep route handlers small and push shared logic into `src/lib/`. Use Tailwind CSS utilities in existing style patterns and `cn()` from `src/lib/utils.ts` for conditional class composition. Preserve the starter's ESLint/Prettier setup; run `npm run lint` after structural changes.

## Testing And CI

Frontend tests run on Vitest (`npm test`); backend tests run on pytest (`cd backend && uv run pytest`). The baseline gate before a commit is `npm run lint && npm run typecheck && npm test && npm run build`, plus `uv run pytest` when `backend/` changed.

GitHub Actions runs on the canonical `main` branch:

- `.github/workflows/ci.yml` — three jobs: `ci` (lint, typecheck, build), `frontend-tests` (`npm test`), `backend-tests` (`uv sync --group dev` + `uv run pytest`). The `ci` job needs the `SUPABASE_URL` and `SUPABASE_KEY` repository secrets.
- `.github/workflows/ai-review.yml` — AI code review on every PR to `main` (and on the `ai-cr:review` label). It posts a verdict comment and applies an `ai-cr:passed` / `ai-cr:failed` / `ai-cr:review` label. Advisory only; it does not block the merge.

## Commits And PRs

Recent history uses Conventional-style prefixes such as `chore:`, `fix:`, and `docs:`. Keep commits scoped, mention verification commands in PR descriptions, and separate user-owned workspace cleanup from product code changes.
