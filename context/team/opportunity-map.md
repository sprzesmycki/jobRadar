# Opportunity Map

## Context

- **Project / context**: AI job-application helper (upload/ekstrakcja CV, agregacja ofert z 3 źródeł, generowanie listów, scoring CV↔oferta) + toolkit skilli `/10x-*` i kontrakty w `context/`.
- **Data constraint**: mock / lokalne / read-only / niewrażliwe — pierwsza wersja startuje lekko, bez kontroli dostępu i audytu.
- **Date**: 2026-07-05

## Map

| Signal | Existing / default response | Thin complement | First useful version | Data risk | Direction if valuable |
|---|---|---|---|---|---|
| **S1** Nie wiadomo, co w toku a co domknięte; stan w `context/` vs git się rozjeżdża | git log/status + ręczne przeglądanie changes vs archive; `/10x-archive` stempluje zamknięcie | read-only digest łączący `change.md` (status) z git (untracked/modified) i archiwum | skrypt lokalny → raport MD "w toku / domknięte / rozjazd" | local / read-only | Internal tool → Review/CI gate |
| **S2** Kontrakty foundation rozjeżdżają się po re-runach skilli | ręczne czytanie frontmatterów i dat; CLAUDE.md opisuje hand-offy, nikt nie waliduje | walidator spójności frontmatterów (daty, referencje stack↔infra) | skrypt lint foundation/*.md → lista ostrzeżeń | local / read-only | Internal tool (lint kontraktów) |
| **S3** Review każdej zmiany żyje osobno; te same uwagi wracają bez twardej bramki | `/10x-impl-review` i `/10x-plan-review` per-zmiana; brak agregacji wzorców | agregator czytający wszystkie `reviews/*.md`, wyciąga powtarzalne klasy uwag | skrypt → "top powtarzalnych uwag" jako kandydat na lessons.md | local / read-only | Internal tool → Review/CI gate |
| **S4** Skille i reguły kopiowane/rozjeżdżają się między repo | ręczne kopiowanie / wiki; zaczątki pack-init/tf-registry, brak wydanych wersji | rejestr artefaktów AI z definicją paczki i listą wersji | repozytorium/rejestr z jedną paczką testową + ręczna instalacja w 1 projekcie | local / read-only | Shared artifact registry (M5L4) |

## Recommended First Candidate

```text
Candidate:
Status digest zmian (roboczo: "co-w-toku")

Reads:
- context/changes/*/change.md   (status każdej otwartej zmiany)
- context/archive/*/            (co już domknięte, z datą)
- git status / git log          (untracked / modified / ostatnie commity)

Returns:
Raport Markdown do odczytu:
- W TOKU: otwarte zmiany + ich deklarowany status
- ROZJAZD: zmiana ma status "done" w change.md, ale są niezacommitowane pliki (albo odwrotnie)
- ŚWIEŻE, NIEŚLEDZONE: untracked pliki spoza żadnej zmiany (np. 7 docs w git status)
- OSTATNIO DOMKNIĘTE: N ostatnich z archive/

Does not do:
- nie zmienia statusów, nie archiwizuje, nie robi commitów (to robi /10x-archive, git)
- nie ma UI, logowania, bazy, harmonogramu
- nie zastępuje git ani context/ — tylko czyta i linkuje do plików

Data risk:
local / read-only — wyłącznie pliki repo i wyjście gita. Zero danych klienckich.

Direction if valuable:
Internal tool → docelowo Review/CI gate (ten sam raport jako komentarz pod PR-em w M5L2/L3).
```

## Why This Candidate

S1 boli najczęściej (codzienny "co się zmieniło") i łączy sygnał, którego żadne źródło nie ma samo — git nie zna deklarowanego statusu z `change.md`, a `change.md` nie wie, że pliki wiszą niezacommitowane. S2 i S3 bolą rzadziej (po re-runie / przy zamknięciu zmiany), a S4 to świadomie osobny, cięższy przepływ z M5L4 (rejestr), nie cienki helper. Digest zostaje skromny: czyta, streszcza, linkuje do źródeł, decyzję zostawia człowiekowi.

## Next Direction If Valuable

Wybrany następny ruch: **walidacja przed budową** — `/10x-mom-test` na tej mapie, a jeśli problem przeżyje rozmowy o przeszłych zachowaniach, zwalidowana okazja idzie w `/10x-shape` → `/10x-prd` → `/10x-roadmap`. Najtańszy pierwszy krok i tak jest rozmowa z ludźmi żyjącymi z tym tarciem (tu: Ty jako główny użytkownik toolkitu) o tym, jak dziś ręcznie sprawdzasz status i co cię ostatnio ugryzło.
```