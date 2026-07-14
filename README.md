# JobRadar

Aggregates remote developer job offers from several portals, scores each one against your CV, and generates a personalized cover letter for the offers worth applying to.

**Live:** https://job-radar.sebastian-przesmycki.workers.dev

## How it works

1. You upload a PDF CV and set your preferences (role, technologies, salary range, work mode).
2. JobRadar aggregates offers from JustJoinIT, Remotive, and Adzuna into a single deduplicated list.
3. Each offer gets a 0–100 match score against your CV, plus the list of skills you're missing.
4. One click generates a cover letter grounded in both that specific offer and your CV.
5. Offers can be saved with an application status.

## Tech Stack

Two runtimes, joined by an HTTP contract.

**Frontend / BFF** (`src/`)

- [Astro](https://astro.build/) v6 — server-first rendering, also serves the API routes
- [React](https://react.dev/) v19 — interactive islands
- [TypeScript](https://www.typescriptlang.org/) v5
- [Tailwind CSS](https://tailwindcss.com/) v4
- [Cloudflare Workers](https://workers.cloudflare.com/) — deployment target

**Backend** (`backend/`)

- [FastAPI](https://fastapi.tiangolo.com/) on Python 3.13, managed with [uv](https://docs.astral.sh/uv/) — CV parsing, match scoring, cover-letter generation
- Runs as a Docker container on a VPS; see [`backend/README.md`](./backend/README.md)

**Shared**

- [Supabase](https://supabase.com/) — Auth, Postgres, and Storage (CV files)
- z.ai / GLM via the OpenAI SDK — scoring and cover-letter generation

## Prerequisites

- Node.js v22.14.0 (see `.nvmrc`)
- [Docker](https://www.docker.com/) — for the local Supabase stack (~7 GB RAM)
- [uv](https://docs.astral.sh/uv/) — only if you're working on `backend/`

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Create your env files:

```bash
cp .env.example .env
cp .env.example .dev.vars
```

3. Start the local Supabase stack and apply migrations:

```bash
npx supabase start
npx supabase db reset
```

Copy the `API URL` and `anon key` the CLI prints into both `.env` and `.dev.vars`. Studio is at `http://localhost:54323`; `npx supabase stop` shuts it down.

4. Run the dev server:

```bash
npm run dev
```

The job feed additionally needs Adzuna credentials and a reachable backend — see [Environment variables](#environment-variables). Without them, auth works but the offer list stays empty.

## Environment variables

All six are declared in Astro's `astro:env` schema (`astro.config.mjs`) and are **server-only secrets** — they are never exposed to the client. They belong in `.env` and `.dev.vars` locally, and in Cloudflare secrets in production.

| Variable          | Required for            | Description                                                             |
| ----------------- | ----------------------- | ----------------------------------------------------------------------- |
| `SUPABASE_URL`    | auth, all data          | Project URL (Supabase dashboard → Settings → API, or the local CLI output) |
| `SUPABASE_KEY`    | auth, all data          | `anon` public key from the same place                                   |
| `BACKEND_API_URL` | CV, scoring, cover letters | Base URL of the FastAPI service                                      |
| `ADZUNA_APP_ID`   | job feed                | Adzuna API app ID                                                       |
| `ADZUNA_APP_KEY`  | job feed                | Adzuna API app key                                                      |
| `ADZUNA_COUNTRY`  | job feed                | Adzuna country code (e.g. `us`)                                         |

## Available Scripts

- `npm run dev` — start the dev server (Cloudflare workerd runtime)
- `npm run build` — build for production
- `npm run preview` — preview the production build
- `npm test` — run the Vitest suite
- `npm run test:coverage` — Vitest with coverage
- `npm run typecheck` — `astro check` (CI gate)
- `npm run lint` / `npm run lint:fix` — ESLint with type-checked rules
- `npm run format` — Prettier
- `npm run db:types` — regenerate `src/lib/database.types.ts` from the local Supabase schema

## Testing

```bash
npm test                     # frontend / BFF (Vitest)
cd backend && uv run pytest  # backend (pytest)
```

Both suites run in CI on every push and PR to `main`.

## Project Structure

```md
.
├── src/
│ ├── pages/ # Astro routes
│ │ └── api/ # BFF endpoints
│ ├── components/ # UI components (Astro & React)
│ ├── layouts/ # Astro layouts
│ ├── lib/ # Shared utilities, Supabase client
│ │ └── job-sources/ # Per-portal adapters + aggregator
│ ├── styles/ # Global styles
│ ├── middleware.ts # Route protection
│ └── __tests__/ # Vitest suite
├── backend/ # FastAPI service (CV, scoring, cover letters)
├── supabase/ # Local Supabase config + SQL migrations
├── infra/ # Deployment helpers for the VPS backend
├── context/ # Product, stack, and architecture contracts
├── public/ # Public assets
└── wrangler.jsonc # Cloudflare Workers config
```

## Database Migrations

SQL migrations live in `supabase/migrations/`. Apply them to a linked project before deploying features that write user data:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Current migrations create:

- `job_preferences` — per-user role, technology, salary, work-mode, and location filters.
- `saved_jobs` — per-user saved offer status tracking.
- `cv_profiles` — the profile extracted from the uploaded CV (one per user).
- `job_scores` — cached 0–100 match score and explanation per offer.
- `cover_letters` — generated cover letters, with a non-empty-content constraint.

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development, open the Supabase dashboard → **Authentication → Email → Confirm email** and toggle it **off**.

### Auth routes

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                     |
| `/dashboard`          | Protected page (redirects to `/auth/signin` if unauthenticated)         |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

## Deployment

The frontend deploys to [Cloudflare Workers](https://workers.cloudflare.com/). Note the command: this project uses `wrangler deploy`, **not** `wrangler pages deploy`.

```bash
npm run build
npx wrangler deploy
```

Set all six environment variables as Worker secrets via `npx wrangler secret put <NAME>` or in the Cloudflare dashboard.

The backend deploys separately as a Docker container on a VPS — see [`backend/README.md`](./backend/README.md) and `docker-compose.prod.yml`.

## CI

Two GitHub Actions workflows run on `main`:

- **`ci.yml`** — three jobs: `ci` (lint, typecheck, build), `frontend-tests` (Vitest), and `backend-tests` (pytest). The `ci` job needs `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets.
- **`ai-review.yml`** — an AI code review on every PR to `main`. It sends the PR diff to z.ai/GLM, posts a structured verdict as a PR comment, and applies an `ai-cr:passed` / `ai-cr:failed` / `ai-cr:review` label. The review is advisory and does not block merges.

## License

MIT — see [LICENSE](./LICENSE).
