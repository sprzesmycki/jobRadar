---
title: Certification submission forms — fill-in packs
created: 2026-07-14
type: submission-aid
---

# Certification submission — fill-in packs

Two Baserow forms, three badges. Fields below are the **actual** fields on the live forms.

- **Form A — Builder:** https://baserow.io/form/g6rJ-njiGpV5lPxvot6iRxsXTh8Wb-AnRjy7s2Zck1c
- **Form B — Architect + Champion:** https://baserow.io/form/fwnBioduXc90QTli6lsCVL_YgRdTECPTCmwiVhu8d-E

⚠️ **Deadline:** both forms say the **first** round closed **5 July 23:59**. Today is 14 July,
so you are submitting into a later round. Confirm a second round is open before relying on this.

---

## Form A — 10xBuilder (Modules 1–3)

| # | Field | Required | Value |
| --- | --- | --- | --- |
| 1 | Email | ✅ | `sebastian.przesmycki@gmail.com` |
| 2 | Imię i nazwisko | ✅ | `Sebastian Przesmycki` |
| 3 | Typ projektu | ✅ | **Własny projekt** |
| 4 | Zgoda na wykorzystanie projektu do promocji kursu | ✅ | *your call — Yes / No* |
| 5 | Repozytorium projektu na GitHub | ✅ | `https://github.com/sprzesmycki/jobRadar` |
| 6 | Publiczny adres opublikowanej aplikacji | optional | `https://job-radar.sebastian-przesmycki.workers.dev` |
| 7 | Screenshot: Ekran logowania | optional | ❌ **missing** |
| 8 | Screenshot: Strona główna / ekran po zalogowaniu | ✅ | ❌ **missing** |
| 9 | Screenshot: Główna funkcjonalność nr 1 | ✅ | ❌ **missing** |
| 10 | Screenshot: Główna funkcjonalność nr 2 | ✅ | ❌ **missing** |
| 11 | Screenshot: Poprawnie działający test | ✅ | ❌ **missing** |
| 12 | Załączniki niestandardowe | optional | — (skip) |
| 13 | Twój komentarz | optional | see below |

### 🚨 Blocker: four required screenshots do not exist

The repo contains **only** the three Champion CI screenshots. Nothing of the running app.
Fields 8–11 are required, so **Builder cannot be submitted today.**

Suggested mapping onto the app's actual features:

| Field | What to capture |
| --- | --- |
| 7 — Ekran logowania (optional) | `/auth/signin` |
| 8 — Po zalogowaniu (required) | `/dashboard` with the aggregated offer list visible |
| 9 — Funkcjonalność nr 1 (required) | An offer showing its **% CV match score + missing skills** — the product's core promise |
| 10 — Funkcjonalność nr 2 (required) | A **generated cover letter** for a specific offer |
| 11 — Poprawnie działający test (required) | Green `npm test` run, or a green `ci.yml` run page on GitHub |

Fields 8–10 need a logged-in session with a CV uploaded — I can't produce those without
credentials or you driving the browser. Field 11 I can produce unaided.

### Field 13 — Twój komentarz (paste)

```
JobRadar agreguje zdalne oferty pracy z kilku portali (JustJoinIT, Remotive, Adzuna) w jedną
listę i dopasowuje je do CV użytkownika. Użytkownik wgrywa CV (PDF), ustawia preferencje
(rola, technologie, widełki), a przy każdej ofercie widzi wynik dopasowania 0–100, brakujące
skille i może jednym kliknięciem wygenerować spersonalizowany cover letter odnoszący się do
konkretnej oferty i konkretnych punktów z CV.

Stack: Astro 6 + React 19 + TypeScript na Cloudflare Workers; Supabase (Postgres + Auth +
Storage, RLS); backend Python/FastAPI w Dockerze na VPS (parsowanie CV, scoring, orkiestracja
AI); z.ai/GLM przez SDK OpenAI. CI/CD: GitHub Actions — testy oraz pipeline AI code review
komentujący każdy PR.
```

---

## Form B — 10xArchitect + 10xChampion (Modules 4 & 5)

Selecting **"Obie odznaki"** unfolds two conditional fields; picking the Champion project
unfolds a third. Full list, in order:

| # | Field | Value to enter |
| --- | --- | --- |
| 1 | Email * | `sebastian.przesmycki@gmail.com` |
| 2 | Imię i nazwisko * | `Sebastian Przesmycki` |
| 3 | Na jaką odznakę się zgłaszasz? * | **Obie odznaki** |
| 4 | **Raport architektoniczny (M4)** — upload | `context/architect-report.md` (see PDF note) |
| 5 | **Który projekt Champion (M5) zrealizowałeś?** | **Pipeline CI/CD do review kodu (M5L2-3)** |
| 6 | **Załączniki dla projektu Pipeline (M5)** — upload | 3 screenshots, mapped below |
| 7 | Twój komentarz | optional — see below |

*(The other Champion option, "Rejestr artefaktów zespołowych (M5L4)", is not your path — do
not pick it; it unfolds a different upload field.)*

### Field 4 — Raport architektoniczny

Help text: *"Wgraj zsyntetyzowany raport, zwięzły two-pager zbudowany z czterech artefaktów
zgodnie z instrukcjami w sekcji «Zadania praktyczne» M4L5"*

Upload `context/architect-report.md`. ⚠️ It asks for a **two-pager** — markdown has no pages.
Exporting to PDF makes the "two pages" claim checkable and is the safer upload.

### Field 6 — Załączniki dla projektu Pipeline (M5)

Help text, verbatim — *"Wgraj trzy screenshoty:"*

| Required screenshot | File |
| --- | --- |
| widok pipeline'u z co najmniej jednym widocznym jobem | `context/team/champion-evidence/01-run-page.png` |
| logi z pipeline'u gdy wykonuje się krok code review | `context/team/champion-evidence/02-job-logs.png` ⚠️ |
| działanie na PR — zrzut z komentarzem code review od agenta | `context/team/champion-evidence/03-pr-comment.png` |

🚨 **The `02` caveat now bites.** The field explicitly asks for **logi** from the code-review
step. `02-job-logs.png` was captured logged out, so it shows the green step list but **no log
text** — GitHub gates log text behind sign-in. Re-capture it signed in: open
[run 28781629430](https://github.com/sprzesmycki/jobRadar/actions/runs/28781629430) → job
`review` → expand **Run ./.github/actions/ai-reviewer** (and/or **Apply verdict label**, which
prints `verdict=APPROVED`) → screenshot. ~30 seconds, and it turns a weak attachment into an
exact match for what's being asked.

### Field 7 — Twój komentarz (optional; paste — covers both badges)

```
Zgłaszam obie odznaki. Oba artefakty są w publicznym repo: https://github.com/sprzesmycki/jobRadar

— 10xArchitect (M4) —
Raport architektoniczny (two-pager, 6 sekcji, synteza L2–L5):
https://github.com/sprzesmycki/jobRadar/blob/main/context/architect-report.md
Artefakty źródłowe: mapa repo (L2) context/map/, analiza ficzera (L3)
context/archive/2026-07-05-cv-flow-analysis/, plan refaktoryzacji (L4)
context/archive/2026-07-05-refactor-opportunities/, destylacja domeny DDD (L5) context/domain/

— 10xChampion (M5, ścieżka A: pipeline CI do code review) —
Pipeline AI code review w GitHub Actions, odpalany na każdym PR do main. Composite action
zbiera diff PR-a i wysyła do z.ai/GLM (przez SDK OpenAI); skrypt zwraca ustrukturyzowany
werdykt JSON oceniany w 6 kryteriach (poprawność, idiomatyczność, złożoność, pokrycie
testami/ryzyka, dokumentacja, bezpieczeństwo). Workflow publikuje review jako komentarz na PR
i nadaje etykietę ai-cr:passed / ai-cr:failed / ai-cr:review. Review jest doradcze i nie
blokuje merge'a.

Dowody (3 wymagane kategorie z M5L1, Krok 4):
1. Widok pipeline'u + job: https://github.com/sprzesmycki/jobRadar/actions/runs/28781629430
2. Logi joba: ten sam run, job "review" (verdict=APPROVED, 09:34:50Z)
3. Komentarz LLM na PR: https://github.com/sprzesmycki/jobRadar/pull/20
Werdykt: APPROVED → etykieta ai-cr:passed.
Zrzuty ekranu w repo: context/team/champion-evidence/ (01-run-page.png, 02-job-logs.png,
03-pr-comment.png).
Kod: .github/workflows/ai-review.yml, .github/actions/ai-reviewer/, backend/scripts/pr_review.py
```

---

## Status

| Badge | Ready? | Blocker |
| --- | --- | --- |
| 10xBuilder | ❌ NO | 4 required app screenshots (fields 8–11) do not exist |
| 10xArchitect | ✅ YES | none |
| 10xChampion | ✅ YES | none (see `02-job-logs.png` caveat in champion-evidence/README.md) |
