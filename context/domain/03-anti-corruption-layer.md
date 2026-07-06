---
title: Anti-Corruption Layer JobRadar — izolacja SDK `openai` (transport z.ai/GLM) za wąskim portem domenowym
created: 2026-07-05
type: refactor-plan
---

# Anti-Corruption Layer — przeciekający pakiet `openai` (transport do z.ai/GLM)

> Produkt tego dokumentu to PLAN refaktoru, nie kod. Kod produkcyjny pozostaje nietknięty.
> Każdy cytat `plik:linia` został zweryfikowany przez otwarcie pliku w tej sesji — numery są
> rzeczywiste. Artefakty `01-domain-distillation.md` i `02-invariant-aggregate-refactor.md` były
> materiałem pomocniczym; przeciek zdiagnozowałem samodzielnie na kodzie i manifestach pakietów.
> Poprzednie kroki dotyczyły niezmiennika **JobScore** (świeżość + kompletność). Ten krok jest
> ortogonalny: dotyczy **granicy warstw** i przeciekającej **zależności zewnętrznej**, nie reguły biznesowej.

---

## KROK 0 — Kontekst (odkryty samodzielnie)

- **Stack (manifesty):**
  - Frontend + orkiestracja: Astro 6 + React 19 + TS (`package.json`) — zależności m.in.
    `@supabase/supabase-js`, `@supabase/ssr`.
  - Backend AI/CV: FastAPI (Python ≥3.13, `backend/pyproject.toml`) — zależności zewnętrzne:
    `openai>=1.0.0,<2.0.0`, `pypdf>=6.4.0`, `httpx`, `fastapi`, `slowapi`.
  - Persystencja: Supabase/Postgres (`supabase/migrations/*.sql`).
  - Zewnętrzny LLM: **z.ai (GLM)** — patrz niżej; wołany przez SDK `openai`.
- **Zależności-kandydatki na przeciek (z manifestów):** `@supabase/*` (TS), `openai` (Python),
  `pypdf` (Python).
- **Deklaracja wymienialności (sygnał intencja-vs-kod):** konfiguracja nazwana jest
  **provider-agnostycznie** — `ai_provider_api_key` (`backend/app/core/config.py:45`) i
  `ai_model_id` (domyślnie `"GLM-4.5-Air"`, `config.py:46`). Nazwa „AI **provider**" sugeruje
  intencję: dostawca LLM ma być wymienialny. Kod tej intencji **nie dotrzymuje** — endpoint z.ai
  i sposób uwierzytelnienia (Zhipu JWT) są zaszyte na sztywno i zduplikowane w dwóch serwisach
  (KROK 3). W dokumentach (`tech-stack.md`, `README.md`) nie ma jawnego zdania „żeby dało się
  wymienić LLM"; jedynym nośnikiem tej intencji jest właśnie provider-agnostyczne nazewnictwo configu.

---

## KROK 1 — IDENTYFIKACJA przeciekających zależności

Przebiegłem trzy zależności zewnętrzne przez sygnały przecieku (import w wielu warstwach,
zduplikowana rekonstrukcja obiektów biblioteki, typy biblioteki w sygnaturach/kontraktach wire,
wołanie tego samego SDK po obu stronach granicy).

### Oś A — `openai` (SDK OpenAI użyte jako transport do z.ai/GLM)

Pakiet OpenAI jest wciśnięty do obsługi **nie-OpenAI** dostawcy (z.ai/Zhipu) przez własne
uwierzytelnienie JWT. Wszystkie pliki, które go dziś „znają":

