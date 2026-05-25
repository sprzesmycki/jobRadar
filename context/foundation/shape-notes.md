---
project: JobRadar
context_type: greenfield
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: false
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "główny ból"
      decision: "filtrowanie i odkrywanie — zbyt wiele nieistotnych ofert rozsianych po wielu portalach"
    - topic: "persona"
      decision: "senior/mid developer, zatrudniony, pasywnie szuka remote za USD/EUR"
    - topic: "insight"
      decision: "oferty rozproszone po dziesiątkach portali — brak jednej agregowanej powierzchni"
    - topic: "auth model"
      decision: "email + hasło lub OAuth; zamknięta rejestracja na MVP (single-user: tylko właściciel)"
  frs_drafted: 11
  quality_check_status: accepted
---

## Vision & Problem Statement

Doświadczony developer IT (mid/senior), aktualnie zatrudniony, pasywnie szuka lepiej płatnych ofert remote (USD/EUR). Oferty relevantne dla jego profilu są rozproszone po kilkunastu portalach jednocześnie — nie istnieje jedno miejsce, które agreguje je wszystkie. Ręczne przeglądanie wielu portali i ocena dopasowania CV do każdej oferty jest czasochłonna; napisanie spersonalizowanego cover lettera pod każdą aplikację zajmuje godziny.

Insight: portale pracy są silosami — obsługują wyłącznie własny inventarz i nie mają motywacji do agregacji między sobą. Developer z dobrym CV nie może dziś użyć tego CV jako wyszukiwarki działającej jednocześnie we wszystkich relevantnych źródłach.

## User & Persona

### Primary persona

Mid/senior IT developer, aktualnie zatrudniony (4+ lata doświadczenia). Pasywnie szuka lepiej płatnych pozycji remote kompensowanych w USD lub EUR. Ma ograniczony czas na szukanie pracy (wieczory, przerwy w pracy). Aplikuje selektywnie — chce widzieć tylko trafne oferty i aplikować szybko gdy już znajdzie coś wartościowego. Nie chce spędzać godzin na przeglądaniu portali ani pisaniu cover letterów od zera.

## Functional Requirements

### Autentykacja
- FR-001: User can register via email + password or OAuth. Priority: must-have
  > Socrates: Kontrargument rozważony: "Single-user MVP — hardcoded login wystarczy." Pominięcie: FR-001 zostaje — aplikacja ma być prawdziwym produktem od dnia 1, nawet jeśli użytkownik to tylko właściciel.
- FR-002: User can log in and log out. Priority: must-have
  > Socrates: Kontrargument rozważony: "logout jest UX-nicety w single-user MVP." Pominięcie: logout zostaje jako baseline bezpieczeństwa — usunięcie go tworzyłoby niekompatybilny dług przy otwieraniu dla innych użytkowników.

### Profil i preferencje
- FR-003: User can upload their CV as a PDF file. Priority: must-have
  > Socrates: Kontrargument rozważony: "PDF parsing jest kruchy." Pominięcie: PDF to oczekiwany UX — użytkownik nie będzie przepisywał CV ręcznie.
- FR-004: User can set job preferences: role, technologies, min salary, work mode (remote/hybrid/onsite). Priority: must-have
  > Socrates: Kontrargument rozważony: "match score już filtruje — preferences redundantne." Pominięcie: preferencje są niezbędne do pre-filtrowania przed scoringiem — bez nich API fetches i scoring uruchamiają się dla tysięcy irrelevantnych ofert.

### Agregacja ofert
- FR-005: User can view an aggregated list of job offers from JustJoinIT, Remotive, and Adzuna filtered by their preferences. Priority: must-have
  > Socrates: Kontrargument rozważony: "jedno źródło to nie agregacja — obietnica produktu niespełniona." Rozwiązanie: FR-005 rozszerzony do 3 źródeł (JustJoinIT + Remotive + Adzuna) zgodnie z doprecyzowaniem użytkownika. Wartość agregacji jest spełniona już w MVP.

