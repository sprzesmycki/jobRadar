# CI Test Coverage — Plan Brief

> Full plan: `context/changes/ci-test-coverage/plan.md`

## What & Why

Backend ma testy, ale CI ich nie uruchamia — `ci.yml` robi tylko lint i build. Certyfikat wymaga "co najmniej jednego testu z perspektywy użytkownika" uruchamianego automatycznie. Jeden ze starych testów jest też nieaktualny i czerwienieje, więc najpierw go naprawiamy.

## Starting Point

`test_contracts.py` ma 14+ testów przez FastAPI `TestClient`, w tym `test_cv_extract_returns_structured_profile` (user-facing: upload CV → structured profile). `test_job_scoring_placeholder_returns_501` oczekuje HTTP 501, ale scoring endpoint jest już zaimplementowany (S-05) i zwraca 200. CI nigdy nie wywołuje `pytest`.

## Desired End State

`pytest` przechodzi zielono lokalnie i w CI. GitHub Actions pokazuje dwa równoległe joby: `ci` (Node/lint/build) i `backend-tests` (Python/uv/pytest). Scoring test weryfikuje zaimplementowany endpoint przez mock AsyncOpenAI.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| User-facing test | TestClient API tests | Istniejące testy kontraktowe testują user flow; brak potrzeby dodatkowego Playwright setupu | Plan |
| Stale scoring test | Zastąp zmockowanym testem | Endpoint jest zaimplementowany — usunięcie bez zastępnika zostawiłoby scoring bez pokrycia | Plan |
| CI Python setup | Osobny job z setup-uv | Izolacja od Node joba, używa tego samego lockfile co lokalnie | Plan |

## Scope

**In scope:**
- Naprawienie stale `test_job_scoring_placeholder_returns_501`
- Nowy mocked scoring test (`test_job_scoring_returns_structured_result`)
- Nowy job `backend-tests` w `ci.yml`

**Out of scope:**
- Playwright E2E tests
- Frontend unit tests
- Zwiększanie coverage poza minimum

## Architecture / Approach

TestClient wykonuje requesty bezpośrednio przez ASGI — nie potrzeba running serwera ani sekretów w CI. `monkeypatch.setattr("app.services.scoring.AsyncOpenAI", ...)` pozwala podmienić wywołanie AI bez prawdziwego klucza.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Fix stale scoring test | `pytest` przechodzi zielono lokalnie | Mock AsyncOpenAI musi trafiać w właściwy module path |
| 2. Add backend-tests CI job | `pytest` uruchamia się automatycznie w CI | Brak — setup-uv + uv run pytest jest standardowe |

**Prerequisites:** Dostęp do repo, uv zainstalowane lokalnie  
**Estimated effort:** ~1 sesja, 2 fazy

## Open Risks & Assumptions

- `app.services.scoring.AsyncOpenAI` jest właściwym targetem dla monkeypatch (nie import path w teście)
- `docs/test-fixtures/test-cv-jane-kowalska.pdf` jest w repo i dostępny w CI checkout

## Success Criteria (Summary)

- `uv run pytest` zielone lokalnie bez zewnętrznych sekretów
- GitHub Actions pokazuje zielony job `backend-tests` na PR/push do main
- Certyfikat: istnieje automatyczny test weryfikujący user flow (CV extraction przez API)
