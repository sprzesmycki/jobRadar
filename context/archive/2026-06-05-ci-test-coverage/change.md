---
change_id: ci-test-coverage
title: Add tests to CI and add at least one user-facing test
status: archived
created: 2026-06-05
updated: 2026-06-05

archived_at: 2026-06-05T20:36:07Z
---

## Notes

Backend tests exist (test_contracts.py, test_cv_extraction.py) but CI only runs lint + build — pytest is never called. Certification requires at least one user-facing test and automated quality verification. Linear: SPR-14.
