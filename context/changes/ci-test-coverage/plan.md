# CI Test Coverage Implementation Plan

## Overview

Napraw stale scoring test i uruchom istniejące testy backendu w CI. Istniejące testy (`test_contracts.py`, `test_cv_extraction.py`) są wystarczające jako "user-facing tests" dla certyfikatu — brakuje tylko tego, że nigdy nie uruchamiają się automatycznie.

## Current State Analysis

Dwa pliki testów backendu istnieją i działają lokalnie przez `uv run pytest`. CI job uruchamia tylko `npm lint + build` — `pytest` nie jest wywoływany. Jeden test (`test_job_scoring_placeholder_returns_501`) jest nieaktualny: endpoint `/v1/jobs/score` jest zaimplementowany od S-05 i nie zwraca już 501. Cover letter endpoint (`/v1/cover-letter`) nadal zwraca 501 — jego test jest poprawny.

## Desired End State

`uv run pytest` przechodzi zielono na gałęzi main. CI ma osobny job `backend-tests`, który setup-uje uv, instaluje dev dependencies i uruchamia pytest. Stale scoring test jest zastąpiony testem weryfikującym kształt odpowiedzi przy zmockowanym AsyncOpenAI.

### Key Discoveries:

- `backend/tests/test_contracts.py:292` — `test_job_scoring_placeholder_returns_501` oczekuje HTTP 501, ale `app/api/routes/scoring.py` zwraca 200 od S-05
- `backend/pyproject.toml` — `[tool.pytest.ini_options] testpaths = ["tests"]`, `pythonpath = ["."]` — pytest skonfigurowany
- `docs/test-fixtures/test-cv-jane-kowalska.pdf` — fixture jest w repo, `test_cv_extraction.py` zadziała w CI
- `app/services/scoring.py:54` — `AsyncOpenAI` importowany bezpośrednio; można mockować przez `monkeypatch.setattr("app.services.scoring.AsyncOpenAI", ...)`
- Cover letter (`app/api/routes/cover_letter.py`) nadal zwraca 501 hardcode — `test_cover_letter_placeholder_returns_501` jest nadal poprawny

## What We're NOT Doing

- Playwright E2E tests — TestClient API tests spełniają wymaganie certyfikatu
- Frontend unit tests (vitest) — nie w scope tego slice
- Test dla cover letter (S-06 blocked)
- Zwiększanie coverage — minimum do certyfikatu i zielonego CI

## Implementation Approach

Phase 1 najpierw, bo CI nie może zielenić dopóki test jest stale. Phase 2 to mechaniczne dodanie Python setupu do workflow.

## Phase 1: Fix Stale Scoring Test

### Overview

Zastąp `test_job_scoring_placeholder_returns_501` nowym testem, który mockuje `AsyncOpenAI` i weryfikuje że zaimplementowany scoring endpoint zwraca strukturę `JobScoringResponse` (score, explanation, matched_skills, missing_skills).

### Changes Required:

#### 1. Replace stale test in `test_contracts.py`

**File**: `backend/tests/test_contracts.py`

**Intent**: Usuń `test_job_scoring_placeholder_returns_501` i dodaj `test_job_scoring_returns_structured_result`. Nowy test używa `authed_client`, patchuje `app.services.scoring.AsyncOpenAI` przez `monkeypatch`, i weryfikuje że endpoint zwraca HTTP 200 z kluczami `score`, `explanation`, `matched_skills`, `missing_skills`.

**Contract**: Mock `AsyncOpenAI` musi udawać `client.chat.completions.create(...)` zwracające obiekt z `choices[0].message.content` zawierającym JSON: `{"score": 75, "explanation": "Good match.", "matched_skills": ["Python"], "missing_skills": ["Go"]}`. `monkeypatch.setattr("app.services.scoring.AsyncOpenAI", ...)` — target module path, nie import path w teście.

### Success Criteria:

#### Automated Verification:

- `cd backend && uv run pytest tests/test_contracts.py -v` — wszystkie testy zielone, żadnego FAILED ani ERROR

#### Manual Verification:

- Sprawdź że `test_job_scoring_returns_structured_result` pojawia się w output i PASSED

---

## Phase 2: Add backend-tests CI Job

### Overview

Dodaj nowy job `backend-tests` do `.github/workflows/ci.yml`, który checkout-uje repo, instaluje Python + uv, instaluje dev dependencies backendu i uruchamia pytest.

### Changes Required:

#### 1. Add `backend-tests` job to CI workflow

**File**: `.github/workflows/ci.yml`

**Intent**: Nowy job równoległy do istniejącego `ci` joba. Uruchamia się na `push` i `pull_request` do main — te same triggery co obecny job.

**Contract**:

```yaml
backend-tests:
  runs-on: ubuntu-latest
  defaults:
    run:
      working-directory: backend
  steps:
    - uses: actions/checkout@v4
    - uses: astral-sh/setup-uv@v4
      with:
        version: "latest"
    - run: uv sync --group dev
    - run: uv run pytest
```

`working-directory: backend` w `defaults.run` oznacza że wszystkie `run:` kroki wykonują się w `backend/`. Nie potrzeba żadnych sekretów — testy mockują zewnętrzne wywołania.

### Success Criteria:

#### Automated Verification:

- Push do branch lub PR do main — CI pokazuje dwa joby: `ci` (Node/lint/build) i `backend-tests` (Python/pytest)
- Job `backend-tests` przechodzi zielono

#### Manual Verification:

- Na stronie Actions w GitHub widoczny jest run z oboma jobami zielonymi

**Implementation Note**: Po Phase 2 poczekaj na zielone CI na main przed zamknięciem change.

---

## Testing Strategy

### Automated Tests in CI:

- `test_contracts.py` — 14+ testów API kontraktowych przez TestClient
- `test_cv_extraction.py` — testy ekstrakcji PDF (w tym real-fixture test)
- Nowy scoring mock test zastępuje stale placeholder test

### Manual Testing Steps:

1. `cd backend && uv run pytest -v` — weryfikacja lokalna przed push
2. Otwórz PR, sprawdź Actions tab — oba joby zielone

## References

- Change: `context/changes/ci-test-coverage/change.md`
- Linear: SPR-14
- Scoring service: `backend/app/services/scoring.py:54`
- CI workflow: `.github/workflows/ci.yml`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Fix Stale Scoring Test

#### Automated

- [x] 1.1 `cd backend && uv run pytest tests/test_contracts.py -v` — all PASSED, no FAILED

#### Manual

- [x] 1.2 Nowy `test_job_scoring_returns_structured_result` widoczny i PASSED w output

### Phase 2: Add backend-tests CI Job

#### Automated

- [ ] 2.1 CI job `backend-tests` przechodzi zielono na PR/push

#### Manual

- [ ] 2.2 GitHub Actions pokazuje oba joby (ci + backend-tests) zielone
