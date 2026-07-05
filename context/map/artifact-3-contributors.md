# Artefakt 3 — Kontekst kontrybutorów (kto wie co)

> Robocze notatki z Wide Scan, składowa 3/3. Źródło sygnału: **historia commitów gita**.
> Pytanie lekcji: „kogo zapytać, zanim wprowadzę zmianę?"

## Ograniczenie tej składowej (kluczowe — czytaj najpierw)

To **solowy projekt wspomagany agentami AI**, nie zespół. Konsekwencje:

- **Jeden człowiek-autor:** `Sebastian Przesmycki <sebastian.przesmycki@gmail.com>` (dwa warianty nazwy: `sebastian.przesmycki` 107 commitów + `Sebastian Przesmycki` 17 — ten sam e-mail, ten sam człowiek).
- **Brak botów do odfiltrowania** (dependabot/renovate: 0). Ale **~38 commitów jest współautorowanych przez agentów** (`Claude Sonnet 4.6`, `Claude Opus 4.7`) przez trailer `Co-Authored-By`.
- Klasyczna „mapa kontrybutorów" (kto ma ukrytą wiedzę, do kogo zajrzeć) **degeneruje się** — jest jedna osoba. Zamiast udawać ranking ludzi, robimy uczciwą adaptację ↓.

## Adaptacja: „kogo zapytać" → „gdzie żyje uzasadnienie"

W tym repo wiedza o decyzjach **nie żyje w głowach wielu ludzi — żyje w artefaktach procesu 10xDevs.** Duża część kodu powstała agentowo, więc rationale, edge case'y i alternatywy są zapisane w `context/changes/*/` (`change.md`, `research.md`, `plan.md`), nie w pamięci zespołu. To jest realny odpowiednik „linii wsparcia" dla tego projektu.

## Top obszary → gdzie szukać kontekstu przed zmianą

| Obszar (z artefaktów 1+2) | Człowiek | Gdzie żyje „dlaczego" (context/archive/) |
|---------------------------|----------|------------------------------------------|
| Agregacja ofert (`src/lib/job-sources/*`, `aggregate.ts`) | Sebastian | `2026-06-01-first-live-job-source`, `2026-06-01-three-source-job-aggregation` |
| CV upload + ekstrakcja (`api/cv/upload.ts`, `backend/routes/cv.py`, `services/cv_extraction`, `storage`) | Sebastian | `2026-06-02-cv-upload-and-extraction`, `2026-06-02-python-cv-ai-service-foundation` |
| Scoring ofert (`api/jobs/score-batch.ts`, `backend/routes/scoring.py`) | Sebastian | `2026-06-05-cv-based-job-scoring` |
| Cover letter (`api/jobs/cover-letter.ts`, `backend/routes/cover_letter.py`) | Sebastian | `2026-06-05-cover-letter-generation` |
| Kontrakt frontend↔backend (`test_contracts.py`) | Sebastian (12 commitów, **7 współautorowanych przez agenta**) | `2026-06-06-testing-backend-api-hardening`, `2026-06-07-testing-astro-route-contracts` |
| Onboarding / preferencje (`api/preferences.ts`, `lib/preferences.ts`) | Sebastian | `2026-06-01-onboarding-preferences` |
| Foundation backendu (FastAPI/VPS) | Sebastian + agent | `2026-06-02-python-cv-ai-service-foundation` (ma `research.md`) |

## Motywy pracy (scope'y z commitów)

Najczęstsze scope'y: `three-source-job-aggregation` (9 docs + 2 fix), `cv-based-job-scoring` (6 feat), `first-live-job-source` (6 docs + 4 fix), `cover-letter-generation` (5), `python-cv-ai-service-foundation` (5 docs). → nacisk pracy = **pipeline ofert + AI (CV → scoring → cover letter)**, spójnie z artefaktem 1.

Sygnał z `fix(...)`: najwięcej poprawek w `first-live-job-source` (4) i `onboarding-preferences` (2) — te obszary były najczęściej korygowane, warto przeczytać ich `plan.md` przed zmianą.

## Co wynika dla pracy w legacy

- **Nie ma drugiej osoby do zapytania.** Przed zmianą w obszarze X → przeczytaj `context/archive/<data>-<feature>/{research.md,plan.md}`, nie szukaj eksperta.
- **Granica kontraktu (`test_contracts.py`) jest najmocniej „współtworzona z agentem"** (7/12) — decyzje o kształcie API są w planach `testing-*`, a siatka bezpieczeństwa jest w samych testach.
- Dwa warianty nazwy autora to ta sama osoba — nie licz ich jako dwóch kontrybutorów.

## Unknowns

- Czy uzasadnienia w `plan.md`/`research.md` są nadal aktualne, czy część decyzji już się zdezaktualizowała? (`git blame` powie kto/kiedy, nie „czy słuszne").
- Wiedza operacyjna (deploy, sekrety, VPS `sprzesmycki.dev`) — częściowo w `infra/` i `context/deployment/deploy-plan.md`, ale realny stan produkcji to `unknown` z samej historii.