### Matching
- FR-006: User can see a CV-to-job match percentage score for each offer, with a brief explanation of the key matching factors. Priority: must-have
  > Socrates: Kontrargument rozważony: "procentowy wynik bez wyjaśnienia to black box — użytkownik nie ufa." Rozwiązanie: FR-006 zaktualizowany — score musi zawierać zwięzłe wyjaśnienie kluczowych czynników, nie samą liczbę.
- FR-007: User can see which skills are missing from their CV relative to a job offer's requirements. Priority: must-have
  > Socrates: Kontrargument rozważony: "lista brakujących skillów może być zaszumiona (communication skills, agile jako 'missing')." Pominięcie: FR-007 zostaje — problem szumu jest kwestią jakości implementacji (filtrowanie soft skills), nie zasadności FR.

### Cover letter
- FR-008: User can generate a personalized cover letter for any offer, referencing both the offer content and their CV. Priority: must-have
  > Socrates: Kontrargument rozważony: "AI cover lettery są coraz częściej rozpoznawane przez rekruterów." Pominięcie: cover letter pozostaje kluczową wartością produktu — wyraźna personalizacja (konkretne punkty z CV + konkretne wymagania oferty) zmniejsza ryzyko generyczności.

### Śledzenie aplikacji
- FR-009: User can save a job offer with a status label (interested / applied / rejected). Priority: must-have
  > Socrates: Kontrargument rozważony: "browser bookmarks wystarczyłyby dla single-user MVP." Pominięcie: status tracking jest częścią obietnicy produktu — zapisywanie statusów to feature, nie infrastruktura, i powinno być walidowane w MVP.
- FR-010: User can view their saved offers list. Priority: must-have
  > Socrates: Kontrargument rozważony: "można odroczyć do v2." Pominięcie: FR-010 zostaje — bez widoku zapisanych ofert FR-009 jest bezsensowny. Razem tworzą kompletny loop.
- FR-011: User can add notes to a saved offer. Priority: nice-to-have
  > Socrates: Kontrargument rozważony: "za mało aplikacji w v1 żeby notatki miały sens." Przyjęty warunkowo: FR-011 pozostaje nice-to-have — implementować tylko jeśli czas pozwoli po dostarczeniu must-have.

## User Stories

### US-01: Developer odkrywa trafne oferty remote

- **Given** zalogowany użytkownik z wgranym CV i ustawionymi preferencjami
- **When** otwiera widok listy ofert
- **Then** widzi listę ofert z JustJoinIT przefiltrowaną po roli, technologiach i min. widełkach — każda z wynikiem % dopasowania CV oraz listą brakujących skills

#### Acceptance Criteria
- Oferty niepassujące do preferencji nie pojawiają się na liście
- Każda oferta pokazuje wynik dopasowania (0–100%) zanim użytkownik ją otworzy
- Pusta lista (brak trafień) pokazuje komunikat z sugestią rozluźnienia filtrów — nie pusty ekran

### US-02: Developer generuje cover letter pod konkretną ofertę

- **Given** zalogowany użytkownik z wgranym CV przeglądający szczegóły oferty
- **When** klika "Generuj cover letter"
- **Then** otrzymuje gotowy tekst cover lettera odwołujący się do konkretnych wymagań oferty i konkretnych punktów z jego CV

#### Acceptance Criteria
- Wygenerowany tekst zawiera przynajmniej jedno bezpośrednie odwołanie do wymagań z ogłoszenia
- Wygenerowany tekst zawiera przynajmniej jedno odwołanie do doświadczenia z CV kandydata
- Cover letter nie brzmi jak generyczny szablon

## Business Logic

JobRadar ocenia dopasowanie kandydata do oferty na podstawie porównania treści jego CV z wymaganiami ogłoszenia — zwraca wynik dopasowania z uzasadnieniem, wskazuje brakujące skills, i generuje spersonalizowany cover letter łączący konkretne wymagania oferty z konkretnymi punktami z CV kandydata.

