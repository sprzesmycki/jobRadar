# Artefakt 2 — Struktura (jak to jest zbudowane)

> Robocze notatki z Wide Scan, składowa 2/3. Źródło sygnału: **statyczny graf importów**.
> Narzędzie (JS/TS): `dependency-cruiser` 17.4.3 (config: `.dependency-cruiser.cjs`, alias `@/* → src/*`).
> Backend Python: brak grafu z tego narzędzia → **light import scan** (grep), jawnie oznaczony jako słabszy sygnał.
> Format: Markdown najpierw (za lekcją), bez Graphviz/SVG na tym etapie.

## Najważniejsze obserwacje

1. **Frontend (`src/`) ma czysty graf: 0 cykli** (35 modułów, 57 zależności). To dobra wiadomość dla legacy — brak splątanych granic importów po stronie Astro/TS.
2. **Jeden stabilny rdzeń nośny: `src/lib/supabase.ts`** — Ca=9 (dziewięć modułów od niego zależy), instability=0.18. Auth + klient DB. Zmiana jego kontraktu ma najszerszy blast radius w całym frontendzie.
3. **Warstwa kontraktu adapterów: `src/lib/job-sources/types.ts`** — Ca=6, instability=0. Wspólny typ dla wszystkich źródeł ofert (adzuna, remotive, justjoinit, salary). Klasyczny contract layer.
4. **Jeden orkiestrator: `src/lib/job-sources/aggregate.ts`** — Ce=5, instability=0.83. Składa 4 adaptery źródeł w jeden przepływ. Wysoki fan-out = kruchy wobec zmian w którymkolwiek źródle, ale sam mało od kogo zależny → dobry punkt izolacji feature'u „agregacja ofert".
5. **Backend to czysta, warstwowa architektura FastAPI** (light scan): `main → api/routes → services → schemas/core`. Routery jawnie montowane w `main.py` (health, me, cv, scoring, cover_letter). Load-bearing: `app.core.config` (10 importów), `app.core.security` i `app.schemas.common` (po 5).
6. **Struktura mirroruje się między warstwami.** Frontend BFF (`src/pages/api/{cv,jobs}`) ma bliźniaka w backendzie (`backend/app/api/routes/{cv,scoring,cover_letter}`). Dwa niezależne grafy, jeden kontrakt — spięty przez `test_contracts.py`.

## Cykle

| Obszar | Wynik | Dowód | Dlaczego ważne |
|--------|-------|-------|----------------|
| `src/` (Astro/TS) | **brak cykli** | `depcruise src` → 0 circular, 35 mod / 57 dep | granice importów frontendu są zdrowe; nie ma tu kandydata na Deep Focus „po cyklu" |
| `backend/` (Python) | **nieznane (`unknown`)** | brak grafu — `dependency-cruiser` nie obsługuje Pythona | NIE zakładać „brak cykli"; alternatywa: `pydeps`/`Tach` w kolejnej sesji |

## Metryki sprzężenia — frontend (Ca=fan-in, Ce=fan-out, inst=Ce/(Ca+Ce))

| Moduł | Ca | Ce | inst | Interpretacja |
|-------|----|----|------|---------------|
| `src/lib/supabase.ts` | 9 | 2 | 0.18 | **stabilny rdzeń** (auth+DB), szeroki blast radius przy zmianie kontraktu |
| `src/lib/job-sources/types.ts` | 6 | 0 | 0.00 | **contract layer** adapterów źródeł ofert |
| `src/lib/job-sources/aggregate.ts` | 1 | 5 | 0.83 | **orkiestrator** — składa 4 źródła; kruchy wobec zmian w adapterach |
| `src/lib/jobs.ts` | 0 | 4 | 1.00 | logika domenowa ofert, konsument (wysoka niestabilność = OK dla top-level) |
| `src/lib/job-sources/{adzuna,remotive}.ts` | 2 | 3 | 0.60 | adaptery: implementują `types.ts`, wołają salary/util |

(`astro`, `astro:env/server` mają wysokie Ca, ale to zależności frameworka — pominięte jako szum.)

## Granice warstw

| Sprawdzana granica | Wynik | Dowód | Uwaga |
|--------------------|-------|-------|-------|
| BFF (Astro `src/pages/api`) vs backend (FastAPI) | dwie osobne bazy kodu, jeden kontrakt | mirror tras `cv/scoring/cover-letter`; `test_contracts.py` pilnuje | zmiana kształtu żądania/odpowiedzi = edycja po obu stronach |
| `lib` vs `pages` (frontend) | `pages`/`components` zależą od `lib`, nie odwrotnie | graf importów, kierunek do `supabase.ts`/`jobs.ts` | warstwy trzymają granicę |
| adaptery źródeł vs `types.ts` | adaptery zależą od kontraktu, kontrakt od nikogo | `types.ts` Ca=6, Ce=0 | zdrowa inwersja: kontrakt jest fundamentem |
| backend `services` vs `core`/`schemas` | services zależą od config/security/schemas | light scan: `core.config` Ca=10 | warstwowo poprawne |

## Ryzyka testowalności (z grafu)

- **`aggregate.ts` (Ce=5)** — testy jednostkowe wymagają zamockowania 4 adapterów + salary. Naturalny kandydat na test integracyjny źródeł ofert.
- **Wszystko co ciągnie `supabase.ts` (Ca=9)** — trudne w izolacji bez mocka klienta Supabase (auth/DB). Dotyczy większości API routes.
- **Kontrakt cv/scoring/cover-letter** — ryzyko realne po stronie granicy; już pokryte `backend/tests/test_contracts.py` (najgorętszy plik testowy z artefaktu 1).

## Entry pointy (z enumeracji, nie z grafu)

- **Frontend strony:** `index.astro`, `dashboard.astro` (hub), `auth/{signin,signup,confirm-email}.astro`.
- **Frontend BFF API:** `api/auth/{signin,signout,signup}`, `api/cv/upload`, `api/jobs/{score-batch,cover-letter}`, `api/preferences`, `api/saved-jobs`, `api/debug/jobs`.
- **Backend FastAPI:** routery `health`, `me`, `cv`, `scoring`, `cover_letter` (montowane w `main.py`).

## Orphany (uwaga na limit narzędzia)

`saved-jobs.ts`, `job-scores.ts`, `cv-profile.ts` wychodzą jako orphan w grafie — **ale to prawdopodobnie artefakt parsowania `.astro`**: są importowane ze stron `.astro`/tras, których `dependency-cruiser` nie przechodzi w pełni. To limit narzędzia, nie martwy kod. `needs verification`.

## Unknowns (luki statycznej analizy)

- **Backend nie ma grafu importów** — cała ocena couplingu Pythona to light grep scan, nie `Ca/Ce`. → `pydeps`/`Tach` w Deep Focus.
- **Runtime coupling niewidoczny w grafie:** zmienne env (`astro:env/server`), feature flagi, wywołania HTTP BFF→backend (fetch, nie import), webhooki, Supabase RLS/migrations, kolejność montowania routerów.
- **Granica Astro↔React↔`.astro`** — parsowanie `.astro` przez depcruise jest częściowe (patrz orphany).
- **Kontrakt frontend↔backend jest runtime (HTTP), nie import** — graf statyczny nigdy go nie pokaże; jedyny widoczny ślad to co-change + `test_contracts.py`.
