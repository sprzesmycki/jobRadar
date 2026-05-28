# Repository Guidelines

JobRadar is an Astro 6 + React 19 + TypeScript app targeting Cloudflare, with Supabase for Auth/Postgres/Storage and a planned FastAPI service on the owner's VPS for Python-heavy CV and AI work. Treat `context/foundation/*.md` as the product and stack contract before changing architecture.

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
- `npm run lint` and `npm run build` are the required verification commands before commits.
- `npm audit --json` records dependency advisories; current bootstrap log is at `context/changes/bootstrap-verification/verification.md`.

## Project Structure

- `src/pages/` contains Astro routes and server endpoints; auth API routes live in `src/pages/api/auth/`.
- `src/components/` holds Astro and React UI components; shared primitives live in `src/components/ui/`.
- `src/lib/` contains shared utilities and Supabase client setup.
- `src/middleware.ts` protects authenticated routes; update its protected-route list when adding private pages.
- `supabase/` contains local Supabase config. Product and infrastructure decisions live under `context/foundation/`.

## Style And Conventions

Use TypeScript, ESM, Astro components for server-rendered pages/layout, and React islands for interactive controls. Keep route handlers small and push shared logic into `src/lib/`. Use Tailwind CSS utilities in existing style patterns and `cn()` from `src/lib/utils.ts` for conditional class composition. Preserve the starter's ESLint/Prettier setup; run `npm run lint` after structural changes.

## Testing And CI

There is no dedicated test runner yet. Until one is added, `npm run lint` plus `npm run build` is the baseline gate. GitHub Actions currently runs on `master`; update `.github/workflows/ci.yml` if the canonical branch is `main`. CI needs `SUPABASE_URL` and `SUPABASE_KEY` secrets for builds.

## Commits And PRs

Recent history uses Conventional-style prefixes such as `chore:`, `fix:`, and `docs:`. Keep commits scoped, mention verification commands in PR descriptions, and separate user-owned workspace cleanup from product code changes.
