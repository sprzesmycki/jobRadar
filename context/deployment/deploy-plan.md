# Job Radar: First Fly.io Deployment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the Django job-radar app to Fly.io as a production MVP, backed by a persistent Fly Postgres VM.

**Architecture:** The app runs as a WSGI process (gunicorn) in a Docker container on a Fly.io persistent VM in Frankfurt. Fly's proxy handles HTTPS termination and routes traffic to port 8000. Migrations run automatically on each deploy via fly.toml's `release_command`. Static files are served by whitenoise directly from the container (no CDN needed at MVP).

**Tech Stack:** Django 6.0.5, Python 3.14, uv (package manager), gunicorn, psycopg2-binary, dj-database-url, whitenoise, Fly.io (`ghcr.io/astral-sh/uv:python3.14-bookworm-slim` base image).

---

## Prerequisites

Complete these before starting Task 1. Each takes 2–10 minutes. The manual gate tasks (5–9) assume all prerequisites are done.

### P1: Local Tooling

- [ ] **Verify uv is installed**

```bash
uv --version
```
Expected: `uv 0.x.x` — already in use in this project.

- [ ] **Verify Python 3.14 is active**

```bash
python3 --version
```
Expected: `Python 3.14.x`

- [ ] **Verify git identity is configured**

```bash
git config --global user.email
```
Expected: your email address. If blank:
```bash
git config --global user.email "you@example.com"
git config --global user.name "Your Name"
```

- [ ] **Verify the working tree is clean before starting**

```bash
git status
```
Expected: `nothing to commit, working tree clean`. Stash or commit any in-progress changes before Task 1.

---

### P2: Install flyctl

`flyctl` is the Fly.io CLI. It must be installed before the manual gate tasks.

- [ ] **Install flyctl**

```bash
curl -L https://fly.io/install.sh | sh
```

- [ ] **Add flyctl to your PATH permanently**

Add this line to `~/.zshrc` (or `~/.bashrc`):
```bash
export PATH="$HOME/.fly/bin:$PATH"
```
Then reload: `source ~/.zshrc`

- [ ] **Verify flyctl is available**

```bash
fly version
```
Expected: `fly vX.X.X ...`

---

### P3: Fly.io Account and Billing

