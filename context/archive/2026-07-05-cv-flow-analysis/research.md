---
date: 2026-07-05T14:01:58+0200
researcher: sebastian.przesmycki
git_commit: b0635dea29a1f48019ba87fa89fe4dab0dd2a218
branch: main
repository: przeprogramowani
topic: "Korytarz CV (upload + ekstrakcja) — Deep Focus M4L3"
tags: [research, codebase, cv, extraction, bff, fastapi, deep-focus]
status: complete
last_updated: 2026-07-05
last_updated_by: sebastian.przesmycki
---

# Research: Korytarz CV (upload + ekstrakcja) — Deep Focus M4L3

**Date**: 2026-07-05T14:01:58+0200 · **Researcher**: sebastian.przesmycki · **Commit**: b0635de · **Branch**: main · **Repository**: przeprogramowani

## Cel Deep Focus (jednolinijkowo)

Badam **przepływ zapisu i ekstrakcji CV**, wchodząc od `src/pages/api/cv/upload.ts`; mapa (`context/map/repo-map.md`) wskazała ten obszar jako strefę ryzyka #1/#3 (kontrakt runtime frontend↔backend + „korytarz CV" przez 6 warstw i 2 języki, siatka = `test_contracts.py`). Metoda: `/10x-research` z 3 sub-agentami (trace / luki testów / blast radius), mapa jako **prior, nie prawda**.

> Zakres: wyłącznie analiza stanu obecnego. **Bez refaktoru** (to M4L4). Twierdzenia strukturalne (liczby) w tym raporcie są oznaczone `⟐ do weryfikacji ast-grep` i domknięte w Kroku 3.

---

## 1. Feature overview

### 1.1 Co to naprawdę jest

Z zewnątrz „upload CV z ekstrakcją AI". Pod spodem: **upload PDF do Supabase Storage + deterministyczna ekstrakcja regexami i listami słów kluczowych**. `[evidence]` `backend/app/services/cv_extraction.py` nie ma żadnego LLM — to `pypdf` + `EMAIL_RE`/`LINK_RE`/`PHONE_RE` + ręczne listy `SKILL_KEYWORDS` (⟐ ~22) i `ROLE_KEYWORDS` (⟐ ~9). „AI" w tym feature to nazwa produktu, nie mechanizm. `[evidence]` (LLM — z.ai/GLM — pojawia się dopiero w *scoringu* i *cover letterze*, nie w ekstrakcji CV). `[evidence]`

### 1.2 Trace end-to-end (przepływ, nie spis plików)

Kluczowa obserwacja: to, co z drzewa katalogów wygląda jak gruby stos warstw, realnie ma **jedno gęste miejsce pracy** (`cv_extraction.py`) i wiele cienkich opakowań (route → service → storage to przezroczysty transport). `[inference]`

```mermaid
sequenceDiagram
    participant U as Browser (dashboard.astro)
    participant BFF as Astro BFF<br/>api/cv/upload.ts
    participant ST as Supabase Storage<br/>bucket "cvs"
    participant API as FastAPI<br/>routes/cv.py
    participant EX as service<br/>cv_extraction.py
    participant DB as Supabase DB<br/>cv_profiles

    U->>BFF: POST form-data (cv=PDF)
    BFF->>BFF: auth (getUser+getSession), isPdf, size<=6MB
    BFF->>DB: SELECT storage_path WHERE user_id (stary plik)
    BFF->>ST: upload {user.id}/{ts}-{safeName}.pdf (upsert:false)
    BFF->>API: POST /v1/cv/extract {cv:{bucket,path,content_type}}<br/>Bearer access_token
    API->>API: bucket=="cvs"? content_type? path[0]==user_id?
    API->>ST: GET /storage/v1/object (service_role_key, omija RLS)
    ST-->>API: PDF bytes
    API->>EX: extract_profile_from_pdf_bytes(bytes)
    EX->>EX: pypdf → text; <20 znaków → 422
    EX-->>API: CvExtractionResponse (9 pól)
    API-->>BFF: 200 profil (9 pól)
    BFF->>BFF: normalizeProfile() → 7 pól (page_count/text_character_count ODPADAJĄ)
    BFF->>DB: upsert cv_profiles (onConflict user_id)
    BFF->>DB: DELETE job_scores WHERE user_id  (kaskada!)
    BFF->>DB: DELETE cover_letters WHERE user_id  (kaskada!)
    BFF->>ST: remove(stary storage_path)
    BFF-->>U: redirect /dashboard?saved=cv
```

