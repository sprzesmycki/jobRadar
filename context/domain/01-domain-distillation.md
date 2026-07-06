---
title: Destylacja domeny JobRadar — mapa domeny, subdomeny, agregaty i rozjazdy model↔kod
created: 2026-07-05
type: domain-distillation
---

# Destylacja domeny — JobRadar

> Produkt tej analizy to MAPA domeny, nie kod. Wszystkie pojęcia i reguły zostały ODKRYTE
> z dokumentów źródłowych (`context/foundation/`) oraz z kodu (backend Python, frontend Astro/TS,
> migracje SQL). Każdy cytat został zweryfikowany przez otwarcie pliku — numery linii są rzeczywiste.

## KROK 0 — Kontekst projektu (odkryty)

- **Dokumenty źródłowe (dostępne):** `context/foundation/prd.md`, `shape-notes.md`, `roadmap.md`,
  `tech-stack.md`, `README.md`. PRD jest kompletny (11 FR, 2 US, guardrails, non-goals) — analiza
  NIE jest ograniczona brakiem wymagań.
- **Stack i warstwy (odkryte):**
  - Frontend + orkiestracja API: **Astro 6 + React 19 + TypeScript** w `src/`. Server routes żyją
    w `src/pages/api/**`, logika domenowa w `src/lib/**`.
  - Serwis AI/CV: **FastAPI (Python)** w `backend/app/**` — warstwy `api/routes`, `services`, `schemas`.
  - Persystencja: **Supabase/Postgres**, migracje w `supabase/migrations/*.sql` (RLS + CHECK-i).
  - Zewnętrzny LLM: z.ai (GLM), wołany z `backend/app/services/{scoring,cover_letter}.py`.
- **Rozproszenie logiki domenowej:** reguły są rozsiane po TRZECH warstwach — filtrowanie i dedup w TS
  (`src/lib`), scoring/generacja i ekstrakcja w Pythonie (`backend/app/services`), a niezmienniki
  danych w SQL (`supabase/migrations`). Ten rozjazd warstwowy jest sam w sobie źródłem części dryfu.

---

## KROK 1 — Ubiquitous Language

