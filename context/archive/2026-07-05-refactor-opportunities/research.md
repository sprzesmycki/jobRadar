---
date: 2026-07-05T14:20:00+0200
researcher: sebastian.przesmycki
git_commit: b0635dea29a1f48019ba87fa89fe4dab0dd2a218
branch: main
repository: przeprogramowani
topic: "Refactor opportunities dla korytarza CV (element ④)"
tags: [research, refactor, cv, technical-debt, ranking, verified]
status: complete
last_updated: 2026-07-05
last_updated_by: sebastian.przesmycki
verification_commit: b0635de
---

# Research: Refactor opportunities — korytarz CV (element ④)

**Prior wejściowy:** `context/changes/cv-flow-analysis/research.md` (② Feature overview + ③ Technical debt, zweryfikowane ast-grep). Ustalenia tamtego raportu traktuję jako zebrane dowody — nie wyprowadzam ich na nowo.

> **Granice tej eksploracji (z `change.md`):** żadnego refaktoru, żadnej decyzji. Dowody przed interpretacją. Docelowej architektury nie projektuję poza nazwaniem adekwatnego kształtu per kandydat. Ranking to **propozycja dla sesji planowania**, nie decyzja.

---

## Enumeracja problemów z ③ (do audytu) i klasyfikacja