Kroki z dowodami (`file:line`):
1. Auth + walidacja PDF/rozmiar — `src/pages/api/cv/upload.ts:95-132`. `[evidence]`
2. Odczyt starego profilu (znany race → orphan, świadomie zaakceptowany na MVP) — `upload.ts:134-147`. `[evidence]`
3. Upload do bucketu `cvs`, `upsert:false` — `upload.ts:151-158`. `[evidence]`
4. Wywołanie backendu przekazuje **referencję storage, nie bajty** — backend sam pobiera plik — `upload.ts:167-180` → `routes/cv.py:43` → `services/storage.py:12-33`. `[evidence]`
5. Backend: 3 bramki walidacji (bucket, content_type, path-traversal `parts[0]==user_id`) — `routes/cv.py:22-40`. `[evidence]`
6. Download przez `service_role_key` (omija RLS) — `services/storage.py:13-24`. `[evidence]`
7. Ekstrakcja; próg `<20` znaków → `CvExtractionError` → 422 — `cv_extraction.py:77-92`. `[evidence]`
8. BFF re-normalizuje odpowiedź defensywnie (TS) i upsertuje wiersz `cv_profiles` — `upload.ts:196-222`. `[evidence]`
9. **Kaskadowa inwalidacja** `job_scores` + `cover_letters` (fire-and-forget, błędy logowane) — `upload.ts:232-236`. `[evidence]`

### 1.3 Kształt zapisu i odczytu

- **Jeden profil na użytkownika**: `upsert onConflict user_id`, PK = `user_id` — `upload.ts:204-222`, migracja `supabase/migrations/20260602140000_create_cv_profiles.sql:10`. `[evidence]`
- **Odczyt (return path)**: SSR `dashboard.astro:21` → `src/lib/cv-profile.ts:25-45` (ręczna lista `.select(...)`), render karty profilu `dashboard.astro:150-189`. Wyświetlane: `full_name, file_name, file_size, email, phone, role_hints[0..3], skills[0..10], experience_highlights[0..2]`. `[evidence]`
- **Profil bramkuje UI**: istnienie `cv_profiles` włącza pobranie `job_scores` i przyciski scoring/cover-letter — `dashboard.astro:30-37,367-373`. `[evidence]`
- **Downstream re-czyta profil serwerowo** (klient NIE wysyła profilu): `score-batch.ts:167-171` (bierze `skills, role_hints, experience_highlights`), `cover-letter.ts:78-82` (bierze też `full_name`). `[evidence]`

---

## 2. Technical debt (mapa kruchości, nie lista brzydkich plików)

### 2.1 Najgroźniejszy dług jest cichy: model rozjeżdżający się na 4 połowy

Kształt profilu żyje w **czterech** miejscach, które muszą się zgadzać, a nic ich nie trzyma razem narzędziowo (connascence znaczenia na dużym dystansie): `[evidence]`

| Lokalizacja | Pola profilu |
|---|---|
| backend `CvExtractionResponse` (`schemas/cv.py:16-25`) | 7 semantycznych + `page_count` + `text_character_count` (**9**) |
| frontend `ExtractedProfile` (`upload.ts:8-16`) | **7** (dwa pola telemetryczne odpadają w `normalizeProfile`) |
| DB `cv_profiles` (migracja `:16-22`) | **7** semantycznych (+ metadane storage) |
| `CvProfile` + `.select(...)` (`cv-profile.ts`) | 14 kolumn jako **surowy string** |

