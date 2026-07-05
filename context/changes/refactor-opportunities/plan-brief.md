# Guard dla kontraktu CV (C1 + C3b) — Plan Brief

> Full plan: `context/changes/refactor-opportunities/plan.md`
> Research (element ④): `context/changes/refactor-opportunities/research.md`

## What & Why

Domykamy dwa strukturalne kandydatury z rankingu: **C1** — nietypowane `.select()` na `cv_profiles` (rename kolumny przechodzi `tsc` i pęka cicho w runtime) dostaje guard przez generated types + typowany helper; **C3b** — martwa kolumna `role_hints` w scoringu (leftover po refaktorze) zostaje usunięta. Cel: zamienić „łatwo o tym zapomnieć" w „nie da się popsuć po cichu", bez zmiany zachowania.

## Starting Point

Klient Supabase jest nietypowany (`src/lib/supabase.ts:9`, bez `<Database>`), więc wszystkie `.select()` zwracają `any`; kształt profilu żyje w 4–5 niepowiązanych miejscach (TS↔Python↔SQL). `role_hints` jest selektowany w `score-batch.ts:169`, ale nieprzekazywany. BFF i scoring mają 0% pokrycia testami. CI: 3 blokujące joby (build/typecheck, vitest, pytest).

## Desired End State

Odczyt `cv_profiles` idzie przez helper typowany względem wygenerowanego `database.types.ts`, więc rename kolumny łamie kompilację (guard). `role_hints` usunięty ze scoringu bez zmiany zachowania. Testy charakteryzujące pinują `normalizeProfile`/`getCvProfile`. Build i testy zielone; celowe zepsucie kolumny łamie build (dowód, że guard żyje).

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
|---------|-------|----------|--------|
| Który kandydat | C1 (top) + C3b (szybki zysk) | najwyższy koszt długu (ciche zepsucie) + tani standalone | Research/Plan |
| Zakres guardu C1 | Pilot na `cv_profiles` (typowany helper) | contained blast radius, right-sizing „enforcement per area" | Plan |
| C3b kierunek | Usuń martwą kolumnę | refaktor strukturalny bez zmiany zachowania | Plan |
| Bramka CI na dryf | Odłożona (mechanizm najpierw) | mechanizm ląduje na zielono, egzekwowanie włącza się osobno | Plan |
| C3a telemetria | Zostaje (nie usuwamy) | świadoma decyzja z historii → guard/leave | Research |

## Scope

**In scope:** C3b (usunięcie `role_hints` w `score-batch`); testy char. `normalizeProfile`/`getCvProfile`; generacja `Database` types + skrypt npm; typowany helper `cv_profiles` (pilot).

**Out of scope:** globalny `createServerClient<Database>`; bramka CI na dryf; C2 (mapa błędów); C3a (telemetria); P9 (mapowanie semantyczne → M4L5); przywracanie forwardu `role_hints`; typowanie pozostałych tabel.

## Architecture / Approach

Guard-first, „dodaj test, zanim dotkniesz". Fazy od najtańszej/najbardziej samodzielnej. Mechanizm (typy) ląduje na zielono jako czysty dodatek; egzekwowanie (typowany helper) włącza się osobną fazą. Każda faza = osobny odwracalny commit.

## Phases at a Glance

| Faza | Dostarcza | Kluczowe ryzyko |
|------|-----------|-----------------|
| 1. C3b | usunięcie martwej kolumny `role_hints` | dotyka nietestowanego `score-batch` (mitygacja: 1 wystąpienie, zachowanie zachowane) |
| 2. Testy char. | pin `normalizeProfile`/`getCvProfile` | pułapka wyroczni — pinujemy stan zastany świadomie |
| 3. Gen types | `database.types.ts` + skrypt npm | konfiguracja `supabase gen types` (`--local` vs `--project-id`) |
| 4. Typowany helper | guard aktywny na `cv_profiles` | typowanie może odsłonić latentny mismatch (dobre) |

**Prerequisites:** działający toolchain (`npm ci`, `supabase` CLI), dostęp do schematu (lokalny stack lub project-id).
**Estimated effort:** ~1–2 sesje, 4 fazy, 4 osobne commity.

## Open Risks & Assumptions

- `supabase gen types` wymaga lokalnego stacku albo project-id — dokładny wariant do ustalenia przy implementacji (Faza 3).
- `normalizeProfile` może wymagać eksportu (minimalna, odwracalna zmiana produkcyjna w Fazie 2).
- Pilot celowo zostawia 3 inne `.select()` nietypowane — udokumentowane jako follow-up, nie luka.

## Success Criteria (Summary)

- Rename kolumny `cv_profiles` łamie build zamiast psuć dane w runtime (guard żyje — Faza 4 celowe zepsucie).
- Scoring i render profilu działają identycznie jak przed zmianą (zachowanie zachowane).
- `role_hints` nieobecny w `score-batch`; nowe testy charakteryzujące zielone.
