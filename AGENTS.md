## Project

The MSF Olympics Running Zone app: volunteers' phones record races (start line, finish line, timer) and zone leads check results and download the Day export. `README.md` describes every screen.

- **Stack**: Fastify 5 server on Postgres (`pg`), React 19 screens built with Vite, TypeScript throughout. Unit and API tests in vitest (`tests/`), end-to-end in Playwright (`e2e/`).
- **Layout**: `src/server/` (routes and storage, one folder per area), `src/client/` (screens: `races/` and `flow/` for the race screen, `lead/` for lead screens, `shell/` for the frame), `src/shared/` (rules and wording both sides use, see `CODING_STANDARDS.md`).
- **Proof a change is done**: `npm run verify` (lint, tests, typecheck, build) is what CI runs, plus the e2e specs the change touches.

## Boundaries

- **Railway deploys `main` to production**, so a merge to `main` is a release. An effort's work lives on `integration/<name>` and reaches `main` once, after the owner reviews it.
- **No real names** of volunteers, leads or testers in issues, specs, PRs, commits or repo docs. Use job names (Start line, Finish line, Timer, zone lead) or invented names.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Testing

Running or writing tests (Node 22 like CI, e2e on all three projects, `ownName` / `press`, look checks): see `docs/agents/testing.md`.

### Coding standards

Reviewing a change: check it against `CODING_STANDARDS.md`.