- **`page_count` / `text_character_count`: martwy output** — liczone przez backend, odrzucane przez TS i nieprzechowywane w DB. `[evidence]` Dodanie pola do ekstrakcji NIE propaguje się samo — trzeba ruszyć wszystkie 4 miejsca + body upsertu. `[inference]`
- **Najostrzejszy szew: nietypowane stringi `.select(...)` na `cv_profiles` w 4 plikach** (zweryfikowane ast-grep, patrz §6): `cv-profile.ts:28` (14 kolumn), `score-batch.ts:169`, `cover-letter.ts:80`, `upload.ts:139` (`storage_path`). Rename kolumny **przechodzi kompilację TS i pęka dopiero w runtime**. Żaden test kontraktowy tego nie spina. `[inference]` To najwyższe ryzyko cichego zepsucia danych.
- **Mapowanie nazw frontend→backend**: `experience_highlights → ProfileInput.experience`, `full_name → summary` (`score-batch.ts:47-60`, `cover-letter.ts:109-124`). Semantyczny rename nieobjęty żadnym testem granicznym. `[inference]`

### 2.2 Kontrakt kodów błędu jest niepełny (drift)

Backend emituje **8 kodów błędu z 6 miejsc `raise`** (zweryfikowane ast-grep, §6 — jeden `raise` w gałęzi `httpx.HTTPError` rozgałęzia się na 3 kody) (`routes/cv.py`: `invalid_cv_bucket`, `unsupported_cv_type`, `cv_path_forbidden`, `storage_not_configured`, `storage_credentials_invalid`, `cv_file_not_found`, `storage_download_failed`, `cv_text_not_extractable`). BFF `getExtractionErrorMessage` (`upload.ts:79-93`) mapuje **jawnie tylko 3** (422 + `storage_credentials_invalid` + `cv_file_not_found`); reszta ląduje w generycznym „CV extraction service is unavailable." `[evidence]` Użytkownik traci informację np. o `unsupported_cv_type` (415) czy `storage_download_failed` (502). `[inference]`

### 2.3 Luki testowe dokładnie tam, gdzie decyduje bezpieczeństwo refaktoru

- **Kody błędu backendu: pokryte ⟐ 4/8** (`test_contracts.py:197,207,223,233,484`). Niepokryte: `storage_download_failed` (502), `storage_credentials_invalid` (503), `cv_file_not_found` (404), `cv_text_not_extractable` (422 bezpośrednio). `[evidence]`
- **BFF `upload.ts`: 0% pokrycia.** Brak testów auth, walidacji, uploadu, `normalizeProfile`, upsertu, **5 ścieżek cleanupu** `storage.remove` (`upload.ts:182,188,200,225,239`) i **kaskadowej inwalidacji** `job_scores`/`cover_letters`. `[evidence]` To znaczy: ścieżki błędu, które decydują o osieroconych plikach w storage, nikt nie testuje.
- **`cv_extraction.py`: brak testów jednostkowych** funkcji (`guess_full_name`, `find_keywords`, `find_experience_highlights`, `first_match`, `unique_matches`, `normalize_spaces`). Jest tylko test integracyjny na fixture PDF (`test_cv_extraction.py:13,26,34`). `[evidence]` Regresje w heurystyce parsowania przejdą niezauważone.

### 2.4 Sprzężenie tanie vs prawdziwe (żeby nie panikować)

