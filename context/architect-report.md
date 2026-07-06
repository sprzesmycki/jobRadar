---
title: Raport architektoniczny — moduł 4 (10xArchitect) — JobRadar
created: 2026-07-05
type: architect-report
---

# Raport architektoniczny — JobRadar (moduł 4, ścieżka 10xArchitect)

> Two-pager oparty wyłącznie na artefaktach L2–L5. Wszystkie liczby i twierdzenia „tylko tutaj"
> pochodzą z cytowanych artefaktów, nie z pamięci o kodzie.

## 1. Opisane projekty

Wszystkie artefakty L2–L5 powstały na **jednym repozytorium — `job-radar` (JobRadar)** — więc to jeden
projekt oglądany z czterech perspektyw.

- **Nazwa / cel:** JobRadar — agregacja ofert pracy i dopasowanie ich do CV z pomocą AI (L2 TL;DR).
- **Stack:** dwa rdzenie spięte kontraktem HTTP — frontend/BFF w **Astro 6 + React 19 + TypeScript**
  (`src/`) oraz serwis AI/CV w **Python/FastAPI** (`backend/app/`); persystencja **Supabase/Postgres**
  (migracje + RLS); zewnętrzny LLM **z.ai/GLM** przez SDK `openai` (L2 §1, L5-01 KROK 0).
- **Skala (orientacyjnie):** cała historia gita ~2 tygodnie (2026-05-26 → 06-08), **124 commity**,
  1 człowiek-autor + agenci AI (~38 commitów współautorowanych przez Claude) (L2 nagłówek, §5).
- **Gdzie się pojawiło:** L2 = mapa całego repo; L3 = korytarz CV w tym repo; L4 = refaktor guardu
  kontraktu CV w tym repo; L5 = destylacja domeny + 2 plany refaktoru w tym repo.

## 2. Mapa projektu (L2)

1. **Najboleśniejsza granica jest niewidoczna statycznie:** kontrakt frontend↔backend
   (cv/scoring/cover-letter) to runtime HTTP — żaden graf importów go nie widzi, a zmieniał się
   najczęściej; jedyna siatka to `test_contracts.py` (strefa ryzyka #1).
2. **Lokalne centra grafu:** `src/lib/supabase.ts` (Ca=9, auth+DB — szeroki blast radius),
   `src/lib/job-sources/aggregate.ts` (orkiestrator 4 źródeł, Ce=5).
3. **Hub produktu / entry point:** `src/pages/dashboard.astro` (15 zmian, najgorętszy plik) spina
   jobs, scoring, preferences; backend entry = `backend/app/main.py` (montaż routerów).
4. **Pułapka struktury:** `job_radar/` to martwy scaffold Django — realny backend to FastAPI;
   drzewo katalogów tu „kłamie".
5. **Najważniejsze unknowns:** brak grafu Pythona (cykle/coupling backendu = `unknown`); okno 2 tygodni
   nie odróżnia stałego centrum od kampanii MVP; runtime coupling (env, RLS, kolejność routerów) poza
   zasięgiem grafu.

## 3. Analiza ficzera (L3) — korytarz CV (upload + ekstrakcja)

- **Co i dlaczego:** przepływ zapisu i ekstrakcji CV, wejście od `src/pages/api/cv/upload.ts` —
  wybrany bo mapa oznaczyła go jako **strefę ryzyka #1 i #3** (kontrakt runtime + korytarz przez
  6 warstw i 2 języki).
- **Overview:** input to PDF z przeglądarki (dashboard) → BFF waliduje i wrzuca plik do Supabase
  Storage (bucket `cvs`) → wywołuje FastAPI przekazując **referencję storage, nie bajty** → backend
  pobiera plik przez `service_role_key` (omija RLS) i ekstrahuje profil **deterministycznie
  (pypdf + regex + listy słów kluczowych, ZERO LLM)** → BFF re-normalizuje odpowiedź do 7 pól i
  upsertuje wiersz `cv_profiles`, po czym kaskadowo unieważnia `job_scores`/`cover_letters`.
- **Technical debt (2–3 najważniejsze):**
  1. **Model rozjeżdża się na 4 miejsca** (`CvExtractionResponse` 9 pól / `ExtractedProfile` 7 /
     DB 7 / `.select()` string), nic ich nie trzyma narzędziowo. Najostrzejszy szew: **nietypowane
     `.select()` na `cv_profiles`** — rename kolumny przechodzi `tsc` i pęka dopiero w runtime.
     **Potwierdzone ast-grepem 0.44.1** (§6, T5): `ast-grep '$X.from("cv_profiles").select($A)'` = **4**
     pliki (`cv-profile.ts:28`, `score-batch.ts:169`, `cover-letter.ts:80`, `upload.ts:139`) — pierwotny
     raport mówił o 3, śledztwo poszerzyło ryzyko.
  2. **Luki testowe dokładnie tam, gdzie decyduje bezpieczeństwo refaktoru:** BFF `upload.ts` = **0%
     pokrycia** (auth, walidacja, normalizeProfile, upsert, 5 ścieżek cleanupu, kaskadowa inwalidacja);
     kody błędu backendu pokryte **4/8** (ast-grep §6, T6 — pozostałe 4 to realne zero).
  3. **Blast radius:** zmiana zestawu pól profilu = **7 plików naraz** + 2 mappery downstream
     (`both: static graph + co-change`).
- Korekta priora: mapowe „CV + AI ⇒ ekstrakcja LLM" **obalone** — ekstrakcja jest czysto regex/keyword;
  LLM wchodzi dopiero w scoringu i cover letterze.

