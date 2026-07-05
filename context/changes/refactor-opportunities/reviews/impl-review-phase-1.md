<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Refactor opportunities — C3b (usuń martwą kolumnę `role_hints`)

- **Plan**: context/changes/refactor-opportunities/plan.md
- **Scope**: Phase 1 of 4
- **Date**: 2026-07-05
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- **Plan Adherence — PASS**: Plan §Phase 1 wymaga usunięcia `role_hints` z `.select()` (`score-batch.ts:169`), kontrakt `.select("skills, experience_highlights")`. Commit `3e8f25c` realizuje dokładnie tę zmianę (1 linia). → MATCH.
- **Safety & Quality — PASS**: Zmiana jest behavior-preserving. `role_hints` ma **zero odczytów downstream** — payload do LLM buduje się wyłącznie z `skills` + `experience_highlights` (`score-batch.ts:57-58`). `cvProfile.role_hints` był martwym leftoverem po `e982202`.
- **Scope Discipline — PASS**: Guardrail „NOT doing" (nie przywracać forwardu `role_hints`) respektowany — dotknięto wyłącznie listy `.select()`. `context/map/` w commicie NIE jest scope creepem — plan.md:217 cytuje `context/map/repo-map.md` jako input ① tej zmiany.
- **Architecture — PASS**: Brak zmian w granicach modułów; jednoliniowa modyfikacja istniejącego zapytania.
- **Pattern Consistency — PASS**: Zapytanie zgodne z pozostałymi `.select()` w pliku; istniejący test `src/__tests__/api/score-batch.test.ts` dalej zielony.
- **Success Criteria — PASS**: 1.1 build ✅ · 1.2 test ✅ (6/6) · 1.3 grep `role_hints` absent ✅ · 1.4 manual ✅ (scoring 200 OK, zachowanie niezmienione).

## Findings

Brak. Zmiana chirurgiczna (1 linia produkcyjna), plan-adherent, behavior-preserving, w pełni zweryfikowana.

## Notes

- Zdiagnozowany podczas weryfikacji, ale **poza zakresem tej zmiany**: latencja scoringu ~25 s/oferta (LLM) × sekwencyjne partie po 5 w `score-batch.ts` (`SCORE_CAP`, `AbortSignal.timeout(30_000)`, dostrzeliwanie co 2 s po stronie klienta w `dashboard.astro`). Kandydat na osobny refactor opportunity (równoległość / wyższy cap / timeout dopasowany do latencji / szybszy model). Nie jest regresją Fazy 1.
