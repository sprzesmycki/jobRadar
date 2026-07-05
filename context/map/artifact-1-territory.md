# Artefakt 1 — Terytorium (gdzie projekt żyje)

> Robocze notatki z Wide Scan, składowa 1/3. Źródło sygnału: **historia gita**.
> Metoda: `git log --name-only` + co-change per plik. NIE czytamy jeszcze kodu.

## Okno analizy (ważne ograniczenie)

- Repo `job-radar` ma **124 commity**, całość w oknie **2026-05-26 → 2026-06-08 (~2 tygodnie)**.
- Lekcja zakłada okno 12 miesięcy z podziałem na kwartały — **tutaj to niemożliwe**: cała historia mieści się w dwóch tygodniach.
- Konsekwencja: nie da się odróżnić „stałego centrum" od „sezonowej kampanii". Wszystkie sygnały aktywności to jedna, krótka faza budowy MVP. Etykiety `stable/volatile/seasonal` są tu **niedostępne** (`unknown`), nie fałszywie pewne.

## Filtr szumu

Odfiltrowane: `package-lock.json`, `uv.lock`, `node_modules/`, `.venv/`, `__pycache__`, `.ruff_cache`, `.pytest_cache`, `dist/`, `.astro/`, `.wrangler/`, `egg-info`.
Dodatkowo oddzielone: `context/**` i `docs/**` — to artefakty procesu 10xDevs (plany, roadmapy, archiwum zmian), nie kod produktu. Dominują ranking (`context/changes` = 131 dotknięć), ale opisują *jak pracowano*, nie *jak zbudowany jest system*.

## Najważniejsze obserwacje

1. **Praca skupia się w dwóch miejscach: `src/pages` (frontend/BFF, 45 dotknięć) i `backend/app` (Python API, 51 dotknięć).** To dwa rdzenie systemu — Astro jako warstwa produktowa + FastAPI jako usługa AI/CV.
2. **Najgorętszy pojedynczy plik to `src/pages/dashboard.astro` (15 zmian)** — centralny widok produktu, spina jobs + scoring + preferences.
3. **Istnieje realne sprzężenie cross-stack.** `backend/app/api/routes/cv.py` współzmienia się z `src/pages/api/cv/upload.ts` (3×) — to kontrakt między warstwą BFF (Astro) a usługą Pythona. Ta sama para tematyczna wraca dla `cover-letter` i `scoring`. **7 commitów dotyka jednocześnie `src/` i `backend/`.**
4. **`backend/tests/test_contracts.py` to drugi najgorętszy plik (12 zmian)** — testy kontraktowe pilnujące granicy frontend↔backend. Wysoka aktywność = granica jest krucha / często renegocjowana.
5. **Drzewko katalogów kłamie: `job_radar/` to martwy scaffold Django.** Pierwszy commit to „Django 6 + uv", ale backend jest realnie **FastAPI** (`backend/app/main.py`). `job_radar/` w HEAD zawiera już tylko `__pycache__`. Historia pokazuje 4 zmiany `job_radar/settings.py` — to ślad porzuconej ścieżki, nie aktywny obszar.

## TOP zmieniane pliki kodu (całe okno, po filtrze)

| # | Plik | Zmiany | Rola (hipoteza) |
|---|------|--------|-----------------|
| 1 | `src/pages/dashboard.astro` | 15 | centralny widok produktu |
| 2 | `backend/tests/test_contracts.py` | 12 | testy kontraktu frontend↔backend |
| 3 | `.github/workflows/ci.yml` | 9 | pipeline CI (dojrzewał) |
| 4 | `src/pages/api/jobs/score-batch.ts` | 7 | BFF: scoring ofert |
| 5 | `src/pages/api/cv/upload.ts` | 7 | BFF: upload CV → backend |
| 6 | `src/lib/jobs.ts` | 7 | logika domenowa ofert |
| 7 | `job_radar/settings.py` | 4 | **martwy** scaffold Django |
| 8 | `backend/app/core/config.py` | 4 | konfiguracja backendu |
| 9 | `backend/app/api/routes/cv.py` | 4 | endpoint CV (Python) |

## TOP zmieniane katalogi kodu

| Katalog | Dotknięcia | Uwaga |
|---------|-----------|-------|
| `backend/app` | 51 | rdzeń usługi Python (routes/services/schemas) |
| `src/pages` | 45 | strony + API routes (BFF) |
| `src/lib` | 31 | logika domenowa frontendu |
| `backend/tests` | 13 | testy kontraktowe + jednostkowe |
| `src/components` | 11 | UI |
| `supabase/migrations` | 8 | schema DB (auth, cv_profiles, saved_jobs) |

## Współzmiany (co zmienia się razem)

**Wokół `dashboard.astro`:** `src/lib/jobs.ts` (5×), `src/pages/api/jobs/score-batch.ts` (4×), `src/lib/preferences.ts`, `src/lib/supabase.ts`. → dashboard jest hubem produktowym: dotknięcie go zwykle ciągnie logikę jobs/scoring/preferences.

**Wokół `backend/app/api/routes/cv.py`:** `src/pages/api/cv/upload.ts` (3×), `backend/tests/test_contracts.py` (3×), `backend/app/services/storage.py` (3×), `backend/app/services/cv_extraction.py`, `backend/app/schemas/cv.py`, `supabase/migrations/…_create_cv_profiles.sql`. → pełny „korytarz CV": endpoint → serwis ekstrakcji → storage → schema → migracja DB → BFF frontendu. Zmiana kształtu CV przechodzi przez ~6 warstw i dwa języki.

## Wspólny mianownik

- Brak pojedynczego pliku i18n/config, który zmienia się „ze wszystkim" (projekt młody, bez warstwy tłumaczeń).
- Najbliżej „wspólnego mianownika" jest **granica kontraktu cv/scoring/cover-letter** — te trzy tematy powtarzają się jako pary BFF↔backend.

## Weryfikacja istnienia

Wszystkie pliki z TOP (poza świadomie oznaczonym `job_radar/`) **istnieją w HEAD** — analiza nie opiera się na usuniętych ścieżkach. ✅

## Co wynika dla pracy w legacy (wstępnie)

- Rdzeń = para **Astro BFF ↔ FastAPI**, spięta kontraktami cv/scoring/cover-letter. Tu zmiana najpewniej przejdzie przez kilka warstw.
- `dashboard.astro` = miejsce, gdzie zbiega się produkt; ostrożnie przy zmianach.
- `backend/tests/test_contracts.py` = sygnał, że granica frontend↔backend jest świadomie testowana — dobra siatka bezpieczeństwa, ale też dowód, że łatwo ją zepsuć.

## Unknowns (do sprawdzenia w Deep Focus)

- Czy `job_radar/` jest w 100% martwy (referencje w configu / deployu)? — do potwierdzenia.
- Czy istnieją kontrakty, które **powinny** się współzmieniać, a nie robią tego? (np. typ CV w Pythonie vs jego odpowiednik w TS) — historia tego nie pokaże.
- Brak wymiaru czasu (2 tyg.) → nie wiadomo, co jest trwałym centrum, a co artefaktem sprintu MVP.
