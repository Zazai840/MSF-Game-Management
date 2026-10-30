# Testing

How to run and write this repo's tests so they agree with CI. Commands and scripts live in `package.json`; this file holds what they don't say.

## Before the first run

- **A fresh worktree needs `npm ci`.** Worktrees share no `node_modules`; ESLint, vitest and Playwright fail to start without it.
- **CI runs Node 22** (`.github/workflows/verify.yml`); your default Node may be newer. When a test fails only for you, or only in CI, run it under Node 22 before debugging: `PATH="$HOME/.nvm/versions/node/v22.18.0/bin:$PATH" npm test -- <file>` (any installed 22.x under `~/.nvm/versions/node/` works).

## Unit and API tests

`npm test -- <files>` makes its own Postgres database for the run and drops it after, so worktrees run at once without clashing. `GLOSSARY.md` and the design system are checked here too:

- `tests/glossary-words.test.ts` fails when a screen shows a word a glossary entry lists under _Avoid_. Use the glossary's term. A word that is plain English there, or on a screen a spec left alone, goes on its allow-list with a one-line reason.
- `tests/design-system-lengths.test.ts` fails when race-flow CSS (`src/client/races/*.css`) uses a pixel length off its token scale in `docs/running-zone-design-system/tokens.json`. Use a `var(--space-*)`, `--radius-*` or `--size-*` token; a deliberate exception goes on its allow-list with a reason.

## End-to-end tests

- **Each run picks a free port and builds into its own folder**, so parallel worktrees run Playwright at once.
- **Run the specs your change touches, on all three projects**: `npx playwright test e2e/<spec>.ts` runs iPhone, Android and desktop together. A string you changed may be asserted elsewhere: `grep -rl "<old words>" e2e` and run those specs too. CI runs the full suite on the PR, one job per project.
- **Every spec shares one test day**, so each test owns what it creates:
  - names from `ownName('Words')` (adds the project and the `--repeat-each` pass). A join or sign-in that reuses another test's name fails at once, naming both tests.
  - event codes from `ownCode()`, events from `ownEvent`, relays from `ownRelay`, children from `ownWristbands`.
- **Press with `press(locator)`**: it taps on the phone projects and clicks on desktop. Lint rejects `.tap(` in `e2e/`.
- **Look checks**: call `expect(await lookProblems(page)).toEqual([])` on each new screen or state. It measures 44px targets, contrast, the design system's approved colour pairs (`docs/running-zone-design-system/accessibility.md`) on race-flow screens, and the older screens' house style. A failure names the element: fix the screen to the design system rather than the check.
- **Check a fix holds on repeat**: `npx playwright test e2e/<spec>.ts --repeat-each=2` shows a test owns its data.