## 4. Plan refaktoryzacji (L4) — guard kontraktu CV (C1 + C3b)

- **Co refaktorowane / docelowy kształt:** **C1** — odczyt `cv_profiles` idzie przez **typowany helper**
  z generowanym `src/lib/database.types.ts`, tak że rename kolumny staje się błędem kompilacji
  (`astro check`), nie cichym runtime-breakiem; **C3b** — usunięcie martwej kolumny `role_hints` z
  `.select()` w scoringu. Right-sizing: świadomy mirror kształtu zostaje — dostaje **guard, nie
  przebudowę**.
- **Czego świadomie NIE robimy:** globalnego `createServerClient<Database>` (pilot ogranicza blast
  radius do `cv_profiles`); bramki CI na dryf typów (`gen types --check` — osobny follow-up); C2
  (mapa kodów błędu); C3a (usunięcie `page_count`/`text_character_count` — świadoma telemetria);
  P9 (mapowanie `full_name→summary` — temat L5); przywracania forwardu `role_hints`.
- **Fazy (status: wszystkie 4 wykonane wg Progress):**
  1. C3b — usuń martwą `role_hints` ze `score-batch.ts` → auto: `npm run build`/`npm test`/grep; ręcznie: scoring działa.
  2. Testy charakteryzujące `normalizeProfile` + `getCvProfile` (test przed dotknięciem) → auto: `npm test`; ręcznie: pinują obecne zachowanie.
  3. Generacja `database.types.ts` (mechanizm, ląduje na zielono) → auto: `npm run db:types` + grep 7 kolumn; ręcznie: zgodność z migracją.
  4. Typowany helper `cv-profile.ts` (egzekwowanie) → auto: `npm run typecheck` + **celowe zepsucie** łamie kompilację; ręcznie: karta profilu renderuje się jak przed.

## 5. Domena wg DDD (L5)

- **Ubiquitous language (kluczowe pojęcia):** *CV Profile* (jeden PDF/usera), *Match Score*
  (0–100 + wyjaśnienie), *Cover Letter*, *Job Hash* (SHA-256 treści oferty — sygnał świeżości cache),
  *Aggregation + Deduplication* (klucz `company::title`). **Najważniejsze rozjazdy model↔kod:**
  R1 — `job_hash` jest liczony i zapisywany, ale **nigdy porównywany** → zmiana treści oferty daje
  wieczny stary score; R3 — puste `explanation` (`""`) dopuszczone mimo FR-006 „nie sama liczba";
  R4 — brak filtrowania soft-skilli w `missing_skills`.
- **Niezmiennik #1 i jego agregat:** **JobScore** = „Match Score ważny wyłącznie dla pary wejść
  (treść oferty, CV), z której powstał, `explanation` niepuste, wartość ∈ 0..100" (N1a ∧ N1b ∧ N1c).
  Wybrany bo jednocześnie najbardziej rdzeniowy (wprost guardrail zaufania prd.md:46) i najsłabiej
  egzekwowany. Doprecyzowanie ponad mapę: `grep job_hash` daje **wyłącznie zapisy, zero odczytów** —
  sygnał świeżości jest dowodliwie martwy; dodatkowo hash liczony tylko z treści oferty, więc nie
  wykryłby nawet zmiany CV. Plan: agregat-root `JobScore` + `JobScoreRepository` (stale = miss)
  w `src/lib/domain/`.
- **Anti-Corruption Layer — przeciek #1:** SDK **`openai`** (użyty jako transport do z.ai/GLM), nie
  Supabase. Przecieka przez **serwisy domenowe (2 pliki: `scoring.py`, `cover_letter.py`) + warstwę
  testów (3 punkty patcha w `test_contracts.py`)** — z werbatimową kopią `_zhipu_jwt`, zaszytym
  `base_url`, `OpenAIError` łapanym w serwisie i kształtem `choices[0].message.content` w domenie i
  testach. Docelowo: jeden wąski port `ChatModel` + jeden adapter `ZaiChatAdapter` (kryterium sukcesu:
  `grep openai` trafia tylko w adapter). Supabase świadomie zostawiony jako runner-up (~15 plików/5
  warstw, ale bez duplikacji konstrukcji i bez deklaracji wymienialności).

## 6. Decyzje, które należą do mnie

Jako właściciel projektu rozstrzygnąłem kilka rzeczy, których AI samo by nie przesądziło. W L4, mimo że
research pokazał 4 nietypowane `.select()` i kuszące „przetypuj wszystko globalnie", **świadomie ograniczyłem
zakres do pilota `cv_profiles` (C1) + jednego martwego pola (C3b)** i wprost wykluczyłem globalny
`createServerClient<Database>` oraz bramkę CI na dryf typów — bo tańszy, odwracalny guard bije szeroką
przebudowę przy 0% pokrycia BFF. W L5 to ja wybrałem **JobScore (świeżość + niepuste explanation) jako
niezmiennik #1**, świadomie odsuwając bliźniaczy CoverLetter, odszumianie soft-skilli i CV-fingerprint do
faz opcjonalnych, żeby rdzeń niezmiennika domknąć minimalnie na istniejącej kolumnie `job_hash`. W ACL
rozstrzygnąłem, że **przeciekiem #1 jest `openai`, nie Supabase** — mimo że Supabase dotyka więcej plików —
bo decyduje duplikacja rekonstrukcji + rozjazd „provider-agnostyczny config vs zaszyty z.ai", a Supabase to
zadeklarowany, niewymienialny filar. AI dostarczyło rankingi, dowody ast-grep i pseudokod; wybór zakresu,
kolejności i tego, co świadomie zostaje niezrobione, był mój.
