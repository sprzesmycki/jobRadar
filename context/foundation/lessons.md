# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Name the frontend before accepting a full-stack web stack

- **Context**: Stack selection and infrastructure planning for full-stack web applications.
- **Problem**: A backend starter was accepted as the web-app stack without an explicit frontend decision, which led to a deployed backend/admin smoke test instead of a usable product UI.
- **Rule**: Before accepting a stack, explicitly name the frontend architecture, backend architecture, hosting, data/storage layer, and what renders `/`. Do not treat a backend framework as a full-stack product decision unless the frontend surface is named and accepted.
- **Applies to**: research, plan, plan-review, implement, impl-review

## Document every 10x slice before moving on

- **Context**: 10x course work where project progress must be auditable step by step.
- **Problem**: Implementing a vertical slice directly in code without a matching `context/changes/<change-id>/` folder breaks the course flow and makes later review, Supabase work, deployment, and archiving harder to reconstruct.
- **Rule**: Every slice must have 10x documentation before the next operational step: `change.md`, `plan.md`, `plan-brief.md`, and progress state that reflects what is done vs. still pending. If code was written first, create a retroactive change folder immediately and mark completed/pending progress honestly.
- **Applies to**: all
