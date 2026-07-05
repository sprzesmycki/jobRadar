# Refactor opportunities: guard dla kontraktu CV (C1 + C3b) — Implementation Plan

## Overview

Domykamy dwa kandydatury z rankingu `research.md`: **C1** (guard dla nietypowanego `.select()` na `cv_profiles` — pilot) i **C3b** (usunięcie martwej kolumny `role_hints` w scoringu). Cel: zamienić „rename kolumny przechodzi `tsc` i pęka w runtime" na „nie da się tego popsuć po cichu", bez zmiany zachowania. Right-sizing: świadomy mirror kształtu (commit `2417754`) zostaje — dostaje **guard**, nie przebudowę.

## Current State Analysis

- Klient Supabase jest **nietypowany**: `createServerClient(...)` bez generyka `<Database>` (`src/lib/supabase.ts:9`), więc `.from("cv_profiles").select("...")` zwraca `any`. Rename/usunięcie kolumny kompiluje się czysto i pęka dopiero w runtime. `[evidence, research §C1]`
- Nietypowane `.select()` na `cv_profiles` w 4 plikach (`cv-profile.ts:28`, `score-batch.ts:169`, `cover-letter.ts:80`, `upload.ts:139`). Brak generated types, zod, wspólnego pakietu. `[ast-grep = 4]`
- `role_hints` w `score-batch.ts:169` jest **selektowany, ale nie przekazywany** (jedyne wystąpienie w pliku) — martwy leftover po refaktorze `e982202`. W `cover-letter.ts` `role_hints` JEST forwardowany (`:122`) — asymetria potwierdzona. `[ast-grep]`
- CI: 3 blokujące joby (`ci.yml`): build+typecheck (astro), `frontend-tests` (vitest), `backend-tests` (pytest). Brak coverage-gate, brak E2E. `supabase` CLI w devDeps; `supabase gen types typescript` uruchamialny, ale niepodpięty (brak skryptu/pliku). `[research §feasibility]`
- BFF `upload.ts` i `score-batch.ts`: **0% pokrycia** testami. `[research §2.3]`

## Desired End State

