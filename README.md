# Running Zone

The MSF Olympics Running Zone app. Children are identified only by wristband number; joined helpers use their own first names.

## Run locally

Install Docker with Compose. Copy `.env.example` to `.env`, choose an owner password and a database password, and put the URL-encoded database password in `DATABASE_URL`. Keep `.env` private; it is ignored by Git. The database hostname inside Compose is `database`.

Start the app and persistent Postgres database with one command:

```sh
docker compose up --build
```

Open http://localhost:3000. When no Olympics day exists, join with the owner password and your first name. This starts the day as a scoring team member. Open Lead → Day to read the day code for volunteers and the lead code. Later joins use the day code and an unused first name. The phone stays joined through reloads.

`docker compose down` stops the app and keeps the day's data. `APP_PORT` and `DATABASE_PORT` in `.env` can change the default host ports (3000 and 5433). Rebuilding does not clear the day. The database password must match the value used to initialise the persistent database volume.

For fast development, install Node.js 22.12+ and Postgres, run `npm ci`, then provide `DATABASE_URL` and `OWNER_PASSWORD` as environment settings and run `npm run dev`. The server serves the API and Vite screens together at port 3000; `HOST` and `PORT` are optional. For a production build, run `npm run build`, then `NODE_ENV=production npm start` with those same required settings. There is no default owner password or application database connection.

The Day tab starts with the 20 individual events from the scoring template. Scoring team members can rename events, add an event with its section and event format, and switch events off or back on. Confirm the event list after checking it; any setup change asks you to confirm again. Switched-off events remain visible on Day and are omitted from volunteer event choices.

## Check changes

```sh
npm ci
npm run verify
npx playwright install chromium
npm run test:e2e
```

The default test database connection is local Postgres on port 5432 using your operating-system username. Set `PG_ADMIN_URL` to a Postgres connection with database-creation permission if yours differs. If using the Compose database from the host, it is `postgresql://running:YOUR_URL_ENCODED_DATABASE_PASSWORD@localhost:5433/postgres`.

`npm test` creates a fresh process-specific Postgres database, runs HTTP API tests in-process against it and plain results-rule unit tests, then drops that generated database. Different worktrees can run tests concurrently. `TEST_DATABASE_URL` or `TEST_DATABASE_NAME` selects a retained test database; only names matching `msf_spec22_<digits>_test` or `msf_spec22_<digits>_e2e` may be cleared. Never use an application database for tests. Test files run sequentially because each HTTP test resets its isolated day's state.

Playwright builds and starts a production app on port 4323 with a fresh, isolated database and runs at iPhone, Android and desktop viewport sizes. Override `E2E_PORT` for concurrent browser runs; optional `E2E_DATABASE_URL` / `E2E_DATABASE_NAME` select a dedicated test database. Browser databases are retained after the run for inspection. Phone sizes use Chromium; real Safari and Samsung Internet checks belong to the rehearsal. Screenshots and failed traces appear in ignored `test-results/`.

The build measures all statically imported first-load JavaScript after gzip and fails above 100,000 bytes. The Lead screen is a dynamic import and is fetched only when an authorised phone opens it. No component library or CSS framework is used.

## Module boundaries

- `createApp(settings)` opens Postgres and returns a Fastify instance for HTTP tests or the web server. Settings hold the database URL and owner password. `resetTestDay` is restricted to isolated test database names.
- Register authenticated HTTP actions through `actions(app, pool)(method, path, minimumLevel, handler)`. It authenticates the phone and enforces the shared Volunteer → Lead → Scoring team ladder before calling the handler. Domain refusals use `Refusal(status, message)`.
- `GET /api/me` returns `{id, name, level}`. `POST /api/join` accepts `{code, name}` and returns `{token, phone}`. `POST /api/become-lead` accepts `{code}`. Tokens are random, stored as hashes on the server and held in browser storage on the phone.
- `GET /api/home` returns the phone and job waiting counts, plus `needsYou` only for leads. `GET /api/lead` requires Lead; `GET /api/day` requires Scoring team and returns the codes. Race jobs and results are placeholders for subsequent tickets.
- `GET /api/events` is a volunteer read returning enabled events. Day also returns all events, `eventsConfirmed`, and `revision`. Scoring-team setup actions are `POST /api/day/confirm-events`, `POST /api/day/events` (`code`, `name`, `section`, `format`), `POST /api/day/events/:code/rename` (`name`), and `POST /api/day/events/:code/enabled` (`enabled`). Event IDs remain stable when names change. Setup writes and day revision increments share one transaction; changing the programme clears its confirmation.
- `src/shared/results-rules.ts` establishes the pure results boundary. Subsequent rules work extends its empty-event output and shared state without introducing I/O.
- `src/client/api.ts` is the browser HTTP boundary and clears this app's saved browser data when a phone is refused as removed. `App.tsx` polls the home read every five seconds and refreshes when the screen becomes visible. The Lead screen polls its own read.
