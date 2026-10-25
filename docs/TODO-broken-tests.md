# TODO: fix the tests broken by the race flow

The race flow (ADR 0003) made the race screen relay-only: `/api/race-screen/:code` now refuses individual events with
"Open this race from Races", and `tests/support/races.ts` drives individual events through the race-flow routes
(`/api/races/...`). Tests below still assume the old race screen for individual events (holds, Submit Race presses,
`asked`/`pressed`/`lastSaved`/`holds` on the helper's `screen()`, or direct `/api/race-screen/R4/...` calls). Each needs
porting to the race-flow routes (see `tests/race-flow-steps.test.ts` for the pattern) or, for hold behaviour, to a relay
(see `tests/relay-race-screen.test.ts`).

Status when this was written: not yet confirmed by a full run; the list comes from typecheck errors and a search for
old-route calls on individual event codes.

## Fail to typecheck (use the old helper shape)
- [ ] `tests/current-race-rulings.test.ts`: reads `screen().holds`
- [ ] `tests/no-final-rulings.test.ts`: reads `screen().holds`; uses `setup.write(...,'take-over'|'absent')` on R4
- [ ] `tests/reset.test.ts`: reads `submit().pressed`; old `/api/race-screen/R7/order`
- [ ] `tests/storage-upgrade.test.ts`: reads `screen().holds`, expects `submit()` to answer the next heat and `lastSaved`

## Call old race-screen routes on individual events
- [ ] `tests/race-screen-stream.test.ts`: whole file; port the stream engine tests (heartbeat, limit, refusals, new day, shutdown) to `/api/live/races/:raceId`, and the Home stream tests to relays or `/api/live/races`
- [ ] `tests/final-rulings.test.ts`: `/api/race-screen/R3/...` hold, absent, check-in
- [ ] `tests/stage-rulings.test.ts`: `/api/race-screen/R16/...` writes after stage complete
- [ ] `tests/export.test.ts`: `/api/race-screen/R3/hold` and `/absent` on the final
- [ ] `tests/runner-cap.test.ts`: `/api/race-screen/R4/times`
- [ ] `tests/race-rulings.test.ts`: reads `/api/race-screen/R10` after a re-run
- [ ] `tests/rulings.test.ts`, `tests/phone-management.test.ts`: GET `/api/race-screen/R4`
- [ ] `tests/runner-rulings.test.ts`, `tests/build-id.test.ts`: check their race-screen calls

## Known flaky on the local Podman database
- [ ] `tests/storage-upgrade.test.ts` and `tests/test-db.test.ts` time out in CREATE/DROP DATABASE during a full run; they pass alone

## Not run at all
- [ ] Every e2e spec (`npm run test:e2e`): needs `npx playwright install chromium`. Many drive the old Home tiles, Dashboard,
  To check, the old sign-in screens or the race screen on individual events, so expect most to need rewriting for the
  race flow and the Join form.