| Pojęcie | Definicja (z domeny) | Cytat źródłowy (dokument) | Gdzie żyje w kodzie |
| --- | --- | --- | --- |
| **CV Profile** | Wgrane raz CV (PDF) + wyekstrahowany profil (skills, role hints, highlights), używane przy każdym scoringu | prd.md:126 „CV w formacie PDF, załadowane raz i używane przy każdym scoringu" | Tabela `cv_profiles` — `supabase/migrations/20260602140000_create_cv_profiles.sql:11`; typ `CvProfile` — `src/lib/cv-profile.ts:14`; ekstrakcja — `backend/app/services/cv_extraction.py:77` |
| **Match Score (% dopasowania)** | Liczba 0–100 opisująca dopasowanie CV do oferty | prd.md:98 „CV-to-job match percentage score for each offer" | `JobScoringResponse.score` — `backend/app/schemas/scoring.py:12`; kolumna `score` (CHECK 0–100) — `supabase/migrations/20260605120000_create_job_scores.sql:8` |
| **Explanation (uzasadnienie)** | Zwięzłe wyjaśnienie kluczowych czynników scoringu | prd.md:99 (FR-006) „with a brief explanation of the key matching factors" | `JobScoringResponse.explanation` — `backend/app/schemas/scoring.py:13`; **wymóg niepustości NIE egzekwowany** — `backend/app/services/scoring.py:93` wstawia `""` gdy brak |
| **Matched Skills** | Skills obecne i w CV, i w ofercie | prd.md:128 „skills obecnych w ofercie" (implikacja) | `matched_skills` — `backend/app/schemas/scoring.py:14` |
| **Missing Skills** | Skills wymagane przez ofertę a nieobecne w CV | prd.md:100 (FR-007) „which skills are missing from their CV" | `missing_skills` — `backend/app/schemas/scoring.py:15`; **filtrowanie soft-skilli — BRAK w kodzie** (patrz KROK 4) |
| **Cover Letter** | Spersonalizowany tekst odwołujący się do konkretnej oferty i punktów z CV | prd.md:105 (FR-008) | `generate_cover_letter` — `backend/app/services/cover_letter.py:65`; tabela `cover_letters` — `supabase/migrations/20260605160000_create_cover_letters.sql` |
| **Job Preferences** | Rola, technologie, min. widełki, tryb pracy — pre-filtr przed scoringiem | prd.md:88 (FR-004); prd.md:89 „niezbędne do pre-filtrowania przed scoringiem" | Tabela `job_preferences` — `supabase/migrations/20260601100000_create_job_preferences.sql:1`; typ `JobPreferences` — `src/lib/preferences.ts:3`; filtry — `src/lib/jobs.ts:67-97` |
| **Job Listing / Oferta** | Pojedyncza oferta z zewnętrznego źródła (transient, nieprzechowywana) | prd.md:93 (FR-005) | `JobListing` — `src/lib/job-sources/types.ts:3` |
| **Source (źródło)** | JustJoinIT / Remotive / Adzuna | prd.md:93 „from JustJoinIT, Remotive, and Adzuna" | `JobSourceName` — `src/lib/job-sources/types.ts:1`; fetch — `src/lib/job-sources/aggregate.ts:61-65` |
| **Aggregation + Deduplication** | Złączenie ofert z 3 źródeł z odsianiem duplikatów | roadmap.md:33 „aggregated offers ... and deduplication" | `dedupeJobs` — `src/lib/job-sources/aggregate.ts:26`; klucz `company::title` — `aggregate.ts:18` |
| **External ID** | Stabilny identyfikator oferty, klucz cache scoringu/listu i zapisanych ofert | — (pojęcie techniczne, wynikowe) | `unique (user_id, external_id)` — `...create_saved_jobs.sql`, `...create_job_scores.sql:12`, `...create_cover_letters.sql` |
| **Job Hash** | SHA-256 treści oferty (title+company+description+technologies) — sygnał zmiany treści oferty | — (pojęcie wynikowe; intencja: wykrycie nieaktualności cache) | Liczony — `src/pages/api/jobs/score-batch.ts:33`, `.../cover-letter.ts:16`; kolumna `job_hash NOT NULL` — `...create_job_scores.sql:6`; **porównanie/inwalidacja — BRAK w kodzie** |
| **Saved Job + Status** | Zapisana oferta ze statusem interested/applied/rejected | prd.md:110 (FR-009) | Tabela `saved_jobs` + CHECK status — `...create_saved_jobs.sql:10`; typ `SavedJob` — `src/lib/saved-jobs.ts:5`; zapis — `src/pages/api/saved-jobs.ts:45` |
| **Notes (notatki)** | Notatka do zapisanej oferty (np. co padło na rozmowie) | prd.md:114 (FR-011, nice-to-have) | Kolumna `notes` — `...create_saved_jobs.sql:9`; pole `notes` w typie — `src/lib/saved-jobs.ts:6`; **ścieżka ZAPISU — BRAK w kodzie** (upsert w `saved-jobs.ts:37-53` nie ustawia `notes`) |
| **Privacy (prywatność CV)** | Pełna treść CV nigdy publiczna ani logowana w serwisach zewnętrznych | prd.md:45 (guardrail); prd.md:120 (NFR) | Prywatny bucket `cvs` (public=false) — `...create_cv_profiles.sql:1-3`; RLS storage per-user — `...:55-90`; walidacja ścieżki per-user w backendzie — `backend/app/api/routes/cv.py:35-40` |
| **Demo / Fallback jobs** | Statyczne oferty pokazywane, gdy źródła live padną | (odkryte w kodzie; brak w PRD) | `demoJobs` — `src/lib/jobs.ts:24`; wybór fallback — `src/lib/jobs.ts:138` |
| **Closed registration (single-user MVP)** | MVP: jeden użytkownik (właściciel) weryfikuje produkt | prd.md:134 „zamknięta rejestracja — jeden użytkownik" | **Egzekwowanie — BRAK w kodzie** (route `src/pages/api/auth/signup.ts` istnieje; brak allowlisty/wyłączenia rejestracji) |

---

## KROK 2 — Klasyfikacja subdomen: Core / Supporting / Generic

| Obszar / pojęcie | Kategoria | Uzasadnienie (odwołanie do celów produktu) |
| --- | --- | --- |
| **Match Score + Explanation + Missing Skills** (scoring CV↔oferta) | **CORE** | To sedno przewagi. Guardrail prd.md:46 „Wynik % dopasowania musi być wiarygodny — jeśli scoring jest losowy ... użytkownik przestaje ufać całemu produktowi". Jeśli to nie działa, produkt jest bezwartościowy. |
| **Cover Letter Generation** | **CORE** | US-02 (prd.md:63) + FR-008. Druga obietnica wartości: „napisanie spersonalizowanego cover lettera ... zajmuje godziny" (prd.md:20). |
| **Aggregation + Deduplication (3 źródła)** | **CORE** | Insight produktu: portale to silosy, brak jednej agregowanej powierzchni (prd.md:22). North star roadmap.md:24 to realne oferty z wielu źródeł. |
| **CV Extraction (PDF → profil)** | **SUPPORTING** | Konieczne, by zasilić Core (scoring/list), ale samo w sobie nie jest przewagą — to adapter wejścia. F-01/S-04 w roadmap. Non-goal: „Brak generatora/edytora CV" (prd.md:141). |
| **Job Preferences (pre-filtr)** | **SUPPORTING** | Wspiera Core przez zawężenie zbioru przed scoringiem (prd.md:89), ale to filtr, nie przewaga. |
| **Saved Jobs + Status + Notes** | **SUPPORTING** | Domyka pętlę aplikowania (FR-009/010/011), ale to tracking — wartość dodana, nie rdzeń. S-07/S-08 wciąż `proposed`. |
| **Auth / rejestracja / sesje** | **GENERIC** | Baseline bezpieczeństwa (FR-001/002). Realizowane w całości przez Supabase Auth — brak logiki domenowej własnej. |
| **Storage (prywatny bucket CV)** | **GENERIC** | Infrastruktura Supabase Storage; wartość leży w guardrailu prywatności, nie w samym storage. |

