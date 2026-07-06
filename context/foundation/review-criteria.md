# Code Review Criteria

Six scored dimensions. Each is scored 1–10 against the anchored states below; the reviewer
reads this file verbatim into the prompt at runtime.

## correctness

- **1:** The change is logically wrong — it breaks existing behavior, mishandles edge cases, or introduces a clear bug.
- **10:** The change does exactly what it intends, handles edge cases, and preserves existing behavior.

## idiomaticity

- **1:** Ignores the language and codebase conventions; fights the framework or reinvents provided utilities.
- **10:** Reads like the surrounding code — same naming, patterns, and idioms; uses standard/library facilities where appropriate.

## complexity

- **1:** Over-engineered or needlessly convoluted — speculative abstractions, deep nesting, or code far longer than the problem requires.
- **10:** The simplest solution that solves the problem; nothing speculative, easy to follow.

## test/risk coverage

- **1:** Risky logic ships with no tests and no safeguards; failure modes are unhandled.
- **10:** New behavior is covered by tests (or clearly justified as untestable) and risky paths have appropriate guards.

## documentation

- **1:** Non-obvious code carries no explanation; public interfaces are undocumented and names mislead.
- **10:** Intent is clear from names and, where needed, comments/docstrings; public surfaces are documented.

## security

- **1:** Introduces an exploitable flaw — injection, secret leakage, missing authz, or unsafe handling of untrusted input.
- **10:** Untrusted input is validated/parameterized, secrets stay out of code and logs, and authz is respected.