- **Tanie (łapane przez CI, nie liczą się jako blast radius):** `uv.lock`, `pyproject.toml` (generowane), `test_contracts.py`/`test_cv_extraction.py` (siatka, nie rzecz do przemyślenia), `context/changes/*` (planistyczny szum). `[evidence]`
- **Prawdziwe (człowiek musi ręcznie synchronizować, żaden test nie spina end-to-end):** 7-polowy kształt profilu przez 4 lokalizacje + nietypowane `.select()` + mapowanie nazw front→back. `[inference]`
- **`SKILL_KEYWORDS`/`ROLE_KEYWORDS` to NIE kontrakt** — miękka dźwignia recall. Scoring dopasowuje LLM-em (`services/scoring.py`, z.ai/GLM) na wolnym tekście, nie równością stringów. Usunięcie słowa = niższy recall ekstrakcji, nic nie rzuca wyjątku. Jedno wewnętrzne sprzężenie: `find_experience_highlights` reużywa `SKILL_KEYWORDS`. `[evidence]`

### 2.5 Blast radius — co musi ruszyć się razem

Zmiana zestawu pól profilu = **7 plików** naraz: `cv_extraction.py` · `schemas/cv.py` · `upload.ts` (interfejs + `normalizeProfile` + body upsertu) · migracja `cv_profiles` · `cv-profile.ts` (interfejs + `.select()`) · `dashboard.astro` · testy kontraktowe. Plus **2 mappery downstream** (`score-batch.ts`, `cover-letter.ts`), jeśli rusza się pole, które konsumują. `[both: static graph + co-change]` `score-batch.ts` potwierdzone współzmianami z `upload.ts`. `[evidence]`

Dodatkowo: `score-batch.ts` **selektuje `role_hints`, ale go nie przekazuje** do backendu — martwa kolumna w `.select()`. `[evidence]`

---

## 3. Korekty priora z mapy (evidence > prior)

Mapa (M4L2) to prior; research go doprecyzował:
- Mapa: „kontrakt frontend↔backend runtime, niewidoczny w grafie". **Potwierdzone i pogłębione**: kontrakt to HTTP `POST /v1/cv/extract` z referencją storage; realny szew ryzyka to nietypowane `.select()` stringi, nie sam HTTP. `[correction: doprecyzowanie]`
- Mapa: „korytarz CV przez 6 warstw". **Doprecyzowane**: warstw jest formalnie ~6, ale realna praca jest w 1 (`cv_extraction.py`); reszta to transport. `[correction]`
- Prior domyślny „CV + AI" ⇒ ekstrakcja LLM. **Obalone**: ekstrakcja jest czysto regex/keyword. `[correction: obalone]`

## 4. Evidence / Inference / Unknown — podsumowanie

**Unknowns (do Deep Focus / weryfikacji):**
- Czy odrzucenie `page_count`/`text_character_count` jest świadome, czy niedokończone? `[unknown]`
- Czy `storage_download_failed`/`credentials_invalid`/`cv_file_not_found` realnie występują w produkcji (brak logów w oknie historii)? `[unknown]`
- Czy istnieje kontrakt, który *powinien* się współzmieniać (TS `ExtractedProfile` ↔ Python `CvExtractionResponse`), a git prawie nigdy nie rusza ich w jednym commicie? co-change tego nie potwierdził — `[unknown]`.

## 6. Weryfikacja twierdzeń strukturalnych (ast-grep + grep, Krok 3)

Narzędzie: `ast-grep 0.44.1`. Reguła lekcji zastosowana: **liczba z ast-grep, każde zero potwierdzone grepem**.