| Plik:linia | Co przecieka |
| --- | --- |
| `backend/app/services/scoring.py:8` | `from openai import AsyncOpenAI, OpenAIError` |
| `backend/app/services/scoring.py:26-43` | `_zhipu_jwt(...)` — z.ai-specyficzne podpisywanie klucza `{id}.{secret}` → JWT |
| `backend/app/services/scoring.py:64-68` | walidacja formatu klucza `"." not in ...` (założenie z.ai) |
| `backend/app/services/scoring.py:70-71` | `AsyncOpenAI(base_url="https://api.z.ai/api/coding/paas/v4", api_key=token)` — endpoint zaszyty |
| `backend/app/services/scoring.py:82-83` | `except OpenAIError` → `HTTPException(502)` — **typ błędu biblioteki w warstwie serwisu** |
| `backend/app/services/scoring.py:85-90` | `response.choices[0].message.content` + zdejmowanie ```` ``` ```` — **surowy kształt wire biblioteki** |
| `backend/app/services/cover_letter.py:8` | `from openai import AsyncOpenAI, OpenAIError` (drugi raz) |
| `backend/app/services/cover_letter.py:21-38` | `_zhipu_jwt(...)` — **KOPIA 1:1** funkcji ze `scoring.py` |
| `backend/app/services/cover_letter.py:73-77` | walidacja formatu klucza — **duplikat** |
| `backend/app/services/cover_letter.py:79-84` | `AsyncOpenAI(base_url="https://api.z.ai/api/coding/paas/v4", ...)` — endpoint zaszyty (duplikat, +`timeout=90`) |
| `backend/app/services/cover_letter.py:95-98` | `except OpenAIError` → `HTTPException(502)` (duplikat) |
| `backend/app/services/cover_letter.py:100-108` | `response.choices[0].message.content` + zdejmowanie fence (duplikat) |
| `backend/tests/test_contracts.py:313-314` | `monkeypatch.setattr("app.services.scoring.AsyncOpenAI", ...)` — test musi patchować SDK **pod ścieżką serwisu** |
| `backend/tests/test_contracts.py:362-363, 434-435` | `monkeypatch.setattr("app.services.cover_letter.AsyncOpenAI", ...)` — patch pod **drugą** ścieżką |
| `backend/tests/test_contracts.py:304-309, 348-358` | testy odtwarzają kształt `completion.choices[0].message.content` — kształt wire wyciekł do testów |
| `backend/tests/test_contracts.py:533-540` | `from openai import OpenAIError` + patch — typ błędu biblioteki w teście |

**Warstwy dotknięte:** serwisy domenowe (2 pliki) + warstwa testów (1 plik, 3 osobne punkty patcha).
**Kluczowy objaw:** cała wiedza o z.ai (endpoint, JWT, kształt odpowiedzi, typ błędu) jest
**zduplikowana** między `scoring.py` a `cover_letter.py` — nie ma ani jednego miejsca prawdy.

### Oś B — `@supabase/*` (klient Supabase w TS)

| Plik:linia | Co przecieka |
| --- | --- |
| `src/lib/supabase.ts:1,9` | `createServerClient` — konstrukcja klienta (scentralizowana, jedno miejsce) |
| `src/lib/preferences.ts:1,19` | `getJobPreferences(supabase: SupabaseClient, ...)` — **typ biblioteki w sygnaturze domenowej** |
| `src/lib/saved-jobs.ts:1,9` | `getSavedJobs(supabase: SupabaseClient, ...)` — typ biblioteki w sygnaturze |
| `src/lib/cv-profile.ts:1,37,40` | `getCvProfile(supabase: SupabaseClient, ...)` + rzutowanie `SupabaseClient<Database>` |
| `src/lib/job-scores.ts:1,12` | `getJobScores(supabase: SupabaseClient, ...)` — typ biblioteki w sygnaturze |
| `src/pages/api/**` (8 route'ów) | `createClient(...)` w każdym route (`saved-jobs.ts`, `preferences.ts`, `cv/upload.ts`, `jobs/score-batch.ts`, `jobs/cover-letter.ts`, `auth/{signin,signup,signout}.ts`) |
| `src/pages/dashboard.astro:8,11` | `createClient(...)` — **warstwa UI** buduje zapytania inline |
| `src/middleware.ts:2,7` | `createClient(...)` w middleware |
| `src/env.d.ts:3` | `import("@supabase/supabase-js").User` w typie globalnym |
| `src/__tests__/**` | `SupabaseClient` w helperach i testach |

**Warstwy dotknięte:** UI (astro) + middleware + 4 biblioteki domenowe + 8 route'ów + testy (~15 plików).

### Oś C — `pypdf` (ekstrakcja CV)

| Plik:linia | Co przecieka |
| --- | --- |
| `backend/app/services/cv_extraction.py:5-6,97` | `from pypdf import PdfReader` / `PdfStreamError` / `PdfReader(BytesIO(...))` |

**Warstwy dotknięte:** jeden plik (jedna warstwa). Brak duplikacji, brak wycieku typu do sygnatur.
Odrzucony jako przeciek pomijalny.

---

## KROK 2 — KLASYFIKACJA i wybór #1

| Oś | (a) Warstwy / pliki | (b) Ryzyko/koszt wymiany dziś | (c) Deklarowana wymienialność (intencja-vs-kod) | Duplikacja rekonstrukcji |
| --- | --- | --- | --- | --- |
| **A — `openai`/z.ai** | 2 serwisy + 3 punkty w testach | **Realne i częste** — z.ai to wybór MVP; zmiana modelu/endpointu/dostawcy dotyka **dwóch** plików identycznie + logiki JWT | **TAK** — config nazwany `ai_provider_*` deklaruje agnostyczność, kod hardkoduje z.ai (`config.py:45-46` vs `scoring.py:71`/`cover_letter.py:81`) | **TAK, 1:1** — `_zhipu_jwt`, endpoint, walidacja klucza, unwrap odpowiedzi zduplikowane |
| B — `@supabase/*` | ~15 plików, 5 warstw (w tym UI) | **Bardzo wysoki**, ale to *świadomie wybrana* podstawa (auth+storage+db+RLS) — nie ma jej wymieniać | **NIE** — Supabase to zadeklarowany filar stacku (`tech-stack.md:29`), zero deklaracji wymiany | **NIE** — konstrukcja scentralizowana w `src/lib/supabase.ts:createClient`; wycieka *typ* i *API zapytań*, nie konstrukcja |
| C — `pypdf` | 1 plik | Niski | Brak | Brak |

### Wybór #1 — `openai` (SDK jako transport do z.ai/GLM)

**Wybieram oś A jako najgorszy przeciek do naprawy ACL-em.** Uzasadnienie względem trzech osi:

1. **Duplikacja rekonstrukcji biblioteki (rozstrzygający sygnał ACL).** `scoring.py` i
   `cover_letter.py` zawierają **werbatimową kopię** `_zhipu_jwt` (`scoring.py:26-43` ≡
   `cover_letter.py:21-38`), ten sam zaszyty `base_url`, tę samą walidację klucza i ten sam
   unwrap `response.choices[0].message.content`. To definicja przecieku: wiedza o kształcie
   zależności rozlana po wielu miejscach bez pojedynczego źródła prawdy. Supabase tego nie ma —
   jego konstrukcja jest już w jednym pliku.

2. **Rozjazd intencja-vs-kod (mocny sygnał wg zadania).** Config deklaruje dostawcę jako
   wymienialny (`ai_provider_api_key`, `ai_model_id` — `config.py:45-46`), ale kod przybija
   z.ai gwoździami w dwóch serwisach. Supabase przeciwnie — jest zadeklarowanym, niewymienialnym
   filarem; jego „przeciek" jest oczekiwaną ceną wyboru stacku, nie rozjazdem.

3. **Typ biblioteki w warstwie domenowej i w kontrakcie wire.** `OpenAIError` łapany wprost w
   serwisach (`scoring.py:82`, `cover_letter.py:95`), a surowy kształt `completion.choices[0]
   .message.content` parsowany w serwisach i **odtwarzany w testach** (`test_contracts.py:304-309`).
   Warstwa domenowa i testy wiedzą, że pod spodem jest OpenAI-owy protokół — czego przy z.ai jako
   *implementacji* nie powinny wiedzieć.

4. **Tractability + czystość dowodu.** ACL nad transportem LLM to **jeden wąski port + jeden
   adapter**; kryterium sukcesu jest jednoznaczne (`grep openai` → tylko adapter). ACL nad
   Supabase to repozytorium-per-agregat — znacznie większy, rozmyty refaktor, słabo pasujący do
   pojedynczego kroku.

**Supabase (oś B) traktuję jako udokumentowanego runner-upa**, nie #1: jest szerszy liczbą plików,
ale (i) nie ma duplikacji konstrukcji, (ii) nie ma deklaracji wymienialności, (iii) to persystencyjny
fundament, którego ACL jest osobnym, większym ćwiczeniem (repozytoria). `SupabaseClient` w sygnaturach
4 bibliotek domenowych to realny dług — ale nie „najgorszy przeciek" w sensie ACL, bo nikt tej
zależności nie zamierza wymieniać, a jej rekonstrukcja nie jest rozsmarowana.

---

## KROK 3 — DIAGNOZA (duplikacja + przecieki przez granice)

### 3.1 Duplikacja 1:1 — `_zhipu_jwt` (autoryzacja z.ai)

`scoring.py:26-43`:
```python
def _zhipu_jwt(api_key: str) -> str:
    api_key_id, api_secret = api_key.split(".", 1)
    ts_ms = int(time.time() * 1000)
    ...
    header = _b64url({"alg": "HS256", "sign_type": "SIGN"})
    payload = _b64url({"api_key": api_key_id, "exp": ts_ms + 3_600_000, "timestamp": ts_ms})
    ...
```
`cover_letter.py:21-38` — **znak w znak ta sama funkcja**. Zmiana algorytmu podpisu, czasu życia
tokenu czy formatu klucza wymaga edycji **dwóch** miejsc; rozjazd między nimi jest kwestią czasu.

### 3.2 Duplikacja — endpoint i konstrukcja klienta

- `scoring.py:70-71`: `token = _zhipu_jwt(...)` → `AsyncOpenAI(base_url="https://api.z.ai/api/coding/paas/v4", api_key=token)`.
- `cover_letter.py:79-84`: identyczny `base_url`, dodatkowo `timeout=90.0`.

Endpoint z.ai żyje w dwóch stałych literałach. „Provider-agnostyczny" config (`config.py:45-46`)
nie ma żadnego pola na `base_url` — dostawca **nie jest** faktycznie wymienialny bez edycji kodu.

### 3.3 Duplikacja — walidacja klucza (założenie z.ai wyciekło do reguły serwisu)

`scoring.py:64-68` i `cover_letter.py:73-77`: oba serwisy sprawdzają
`if "." not in settings.ai_provider_api_key` i rzucają 503 „must be in '{id}.{secret}' format".
To założenie **specyficzne dla z.ai/Zhipu** (klucz `{id}.{secret}`) — inny dostawca ma inny format,
a mimo to warunek jest wpisany w dwa serwisy domenowe.

### 3.4 Przeciek typu błędu biblioteki przez granicę

`scoring.py:82-83` i `cover_letter.py:95-98`: `except OpenAIError as exc: raise HTTPException(502, ...)`.
Serwis domenowy importuje i łapie **typ wyjątku z SDK**. Gdyby transport przeszedł np. na `httpx`
albo na inny SDK, ten `except` przestaje cokolwiek łapać — cicho, bez błędu kompilacji.

### 3.5 Przeciek kształtu wire (kontrakt odpowiedzi biblioteki)

`scoring.py:85-90` i `cover_letter.py:100-108`: `response.choices[0].message.content` + zdejmowanie
markdownowych ```` ``` ````. Domena parsuje **wewnętrzny kształt odpowiedzi OpenAI Chat Completions**.
Ten sam kształt jest odtworzony w testach (`test_contracts.py:304-309, 348-358`:
`mock_completion.choices = [mock_choice]`, `mock_message.content = ...`), więc test także „wie",
że pod spodem jest OpenAI.

### 3.6 Przeciek do warstwy testów (podwójny punkt patcha)

Bo SDK jest importowany w każdym serwisie osobno, testy muszą patchować go pod **dwiema różnymi
ścieżkami**: `app.services.scoring.AsyncOpenAI` (`test_contracts.py:314`) oraz
`app.services.cover_letter.AsyncOpenAI` (`:363, :435`). Każdy nowy konsument LLM = kolejny punkt patcha.

### 3.7 Rozjazd intencja-vs-kod (cytat)

- Intencja (kod configu): `ai_provider_api_key` — `config.py:45`; `ai_model_id` (default
  `"GLM-4.5-Air"`) — `config.py:46`. Nazewnictwo „provider" + „model_id" deklaruje wymienialnego dostawcę.
- Rzeczywistość: brak pola `base_url`, brak abstrakcji auth; z.ai zaszyte w `scoring.py:71` i
  `cover_letter.py:81`, autoryzacja z.ai w `_zhipu_jwt` ×2. **Kod nie dotrzymuje deklaracji configu.**

---

## KROK 4 — PROJEKT ACL

### Zasada umiejscowienia

Cała wiedza o z.ai/OpenAI ma zamieszkać w **jednym adapterze**. Serwisy domenowe (`scoring`,
`cover_letter`) mają znać wyłącznie **wąski port** `ChatModel`, mówiący językiem domeny
(system+user prompt, temperatura → czysty tekst), nigdy typami biblioteki. Budowanie promptów
(`_build_user_message`) i parsowanie JSON-a scoringowego do `JobScoringResponse` **zostaje w
domenie** — to logika produktu, nie transport.

Proponowany układ plików (nowy katalog `backend/app/adapters/`):
```
backend/app/domain/chat_model.py        # PORT + domenowe błędy + value objecty (zero importu openai)
backend/app/adapters/zai_chat_adapter.py# JEDYNY plik znający openai + z.ai (endpoint, JWT, unwrap)
backend/app/adapters/__init__.py
```

### 4.1 Value object — `ZaiCredential` (jedyne miejsce wiedzy o kluczu z.ai)

Enkapsuluje założenie `{id}.{secret}` i konwersję do JWT — dziś rozlane po `scoring.py:26-43,64-68`
i `cover_letter.py:21-38,73-77`.

```python
# backend/app/adapters/zai_chat_adapter.py  (PSEUDOKOD — nie implementacja)

class ZaiCredential:
    """Jedyne miejsce znające format klucza z.ai i jego zamianę na JWT."""
    def __init__(self, raw_key: str) -> None:
        if "." not in raw_key:                       # walidacja z 2 serwisów → tu, raz
            raise LlmConfigError("AI_PROVIDER_API_KEY must be '{id}.{secret}'")
        self._id, self._secret = raw_key.split(".", 1)

    def as_jwt(self, ttl_ms: int = 3_600_000) -> str:  # dawne _zhipu_jwt (odduplikowane)
        ...  # HS256 SIGN, api_key/exp/timestamp — jedna implementacja
```

### 4.2 Port domenowy — `ChatModel` (wąski interfejs, zero typów biblioteki)

```python
# backend/app/domain/chat_model.py  (PSEUDOKOD)

class LlmConfigError(Exception): ...      # zastępuje 503 „missing/invalid key"
class LlmUnavailableError(Exception): ... # zastępuje przeciekający OpenAIError
class LlmEmptyResponseError(Exception): ...

@dataclass(frozen=True)
class ChatTurn:            # domenowy kształt zamiast dict-a OpenAI messages
    system: str
    user: str

class ChatModel(Protocol):
    async def complete(self, turn: ChatTurn, *, temperature: float,
                       timeout_s: float | None = None) -> str:
        """Zwraca CZYSTY tekst odpowiedzi. Rzuca wyłącznie błędy domenowe (Llm*)."""
        ...
```

Port zwraca `str` (gotowy tekst, po zdjęciu fence'ów) — konsument nigdy nie widzi
`choices[0].message.content` ani `OpenAIError`.

### 4.3 Adapter — `ZaiChatAdapter` (jedyny znający openai + z.ai)

```python
# backend/app/adapters/zai_chat_adapter.py  (PSEUDOKOD)
from openai import AsyncOpenAI, OpenAIError      # <-- JEDYNY import openai w całym repo

_ZAI_BASE_URL = "https://api.z.ai/api/coding/paas/v4"   # jedyny literał endpointu

class ZaiChatAdapter(ChatModel):
    def __init__(self, credential: ZaiCredential, model_id: str) -> None:
        self._credential = credential
        self._model_id = model_id

    async def complete(self, turn, *, temperature, timeout_s=None) -> str:
        client = AsyncOpenAI(base_url=_ZAI_BASE_URL,
                             api_key=self._credential.as_jwt(),
                             timeout=timeout_s)          # scoring: None, cover_letter: 90.0
        try:
            resp = await client.chat.completions.create(
                model=self._model_id,
                messages=[{"role": "system", "content": turn.system},
                          {"role": "user", "content": turn.user}],
                temperature=temperature)
        except OpenAIError as exc:                       # przeciek złapany TU, przetłumaczony
            raise LlmUnavailableError(str(exc)) from exc
        text = (resp.choices[0].message.content or "").strip()  # unwrap wire TU
        if text.startswith("```"):                       # z.ai/LLM quirk — TU, raz
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        if not text:
            raise LlmEmptyResponseError()
        return text
```

### 4.4 Provider (FastAPI DI) — jeden seam do wstrzyknięcia/podmiany

```python
# backend/app/adapters/zai_chat_adapter.py  (PSEUDOKOD)
def get_chat_model(settings: Annotated[Settings, Depends(get_settings)]) -> ChatModel:
    if not settings.ai_provider_api_key:
        raise LlmConfigError("AI provider not configured")
    return ZaiChatAdapter(ZaiCredential(settings.ai_provider_api_key), settings.ai_model_id)
```

### 4.5 Serwisy po refaktorze — znają tylko port

```python
# backend/app/services/scoring.py  (PSEUDOKOD docelowy)
async def score_job(job, profile, chat: ChatModel) -> JobScoringResponse:
    turn = ChatTurn(system=_SYSTEM_PROMPT, user=_build_user_message(job, profile))
    raw = await chat.complete(turn, temperature=0.2)     # zero openai, zero z.ai, zero JWT
    data = json.loads(_strip_or_raise(raw))              # parsowanie DOMENOWE zostaje
    return JobScoringResponse.model_validate(data)
```
`cover_letter.py` analogicznie: `await chat.complete(turn, temperature=0.7, timeout_s=90.0)`.
Route'y (`api/routes/scoring.py`, `api/routes/cover_letter.py`) wstrzykują
`chat: Annotated[ChatModel, Depends(get_chat_model)]` zamiast `settings`.

### 4.6 Mapowanie błędów domenowych na HTTP (jedno miejsce)

| Błąd domenowy | Zastępuje dzisiejsze | HTTP | Gdzie mapowane |
| --- | --- | --- | --- |
| `LlmConfigError` | `scoring.py:60-68`, `cover_letter.py:68-77` (503 ×2) | 503 | exception handler / route |
| `LlmUnavailableError` | `except OpenAIError → 502` (`scoring.py:82`, `cover_letter.py:95`) | 502 | exception handler |
| `LlmEmptyResponseError` | `cover_letter.py:101-104` (502 pusty tekst) | 502 | exception handler |

---

## KROK 5 — DOWÓD IZOLACJI + before/after

### 5.1 Dowód: wymiana biblioteki dotyka tylko adaptera

Po refaktorze podmiana z.ai → inny dostawca (albo `openai` → `httpx`) wymaga edycji **wyłącznie**
`backend/app/adapters/zai_chat_adapter.py` (+ ewentualnie nowy adapter i jedna linia w
`get_chat_model`). Nie dotyka:
- tabel/migracji (`supabase/migrations/*`) — transport LLM nie ma persystencji; **0 zmian**,
- API route'ów (`api/routes/scoring.py`, `cover_letter.py`) — mówią portem; **0 zmian**,
- schematów wire (`schemas/scoring.py`, `schemas/ai.py`) — kontrakt HTTP niezależny od dostawcy; **0 zmian**,
- promptów i logiki domenowej w serwisach — parsowanie/budowa promptu zostaje; **0 zmian transportowych**,
- UI/TS — backend to czarna skrzynka za HTTP; **0 zmian**.

### 5.2 Before / After (każde dzisiejsze miejsce wiedzy)

| Miejsce | Before (dziś) | After (ACL) |
| --- | --- | --- |
| `scoring.py:8`, `cover_letter.py:8` | `import openai` ×2 | brak — import tylko w adapterze |
| `scoring.py:26-43` ≡ `cover_letter.py:21-38` | `_zhipu_jwt` skopiowany ×2 | `ZaiCredential.as_jwt` — jedna implementacja |
| `scoring.py:64-68` ≡ `cover_letter.py:73-77` | walidacja `{id}.{secret}` ×2 | konstruktor `ZaiCredential` — raz |
| `scoring.py:71`, `cover_letter.py:81` | `base_url="https://api.z.ai/..."` ×2 | `_ZAI_BASE_URL` w adapterze — raz |
| `scoring.py:82`, `cover_letter.py:95` | `except OpenAIError` w serwisie | `except OpenAIError` tylko w adapterze → `LlmUnavailableError` |
| `scoring.py:85-90`, `cover_letter.py:100-108` | `resp.choices[0].message.content` + fence w serwisie | unwrap w adapterze; serwis dostaje `str` |
| `api/routes/*.py` (Depends `settings`) | serwis buduje klienta z `settings` | route wstrzykuje `ChatModel` (Depends `get_chat_model`) |
| `test_contracts.py:314,363,435` | patch `AsyncOpenAI` pod 2 ścieżkami serwisów | podmiana **portu** `ChatModel` w jednym seamie DI |

Warstwa konsumenta (serwis/route) dostaje **gotowy `str` domenowy**, nie surowy obiekt `ChatCompletion`.

### 5.3 Rozstrzygnięcie pytań zależnych od kontraktu biblioteki

- **Auth z.ai przez openai:** z.ai jest OpenAI-kompatybilny na warstwie `chat.completions`, ale
  wymaga **JWT z klucza `{id}.{secret}` (HS256, `sign_type: SIGN`, exp 1h)** — nie surowego klucza
  API. Ta decyzja ma żyć w `ZaiCredential.as_jwt` (adapter), nie w warstwie route/serwisu.
  (Zgodne z notatką projektową o z.ai: base URL + JWT z `{id}.{secret}`.)
- **Fence-stripping odpowiedzi:** to quirk wyjścia LLM, nie kontrakt HTTP produktu — należy do
  adaptera; scoringowy `json.loads` (interpretacja treści) zostaje w domenie.
- **`timeout`:** różnica scoring(none)/cover_letter(90s) to parametr wywołania portu
  (`timeout_s`), nie osobny klient — decyzja w sygnaturze `complete`.
- **Rekonstrukcja klienta per-call:** JWT wygasa po 1h, więc budowa klienta przy każdym wywołaniu
  jest bezpieczna; jeśli kiedyś dojdzie caching, żyje w adapterze — niewidoczny dla domeny.

---

## KROK 6 — WERYFIKACJA i plan faz

### Kryterium sukcesu (sprawdzalne komendą)

```
grep -rn -E "openai|api\.z\.ai|_zhipu_jwt|choices\[0\]" backend/app --include=*.py
```
- **Dziś:** trafienia w `backend/app/services/scoring.py` i `backend/app/services/cover_letter.py`
  (import, `_zhipu_jwt`, `base_url`, `OpenAIError`, `choices[0]`).
- **Po refaktorze (oczekiwane):** wyłącznie `backend/app/adapters/zai_chat_adapter.py`. Zero trafień
  w `backend/app/services/**` i `backend/app/api/**`.

Uzupełniająco (testy):
```
grep -rn "AsyncOpenAI" backend/tests --include=*.py
```
- **Dziś:** patch pod `app.services.scoring.AsyncOpenAI` i `app.services.cover_letter.AsyncOpenAI`
  (3 miejsca).
- **Po refaktorze:** tylko test adaptera; testy serwisów podmieniają port `ChatModel` (0 patchy `AsyncOpenAI`).

### Pliki: kto zna zależność dziś vs po refaktorze

| Plik | Zna `openai`/z.ai dziś | Po refaktorze |
| --- | --- | --- |
| `backend/app/services/scoring.py` | TAK | NIE (zna `ChatModel`) |
| `backend/app/services/cover_letter.py` | TAK | NIE (zna `ChatModel`) |
| `backend/app/api/routes/scoring.py` | pośrednio (buduje przez settings) | NIE (wstrzykuje port) |
| `backend/app/api/routes/cover_letter.py` | pośrednio | NIE |
| `backend/tests/test_contracts.py` | TAK (2 ścieżki + `OpenAIError`) | NIE (mock portu) |
| `backend/app/adapters/zai_chat_adapter.py` | — (nie istnieje) | **TAK — jedyny** |

### Plan faz (test-first: pytest w `backend/tests/`)

- **Faza 1 — Port + błędy domenowe (test-first).** `ChatModel`/`ChatTurn`/`Llm*Error` w
  `app/domain/chat_model.py`; test kontraktu portu na fake'u. RED→GREEN.
- **Faza 2 — Adapter + `ZaiCredential` (test-first).** `ZaiChatAdapter` + odduplikowany `as_jwt`;
  testy: (a) `as_jwt` daje poprawny JWT dla `{id}.{secret}`, (b) `OpenAIError` → `LlmUnavailableError`,
  (c) fence-stripping, (d) pusta treść → `LlmEmptyResponseError`. Patch `AsyncOpenAI` **tylko tutaj**.
- **Faza 3 — Przepięcie `scoring.py` na port.** Serwis przyjmuje `ChatModel`; usunięcie `_zhipu_jwt`,
  importu openai, `base_url`, `except OpenAIError`, unwrapu. Route wstrzykuje `get_chat_model`.
  Przepisać `test_contracts.py` scoring na mock portu.
- **Faza 4 — Przepięcie `cover_letter.py` na port (bliźniak).** To samo; `timeout_s=90.0` przez port.
- **Faza 5 — Weryfikacja izolacji.** Uruchomić grep z kryterium sukcesu; potwierdzić 0 trafień poza
  adapterem oraz zielony `pytest`.
- **Faza 6 (opcjonalna) — Domknięcie deklaracji configu.** Dodać `AI_PROVIDER_BASE_URL` do
  `Settings` i przekazać do adaptera, by „provider-agnostyczny" config faktycznie nim był
  (usuwa ostatni zaszyty literał). Poza rdzeniem ACL.

### Nowe „load-bearing" nazwy (rejestr `docs/reference/contract-surfaces.md` — nie istnieje, zweryfikowane)

- `ChatModel` (port) — `backend/app/domain/chat_model.py`
- `ChatTurn`, `LlmConfigError`, `LlmUnavailableError`, `LlmEmptyResponseError`
- `ZaiChatAdapter`, `ZaiCredential`, `get_chat_model` — `backend/app/adapters/zai_chat_adapter.py`

---

## Ograniczenia

- Plan, nie implementacja — kod produkcyjny nietknięty.
- Cytaty ograniczone do `plik:linia` otwartych i zweryfikowanych w tej sesji.
- Supabase (oś B) świadomie zostawiony jako runner-up: realny dług (typ w sygnaturach 4 bibliotek),
  ale osobne, większe ćwiczenie (repozytoria) i brak deklaracji wymienialności — nie #1 dla ACL.
- Fail-fast konsekwentny: nielegalna konfiguracja/odpowiedź LLM rzuca błąd domenowy mapowany na
  503/502, nie „log i jedź dalej".
