---
title: Niezmiennik #1 JobRadar — agregat-strażnik świeżości i kompletności JobScore (plan refaktoru)
created: 2026-07-05
type: refactor-plan
---

# Niezmiennik #1 — `JobScore` jako agregat-strażnik

> Produkt tego dokumentu to PLAN refaktoru, nie kod. Każda cytowana reguła została zweryfikowana
> przez otwarcie pliku — numery linii są rzeczywiste. Mapa domeny (`01-domain-distillation.md`)
> była materiałem pomocniczym; wszystkie ustalenia, na których się opieram, potwierdziłem
> ponownie na kodzie (KROK 0–1) i miejscami doprecyzowałem.

---

## KROK 0 — Kontekst (zweryfikowany samodzielnie)

- **Dokumenty wymagań:** `context/foundation/prd.md` (kompletny — guardrails w liniach 45–47,
  FR-006/007 w 98–101), `shape-notes.md`, `roadmap.md`, `tech-stack.md`.
- **Warstwy z logiką biznesową (odkryte):**
  - **Orkiestracja + persystencja cache:** Astro API routes w `src/pages/api/**` + biblioteki
    domenowe w `src/lib/**` (TypeScript). To tu żyje read-or-compute-then-persist i to tu żyje
    (albo nie) egzekwowanie świeżości.
  - **Czysty compute AI:** FastAPI w `backend/app/services/{scoring,cover_letter}.py` — bezstanowe
    wywołanie LLM (z.ai/GLM). Nie dotyka bazy.
  - **Niezmienniki danych:** `supabase/migrations/*.sql` (CHECK-i, UNIQUE, RLS).
- **Wniosek strukturalny:** reguła "score jest ważny tylko dopóki jego wejścia się nie zmieniły"
  jest rozsmarowana pomiędzy SQL (kolumna `job_hash NOT NULL`), TS (liczenie hasza) i… nigdzie
  (porównanie). To klasyczny rozjazd model↔kod.

---

## KROK 1 — Lista niezmienników biznesowych (odkryta z dokumentów ORAZ kodu)

| # | Niezmiennik (musi być zawsze prawdziwy) | Źródło (zweryfikowane) |
| --- | --- | --- |
| N1a | **Match Score jest ważny wyłącznie dla wejść, z których powstał** — zmiana treści oferty (i CV) unieważnia zapisany score, który musi zostać przeliczony | prd.md:46 guardrail „Wynik % dopasowania musi być wiarygodny"; intencja kolumny `job_hash NOT NULL` — `20260605120000_create_job_scores.sql:6` |
| N1b | **Match Score nigdy nie jest samą liczbą** — zawiera niepuste, zwięzłe wyjaśnienie | prd.md:98–99 FR-006 „score musi zawierać zwięzłe wyjaśnienie kluczowych czynników, nie samą liczbę" |
| N1c | Match Score ∈ 0..100 | prd.md:98; CHECK `score >= 0 AND score <= 100` — `20260605120000_create_job_scores.sql:7`; `Field(ge=0, le=100)` — `backend/app/schemas/scoring.py:12` |
| N2 | **Cover Letter jest ważny wyłącznie dla wejść, z których powstał** (ten sam wzorzec świeżości co N1a) | intencja `job_hash NOT NULL` — `20260605160000_create_cover_letters.sql:6` |
| N3 | Cover Letter ma niepustą treść | CHECK `content <> ''` — `20260606100000_cover_letters_content_nonempty.sql:2`; guard `cover_letter.py:100–104` |
| N4 | CV: dokładnie jeden PDF na użytkownika, prywatny bucket | PK/CHECK/RLS — `20260602140000_create_cv_profiles.sql` |
| N5 | SavedJob.status ∈ {interested, applied, rejected}, jedna wersja na usera | CHECK + UNIQUE — `20260601101000_create_saved_jobs.sql` |
| N6 | Preferencje zawężają zbiór PRZED scoringiem; waluta ∈ {EUR,USD,PLN} | prd.md:88–89; `src/lib/jobs.ts` filtry |
| N7 | Missing skills odszumione (bez soft-skilli) | prd.md:101 FR-007 „filtrowanie soft skills" |