- [ ] **Create a Fly.io account** (if you don't have one)

Go to fly.io and sign up. No credit card required just to create an account.

- [ ] **Add a payment method**

Go to fly.io/dashboard/billing and add a credit card.
**This is required before Task 6.** `fly postgres create` will fail with `"Please add a payment method"` without billing configured — even for the ~$2/month self-managed VM tier. Add the card now so it doesn't block you mid-deploy.

- [ ] **Authenticate flyctl**

```bash
fly auth login
```
Opens a browser. Log in with the account above.

- [ ] **Verify authentication**

```bash
fly auth whoami
```
Expected: your Fly.io account email address.

---

### P4: App Name Decision

Fly.io app names are globally unique across all users. The default name throughout this plan is `job-radar`.

- [ ] **Decide on a fallback name** in case `job-radar` is taken (you find out when running `fly apps create` in Task 5).

Suggested pattern: `job-radar-<yourhandle>` (e.g. `job-radar-seb`).

If you end up using a different name, make these substitutions throughout the plan:
- `fly.toml` Task 4: change `app = "job-radar"` to your name
- Every `--app job-radar` CLI argument from Task 5 onward
- Your live URL becomes `https://<your-name>.fly.dev/` instead of `https://job-radar.fly.dev/`

---

### P5: (Optional) Docker for Local Dockerfile Testing

Fly builds Docker images remotely, so Docker is not required to deploy. Install only if you want to validate the Dockerfile locally before Task 8.

- [ ] **Install Docker Desktop** (macOS): docker.com/products/docker-desktop

- [ ] **Verify**

```bash
docker --version
```
Expected: `Docker version XX.X.X`

Local test command (run from project root after Task 3):
```bash
docker build -t job-radar-local . && echo "Build OK"
```
Expected: `Build OK` — confirms the image builds without errors before the remote deploy.

---

## File Map

| Path | Action | Responsibility |
|---|---|---|
| `pyproject.toml` | Modify | Add gunicorn, psycopg2-binary, dj-database-url, whitenoise |
| `uv.lock` | Auto-updated | Locked dependency graph |
| `job_radar/settings.py` | Modify | Env-driven SECRET_KEY, DEBUG, ALLOWED_HOSTS, DATABASE_URL, whitenoise static files |
| `Dockerfile` | Create | uv-aware production image; collectstatic at build time with dummy SECRET_KEY |
| `.dockerignore` | Create | Exclude .venv, __pycache__, .git from Docker build context |
| `fly.toml` | Create | App name `job-radar`, region `fra`, port 8000, `release_command` for migrations |

---

## Task 1: Add Production Dependencies

**Files:**
- Modify: `pyproject.toml`
- Auto-updated: `uv.lock`

- [ ] **Step 1: Verify the packages are not yet installed**

```bash
uv run python -c "import gunicorn" 2>&1 || echo "NOT_INSTALLED"
```
Expected: `NOT_INSTALLED`

- [ ] **Step 2: Replace the `[project]` section in pyproject.toml**

```toml
[project]
name = "przeprogramowani"
version = "0.1.0"
description = "Add your description here"
requires-python = ">=3.14"
dependencies = [
    "django>=6.0.5",
    "gunicorn>=23.0.0",
    "psycopg2-binary>=2.9.10",
    "dj-database-url>=2.3.0",
    "whitenoise>=6.9.0",
]

[dependency-groups]
dev = [
    "pip-audit>=2.10.0",
]
```

- [ ] **Step 3: Sync and lock dependencies**

```bash
uv sync
```
Expected: uv resolves and installs the four new packages, rewrites `uv.lock`.

- [ ] **Step 4: Verify all imports resolve**

```bash
uv run python -c "import gunicorn, dj_database_url, whitenoise, psycopg2; print('OK')"
```
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml uv.lock
git commit -m "chore: add gunicorn, psycopg2-binary, dj-database-url, whitenoise for production"
```

---

## Task 2: Update settings.py for Production

**Files:**
- Modify: `job_radar/settings.py`

The current file has a hardcoded `SECRET_KEY`, `DEBUG = True`, empty `ALLOWED_HOSTS`, and SQLite. This task makes all of these environment-driven. Local dev retains its defaults (SQLite, DEBUG=True, insecure key) unless env vars are set. In production, Fly injects the real values as secrets.

- [ ] **Step 1: Verify the baseline check passes before making changes**

```bash
uv run python manage.py check
```
Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 2: Replace job_radar/settings.py with the following**

```python
import os
import dj_database_url
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get(
    'SECRET_KEY',
    'django-insecure-nozitnhjxlcyzyk^3i55gpl0j0_52azb=%lrmwqk58hn$)iwqo',
)

DEBUG = os.environ.get('DEBUG', 'true').lower() == 'true'

ALLOWED_HOSTS = ['localhost', '127.0.0.1']
_fly_app = os.environ.get('FLY_APP_NAME')
if _fly_app:
    ALLOWED_HOSTS.append(f'{_fly_app}.fly.dev')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'job_radar.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'job_radar.wsgi.application'

DATABASES = {
    'default': dj_database_url.config(
        default=f'sqlite:///{BASE_DIR / "db.sqlite3"}',
        conn_max_age=600,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}
```

- [ ] **Step 3: Verify the check still passes locally**

```bash
uv run python manage.py check
```
Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 4: Verify production settings check passes**

```bash
SECRET_KEY=test-key-for-check DEBUG=false ALLOWED_HOSTS=localhost \
  uv run python manage.py check --deploy
```
Expected: exits 0. Advisory warnings about `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE` are expected (Fly's proxy handles HTTPS; these can be hardened post-MVP). Actual errors (not warnings) must be fixed before continuing.

- [ ] **Step 5: Commit**

```bash
git add job_radar/settings.py
git commit -m "chore: env-driven settings — DATABASE_URL, SECRET_KEY, ALLOWED_HOSTS, whitenoise"
```

---

## Task 3: Dockerfile and .dockerignore

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

**Why the dummy SECRET_KEY in Dockerfile:** `collectstatic` runs during `RUN` (image build time), but real Fly secrets are runtime-only. The dummy value is never used in production — Fly overwrites it with the real `SECRET_KEY` secret at container start. This is the workaround documented in the infrastructure.md risk register.

**Why .dockerignore matters:** `COPY . .` after `uv sync` would copy the local `.venv/` from the build host into the container, overwriting the clean container-built venv. `.dockerignore` prevents this.

- [ ] **Step 1: Create .dockerignore**

```
.venv/
__pycache__/
*.py[co]
.git/
.gitignore
staticfiles/
db.sqlite3
*.log
.env
.env.*
.DS_Store
context/
docs/
```

- [ ] **Step 2: Create Dockerfile**

```dockerfile
FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH"
ENV SECRET_KEY=dummy-build-only-not-production
ENV DEBUG=false

COPY . .
RUN python manage.py collectstatic --noinput

EXPOSE 8000
CMD ["gunicorn", "job_radar.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2"]
```

- [ ] **Step 3: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "chore: Dockerfile for Fly.io — uv-aware, collectstatic at build time"
```

---

## Task 4: fly.toml

**Files:**
- Create: `fly.toml`

`fly.toml` is committed to the repo (contains no secrets). The `release_command` runs in a temporary container from the same image before any Machine starts serving traffic — the schema is always current before the app boots. `auto_stop_machines = "off"` keeps the Machine running continuously (no cold starts).

- [ ] **Step 1: Create fly.toml**

```toml
app = "job-radar"
primary_region = "fra"

[build]
  dockerfile = "Dockerfile"

[deploy]
  release_command = "python manage.py migrate --noinput"

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1
```

- [ ] **Step 2: Commit**

```bash
git add fly.toml
git commit -m "chore: fly.toml — fra region, port 8000, release_command for migrations"
```

---

## Task 5: [MANUAL GATE] Create the Fly App

**Prerequisite:** flyctl is installed and authenticated (Prerequisites P2 + P3 are complete).

- [ ] **Step 1: Create the app**

```bash
fly apps create job-radar
```
Expected: `New app created: job-radar`

If the name is taken, use your fallback from Prerequisite P4 (e.g. `fly apps create job-radar-seb`) and update `app = "job-radar"` in `fly.toml` before committing it in Task 4.

---

## Task 6: [MANUAL GATE] Provision Fly Postgres

Using a self-managed Fly Postgres VM (~$2–5/month). Managed Postgres is ~$38/month and unnecessary at MVP. **Manual backup setup is required** — see the risk register in `context/foundation/infrastructure.md`.

- [ ] **Step 1: Create the Postgres cluster**

```bash
fly postgres create \
  --name job-radar-db \
  --region fra \
  --initial-cluster-size 1 \
  --vm-size shared-cpu-1x \
  --volume-size 1
```
When prompted for high availability: choose **No** (single VM is sufficient for MVP).
The command outputs a connection string — note it for reference, but do NOT put it in any file. The next step wires it as a secret automatically.

- [ ] **Step 2: Attach Postgres to the app**

```bash
fly postgres attach job-radar-db --app job-radar
```
Expected: `Postgres cluster job-radar-db is now attached to job-radar`
This sets `DATABASE_URL` as a Fly secret on `job-radar` automatically.

- [ ] **Step 3: Verify DATABASE_URL is set**

```bash
fly secrets list --app job-radar
```
Expected: `DATABASE_URL` appears in the list (value hidden).

---

## Task 7: [MANUAL GATE] Set Remaining Secrets

- [ ] **Step 1: Generate and set SECRET_KEY**

```bash
fly secrets set SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(50))')" --app job-radar
```
Expected: `Secrets are staged for the first deployment`

- [ ] **Step 2: Set DEBUG=false**

```bash
fly secrets set DEBUG=false --app job-radar
```
Expected: `Secrets are staged for the first deployment`

- [ ] **Step 3: Verify all three secrets are staged**

```bash
fly secrets list --app job-radar
```
Expected: `DATABASE_URL`, `SECRET_KEY`, `DEBUG` all listed (values hidden).

---

## Task 8: [MANUAL GATE] First Deploy

- [ ] **Step 1: Deploy**

```bash
fly deploy --app job-radar
```
Fly builds the image remotely, runs `collectstatic` (already baked in during build), runs the release command (`python manage.py migrate --noinput`), then starts the Machine.

Expected output:
```
==> Building image
==> Creating release
Running release command: python manage.py migrate --noinput
  Operations to perform: ...
  Running migrations: ...
==> Monitoring deployment
✓ [1] Machine <id> [app] update succeeded
```

If the deploy fails, run `fly logs --app job-radar` immediately to see the reason.

- [ ] **Step 2: Open the app**

```bash
fly open --app job-radar
```
Expected: browser opens `https://job-radar.fly.dev/`

- [ ] **Step 3: Tail logs to confirm gunicorn is serving**

```bash
fly logs --app job-radar
```
Expected: gunicorn access log lines. HTTP 404 responses for `/` are fine — there are no app views yet, only Django admin at `/admin/`.

---

## Task 9: [MANUAL GATE] Verify Deployment

- [ ] **Step 1: Check the admin login page**

Navigate to `https://job-radar.fly.dev/admin/`
Expected: Django admin login form loads without a 500 error.

- [ ] **Step 2: Create a superuser**

```bash
fly ssh console --pty --app job-radar -C "python manage.py createsuperuser"
```
Follow prompts (username, email, password). Then log in at `https://job-radar.fly.dev/admin/`.
Expected: Django admin dashboard loads and shows the `Authentication and Authorization` section.

- [ ] **Step 3: Confirm machine status**

```bash
fly status --app job-radar
```
Expected: 1 machine in `started` state, region `fra`.

---

## Deployment Outcome (fill in after completion)

- **App URL:** `https://job-radar.fly.dev/`
- **Postgres:** `job-radar-db` cluster, region `fra`, shared-cpu-1x, 1GB volume
- **Deployed:** 2026-05-28
- **Secrets set:** `DATABASE_URL` (via attach), `SECRET_KEY`, `DEBUG`
- **Verified:** [x] admin login redirects to login page, [x] migrations ran, [x] gunicorn serving
- **Scale:** 1 app machine in `fra`; Fly initially created 2 machines for HA, then scaled down to 1 for MVP cost control. `fly.toml` now uses `min_machines_running = 0` with `auto_stop_machines = "off"`.

---

## Rollback Procedure (Reference)

```bash
# List recent releases with image tags
fly releases --app job-radar

# Roll back to a previous release (no rebuild — image already in registry)
fly deploy --image registry.fly.io/job-radar:<tag> --strategy immediate --app job-radar
```

DB migrations applied in the forward direction do NOT auto-revert. Before rolling back app code that includes a migration, reverse the migration first:
```bash
fly ssh console --pty --app job-radar -C "python manage.py migrate <app_name> <migration_before_broken>"
```