| # | Twierdzenie z raportu | Wynik | Dowód (ast-grep / grep) |
|---|-----------------------|-------|-------------------------|
| 1 | `cv.py` ma 8 kodów błędu | **doprecyzowane** | 8 kodów, ale z **6** `raise HTTPException` (`ast-grep 'raise HTTPException($$$)'` = 6); jeden raise w gałęzi `httpx.HTTPError` rozgałęzia się na 3 kody przez zmienną `detail_code`. Grep: 8 unikalnych stringów kodów. |
| 2 | `upload.ts`: 5 wywołań `storage…remove()` | **potwierdzone** | `ast-grep 'supabase.storage.from($$$).remove($$$)'` = 5; grep `.remove([` = 5. |
| 3 | Profil = 7 pól po obu stronach (2 odrzucone) | **potwierdzone** | `ExtractedProfile` = 7 pól, `normalizeProfile` zwraca 7 kluczy; `page_count`/`text_character_count` nieobecne. |
| 4 | `SKILL_KEYWORDS`=22, `ROLE_KEYWORDS`=9 | **potwierdzone** | grep elementów listy: 22 i 9. |
| 5 | Nietypowane `.select()` na `cv_profiles` w 3 plikach | **OBALONE → 4 pliki** | `ast-grep '$X.from("cv_profiles").select($A)'` = 4: `cv-profile.ts:28`, `score-batch.ts:169`, `cover-letter.ts:80`, **`upload.ts:139`** (`storage_path`) — pierwotnie pominięty. Ryzyko szersze, nie węższe. |
| 6 | Testy pokrywają 4/8 kodów błędu | **potwierdzone** | Asertowane: `invalid_cv_bucket`, `unsupported_cv_type`, `cv_path_forbidden`, `storage_not_configured`. Pozostałe 4 — **realne zero** (grep w `backend/tests/` potwierdza brak). |
| 7 | Czytelnicy `cv_profiles` | **doprecyzowane** | 4 miejsca `.select` na `cv_profiles`: **3 konsumują kształt profilu** (`cv-profile.ts` render, `score-batch.ts`, `cover-letter.ts`) + **1 czyta tylko `storage_path`** (`upload.ts`). Pisarze: 1 `upsert` (`upload.ts:204`). |

**Wniosek z weryfikacji:** raport przetrwał śledztwo z dwiema korektami wzmacniającymi tezę o ryzyku — (a) kody błędu pochodzą z 6 rozgałęziających się miejsc raise (trudniejsze do pełnego przetestowania), (b) nietypowane `.select()` jest w **4**, nie 3 plikach. Żadne twierdzenie nie okazało się fałszywie zawyżone w stronę mniejszego ryzyka. Jedno fałszywe zero z ast-grep (pattern `raise HTTPException(status_code=$$$)` = 0) wychwycone i naprawione zgodnie z regułą lekcji.

## Code References

- `src/pages/api/cv/upload.ts:95-244` — cały write-path BFF (auth, upload, fetch, normalize, upsert, kaskada, cleanup).
- `backend/app/api/routes/cv.py:16-77` — walidacja + 8 kodów błędu + download + extract.
- `backend/app/services/cv_extraction.py:77-170` — regex/keyword ekstrakcja (gęste centrum).
- `backend/app/services/storage.py:12-33` — download przez service_role_key (omija RLS).
- `backend/app/schemas/cv.py:16-25` — `CvExtractionResponse` (9 pól).
- `supabase/migrations/20260602140000_create_cv_profiles.sql:9-28` — tabela + RLS.
- `src/lib/cv-profile.ts:25-45` — read-back z ręcznym `.select()`.
- `src/pages/api/jobs/score-batch.ts:47-60,167-171` · `src/pages/api/jobs/cover-letter.ts:78-82,109-124` — downstream mappery.
- `backend/tests/test_contracts.py:197,207,223,233,248,484` · `backend/tests/test_cv_extraction.py:13,26,34` — pokrycie.

## Related Research

- `context/map/repo-map.md` — Mapa projektu (M4L2), prior wejściowy.
- `context/archive/2026-06-02-cv-upload-and-extraction/` · `context/archive/2026-06-02-python-cv-ai-service-foundation/` — historyczne decyzje o tym korytarzu.

## Open Questions

Patrz §4 (Unknowns). Priorytet do M4L4: nietypowane `.select()` stringi + brak testów granicy front↔back — to one zdecydują, czy refaktor kształtu profilu jest bezpieczny.