---

## KROK 2 — Klasyfikacja i wybór #1

Trzy osie oceny (a) rdzeniowość, (b) rozsmarowanie po warstwach, (c) realność egzekwowania:

| Niezmiennik | (a) Rdzeniowy? | (b) Rozsmarowany? | (c) Egzekwowany? |
| --- | --- | --- | --- |
| **N1a — świeżość Score** | **CORE** — wprost guardrail zaufania prd.md:46; scoring to sedno przewagi produktu | **Silnie** — SQL (kolumna) + TS (liczenie) + brak (porównanie) | **NARUSZALNY / IGNOROWANY** — `job_hash` liczony i zapisywany, **nigdy nie czytany** |
| **N1b — niepuste explanation** | **CORE** — FR-006 uczynił wyjaśnienie częścią definicji Score („nie samą liczbę") | Python (fabrykuje `""`) + SQL (dopuszcza `''`) | **NARUSZALNY** — `scoring.py:93` wstawia `""`, schema bez `min_length`, kolumna dopuszcza pusty string |
| N1c — zakres 0..100 | CORE | SQL + Pydantic | **EGZEKWOWANY** (podwójnie) |
| N2 — świeżość CoverLetter | CORE | identyczny wzorzec martwego `job_hash` | IGNOROWANY (jak N1a) |
| N3 — niepusty list | CORE | SQL + Python | EGZEKWOWANY |
| N4/N5/N6 | Supporting/Generic | pojedyncza warstwa | EGZEKWOWANE |
| N7 — odszumianie | jakość CORE | brak | brak (nie łamie danych) |

### Wybór #1 — `JobScore` (świeżość N1a + kompletność N1b)

**Wybieram niezmiennik JobScore = N1a ∧ N1b ∧ N1c: „Match Score jest ważny wyłącznie dla pary
wejść (treść oferty, CV), z której powstał, jego wyjaśnienie jest niepuste, a wartość ∈ 0..100".**

To jednocześnie **najbardziej rdzeniowy** (bezpośrednio realizuje guardrail wiarygodności
prd.md:46 — filar całego produktu) **i najsłabiej egzekwowany**: dokładnie te dwa z trzech
warunków (N1a, N1b), które są rdzeniem zaufania, dziś **nie są egzekwowane w ogóle**, podczas
gdy jedyny egzekwowany (N1c) jest kosmetyczny w porównaniu.

**Zgodność z mapą:** wybór **pokrywa się** z kandydatem #1 z `01-domain-distillation.md`
(JobScore — świeżość + niepuste explanation). Doszedłem do niego niezależnie i potwierdzam.
**Doprecyzowanie ponad mapę (własne ustalenie na kodzie):** grep `job_hash` po `src/` i `backend/`
zwraca **wyłącznie zapisy** (`score-batch.ts:227`, `cover-letter.ts:167`) i definicje typów —
**zero odczytów/porównań**. Sygnał świeżości jest więc dowodliwie martwy, a nie tylko „niespójny".
Dodatkowo: `job_hash` liczony jest tylko z treści oferty (`score-batch.ts:34`), więc **nawet gdyby
był porównywany, nie wykryłby zmiany CV** (re-upload CV → stary score). Niezmiennik świeżości jest
zatem słabszy, niż sugeruje sam schemat. Cover Letter (N2) to ten sam wzorzec — traktuję go jako
bliźniaczy przypadek objęty tym samym agregatem-strażnikiem, faza 5.

---

## KROK 3 — Diagnoza (gdzie dziś żyje reguła, warstwa po warstwie)

### N1a — świeżość Score: reguła zadeklarowana w schemacie, martwa w kodzie

1. **SQL deklaruje intencję:** `job_hash text NOT NULL` — `20260605120000_create_job_scores.sql:6`.
   Kolumna istnieje po to, by odróżnić „score policzony dla tej treści" od „score dla starej treści".
2. **TS liczy hash:** `computeJobHash` (SHA-256 z title+company+description+technologies) —
   `src/pages/api/jobs/score-batch.ts:33–39`, wołane w `:206`, zapisywane w `:227`.
3. **Odczyt cache IGNORUJE hash:** SELECT cache pobiera
   `external_id, score, explanation, matched_skills, missing_skills` — **bez `job_hash`** —
   `score-batch.ts:181–185`. Klucz dopasowania to samo `(user_id, external_id)` (`:184–185`),
   a trafienie w cache kończy pętlę (`:199` `filter(j => !cachedMap.has(j.id))`). Zmiana treści
   oferty → to samo `external_id` → **wieczny stary score**.
4. **Druga ścieżka odczytu — ta sama luka:** `src/lib/job-scores.ts:22–25` (`getJobScores`,
   używane przy renderze listy) selektuje bez `job_hash` i po `external_id`.
5. **Dowód martwoty:** `grep -rn job_hash src/ backend/` → tylko zapisy i typy, **żadnego SELECT
   ani porównania**. Reguła nie jest „niespójnie egzekwowana" — nie jest egzekwowana nigdzie.
6. **Klient jako (nie)strażnik:** żadna warstwa nie pilnuje świeżości; UI po prostu renderuje to,
   co zwróci cache. Nie ma nawet strażnika po stronie klienta — jest cisza.

### N1b — niepuste explanation: błąd „połknięty" i utrwalony

1. **Python fabrykuje pustkę zamiast fail-fast:** gdy LLM nie zwróci `explanation`,
   `backend/app/services/scoring.py:92–95` robi `data["explanation"] = ""` i waliduje dalej —
   **błąd połknięty, operacja jedzie dalej** (łamie zasadę fail-fast).
2. **Schema tego nie łapie:** `explanation: str` bez `min_length` — `backend/app/schemas/scoring.py:13`.
3. **TS tego nie łapie:** kontrola kształtu sprawdza tylko `typeof data.explanation === "string"` —
   `score-batch.ts:94` — pusty string przechodzi.
4. **SQL tego nie łapie:** `explanation text NOT NULL` dopuszcza `''` —
   `20260605120000_create_job_scores.sql:8` (brak `CHECK explanation <> ''`, w przeciwieństwie do
   analogicznego CHECK-a dla cover_letters w `20260606100000...`).
5. **Skutek:** score = liczba bez wyjaśnienia trafia do cache i do UI — dokładnie „black box",
   który FR-006 (prd.md:99) miał wykluczyć.

### N2 — świeżość Cover Letter (bliźniak N1a)

Identyczny wzorzec: hash liczony `cover-letter.ts:16–22`, zapisywany `:167`; odczyt cache
`cover-letter.ts:91–96` po `(user_id, external_id)` **bez `job_hash`**; trafienie zwraca stary list
(`:100–105`). Kolumna `job_hash NOT NULL` — `20260605160000_create_cover_letters.sql:6` — martwa.

---

## KROK 4 — Projekt agregatu-strażnika

### Decyzja o umiejscowieniu

Niezmiennik jest egzekwowalny **tylko w warstwie, która jednocześnie zna wejścia (oferta+CV),
wynik LLM i cache**. Tą warstwą jest **orkiestracja TS** (`src/lib` + Astro route) — Python jest
bezstanowym compute i nie widzi cache. Dlatego agregat-root żyje w `src/lib/domain/job-score.ts`,
a repozytorium w `src/lib/domain/job-score-repository.ts`. Python dostaje jedno wzmocnienie
(fail-fast na pustym `explanation`), by nie produkować nielegalnych wartości u źródła.

### Agregat-root: `JobScore`

Jedyne miejsce, w którym powstaje ważny score. Konstrukcja przez fabrykę z preconditions —
nielegalne wejście rzuca **nazwany błąd domenowy**, nie tworzy po cichu obiektu.

```ts
// src/lib/domain/job-score.ts  (PSEUDOKOD — nie implementacja)

export class EmptyExplanationError extends Error {}   // N1b
export class ScoreOutOfRangeError extends Error {}    // N1c

export interface ScoreInputs {           // provenance = tożsamość wejść
  externalId: string;
  jobHash: string;                       // SHA-256 treści oferty
  cvFingerprint: string;                 // NOWE: hash CV użyty do scoringu (patrz faza 4)
}

export class JobScore {
  private constructor(
    readonly inputs: ScoreInputs,
    readonly score: number,
    readonly explanation: string,
    readonly matchedSkills: string[],
    readonly missingSkills: string[],
    readonly scoredAt: Date,
  ) {}

  // Fabryka egzekwująca N1b + N1c przy KAŻDYM powstaniu score'a
  static create(inputs: ScoreInputs, raw: {
    score: number; explanation: string;
    matchedSkills: string[]; missingSkills: string[];
  }): JobScore {
    if (!Number.isInteger(raw.score) || raw.score < 0 || raw.score > 100)
      throw new ScoreOutOfRangeError(`score=${raw.score} poza 0..100`);
    if (raw.explanation.trim() === "")
      throw new EmptyExplanationError(`explanation puste dla ${inputs.externalId}`);
    return new JobScore(inputs, raw.score, raw.explanation.trim(),
      raw.matchedSkills, raw.missingSkills, new Date());
  }

  // N1a: świeżość = tożsamość wejść, nie sama obecność wiersza
  isFreshFor(currentJobHash: string, currentCvFingerprint: string): boolean {
    return this.inputs.jobHash === currentJobHash
        && this.inputs.cvFingerprint === currentCvFingerprint;
  }
}
```

### Repozytorium: `JobScoreRepository`

Ładuje/zapisuje agregat zamiast rozsianych zapytań `.from("job_scores")`. **Kluczowa zmiana:
stale = miss.** `load` zwraca score tylko jeśli świeży; nieświeży jest traktowany jak brak, co
wymusza przeliczenie. Provenance (`job_hash` + `cv_fingerprint`) zapisywana jest w tym samym
wierszu co wynik → atomowość: nie istnieje wiersz, którego score nie odpowiada jego wejściom.

```ts
// src/lib/domain/job-score-repository.ts  (PSEUDOKOD)

export class JobScoreRepository {
  constructor(private supabase: SupabaseClient, private userId: string) {}

  // Zwraca ŚWIEŻY agregat albo null (miss LUB stale → oba wymuszają rescore)
  async load(externalId: string, jobHash: string, cvFingerprint: string): Promise<JobScore | null> {
    const { data } = await this.supabase
      .from("job_scores")
      .select("external_id, job_hash, cv_fingerprint, score, explanation, matched_skills, missing_skills, scored_at")
      .eq("user_id", this.userId).eq("external_id", externalId).maybeSingle();
    if (!data) return null;
    const agg = JobScore.rehydrate(data);        // rehydrate NIE waliduje N1b (dane historyczne)
    return agg.isFreshFor(jobHash, cvFingerprint) ? agg : null;   // ← martwy job_hash ożywiony
  }

  // Jedna atomowa operacja: wynik + jego provenance zapisane razem
  async save(agg: JobScore): Promise<void> {
    const { error } = await this.supabase.from("job_scores").upsert({
      user_id: this.userId,
      external_id: agg.inputs.externalId,
      job_hash: agg.inputs.jobHash,
      cv_fingerprint: agg.inputs.cvFingerprint,
      score: agg.score, explanation: agg.explanation,
      matched_skills: agg.matchedSkills, missing_skills: agg.missingSkills,
    }, { onConflict: "user_id,external_id" });
    if (error) throw error;   // fail-fast — nie „log i jedź dalej"
  }
}
```

> **Nota o atomowości:** pełen cykl to read(cache) → (miss/stale) → compute(Python) → save. Compute
> jest zewnętrznym I/O i nie mieści się w jednej transakcji DB — i nie musi. Niezmiennik wymaga
> tylko, by **żaden zapisany wiersz nie miał score'a niezgodnego z własną provenance**. Gwarantuje
> to fakt, że `job_hash`/`cv_fingerprint` w `save` pochodzą z tego samego obiektu `job`/`cv`, którym
> policzono score, a `upsert` całego wiersza jest atomowy. Nie ma okna, w którym score i jego hash
> się rozjadą.

### Cienki route (egzekucja przeniesiona z „nigdzie" na serwer)

```ts
// src/pages/api/jobs/score-batch.ts  (PSEUDOKOD docelowy)
const repo = new JobScoreRepository(supabase, user.id);
const cvFingerprint = computeCvFingerprint(cvData);         // NOWE
for (const job of jobs) {
  const jobHash = await computeJobHash(job);
  const fresh = await repo.load(job.id, jobHash, cvFingerprint);   // stale→null
  if (fresh) { scores[job.id] = fresh.toDTO(); continue; }
  // miss/stale → licz (respektując SCORE_CAP)
  try {
    const raw = await scoreOneJob(job, cvData, backendUrl, token);   // może zwrócić null przy awarii sieci
    if (!raw) { /* zostaw dla ponownej próby klienta */ continue; }
    const agg = JobScore.create({ externalId: job.id, jobHash, cvFingerprint }, raw); // rzuca N1b/N1c
    await repo.save(agg);
    scores[job.id] = agg.toDTO();
  } catch (e) {
    if (e instanceof EmptyExplanationError || e instanceof ScoreOutOfRangeError)
      return json({ error: "Scoring zwrócił niekompletny wynik", externalId: job.id }, 502); // mapowanie błędu domenowego
    throw e;
  }
}
```

### Wzmocnienie u źródła (Python, fail-fast)

- `backend/app/schemas/scoring.py:13` → `explanation: str = Field(min_length=1)`.
- `backend/app/services/scoring.py:92–95` → **usunąć fabrykowanie `""`**; brak `explanation`
  w odpowiedzi LLM ma powodować `HTTPException(502, "AI scoring returned incomplete response")`,
  nie cichą pustkę.

### Nazwane błędy domenowe

| Błąd | Niezmiennik | Rzucany gdy | Mapowanie w route |
| --- | --- | --- | --- |
| `EmptyExplanationError` | N1b | `explanation.trim() === ""` przy `JobScore.create` | 502 + `externalId` |
| `ScoreOutOfRangeError` | N1c | `score ∉ 0..100` przy `JobScore.create` | 502 + `externalId` |
| `StaleScoreError` (opcjonalny) | N1a | jeśli chcemy jawnego sygnału zamiast „miss" — inaczej `load` zwraca null | — |

---

## KROK 5 — Before/After, plan faz, testy

### Before / After (każde dzisiejsze miejsce reguły)

| Miejsce | Before (dziś) | After (agregat-strażnik) |
| --- | --- | --- |
| `score-batch.ts:181–185` (odczyt cache) | SELECT bez `job_hash`, dopasowanie po `external_id`; stary score wieczny | `repo.load(id, jobHash, cvFingerprint)` — stale traktowany jak miss → rescore |
| `src/lib/job-scores.ts:22–25` (render listy) | SELECT bez `job_hash` | ten sam `JobScoreRepository.load` z porównaniem świeżości |
| `scoring.py:92–95` | `data["explanation"] = ""` (błąd połknięty) | brak fabrykowania; pusty → 502 (fail-fast) |
| `scoring.py:13` (schema) | `explanation: str` | `Field(min_length=1)` |
| `20260605120000_...:8` (SQL) | `explanation text NOT NULL` dopuszcza `''` | + `CHECK (explanation <> '')` (defense-in-depth, jak dla cover_letters) |
| `20260605120000_...` (SQL) | brak kolumny na fingerprint CV | + `cv_fingerprint text NOT NULL DEFAULT ''` (faza 4) |
| konstrukcja score'a | rozsiana, brak preconditions | jedyne wejście: `JobScore.create` z preconditions |
| `cover-letter.ts:91–96` (bliźniak) | SELECT bez `job_hash` | `CoverLetterRepository.load` z porównaniem świeżości (faza 5) |

### Plan faz (projekt ma dyscyplinę test-first: vitest w `src/__tests__/`, pytest w `backend/tests/`)

- **Faza 1 — Agregat + błędy (test-first, vitest).** `JobScore.create` z preconditions i nazwanymi
  błędami; testy jednostkowe (bez I/O). RED→GREEN.
- **Faza 2 — Fail-fast w Pythonie (test-first, pytest).** `min_length=1` + usunięcie `""`; test,
  że pusty `explanation` z LLM → 502 (dopisać do wzorca z `backend/tests/test_contracts.py`).
- **Faza 3 — Repozytorium + wpięcie w route (test-first, vitest).** `JobScoreRepository.load`
  zwraca null dla stale; rozbudować istniejący `src/__tests__/api/score-batch.test.ts` o przypadek
  „zmieniona treść oferty → rescore, nie stary cache".
- **Faza 4 — Wymiar CV (migracja + fingerprint).** Kolumna `cv_fingerprint` + `computeCvFingerprint`;
  test: re-upload CV → rescore. (Domyka lukę wykrytą ponad mapą; jeśli scope ma być minimalny,
  faza opcjonalna — rdzeń N1a działa już na samym `job_hash` po fazie 3.)
- **Faza 5 — Bliźniak CoverLetter (test-first).** `CoverLetterRepository` z tą samą regułą świeżości;
  reużycie `computeJobHash`/`cvFingerprint`.
- **Faza 6 — SQL defense-in-depth.** `CHECK (explanation <> '')` na `job_scores` (migracja).

### Przypadki testowe niezmiennika (legalne / nielegalne)

**N1b/N1c — `JobScore.create` (vitest, faza 1):**
- legalny: `{score:72, explanation:"Solidne dopasowanie React/TS"}` → obiekt powstaje.
- nielegalny: `explanation:""` lub `"   "` → rzuca `EmptyExplanationError`.
- nielegalny: `score:120` / `score:-1` / `score:50.5` → rzuca `ScoreOutOfRangeError`.

**N1a — `JobScoreRepository.load` (vitest, faza 3):**
- świeży: zapisany `job_hash` == bieżący → zwraca cache (0 wywołań LLM).
- stale (oferta): zapisany `job_hash` != bieżący → zwraca `null` → route liczy na nowo i nadpisuje.
- stale (CV, faza 4): `cv_fingerprint` zmieniony → zwraca `null` → rescore.
- miss: brak wiersza → `null`.

**Python (pytest, faza 2):**
- LLM zwraca poprawny JSON z `explanation` → 200.
- LLM pomija `explanation` → **502** (nie 200 z pustym stringiem).

### Nowe „load-bearing" nazwy do rejestracji

Rejestr `docs/reference/contract-surfaces.md` **nie istnieje** (zweryfikowane). Jeśli powstanie,
zarejestrować:

- `JobScore` (agregat-root) — `src/lib/domain/job-score.ts`
- `JobScoreRepository` — `src/lib/domain/job-score-repository.ts`
- `EmptyExplanationError`, `ScoreOutOfRangeError` (błędy domenowe)
- `computeCvFingerprint` + kolumna `job_scores.cv_fingerprint`
- (faza 5) `CoverLetterRepository`

---

## Ograniczenia

- Plan, nie implementacja — kod produkcyjny nietknięty.
- Cytaty ograniczone do plik:linia otwartych i zweryfikowanych w tej sesji.
- Fail-fast konsekwentnie: nielegalny wynik zatrzymuje operację (502 / rzucony błąd), nie loguje-i-jedzie.
- Wymiar CV-fingerprint (faza 4) to ustalenie ponad mapę; jeśli scope minimalny, rdzeń niezmiennika
  N1a domyka już sama faza 3 na istniejącej kolumnie `job_hash`.
