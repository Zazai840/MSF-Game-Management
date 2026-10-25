# Today's lead code joins on its own

Until the race flow, a phone joined with the Olympics password, then a lead signed in by typing the lead code as well (`/api/lead-sign-in` needs the pass and the code). The race flow's Join (race-flow.md screen 1) is one form: a code, a full name and a job, where "Zone lead? Type the lead code instead of the day code." So `POST /api/join` accepts today's lead code alone and signs the phone in as Lead, never refusing a name (a name held on another phone is numbered, as Lead sign-in already did). It answers with the Olympics pass too, so the phone can tap its name next time.

The lead code was already a day secret given only to leads, at least as strong as the Olympics password (6 random characters, made afresh by Start new day and by New lead code, which also demotes every other lead). Join's wrong codes share the Olympics password's backoff per address, so the lead code gains no new guessing surface.

## Consequences

- Anyone who has the lead code can join as a lead without the Olympics password. Give the lead code only to leads, as before; changing it still demotes the other leads.
- The Olympics password stays the volunteers' way in: a new name makes a profile, a name this phone holds signs in again, and a name held on another phone is refused as taken, with That's me.
- `/api/password`, `/api/owner-sign-in`, `/api/profiles` and `/api/lead-sign-in` stay for older builds and the tests; the app now joins through `/api/join`.
