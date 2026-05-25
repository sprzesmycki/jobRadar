# PRD: JobMatch AI — Job Scraper z AI Scoringiem

## Vision

Aplikacja webowa dla IT developerów szukających pracy (szczególnie remote za $$$), która agreguje oferty z wielu źródeł, automatycznie ocenia ich dopasowanie do CV użytkownika i generuje spersonalizowany cover letter — eliminując manualne przeglądanie dziesiątek ogłoszeń.

---

## Persona

**Użytkownik:** Developer IT (mid/senior), szuka pracy remote lub za granicą, aplikuje aktywnie lub pasywnie. Zna angielski, chce oszczędzić czas na selekcji i pisaniu cover letterów.

**Problem:** Ręczne przeglądanie ofert z wielu portali i dopasowywanie ich do własnego profilu jest czasochłonne. Pisanie cover letterów od zera pod każdą ofertę zajmuje godziny.

---

## Kryteria sukcesu

- Użytkownik wgrywa CV i w ciągu 30 sekund widzi oferty z AI scoringiem
- AI scoring zgadza się z oceną użytkownika w ≥70% przypadków
- Cover letter jest generowany w <10 sekund i wymaga tylko drobnych poprawek

---

## User Stories

**FR-001 — Rejestracja użytkownika**
Given: nowy użytkownik wchodzi na stronę
When: wypełnia formularz rejestracji (email, hasło, imię)
Then: konto zostaje utworzone i użytkownik jest zalogowany

**FR-002 — Logowanie**
Given: użytkownik ma konto
When: podaje email i hasło
Then: dostaje dostęp do swojego dashboardu

**FR-003 — Profil i preferencje**
Given: użytkownik jest zalogowany
When: uzupełnia profil
Then: system zapisuje:
- rola docelowa (Software Engineer / QA Engineer)
- preferowane technologie (multi-select, np. React, Python, Cypress)
- minimalne widełki (kwota + waluta: PLN / USD / EUR)
- tryb pracy (remote / hybrid / onsite)

**FR-004 — Upload CV**
Given: użytkownik jest zalogowany
When: wgrywa plik CV (PDF)
Then: system parsuje CV i zapisuje profil techniczny użytkownika

**FR-005 — Agregacja ofert**
Given: użytkownik ma zapisane preferencje
When: otwiera listę ofert
Then: system pobiera oferty z JustJoinIT, Remotive i Adzuna, filtruje po roli, technologiach i min. widełkach, wyświetla zagregowaną listę

**FR-006 — AI Scoring**
Given: system ma CV użytkownika i pobraną ofertę
When: wyświetla ofertę na liście
Then: AI zwraca % dopasowania + listę brakujących skills

**FR-007 — Cover Letter Generator**
Given: użytkownik klika "Generuj cover letter" przy ofercie
When: AI przetwarza CV + treść oferty
Then: generuje spersonalizowany cover letter gotowy do skopiowania

**FR-008 — Zapisywanie i śledzenie aplikacji**
Given: użytkownik jest zainteresowany ofertą
When: klika "Zapisz" lub "Aplikowałem"
Then: oferta trafia do jego listy z możliwością zmiany statusu (Zapisana / Aplikowano / Rozmowa / Odrzucona)

---

## Business Logic

**Jednozdaniowa reguła biznesowa:**
*"AI porównuje treść oferty z CV użytkownika, zwraca % dopasowania, wskazuje brakujące skills i generuje cover letter dopasowany do tej konkretnej oferty."*

---

## Model danych

- **User** — id, email, password_hash, name, created_at
- **UserPreferences** — id, user_id, target_role (software_engineer/qa_engineer), technologies[], salary_min, salary_currency (PLN/USD/EUR), work_mode (remote/hybrid/onsite)
- **CV** — id, user_id, raw_text, parsed_skills, created_at
- **JobOffer** — id, source (jjit/remotive/adzuna), external_id, title, company, salary_min, salary_max, currency, remote, tech_stack, description, url, fetched_at
- **AIScore** — id, offer_id, user_id, match_percent, missing_skills[], generated_at
- **SavedOffer** — id, user_id, offer_id, status (saved/applied/interview/rejected), cover_letter, notes, updated_at

---

## Access Control

- Rejestracja i logowanie (email + hasło, sesja JWT)
- Każdy użytkownik widzi tylko swoje CV, scoring i zapisane oferty
- Oferty z API są publiczne (cachowane wspólnie)

---

## Non-Goals (poza MVP)

- Automatyczne aplikowanie
- Powiadomienia email/push o nowych ofertach
- Analiza trendów rynkowych
- Porównywanie ofert między sobą
- Import CV z LinkedIn
- Aplikacje mobilne

---

## Tech Stack (sugestia)

- **Backend:** Node.js + Express lub Python + FastAPI
- **Baza:** PostgreSQL
- **AI:** Anthropic Claude API (scoring + cover letter)
- **Frontend:** dowolny (React / Next.js)
- **Źródła ofert:** JustJoinIT (bez klucza), Remotive API (bez klucza), Adzuna API (darmowy klucz)

---

## Open Questions

1. Jak często odświeżać oferty z API? (co godzinę? na żądanie?)
2. Czy cachować wyniki AI scoringu, czy liczyć przy każdym wejściu?
3. Czy Adzuna zwraca oferty z widełkami — trzeba zweryfikować w praktyce
4. Język UI: polski czy angielski?

---

## MVP Scope — pierwszy działający flow

1. Użytkownik rejestruje się i loguje
2. Ustawia preferencje: rola (SE/QA), technologie, min. widełki, tryb pracy
3. Wgrywa CV (PDF)
4. Widzi zagregowaną listę ofert filtrowaną po preferencjach (JustJoinIT jako pierwsze)
5. Przy każdej ofercie widzi % dopasowania i brakujące skills
6. Klika "Generuj cover letter" → dostaje gotowy tekst
7. Zapisuje ofertę ze statusem

**To jest definicja "done" dla MVP.**