Wejścia (od strony użytkownika): CV w formacie PDF, załadowane raz i używane przy każdym scoringu; preferencje (rola, technologie, minimalne widełki) określające które oferty w ogóle trafiają do systemu. Konkretna oferta jest wejściem implicite — wynika z wyboru użytkownika w interfejsie.

Wyjście reguły: wynik % dopasowania z krótkim wyjaśnieniem kluczowych czynników, lista skills obecnych w ofercie a nieobecnych w CV, oraz gotowy tekst cover lettera spersonalizowany pod tę konkretną ofertę.

Jak użytkownik to spotyka: po załadowaniu CV i ustawieniu preferencji widzi listę ofert z wynikami dopasowania; po wejściu w ofertę widzi rozbicie scoringu i braki; klika "Generuj cover letter" i dostaje gotowy tekst.

## Non-Functional Requirements

- Czas generowania cover lettera nie przekracza 30 sekund od kliknięcia przez użytkownika; jeśli operacja trwa dłużej niż 2 sekundy, użytkownik widzi ciągły wskaźnik postępu.
- Pełna treść CV użytkownika nie jest przechowywana przez serwisy zewnętrzne po zakończeniu zapytania — żaden third-party log nie może zawierać surowego tekstu CV.

## Success Criteria

### Primary
- Użytkownik wgrywa CV, ustawia preferencje i widzi zagregowaną listę ofert z JustJoinIT przefiltrowaną po roli, technologiach i widełkach.
- Przy każdej ofercie widzi % dopasowania swojego CV oraz listę brakujących skills.
- Klika "Generuj cover letter" i dostaje gotowy, spersonalizowany tekst odnoszący się do konkretnej oferty i konkretnych punktów z jego CV.
- Może zapisać ofertę ze statusem.

### Secondary
- Historia aplikacji z możliwością dodania notatek do każdej oferty (np. co mówił na rozmowie).

### Guardrails
- Pełna treść CV użytkownika nigdy nie jest dostępna publicznie ani logowana w serwisach zewnętrznych.
- Wynik % dopasowania musi być wiarygodny — jeśli scoring jest losowy lub nieistotny, użytkownik przestaje ufać całemu produktowi.
- Lista ofert ładuje się w akceptowalnym czasie — użytkownik nie czeka 30+ sekund na wyniki.

## Non-Goals

- Nie składa aplikacji za użytkownika: JobRadar pomaga znaleźć odpowiednie oferty i przygotować materiały — wysłanie formularza aplikacyjnego do pracodawcy pozostaje po stronie użytkownika.
- Nie buduje własnego modelu matchingu: scoring i generowanie cover lettera opierają się na gotowych AI API; żadnego własnego trenowania modeli, fine-tuningu ani ML pipeline.
- Brak funkcji społecznościowych: bez team workspaces, profilu publicznego, współdzielenia ofert ani rekomendacji od znajomych.
- Brak generatora / edytora CV: aplikacja czyta istniejące CV użytkownika — nie tworzy, nie edytuje, nie formatuje dokumentów CV.

## Access Control

Użytkownik loguje się przez email + hasło lub OAuth (np. Google/GitHub). Dane profilu (CV, preferencje) przechowywane server-side powiązane z kontem. MVP: zamknięta rejestracja — pojedynczy użytkownik (właściciel aplikacji) weryfikuje produkt zanim otworzy innym. Brak ról w MVP — jeden poziom dostępu, jeden użytkownik.

## Open Questions

Brak otwartych pytań po zakończeniu discovery. Wszystkie kluczowe decyzje zostały podjęte w sesjach 1–6.

## Quality cross-check

Cross-check wykonany 2026-05-25. Wynik: accepted (brak luk). Wszystkie 5 elementów greenfield obecne: Access Control, Business Logic (reguła jednozdaniowa), Project artifacts, Timeline-cost (mvp_weeks: 3, potwierdzony przez użytkownika), Non-Goals (4 wpisy).