| # | Problem z ③ | Klasyfikacja | Uzasadnienie |
|---|-------------|--------------|--------------|
| P1 | Nietypowane `.select()` na `cv_profiles` w 4 plikach — rename kolumny pęka w runtime | **KANDYDAT C1** | zmienia strukturę (typowanie kontraktu) |
| P2 | Kształt profilu w 4–5 lokalizacjach bez wiązania (TS↔Python↔SQL) | **KANDYDAT C1** (ta sama oś co P1) | strukturalny |
| P3 | Kontrakt kodów błędu: backend 8, BFF mapuje 3 | **KANDYDAT C2** | strukturalny (kompletność mapy) |
| P4 | `page_count`/`text_character_count` liczone, niekonsumowane | **KANDYDAT C3a** | strukturalny (usunięcie/right-size) |
| P5 | `score-batch` selektuje `role_hints`, nie przekazuje | **KANDYDAT C3b** | strukturalny (martwa kolumna) |
| P6 | BFF `upload.ts` 0% pokrycia; 4/8 kodów, kaskada, cleanup nietestowane | **NIE-kandydat** → wejście do wykonalności | brak testu ≠ zmiana struktury |
| P7 | Brak unit-testów `cv_extraction.py` | **NIE-kandydat** → wejście do wykonalności | jw. |
| P8 | `SKILL_KEYWORDS` miękka dźwignia recall | **NIE-kandydat** | tuning konfiguracji, nie kontrakt |
| P9 | Mapowanie `full_name→summary`, `experience_highlights→experience` | **POZA ZAKRESEM** | to przeprojektowanie **pojęcia biznesowego** (czym jest „profil" dla scoringu) → osobna, późniejsza analiza |

Kandydaci strukturalni: **C1** (dryf kształtu / nietypowane select), **C2** (niekompletna mapa błędów), **C3** (martwy output C3a + martwa kolumna C3b).

---

## Kandydat C1 — dryf kształtu profilu / nietypowane `.select()`

**Obecny kształt (evidence).** Zestaw pól żyje niezależnie w 5 miejscach, nic ich nie wiąże:
- backend `CvExtractionResponse` — 9 pól (`schemas/cv.py:16-25`).
- TS `ExtractedProfile` — 7 pól + ręczny `normalizeProfile` (`upload.ts:8-16,43-54`).
- DB `cv_profiles` — 7 pól semantycznych + metadane (`migration :9-28`).
- `CvProfile` + ręczny `.select("...")` 14 kolumn (`cv-profile.ts:3-18,28-30`).
- nietypowane `.select()` w 4 plikach: `cv-profile.ts:28`, `score-batch.ts:169`, `cover-letter.ts:80`, `upload.ts:139`.
- **Brak jakiegokolwiek wiązania:** brak generated Supabase types (`createServerClient` bez generyka `<Database>`, `supabase.ts:9`), brak zod, brak wspólnego pakietu. `[evidence]`

**Werdykt intencjonalności.** **Dwoisty** `[evidence, commits]`:
- 4-stronny **mirror kształtu = ŚWIADOMY** — wszystkie lokalizacje narodziły się w jednym commicie `2417754` ("implement CV upload extraction"). To planowany mirror pisany za jednym posiedzeniem, nie dryf przez osobne commity.
- **nietypowany `.select()` = PRZYPADKOWY** (nieprzemyślany default klienta JS) — Supabase klient jest bez `<Database>` od pierwszego scaffoldu `8fd725a`; plik generated-types nigdy nie istniał w historii (`git log --all` pusty). `unknown`, czy typowanie kiedykolwiek świadomie rozważano — git milczy.

**Wykonalność.** Codegen **dostępny, ale niepodpięty** (`supabase` w devDeps, `supabase gen types typescript` uruchamialny; brak skryptu/CI/pliku wyjścia) → **nowa abstrakcja**. Guard dziś: tylko backend `test_contracts.py:248-294` pinuje kształt Pythona; front — zero. CI: 3 blokujące joby (build+typecheck, vitest, pytest), bez coverage-gate. Typecheck **nie łapie** rename kolumny, bo klient zwraca `any`. **Pierwszy krok-prerekwizyt:** test charakteryzujący na szwie `normalizeProfile`/`getCvProfile` (vitest) — zanim ruszysz nietypowane selecty; dopiero potem `supabase gen types` + `createServerClient<Database>`.

## Kandydat C2 — niekompletna mapa kodów błędu

**Obecny kształt (evidence).** Backend emituje 8 kodów z 6 `raise` (`routes/cv.py`, jedna gałąź `httpx.HTTPError` → 3 kody). BFF `getExtractionErrorMessage` (`upload.ts:79-93`) mapuje jawnie 2 po nazwie (`storage_credentials_invalid`, `cv_file_not_found`) + 1 po statusie (422); pozostałe **5** (`invalid_cv_bucket`, `unsupported_cv_type` 415, `cv_path_forbidden`, `storage_not_configured` 503, `storage_download_failed` 502) wpadają w generyczne „unavailable" — użytkownik traci info np. o złym typie pliku. Brak wspólnego enuma po obu stronach. `[evidence]`

**Werdykt intencjonalności. PRZYPADKOWY/niedokończony, NIE regresja** `[evidence, commits]`: `getExtractionErrorMessage` narodził się w `8822860` ("harden CV extraction rollout"), jedyny commit, który go dotknął. Dodał 2 kody na wierzch 1-kodowego oryginału (`2417754`) — nigdy nie zgubił kodów. Gap = niedokończone pokrycie (hardening wziął 3 najsilniejsze przypadki i się zatrzymał).

**Wykonalność.** **Istniejąca abstrakcja do rozszerzenia** (`getExtractionErrorMessage`), nie nowa. Dziś nic w CI nie łapie brakującego mapowania (BFF 0% pokrycia; backend asertuje 4/8 kodów). **Pierwszy krok:** tabelaryczny test vitest po wszystkich 8 kodach → RED dla 5 generycznych; opcjonalnie wspólny const kodów, po którym test iteruje (nowy kod backendu wymusza nowy wiersz).

## Kandydat C3 — martwy output (C3a) / martwa kolumna (C3b)

**C3a `page_count`/`text_character_count`:** produkowane (`cv_extraction.py:90-91`, `schemas/cv.py:24-25`), konsumowane **tylko przez testy** (`test_cv_extraction.py:21-22`, `test_contracts.py:270-271,294`) — brak DB, brak frontu. `[evidence]`
- **Werdykt: ŚWIADOMY (telemetria).** `[evidence, commit]` Oba pola dodane w tym samym `2417754`, co migracja i TS interfejs, które je pomijają — świadome „compute-but-don't-store", nie niedokończona funkcja.
- **Wykonalność.** Usunięcie blast-safe po stronie czytelników, ale pola są `Field(ge=0)` (wymagane) i pinowane przez `test_contracts.py:270-271,294` → usunięcie łamie test (musi ruszyć w lockstepie). Ale skoro to **świadoma telemetria** → reguła „guard/leave, nie przebudowa": **niska wartość refaktoru**, nie tykać bez powodu diagnostycznego.

**C3b `role_hints` selektowany-nie-przekazywany w `score-batch`:** `.select(... role_hints ...)` (`score-batch.ts:169`), ale payload używa tylko `skills`+`experience_highlights` (`:57-58`). `[evidence]`
- **Werdykt: PRZYPADKOWY (leftover po refaktorze).** `[evidence, commits]` W `003de9d` (p4) `role_hints` był selektowany **i** przekazywany; w `e982202` (p5) przepisano mapowanie `ProfileInput` — linię forward `role_hints` usunięto, ale string `.select()` **został**. Martwa kolumna jako niezauważony efekt uboczny.
- **Wykonalność.** Tani, mechaniczny fix: albo usuń `role_hints` z `.select()` (jeśli scoring go nie potrzebuje), albo przywróć forward (jeśli powinien wpływać na scoring — to pytanie decyzyjne, nie czysto mechaniczne). Zero nowej abstrakcji.

---

## Refactor opportunities (ranked)

Ranking wg **koszt długu vs koszt zmiany**, ugruntowany w kodzie i historii. Kolejność do zakwestionowania na planowaniu.

### #1 — C1: guard dla nietypowanego `.select()` (dryf kształtu)
- **obecny → docelowy:** nietypowane stringi `.select()` zwracające `any` → **generated `Database` types + `createServerClient<Database>` + typowany helper zapytań** (string kolumn deklarowany raz, sprawdzany przez kompilator). Mirror Python↔TS zostaje (świadomy) — dostaje **guard**, nie przebudowę.
- **czemu #1:** najwyższy koszt długu — rename/usunięcie kolumny **przechodzi `tsc` i pęka cicho w runtime** (scenariusz „łatwo zapomnieć" ma realną instancję: C3b to dokładnie taki cichy leftover). Werdykt: część przypadkowa (nietypowany default), więc naprawialna.
- **blast radius:** 4 pliki z `.select()` + klient `supabase.ts`; front bez testów (0%).
- **ścieżka inkrementalna (odwracalna):** (1) test charakteryzujący `normalizeProfile`/`getCvProfile` [dodaj test, zanim dotkniesz]; (2) `supabase gen types` → plik typów + skrypt npm; (3) `createServerClient<Database>` — kompilator zaczyna łapać selecty; (4) typowany helper, usunięcie duplikatów stringów.
- **pierwszy prerekwizyt:** test charakteryzujący szwu read/normalize (vitest).

### #2 — C2: domknięcie mapy kodów błędu
- **obecny → docelowy:** częściowy `if`-chain (3/8) → **wyczerpująca mapa** kluczowana nazwanym zbiorem kodów (union TS z exhaustive check, żeby nieobsłużony kod = błąd kompilacji).
- **czemu #2:** przypadkowy/niedokończony, jasna wartość dla użytkownika (actionable errors), **istniejąca abstrakcja do rozszerzenia**, mały blast radius, tania siatka (tabelaryczny test vitest). Niżej niż C1, bo koszt długu = gorszy UX błędu, nie ciche zepsucie danych.
- **blast radius:** `getExtractionErrorMessage` (1 funkcja) + kody w `routes/cv.py`.
- **ścieżka:** (1) tabelaryczny test 8 kodów (RED×5); (2) uzupełnij mapę; (3) opcjonalnie wspólny const kodów.
- **pierwszy prerekwizyt:** test tabelaryczny nad `getExtractionErrorMessage`.

### #3 — C3b: usunięcie martwej kolumny `role_hints` w `score-batch`
- **obecny → docelowy:** `.select(... role_hints ...)` bez forwardu → **usuń martwą kolumnę** (albo świadomie przywróć forward — decyzja na planowaniu).
- **czemu #3:** przypadkowy leftover, trywialny, ale niski koszt długu (tylko czyta zbędną kolumnę). Tani szybki zysk.
- **blast radius:** 1 linia (`score-batch.ts:169`); pytanie decyzyjne: czy scoring *powinien* używać `role_hints`.
- **pierwszy prerekwizyt:** rozstrzygnąć intencję (usuń vs przywróć forward).

---

## Kandydaci rozważeni i odrzuceni

- **C3a — usunięcie `page_count`/`text_character_count`:** **ODRZUCONE jako refaktor.** Historia: świadoma telemetria (`2417754`, compute-but-don't-store). Reguła „guard/leave, nie przebudowa". Rekomendacja: zostaw; ewentualnie udokumentuj jako telemetrię. `unknown` do decyzji: czy telemetria jest jeszcze potrzebna.
- **P9 mapowanie `full_name→summary` / `experience_highlights→experience`:** **POZA ZAKRESEM** — to przeprojektowanie pojęcia biznesowego (czym jest „profil" dla scoringu/cover-lettera), nie struktura kodu. Zatrzymuję się: przedmiot osobnej, późniejszej analizy (kandydat na M4L5 / DDD).
- **P6/P7 luki testowe:** nie-kandydaci strukturalni, ale **weszły jako prerekwizyty** kandydatów (test-before-touch w C1/C2).
- **P8 `SKILL_KEYWORDS`:** tuning recall, nie kontrakt — nie refaktor.

---

## Korekty priora (③ Technical debt) wynikłe z eksploracji

- ③ „nietypowane `.select()` w 4 plikach" — **potwierdzone**, ale dodano werdykt: to **przypadkowy default**, nie świadoma rezygnacja z typów (git milczy → nigdy nie było na stole).
- ③ „kształt w 4 lokalizacjach = dryf" — **doprecyzowane**: shape narodził się jako **świadomy mirror w jednym commicie**; dryfem jest brak *guardu*, nie sam mirror.
- ③ nie etykietował `role_hints` jako martwej kolumny wprost — eksploracja **awansowała to z podejrzenia na fakt** z commitami `003de9d`→`e982202`.

## Weryfikacja twierdzeń (ast-grep)

Narzędzie `ast-grep 0.44.1`; reguła: liczba z ast-grep, **każde zero potwierdzone grepem**. Werdykty rankingu i intencjonalności NIE zmieniane (kontrakt).

| Twierdzenie rankingu | Werdykt | Dowód (plik:linia) | Metoda |
|----------------------|---------|--------------------|--------|
| C2: BFF mapuje 3/8 kodów | **potwierdzone** | `upload.ts:80` (status 422) + `:84,:88` (2 po nazwie) | grep warunków |
| C3b: `role_hints` w `score-batch` — 1 wystąpienie, tylko `.select`, brak forwardu | **potwierdzone** | `score-batch.ts:169` (jedyne) | grep count = 1 |
| C3b scope: `cover-letter` JEDNAK forwarduje `role_hints` (asymetria) | **doprecyzowane** | `cover-letter.ts:80` select + **`:122` forward** | grep — potwierdza, że C3b dotyczy tylko `score-batch` |
| C1: nietypowane `.select()` na `cv_profiles` w 4 plikach | **potwierdzone** | `ast-grep '$X.from("cv_profiles").select($A)'` = 4; grep = 4 | ast-grep + grep |
| C1 root: brak `createServerClient<Database>` i brak pliku generated-types | **potwierdzone (realne zero)** | 0 wystąpień `createServerClient<`; `find *.types.ts` = brak | grep + find (zero potwierdzone) |
| C3a: `page_count`/`text_character_count` konsumowane tylko przez testy | **potwierdzone** | poza producentem (`schemas/cv.py`, `cv_extraction.py`) tylko `test_cv_extraction.py`, `test_contracts.py`; zero w `src/`,`supabase/` | grep repo-wide |
| Baza: `cv.py` = 8 kodów z 6 `raise` | **potwierdzone** | `ast-grep 'raise HTTPException($$$)'` = 6; grep kodów = 8 | ast-grep + grep |

**Wniosek:** żadne twierdzenie nie obaliło pozycji w rankingu. Weryfikacja **wzmocniła** faworyta C1 (root „brak typowanego klienta" to realne zero — nigdy nie było generated types) i **doprecyzowała** C3b (asymetria: `cover-letter` używa `role_hints`, `score-batch` nie — martwa kolumna jest lokalna, nie systemowa). Do decyzji na planowaniu: czy `score-batch` powinien dołączyć do `cover-letter` i forwardować `role_hints`, czy usunąć kolumnę.

## Open questions (unknown — do decyzji na planowaniu)

- Czy scoring *powinien* używać `role_hints` (C3b: usunąć vs przywrócić forward)?
- Czy telemetria `page_count`/`text_character_count` jest jeszcze potrzebna (C3a)?
- Czy `supabase gen types` opłaca się teraz, czy dopiero gdy schema urośnie (C1: zakres pilota)?