- Wygenerowany `src/lib/database.types.ts` (źródło prawdy wywiedzione ze schematu DB) + skrypt npm do regeneracji.
- Odczyt `cv_profiles` (co najmniej w `cv-profile.ts`) idzie przez **typowany helper**, w którym nazwy kolumn są sprawdzane przez kompilator względem `database.types.ts`. Rename kolumny w migracji → **regeneracja typów** (`npm run db:types`) → helper przestaje się kompilować (guard aktywny). Guard zależy od świeżości typów: dopóki bramka CI na dryf jest odłożona (patrz „What We're NOT Doing"), rename bez regeneracji nadal przechodzi build i pęka w runtime — to udokumentowane okno resztkowe, nie zamknięcie problemu.
- `role_hints` usunięty z `.select()` w `score-batch.ts`; zachowanie scoringu identyczne.
- Testy charakteryzujące pinują obecne wyjście `normalizeProfile` i `getCvProfile`, więc każdy krok C1 jest odwracalny i obserwowalny.
- Weryfikacja: `npm run build` (typecheck) i `npm test` zielone; celowe zepsucie (rename kolumny w `database.types.ts`) łamie kompilację helpera.

### Key Discoveries:

- Untyped client to root C1 — `src/lib/supabase.ts:9` (brak `<Database>`), realne zero generated-types w historii. `[research §C1, ast-grep T5]`
- Świadomy mirror vs przypadkowy select — commit `2417754` (mirror) vs `8fd725a` (untyped default). → guard, nie przebudowa.
- `role_hints` martwy tylko w `score-batch` (nie w `cover-letter`) — usunięcie jest lokalne i zachowuje zachowanie. `[ast-grep T2/T3]`
- `vitest.config.ts` mockuje `astro:env/server`, więc handlery BFF są importowalne w teście. `[research §feasibility]`

## What We're NOT Doing

- **Globalnego `createServerClient<Database>`** — pilot ogranicza blast radius do `cv_profiles`; pozostałe tabele (`job_scores`, `saved_jobs`, `preferences`, `cover_letters`) zostają nietypowane w tej zmianie. (Lokalne typowanie klienta wewnątrz helpera `cv_profiles` JEST w zakresie — patrz Faza 4; wykluczamy tylko *globalne* typowanie fabryki.)
- **Bramki CI na dryf typów** (`supabase gen types --check`) — mechanizm ląduje na zielono teraz; egzekwowanie w CI to osobny, późniejszy krok.
- **C2** (domknięcie mapy kodów błędu) — osobna zmiana.
- **C3a** (usunięcie `page_count`/`text_character_count`) — świadoma telemetria, reguła „guard/leave, nie przebudowa".
- **P9** (mapowanie `full_name→summary`, `experience_highlights→experience`) — przeprojektowanie pojęcia biznesowego, temat M4L5.
- **Przywracania forwardu `role_hints`** w scoringu — to zmiana zachowania, poza zakresem strukturalnego refaktoru.

## Implementation Approach

Guard-first i „dodaj test, zanim dotkniesz". Kolejność faz od najtańszej i najbardziej samodzielnej. Mechanizm (typy) ląduje na zielono jako czysty dodatek; egzekwowanie (typowany helper) włącza się osobną fazą. Każda faza to osobny, odwracalny commit.

---

## Phase 1: C3b — usuń martwą kolumnę `role_hints` (szybki zysk)

### Overview

Usunięcie nieużywanej kolumny `role_hints` z zapytania `cv_profiles` w scoringu. Zachowuje zachowanie (kolumna była selektowana, nigdy nieprzekazywana).

### Changes Required:

#### 1. Zapytanie scoringu

**File**: `src/pages/api/jobs/score-batch.ts`

**Intent**: Usunąć `role_hints` z listy `.select()` (`:169`), bo payload do backendu i tak go nie używa — martwy leftover po `e982202`. Zachowanie scoringu bez zmian.

**Contract**: `.select("skills, experience_highlights")` zamiast `.select("skills, role_hints, experience_highlights")`. Żadne inne odwołanie do `role_hints` w pliku (zweryfikowane ast-grep — 1 wystąpienie).

### Success Criteria:

#### Automated Verification:

- Typecheck/build przechodzi: `npm run build`
- Testy frontendu zielone: `npm test`
- `role_hints` nie występuje już w `score-batch.ts`: `! grep -q role_hints src/pages/api/jobs/score-batch.ts`

#### Manual Verification:

- Scoring ofert na dashboardzie działa jak przed zmianą (badge dopasowania pojawia się dla ofert przy wgranym CV).

**Implementation Note**: Po zielonym CI zatrzymaj się na potwierdzenie manualne przed Fazą 2.

---

## Phase 2: Testy charakteryzujące szwu read/normalize (test przed dotknięciem)

### Overview

Zanim ruszymy nietypowane `.select()` (Faza 4), przybijamy obecne zachowanie szwu, który C1 dotknie: `normalizeProfile` (BFF) i `getCvProfile` (odczyt). Dziś oba mają 0% pokrycia — bez tego guard C1 nie ma jak wychwycić runtime-breaka, którego typy jeszcze nie łapią.

### Changes Required:

#### 1. Test `normalizeProfile`

**File**: `src/__tests__/api/cv-upload-normalize.test.ts` (nowy)

**Intent**: Przybić kontrakt `normalizeProfile`: dla wejścia z nadmiarowymi/brakującymi polami zwraca dokładnie 7 kluczy (`full_name, email, phone, links, skills, role_hints, experience_highlights`), z poprawnymi wartościami domyślnymi (`null` / `[]`). Charakteryzuje obecne zachowanie, niekoniecznie „poprawne".

**Contract**: Test importuje `normalizeProfile` (wymaga wyeksportowania funkcji z `upload.ts`, jeśli nie jest — patrz nota). Asercje na kształt 7-kluczowy i coercion `readStringOrNull`/`readStringArray`.

#### 2. Test `getCvProfile`

**File**: `src/__tests__/cv-profile.test.ts` (nowy)

**Intent**: Przybić, że `getCvProfile` selektuje ustaloną listę kolumn i mapuje wiersz na `CvProfile` (oraz zwraca `null` przy braku profilu). Mock klienta Supabase (wzorzec z istniejących testów `src/__tests__`).

**Contract**: Zamockowany `supabase.from().select().eq().maybeSingle()` zwraca wiersz → asercja na zwrócony `CvProfile`; zwraca `null` → asercja na `null`.

### Success Criteria:

#### Automated Verification:

- Nowe testy przechodzą: `npm test`
- Build/typecheck zielony: `npm run build`

#### Manual Verification:

- Przegląd: testy pinują *obecne* zachowanie (nie idealizują) — świadoma decyzja, że ten kształt jest wart utrwalenia.

**Implementation Note**: Jeśli `normalizeProfile` nie jest eksportowany, minimalny export to jedyna zmiana produkcyjnego kodu w tej fazie (odwracalna). Zatrzymaj się na potwierdzenie przed Fazą 3.

---

## Phase 3: Generacja `Database` types (mechanizm — ląduje na zielono)

### Overview

Wprowadzenie źródła prawdy typów wywiedzionego ze schematu Supabase, jako czysty dodatek. Klient pozostaje nietypowany, więc nic się nie psuje (zielono).

### Changes Required:

#### 1. Skrypt generacji

**File**: `package.json`

**Intent**: Dodać skrypt `db:types` uruchamiający `supabase gen types typescript` z lokalnej/zdalnej instancji do pliku typów. Umożliwia powtarzalną regenerację.

**Contract**: `"db:types": "supabase gen types typescript --local > src/lib/database.types.ts"` (dokładny wariant `--local`/`--project-id` do ustalenia wg konfiguracji `supabase/config.toml` na etapie implementacji).

**Prerekwizyt (bramka — bez tego 3.1 daje fałszywy zielony):** `--local` wymaga **działającego i zmigrowanego** lokalnego stacku (`supabase start` + zaaplikowane migracje z `supabase/migrations`); `--project-id` (config ma `project_id = "10x-astro-starter"`) wymaga sieci + `SUPABASE_ACCESS_TOKEN`. Uruchomienie bez spełnionego prerekwizytu albo failuje, albo generuje schemat bez `cv_profiles` — po cichu psując Fazę 4. Wybrać jeden wariant i potraktować jego prerekwizyt jako gate przed 3.1.

#### 2. Wygenerowany plik typów

**File**: `src/lib/database.types.ts` (nowy, generowany)

**Intent**: Zatwierdzić wygenerowany `Database` type jako źródło prawdy dla kształtu tabel (w tym `cv_profiles`). Nie edytować ręcznie.

**Contract**: Eksport `export type Database = { public: { Tables: { cv_profiles: {...}, ... } } }`. Plik oznaczony jako generowany (komentarz nagłówkowy).

### Success Criteria:

#### Automated Verification:

- Skrypt generuje plik bez błędu: `npm run db:types`
- Plik istnieje i zawiera `cv_profiles` z pełnym kształtem: `grep -q "cv_profiles" src/lib/database.types.ts` oraz wszystkie 7 kolumn semantycznych obecne (`full_name`, `email`, `phone`, `links`, `skills`, `role_hints`, `experience_highlights`) — dowód, że schemat zregenerował się kompletnie, nie pusto/częściowo.
- Build/typecheck/testy zielone (klient wciąż nietypowany): `npm run build && npm test`

#### Manual Verification:

- Wygenerowany kształt `cv_profiles` zgadza się z migracją (`full_name … experience_highlights`, kolumny storage, `extracted_at`).

**Implementation Note**: Ta faza NIE typuje klienta — świadomie zostawia mechanizm „na zielono", żeby egzekwowanie ruszyło osobno w Fazie 4. Zatrzymaj się na potwierdzenie przed Fazą 4.

---

## Phase 4: Typowany helper zapytań `cv_profiles` (egzekwowanie — pilot)

### Overview

Włączenie guardu: odczyt `cv_profiles` (co najmniej `getCvProfile`) idzie przez typowany helper wykorzystujący `Database`, dzięki czemu nazwy kolumn są sprawdzane przez kompilator. Testy charakteryzujące z Fazy 2 chronią zachowanie.

### Changes Required:

#### 1. Typowany helper `cv_profiles`

**File**: `src/lib/cv-profile.ts`

**Intent**: Zastąpić surowy string `.select("...")` odwołaniem typowanym względem `Database["public"]["Tables"]["cv_profiles"]`, tak aby literówka/rename kolumny była błędem kompilacji. Kształt `CvProfile` wyprowadzić z typu wiersza przez **`Pick<Row, …>` po liście selektowanych kolumn** — NIE alias `CvProfile = Row`: generowany `Row` zawiera `user_id` i `created_at`, których `.select()` (`cv-profile.ts:29`) ani obecny `CvProfile` nie niosą, więc alias poszerzyłby typ. Pick pilnuje, że guard sprawdza faktycznie selektowane kolumny. Nullability już się zgadza (kolumny nullable → `| null`, `not null default '{}'` → `string[]`). Jedyny konsument to `dashboard.astro:21` (render pokryty przez 4.4).

**Contract**: `getCvProfile` używa klienta/typu z `Database` dla `cv_profiles`; lista kolumn deklarowana raz, typowana. Zachowanie (zwracany `CvProfile` / `null`) niezmienione — pilnują testy z Fazy 2.

**Mechanizm typowania (load-bearing — bez tego guard jest no-opem):** samo zaimportowanie `Database` i wyprowadzenie `CvProfile` z wiersza NIE włącza sprawdzania stringa `.select()`. Supabase sprawdza nazwy kolumn tylko, gdy **instancja klienta** jest typowana jako `SupabaseClient<Database>`. Klient wchodzi tu jako nietypowany parametr (`getCvProfile(supabase: SupabaseClient, …)`, `cv-profile.ts:25`), a fabryka `createClient()` jest bez generyka (`supabase.ts:9`) — i globalnego `createServerClient<Database>` świadomie NIE robimy. Dlatego typowanie musi być **lokalne**: albo rzutowanie w helperze (`supabase as unknown as SupabaseClient<Database>`), albo wariant fabryki zwracający `SupabaseClient<Database>` używany wyłącznie przez `cv-profile.ts`. Wybór wariantu do ustalenia w implementacji; oba trzymają blast radius w `cv_profiles`. To lokalne typowanie jest **w zakresie pilota** (uzupełnia sekcję „What We're NOT Doing", która wyklucza tylko *globalne* typowanie klienta). Snippet pominięty (rutynowe typowanie wg wzorca Supabase), ale mechanizm — nie.

### Success Criteria:

#### Automated Verification:

- Build/typecheck zielony: `npm run build`
- Testy charakteryzujące dalej przechodzą (zachowanie niezmienione): `npm test`
- **Guard działa (celowe zepsucie):** tymczasowy rename kolumny w `database.types.ts` (np. `skills`→`skillz`) powoduje błąd kompilacji w `cv-profile.ts` — potwierdzić, że `npm run build` failuje, potem cofnąć.

#### Manual Verification:

- Karta profilu CV na dashboardzie renderuje się jak przed zmianą (imię, skills, doświadczenie).
- Świadoma decyzja o zakresie pilota: pozostałe `.select()` (`score-batch`, `cover-letter`, `upload`) mogą przejść na helper w osobnym follow-upie — udokumentować jako next step.

**Implementation Note**: Guard-check przez celowe zepsucie to kluczowa asercja tej fazy — dowodzi, że mechanizm faktycznie łapie runtime-break, którego `any` nie łapał.

---

## Testing Strategy

### Unit Tests:
- `normalizeProfile` — kształt 7-kluczowy, wartości domyślne (Faza 2).
- `getCvProfile` — lista kolumn + mapowanie wiersza + `null` przy braku (Faza 2).

### Integration Tests:
- Brak nowych; istniejące `test_contracts.py` i vitest pozostają zielone.

### Manual Testing Steps:
1. Wgraj CV → dashboard pokazuje profil (Faza 4 nie zmienia renderu).
2. Scoring ofert działa po usunięciu `role_hints` (Faza 1).
3. Celowe zepsucie typu kolumny → build failuje (Faza 4 guard).

## Migration Notes

Brak migracji DB. `database.types.ts` jest generowany ze *stanu obecnego* schematu — nie zmienia schematu.

**Ryzyko resztkowe (dryf typów):** guard łapie rename kolumny tylko wtedy, gdy `database.types.ts` zostało zregenerowane po zmianie schematu. Rename w migracji **bez** `npm run db:types` zostawia stały plik typów → `.select()` nadal się kompiluje → runtime-break (dokładnie ten scenariusz „cichego leftovera" co C3b). Forcing function (bramka CI `supabase gen types --check`) jest świadomie odłożona jako osobny follow-up — do tego czasu okno cichego zepsucia pozostaje otwarte i zależy od dyscypliny regeneracji.

## References

- Research (element ④, ranking + weryfikacja ast-grep): `context/changes/refactor-opportunities/research.md`
- Prior (② ③): `context/changes/cv-flow-analysis/research.md`
- Mapa ①: `context/map/repo-map.md`
- Untyped client: `src/lib/supabase.ts:9` · dead column: `src/pages/api/jobs/score-batch.ts:169`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: C3b — usuń martwą kolumnę `role_hints` (szybki zysk)

#### Automated
- [x] 1.1 Typecheck/build przechodzi: `npm run build` — 3e8f25c
- [x] 1.2 Testy frontendu zielone: `npm test` — 3e8f25c
- [x] 1.3 `role_hints` nieobecny w `score-batch.ts` — 3e8f25c

#### Manual
- [x] 1.4 Scoring ofert działa jak przed zmianą — 3e8f25c

### Phase 2: Testy charakteryzujące szwu read/normalize (test przed dotknięciem)

#### Automated
- [x] 2.1 Nowe testy przechodzą: `npm test` — 21afaff
- [x] 2.2 Build/typecheck zielony: `npm run build` — 21afaff

#### Manual
- [x] 2.3 Testy pinują obecne zachowanie (świadome utrwalenie kształtu) — 21afaff

### Phase 3: Generacja `Database` types (mechanizm — ląduje na zielono)

#### Automated
- [x] 3.1 Skrypt generuje plik: `npm run db:types` — ccef121
- [x] 3.2 Plik zawiera `cv_profiles` z 7 kolumnami semantycznymi (kompletny schemat) — ccef121
- [x] 3.3 Build/typecheck/testy zielone (klient nietypowany) — ccef121

#### Manual
- [x] 3.4 Kształt `cv_profiles` zgodny z migracją — ccef121

### Phase 4: Typowany helper zapytań `cv_profiles` (egzekwowanie — pilot)

#### Automated
- [x] 4.1 Build/typecheck zielony: `npm run build` — 841f6fa
- [x] 4.2 Testy charakteryzujące dalej przechodzą — 841f6fa
- [x] 4.3 Guard działa: celowe zepsucie kolumny łamie build, potem cofnięte — 841f6fa

#### Manual
- [x] 4.4 Karta profilu CV renderuje się jak przed zmianą — 841f6fa
- [x] 4.5 Zakres pilota udokumentowany (pozostałe select-y jako follow-up) — 841f6fa
