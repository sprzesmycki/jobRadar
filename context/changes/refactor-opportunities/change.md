---
change_id: refactor-opportunities
title: Refactor opportunities dla korytarza CV — eksploracja, ranking, decyzja, plan
status: impl_reviewed
created: 2026-07-05
updated: 2026-07-05
archived_at: null
---

## Notes

Intencja: mamy analizę tego repozytorium, która dokumentuje dług techniczny i ryzyka strukturalne: `context/changes/cv-flow-analysis/research.md` (② Feature overview + ③ Technical debt, zweryfikowane ast-grep). Ta zmiana odpowiada na pytanie, które tamta analiza celowo zostawiła otwarte: KTÓRE z tych problemów warto naprawić, w jakim docelowym kształcie i w jakiej kolejności. Eksplorujemy każdy zapisany problem w kodzie i historii, a potem porządkujemy je jako refactor opportunities.

Zmiana przebiega etapami: eksploracja → decyzja i plan → implementacja. **Na etapie eksploracji nie dzieje się żaden refaktor i nie zapada żadna decyzja.**

Wynik eksploracji: `research.md` tej zmiany, zakończony rankingiem opcji z trade-offami. Najpierw człowiek przeczyta raport; decyzja, co realizujemy, zapada na etapie planowania (`/10x-plan`), a refaktor rusza dopiero według przyjętego planu.
