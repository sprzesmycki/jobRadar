# Mom Test Validation Plan

## Input Idea

Digest "co-w-toku" (kandydat S1 z `opportunity-map.md`): read-only raport MD łączący `context/changes/*/change.md` (deklarowany status), `git status`/`git log` (untracked/modified) i `context/archive/` (domknięte) → widok "w toku / rozjazd / świeże nieśledzone / ostatnio domknięte".

Odbiorca: **solo** (jedna osoba prowadzi to repo i toolkit `/10x-*`). Walidacja = szczera introspekcja na twardych śladach, nie ankieta.

## Hypotheses

- **User/rola**: programista prowadzący projekt przez toolkit `/10x-*`; w tym repo realnie jedna osoba.
- **Friction**: po kilku dniach trudno powiedzieć, co w toku / domknięte i czy `context/` zgadza się z gitem.
- **Current workaround**: `git status`/`git log` + ręczne otwieranie `context/changes/` vs `context/archive/`; `/10x-archive` stempluje zamknięcie.
- **Risky assumptions**:
  1. Że tarcie powtarza się na tyle często, by zasłużyć na stałe narzędzie (a nie jednorazowy bałagan).
  2. Że `git status` sam nie wystarcza (ryzyko: daje już 90% wartości).
  3. Że digest dodaje coś ponad `/10x-archive`.
  4. Że "rozjazd status vs git" realnie się zdarza i boli, a nie jest teoretyczny.
- **Evidence already present**: cienkie — 1 otwarta zmiana (`spr-12`), 12 zarchiwizowanych, 7 untracked docs + 2 modified teraz. Zdjęcie stanu, nie wzorzec w czasie.

## Critique

1. **Zespół = 1.** Mom Test opiera się na rozmowach z ludźmi żyjącymi z tarciem; tu tym człowiekiem jesteś głównie Ty. Ankieta odpada; introspekcja kłamie łatwiej niż rozmówca, więc dowodem muszą być twarde ślady (git log), nie opinia.
2. **`git status` to mocny konkurent.** Wartość S1 miała być w połączeniu deklarowanego statusu z `change.md` z realnym stanem gita — ale to działa tylko, jeśli status w `change.md` bywa nieaktualny. Jeśli zawsze archiwizujesz od razu przez `/10x-archive`, "rozjazd" nie istnieje.
3. **Solution-in-search-of-a-problem.** "Poranny digest" to sztandarowy przykład z lekcji — ryzyko, że wybrany, bo pasuje do lekcji, a nie bo realnie ugryzł. Dowodem jest konkretna ostatnia sytuacja, nie "byłoby miło".

## Interview Guide

Self-review — każde pytanie ma dowód-do-sprawdzenia; brak konkretnej sytuacji z ~2 tygodni = sygnał "nie buduj jeszcze".

1. Kiedy ostatnio otworzyłeś `context/changes` + `git status` + archiwum, żeby ustalić "co w toku"? (dowód: konkretny dzień)
2. Ile razy w ostatnim tygodniu? (dowód: `git log --oneline -20` — archive/status commity vs dni pracy)
3. Czy `change.md` mówił "done", a pliki wisiały niezacommitowane (lub odwrotnie)? (dowód: 2-3 ostatnie archiwizacje)
4. Co Cię to kosztowało — minuty, zdublowana praca, zapomniana zmiana? Czy "zapomniałem zarchiwizować" się wydarzyło?
5. Czy `git status -sb` + `ls context/changes` nie dały 90% odpowiedzi w 5 s? Czego brakowało?
6. Czy problem nie znika, jeśli dyscyplinujesz archiwizację od razu po merge?
7. 7 untracked docs teraz — jednorazowy zrzut lekcji czy powtarzalny wzorzec?
8. Co musiałoby się stać, żebyś sięgnął po digest jutro rano, a nie po `git status`?

## Survey

Nie dotyczy (odbiorca = solo). Zamiast ankiety — audyt własnych śladów (~30 min):

```bash
# 1. Jak często realnie archiwizujesz
git log --oneline --all --grep="archive" | wc -l

# 2. Czy zmiany długo wiszą otwarte
git log --format="%ci %s" | grep -iE "spr-|change" | head -20

# 3. Czy "rozjazd" istnieje teraz
git status -sb
```

Jeśli archiwizujesz regularnie i od ręki, a rozjazdów brak → problem jest istotny (nie przypadkowy), digest nie ma czego naprawiać.

## Decision Criteria

- **Proceed**: ≥2 konkretne sytuacje z ostatnich 2 tygodni, gdzie brak połączonego widoku kosztował czas/błąd, **i** `git status` sam ich nie łapał (rozjazd status↔pliki był realny).
- **Narrow scope**: ból realny, ale sprowadza się do jednej rzeczy (np. tylko untracked docs spoza zmian) → zbuduj jeden alias gita, nie digest.
- **Do not build yet**: brak choćby jednej konkretnej ostatniej sytuacji; główny argument to "byłoby miło". Wróć, gdy uzbiera się wzorzec.
- **Try existing tool/process first**: `git status -sb` + dyscyplina `/10x-archive` załatwiają 90% → użyj ich, odpuść budowę.