---

## KROK 3 — Kandydaci na agregaty i ich niezmienniki

| Agregat (kandydat) | Niezmiennik (reguła zawsze prawdziwa) | Cytat źródłowy | Status egzekwowania |
| --- | --- | --- | --- |
| **CvProfile** | Dokładnie JEDEN CV na użytkownika; wyłącznie PDF w buckecie `cvs`; nieujawniany publicznie | prd.md:126; prd.md:45 (guardrail) | **EGZEKWUJE** — PK `user_id` (`...create_cv_profiles.sql:11`), CHECK `content_type='application/pdf'` i `storage_bucket='cvs'` (`:23-24`), public=false + RLS (`:1-3, :29`). |
| **JobScore** | Score jest 0–100 **i pozostaje ważny tylko dopóki treść oferty i CV się nie zmieniły** | prd.md:98 (FR-006) + guardrail „score wiarygodny" prd.md:46; intencja `job_hash` | **CZĘŚCIOWO / IGNORUJE** — zakres 0–100 egzekwowany (CHECK `...:8`; pydantic `scoring.py:12`). Ale niezmiennik świeżości **IGNOROWANY**: cache czytany po `(user_id, external_id)` bez porównania `job_hash` — `score-batch.ts:181-195`. |
| **JobScore.explanation** | Score NIGDY nie jest samą liczbą — zawiera wyjaśnienie | prd.md:99 (FR-006) „with a brief explanation" | **IGNORUJE** — puste wyjaśnienie dopuszczone: `scoring.py:93` wstawia `""`; schema `explanation: str` bez `min_length`. |
| **CoverLetter** | Treść niepusta; ważna tylko dla danej pary (CV, oferta); odnosi się do oferty i CV | prd.md:71-73 (AC US-02); FR-008 | **CZĘŚCIOWO** — niepustość egzekwowana (`content_nonempty` CHECK `...20260606100000...:2`; guard `cover_letter.py:100`). Świeżość względem `job_hash` **IGNOROWANA** — cache po `(user_id, external_id)` (`cover-letter.ts:91-105`). „Odwołanie do oferty i CV" (AC) nieweryfikowane. |
| **SavedJob** | Status zawsze ∈ {interested, applied, rejected}; jedna zapisana wersja oferty na usera | prd.md:110 (FR-009) | **EGZEKWUJE** — CHECK status (`...create_saved_jobs.sql:10`), `unique(user_id, external_id)` (`:14`), fallback do `interested` (`saved-jobs.ts:45`). |
| **JobPreferences** | Waluta ∈ {EUR,USD,PLN}; preferencje zawężają zbiór PRZED scoringiem | prd.md:88-89 (FR-004) | **EGZEKWUJE** — CHECK waluty (`...:6`), filtry stosowane przed emisją ofert (`jobs.ts:143-150`). |
| **AggregatedJobs** | Brak duplikatów (ta sama firma+tytuł = jedna oferta); awaria jednego źródła nie wywala listy | roadmap.md:33; prd.md:47 (guardrail czasu) | **EGZEKWUJE** — `dedupeJobs` (`aggregate.ts:26`), `safelyFetchSource` izoluje błędy (`aggregate.ts:41-58`). |

---

## KROK 4 — Rozjazdy MODEL vs KOD (najcenniejsza część)

| # | Dokument mówi X | Kod robi Y | Dowód (plik:linia) |
| --- | --- | --- | --- |
| **R1** | Score musi być **wiarygodny**; `job_hash` istnieje po to, by wykryć zmianę treści oferty i przeliczyć score | Cache scoringu czytany wyłącznie po `(user_id, external_id)`; `job_hash` jest ZAPISYWANY, ale **nigdy porównywany** — zmiana treści oferty → wieczny stary score | Intencja: `job_hash NOT NULL` — `...create_job_scores.sql:6`; liczenie — `score-batch.ts:33-39, 206`; odczyt cache bez `job_hash` — `score-batch.ts:181-195` |
| **R2** | Ten sam wzorzec dla cover lettera — `job_hash` w tabeli sugeruje inwalidację przy zmianie oferty | List czytany z cache po `(user_id, external_id)`; `job_hash` zapisany, nieużywany do inwalidacji | `...create_cover_letters.sql:6`; `cover-letter.ts:91-105, 161-171` |
| **R3** | FR-006: score zawiera **zwięzłe wyjaśnienie** kluczowych czynników (nie sama liczba) | Puste `explanation` jest akceptowane i utrwalane | `scoring.py:92-95` (wstawia `""`); brak `min_length` w `scoring.py:13`; kolumna `explanation text NOT NULL` dopuszcza `''` (`...create_job_scores.sql`) |
| **R4** | FR-007 + shape: lista brakujących skilli ma być **odszumiona** (bez „communication skills", „agile") | Brak jakiegokolwiek filtrowania soft-skilli — `missing_skills` z LLM przekazywane 1:1 | prd.md:101 „filtrowanie soft skills"; brak filtra w `scoring.py:91-99` i `score-batch.ts:221-239` |
| **R5** | FR-011: użytkownik **dodaje notatki** do zapisanej oferty | Kolumna i typ `notes` istnieją, ale endpoint zapisu ofert **nie ustawia** `notes` — brak ścieżki write | Kolumna — `...create_saved_jobs.sql:9`; typ — `saved-jobs.ts:6`; upsert bez `notes` — `saved-jobs.ts:37-53` |
| **R6** | Access Control: MVP = **zamknięta rejestracja**, jeden użytkownik | Rejestracja otwarta — `signup` bez allowlisty/wyłączenia | prd.md:134; `src/pages/api/auth/signup.ts` (brak bramki) |
| **R7** | Guardrail: pełna treść CV **nie** logowana w serwisach zewnętrznych | Do LLM wysyłane są `experience_highlights` — surowe linie CV do 180 znaków (nie pełny tekst, ale fragmenty CV) | highlight = `line[:180]` `cv_extraction.py:162`; wysyłka do z.ai — `cover_letter.py:61`, `scoring.py:55`. Ryzyko częściowego wycieku fragmentów, nie „pełnej treści" — guardrail formalnie dotrzymany, ale warto odnotować. |

---

## KROK 5 — Ranking refaktoru

Szeregowanie wg **wartości** (jak rdzeniowy jest niezmiennik) × **ryzyka** (jak słabo dziś egzekwowany).

| Ranga | Kandydat | Wartość | Ryzyko (stan dziś) | Wynik |
| --- | --- | --- | --- | --- |
| **#1** | **JobScore — niezmiennik świeżości (`job_hash`) + niepuste `explanation`** | **Najwyższa** — to CORE i wprost guardrail zaufania (prd.md:46) | **Wysokie** — `job_hash` liczony i zapisywany, lecz nigdy nie porównywany (R1); puste wyjaśnienia dopuszczone (R3) | **Refaktor #1** |
| #2 | CoverLetter — świeżość względem `job_hash` (R2) | Wysoka (CORE) | Wysokie — identyczny wzorzec martwego `job_hash` | — |
| #3 | Missing Skills — odszumianie soft-skilli (R4) | Średnia (jakość CORE) | Średnie — brak filtra, ale nie łamie danych | — |
| #4 | SavedJob.Notes — brak ścieżki zapisu (R5) | Niska (nice-to-have, S-08 `proposed`) | Niskie | — |
| #5 | Closed registration (R6) | Niska w MVP | Niskie (deklaracja, nie feature) | — |

### Rekomendacja #1 — dlaczego

**Wydziel `JobScore` jako pełnoprawny agregat, którego niezmiennikiem jest: „score jest ważny wyłącznie dla
danej pary (job_hash CV, job_hash oferty), a jego `explanation` jest niepuste".** Dziś infrastruktura tego
niezmiennika **istnieje w modelu danych** (`job_hash` w schemacie) ale **kod jej nie odwzorowuje** — cache
zwraca stare score'y po zmianie treści oferty, wprost uderzając w rdzeniowy guardrail wiarygodności
(prd.md:46). To najczystszy przypadek „wiedza domenowa jest, kod jej nie egzekwuje": naprawa polega na
porównaniu zapisanego `job_hash` z przeliczonym przy odczycie cache (`score-batch.ts:181-195`) i wymuszeniu
niepustego `explanation` w schemacie/serwisie — bez nowych bytów, przy istniejących kolumnach.

---

## Ograniczenia analizy

- Analiza oparta na PRD + kodzie (oba dostępne) — brak ograniczenia „tylko README".
- Nie badano runtime'u ani danych produkcyjnych; wnioski o egzekwowaniu wynikają z lektury kodu i migracji.
- `job_radar/` (osobny katalog w korzeniu) nie był analizowany jako część głównej ścieżki domenowej.
</content>
</invoke>
