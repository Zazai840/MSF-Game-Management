# Norman UX audit - Running Zone

## 1. Summary

- **Date:** 17 Oct 2026
- **Commit:** `a7de616` on branch `v2-polish` (front-end polish on top of v2, PR #55)
- **Scope:** every user-facing route: Join, Become lead, Home, the three volunteer jobs (Check in runners, Finishing order, Times), Dashboard (To check, Results, event page, race page, rulings sheets), Day setup (codes, Phones, Events, export, Start a new day).
- **Inputs besides code:** the 15 Oct client call with MSF (PDF transcript, speakers 1/3/4 are the scoring lead and MSF organisers) and the 16 Oct internal product call (pasted transcript).
- **Evidence type:** static code review only. No browser session was run, so nothing here is "Observed". Visual and mobile claims are marked "Not verified".

**Top 5 fixes by impact**

1. **F2** - Finishing order and Times open the oldest waiting race on their own, so a volunteer can record against the wrong race without ever choosing it. Show the race list first.
2. **F1** - One race is split across three separate job screens, reached only through Home. Make the race the first thing chosen, with Check in / Order / Times as tabs on it (the 16 Oct call agreed this).
3. **F3** - Relay events cannot be recorded at all. Needed by 30 Oct.
4. **F5** - Nothing tells a lead or the scoring team that an event's heats are all recorded; the "Heats complete" button sits at the bottom of a long event page.
5. **F4** - Who does what (zone lead vs scoring team) in the app is the opposite of what MSF described: the scoring team owns setup and rulings, but MSF want the zone lead to own setup and the scoring team mostly to watch results.

## 2. Users and journeys

**Roles** (from `GLOSSARY.md`, `src/server/access/permissions.ts`, and both calls)

| Role | Who | App level |
|---|---|---|
| Volunteer | Explorers aged 16-18; about 4 check-in and 4 finish/timing helpers | Volunteer |
| Zone lead | Running lead on the day (Mohammed, mentoring a successor) | Lead |
| Scoring team | Asem's team in the scoring tent, away from the track | Scoring team (a Lead plus setup, export, reset) |
| Owner | Whoever starts the first day with the owner password | becomes Scoring team |

**Journeys traced**

1. Join the day (day code + name) and, for leads, become lead.
2. Check in a heat at the start line (choose event and section, type wristbands, check, save).
3. Record a finishing order (choose race, tap runners in order, no-place runners, check, save).
4. Enter times from the photo finish (choose race, type digits per place, check, save).
5. Lead clears To check (open item, rule, see it leave the list).
6. Heats to final: mark heats complete, final line-up appears at the start line, attendance, call-up, final recorded, final complete.
7. Scoring team sets up the day (codes, events), downloads the day export, starts a new day.

**Assumptions**

- MSF's statements in the 15 Oct call are the best available description of the real workflow. The 16 Oct internal decisions (race first then job, one screen for order and times, export hidden away, relays in scope for 30 Oct) are treated as the intended direction.
- Phones are the main device for volunteers and zone leads; the scoring team may use a laptop.

## 3. Coverage

| Role | Journey | Routes / screens | Files | Status |
|---|---|---|---|---|
| All | Join, become lead | Join, Become lead | `src/client/access/Join.tsx`, `BecomeLead.tsx`, `src/server/access/routes.ts` | inspected |
| All | App shell, polling, update | header, nav, footer | `src/client/App.tsx`, `api.ts`, `shell/*` | inspected |
| Volunteer | Home | Home | `src/client/home/Home.tsx` | inspected |
| Volunteer | Check in | Start line job | `src/client/jobs/StartLine.tsx`, `useJobData.ts`, `flow/*`, `src/server/races/routes.ts` | inspected |
| Volunteer | Finishing order | Finish order job | `src/client/jobs/FinishOrder.tsx`, `flow/SortableList.tsx` | inspected (SortableList partial) |
| Volunteer | Times | Times job | `src/client/jobs/Times.tsx`, `flow/WrongTime.tsx` | inspected (WrongTime partial) |
| Lead | To check | Dashboard | `src/client/lead/Lead.tsx`, `ToCheck.tsx`, `src/shared/to-check.ts`, `src/shared/lead-items.ts` | inspected |
| Lead | Results, rulings | Results, event, race page, sheets | `Results.tsx`, `RacePage.tsx`, `RaceActions.tsx`, `RunnerActions.tsx`, `TieSheet.tsx`, `StageSheet.tsx`, `FinalPanel.tsx`, `ActionSheet.tsx` | inspected |
| Lead | Clash choice, deleted races, number correction | race page | `ClashVersions.tsx`, `DeletedRaces.tsx`, `RunnerNumber.tsx` | not inspected |
| Scoring team | Day setup | Day setup, Events | `src/client/lead/Day.tsx` | inspected |
| Scoring team | Phones | Phones | `src/client/lead/Phones.tsx` | not inspected |
| - | Results rules, export workbook | server | `src/shared/results-rules.ts`, `src/server/day/*` | partial (only where they shape what the screen says) |
| - | CSS, look rules | all | `*.css`, `e2e/fixtures.ts` | not inspected |

## 4. Findings

| ID | Severity | Confidence | Flow | Principle |
|---|---|---|---|---|
| F1 | High | Code-confirmed | All volunteer jobs | Conceptual model, mapping |
| F2 | High | Code-confirmed | Finishing order, Times | Automation surprise, feedback |
| F3 | Critical (known scope gap) | Code-confirmed | Relays | Conceptual model (missing workflow) |
| F4 | High | Code-confirmed (behaviour); product decision needed | Roles, Day setup | Conceptual model |
| F5 | High | Code-confirmed | Heats to final | Discoverability, feedback |
| F6 | Medium | Code-confirmed | Check in, after save | Error handling, feedback wording |
| F7 | Medium | Code-confirmed | Join | Constraints, recovery, knowledge in the world |
| F8 | Medium | Code-confirmed | Finals | Constraints (real-world exceptions not modelled) |
| F9 | Medium | Code-confirmed | Day setup, export | Conceptual model, feature creep |
| F10 | Low | Code-confirmed | Finishing order, after save | Consistency, recovery |

### F1 - One race is split across three job screens, reached only through Home

- **Severity / confidence:** High / Code-confirmed. **Role:** Volunteer, zone lead helping out. **Route:** Home, then each job.
- **Principle / stage:** Conceptual model and mapping. Fails at **plan** and **specify**: the volunteer thinks "this race", but the app asks "which job" first, then "which race" again inside each job.
- **Evidence:**
  - `src/client/home/Home.tsx:14` - Home asks "What's your job for this race?" before any race exists on screen.
  - `src/client/App.tsx:13` and `:57-61` - the screen is one of `home | Start line | Finish order | Times`; the only way between jobs is back to Home.
  - Each job has its own race picker: `src/client/jobs/StartLine.tsx:138-142`, `FinishOrder.tsx:97-105`, `Times.tsx:106-112`.
  - Finishing order and Times for the same race are two separate screens, though the times are paired to places anyway (`README.md:75`).
  - The check-in picker shows "Carry on", "Already at the start line" and every event and section as buttons on one long page (`StartLine.tsx:139-141`).
- **User impact (inferred, matches the 16 Oct call):** a helper who switches from ordering to times, or a lead who wants to see a race's whole state, goes Home > job > picker > race each time. Mohsin, Khadija and Nayeem agreed on 16 Oct: list races first, then pick the job on the race, and put order and times on one screen. Khadija also proposed remembering the last job used.
- **Root cause:** navigation follows the server's three parts (runners, finish, times) rather than the race the person is looking at.
- **Smallest fix:** a default Running Zone screen listing races (waiting first) with one "New race" button. Opening a race shows a three-way switch at the top (Check in / Order / Times); the last-used job is preselected. Keep the existing entry steps inside each tab.
- **Acceptance:** from any open race, switching job is one tap and needs no Home visit; a new race is at most two taps from the race list; the last-used job is remembered per phone.
- **Verify:** Playwright: open a race in Order, switch to Times, assert the same race header and no Home step in the trail; count taps for "new heat" before and after.

### F2 - Finishing order and Times open the oldest waiting race without the volunteer choosing it

- **Severity / confidence:** High / Code-confirmed. **Role:** Volunteer. **Route:** Finishing order, Times.
- **Principle / stage:** Automation surprise. Fails at **perceive / interpret**: the screen goes straight to "Who came 1st?" and the only sign of which race it is is a small race line and the trail.
- **Evidence:**
  - `src/client/jobs/useJobData.ts:35` - on the first read, if there is no draft, the job sets the draft to `next.waiting[0]` (the oldest waiting race).
  - `src/client/jobs/FinishOrder.tsx:44-48` and `Times.tsx:89-93` - "Next race" after a save opens the next waiting race automatically.
  - `e2e/finish-order.spec.ts:15` - tests reach the race picker "through the trail", confirming the picker is not the first screen.
  - `README.md:27` and `:29` say the jobs "start with the race picker" - the docs and the code disagree.
- **User impact:** when several races are waiting at once (finals of several sections are checked in together, PDF p.7), the oldest race is not necessarily the one that just finished. Asem asked on 15 Oct (PDF p.7) for all waiting races to be listed so the volunteer picks one, "rather than making the assumption which race is it". A wrong pick is saved as a real finishing order for the wrong heat; a lead can fix it only if someone notices.
- **Root cause:** a convenience default meant to save a tap.
- **Smallest fix:** remove the auto-pick in `useRaceJob`; open the picker unless exactly one race is waiting, and even then show the race name as the big heading. After a save, return to the list instead of opening the next race. Correct the README.
- **Acceptance:** with two waiting races, opening Finishing order shows "Which race is it?" with both listed; no order can be tapped before a race is chosen.
- **Verify:** Playwright with two checked-in races; assert the picker heading on open and after a save.

### F3 - Relay events cannot be recorded

- **Severity / confidence:** Critical (a known, planned scope gap) / Code-confirmed. **Role:** all. **Route:** none exists.
- **Principle / stage:** Conceptual model. The whole **goal** (run a relay heat and final) has no path.
- **Evidence:** no relay concept anywhere in `src/` (searched for "relay"); `GLOSSARY.md:67-69` defines a relay team; check-in takes one wristband per runner (`StartLine.tsx:146-149`).
- **User impact:** relays are part of the running zone brief and in scope for 30 Oct (16 Oct call). MSF described the flow on 15 Oct (PDF p.13-16): up to six teams, four wristbands each, entered in running order in the prep area; the order and times volunteers mainly need the last runner's wristband; finals often need a team member swapped.
- **Root cause:** deliberately left out of v1/v2.
- **Smallest fix:** reuse check-in with "Team 1..6" rows of four wristband slots in running order (as Asem and Nora described, PDF p.16), show the anchor (4th) wristband in Order, and allow a swap at final attendance (see F8). Avoid a new screen where possible, as Khadija asked.
- **Acceptance:** a relay heat can be checked in, ordered, timed and ranked; the export has the four numbers on one row (PDF p.16).
- **Verify:** an end-to-end relay heat and final in Playwright; open the export and check the row.

### F4 - Roles in the app do not match how MSF described who does what

- **Severity / confidence:** High / Code-confirmed behaviour; needs a product decision. **Role:** zone lead, scoring team. **Route:** Dashboard, Day setup.
- **Principle / stage:** Conceptual model. Fails at **goal / plan**: the person the app expects to act is not the person who will be there.
- **Evidence:**
  - `src/client/lead/Lead.tsx:16-20` and `:61-63` - Day setup (codes, events, export, reset) is scoring team only.
  - `GLOSSARY.md:153-155` - the scoring team are leads with every ruling, plus setup and export.
  - Zone leads and the scoring team land on the same Dashboard with the same To check list and the heading "N things need a zone lead" (`src/shared/to-check.ts:53`).
- **User impact:** Asem said on 15 Oct (PDF p.1-2): "it would most likely be the zone lead" who sets up the day and edits; from the scoring side "I would only go in and extract the results", with a notice when heats finish. On 16 Oct the team leaned towards the scoring team watching results only, with the zone lead running heats to finals. Today a zone lead cannot add an event or read the day code, and a scoring member is shown a work queue meant for the track.
- **Root cause:** the level ladder Volunteer > Lead > Scoring team assumes the scoring team is the most trusted operator.
- **Smallest fix (after deciding):** let zone leads use Day setup apart from Start a new day, or make "setup" its own permission; give the scoring team a results-first landing page (event cards, finals line-ups, Input - Running) with To check under it.
- **Acceptance:** written role list agreed with MSF (Mohsin's action from 16 Oct); each role's landing screen shows its first task with no taps.
- **Verify:** walk the role document against each level in the app.

### F5 - Nothing says when an event's heats are all done, and "Heats complete" is hard to find

- **Severity / confidence:** High / Code-confirmed. **Role:** zone lead, scoring team. **Route:** Dashboard > Results > event.
- **Principle / stage:** Discoverability and feedback. Fails at **perceive** (no signal) and **specify** (where is the control).
- **Evidence:**
  - To check covers clashes, wrong times, warnings, additions, ran-twice and ties only (`src/shared/lead-items.ts:21-35`); there is no "heats ready to complete" item.
  - The Heats complete button is at the bottom of the event page, after the leaderboard, final panel, Not ranked yet and the race buttons (`src/client/lead/Results.tsx:89-92`).
  - The only overview hint is the event card's Done / Running / Not started colour (`Results.tsx:97-104`).
- **User impact:** Asem asked (PDF p.2) for an automatic notice that "all of the heats are finished for R1". Today that comes over the walkie-talkie and the lead must open the right event and scroll. Heats complete is what produces the finals line-up, so a missed step delays the final.
- **Root cause:** "ready to complete" is not modelled as something waiting for someone.
- **Smallest fix:** add a To check item "R1 60m Boy Cubs - all heats recorded, mark heats complete" that opens the check sheet directly; move the stage button to the top of the event page.
- **Acceptance:** when the last heat of an event is recorded and nothing blocks it, the item appears within one poll; tapping it opens the Heats complete sheet.
- **Verify:** Playwright: record two heats, assert the item and that it opens the sheet.

### F6 - A volunteer can permanently delete a race in two taps, and the result is called "Saved"

- **Severity / confidence:** Medium / Code-confirmed. **Role:** Volunteer. **Route:** Check in > Saved > Delete this race.
- **Principle / stage:** Error handling and feedback. Fails at **perform** (easy slip) and **interpret** (wrong word afterwards).
- **Evidence:**
  - `src/client/jobs/StartLine.tsx:112` - "Delete permanently" sits beside "Move to Deleted races", with no comment.
  - `src/server/races/routes.ts:86-96` - `permanent:true` is accepted at Volunteer level and runs `DELETE FROM races`; no audit note.
  - `StartLine.tsx:96` - after a delete the screen says "Saved"; on failure it says "Not saved - tap Save again" though no Save button is on that screen.
  - `GLOSSARY.md:71-73` - a deleted race is kept "so it can be restored".
- **User impact:** a stressed helper can erase a heat's check-in for good; the lead has no audit trail of it. The "Saved" wording leaves the person unsure what happened.
- **Smallest fix:** volunteers only "Move to Deleted races"; keep permanent deletion for leads (it already exists on the race page). Say "Moved to Deleted races" after, and "Not deleted - try again" on failure.
- **Acceptance:** the Volunteer route refuses `permanent:true`; the Saved screen offers only the soft delete; the follow-up note names the action.
- **Verify:** API test for the refusal; Playwright for the wording.

### F7 - Joining: masked day code, owner password on the volunteer screen, and no way back in after losing the phone's storage

- **Severity / confidence:** Medium / Code-confirmed. **Role:** Volunteer. **Route:** Join.
- **Principle / stage:** Constraints, recovery, knowledge in the world. Fails at **perform** and recovery.
- **Evidence:**
  - `src/client/access/Join.tsx:17` - the day code field is `type="password"`, so a volunteer cannot see a typo in a short shared code.
  - `Join.tsx:15` - the volunteer screen mentions the owner password.
  - `src/server/access/routes.ts:33` - joining again with your own name is refused as "Someone has joined as ..."; a phone whose storage was cleared (private tab, new phone) cannot get back in without the scoring team removing the old phone.
- **User impact:** Abdulaziz said on 16 Oct "we need to fix that logging workflow", and on 15 Oct described a shared password plus pick-your-name profile. The current refusal blames the person ("use your full name") when they are the same person.
- **Smallest fix:** show the day code as typed; move the owner password to a small "Starting the first day?" link; change the refusal to "That name is already joined. If that's you on a new phone, ask a zone lead to remove the old phone in Phones" (and let zone leads do that, see F4).
- **Acceptance:** the day code is visible as typed; the name-taken message names the recovery step.
- **Verify:** Playwright join twice with the same name in two contexts and read the message.

### F8 - Real final-day exceptions have no path: swapping a runner, and "final not run, use the heats"

- **Severity / confidence:** Medium / Code-confirmed. **Role:** Volunteer at the start line, zone lead. **Route:** final attendance, event page.
- **Principle / stage:** Constraints. The app has no way to say what actually happened, so people will work around it.
- **Evidence:**
  - Final attendance offers only Here / Absent (`src/client/jobs/StartLine.tsx:143`).
  - The stage sheet has Heats / Final / Event complete only (`src/shared/stages.ts:17-29`); nothing records a final that will not run. No "not run" path exists in `src/`.
- **User impact:** MSF (PDF p.12) want to swap a member at final check-in (common for relays). Asem (PDF p.17) asked for "Race did not run, using heats as results" for both individual and relay finals when time runs out. Khadija's tracker lists both as new actions.
- **Smallest fix:** a "Swap" choice next to Absent at final attendance (new wristband, audited); a lead action on the event "Final will not run - use heat results" that writes an audit note and takes the medal places from the heat ranking.
- **Acceptance:** both are possible without a lead editing numbers by hand; both show in the audit notes and the export.
- **Verify:** Playwright for each path; check the export rows.

### F9 - The day export looks like a routine task

- **Severity / confidence:** Medium / Code-confirmed. **Role:** Scoring team. **Route:** Day setup.
- **Principle / stage:** Conceptual model. Fails at **interpret**.
- **Evidence:** `src/client/lead/Day.tsx:86-91` - a full card with a primary "Download day export" button; `Day.tsx:10-13` - "Last downloaded 13:40, with newer changes since" nudges repeat downloads.
- **User impact:** on 15 Oct MSF asked "does that mean he has to download it throughout the day?" (PDF p.9). On 16 Oct the team agreed to hide the export behind a submenu, kept for checking and the end of day.
- **Smallest fix:** move the export into a collapsed "End of day" section with Start a new day (which already needs a current export), and reword the status as "for your records; you don't need this during the day".
- **Acceptance:** Day setup's first screenful shows codes, Phones and Events only.
- **Verify:** screenshot review at phone width (not verified here).

### F10 - After saving a finishing order there is no direct "Change order"

- **Severity / confidence:** Low / Code-confirmed. **Role:** Volunteer. **Route:** Finishing order > Saved.
- **Principle / stage:** Consistency and recovery.
- **Evidence:** the Saved screen offers only Next race and Home (`src/client/jobs/FinishOrder.tsx:89-91`), while Check in offers "Edit runners" (`StartLine.tsx:113`) and Times offers "Change times" (`Times.tsx:102`).
- **User impact:** a volunteer who spots a mistake straight after saving has to go through the trail to the picker and find the race under Recent races.
- **Smallest fix:** add "Change order" on the Saved screen, as the other two jobs do.
- **Acceptance / verify:** Playwright: save, tap Change order, land on the check step for the same race.

## 5. Strengths

- **The number pad stays open between wristbands.** `src/client/flow/NumberEntry.tsx:8-33` keeps one input focused so Next never closes the keyboard; Enter, the keyboard's Next key and the button all do the same thing.
- **Warnings inform without blocking.** Fix number / Keep (`StartLine.tsx:150-153`) and Fix time / Keep (`Times.tsx:144-147`) let the volunteer carry on, while the lead sees it later in To check. This fits MSF's need for speed at the line.
- **Nothing typed is lost.** Drafts are saved per phone, day and job across reloads with their original versions (`useJobData.ts:6-14`); a failed save keeps the entry and says "Not saved - tap Save again" next to the button.
- **Two people saving different answers is handled, not overwritten.** Clashes are kept for a lead with names and times (`src/shared/to-check.ts:22-29`).
- **To check speaks plainly and opens the problem.** Each item has where, what and what to decide, and opens the race or sheet in one tap (`ToCheck.tsx:19-26`).
- **Clear save confirmation.** The full-screen Saved names the race in large type (`flow/Saved.tsx:9-22`).
- **Dangerous day-level actions are guarded.** Start a new day needs "NEW DAY" typed and a current export (`Day.tsx:93-98`, `README.md:90`).
- **Accessible sheets.** `ActionSheet.tsx` traps focus, closes on Escape and returns focus afterwards.
- **Children identified only by wristband**, matching Asem's data-protection preference (PDF p.5).

## 6. Hypotheses to test

| Hypothesis | Experiment | Pass / fail |
|---|---|---|
| H1. Race-first navigation (F1) is faster than job-first for real volunteers. | 5 Explorers, paper or clickable mockup (Khadija offered one), tasks: new heat, order it, time it. | Pass if median taps and time drop and no one asks "where do I go". |
| H2. The times volunteer does not need wristbands on screen. | Ask Mohammed during his demo; watch one timed heat. | Pass if timing by place only causes no confusion (Asem was unsure, PDF p.3). |
| H3. The scoring team is happy with a read-only results view plus a "heats done" notice (F4, F5). | Show Asem a results-first landing page. | Pass if he would not need the spreadsheet during the day. |
| H4. Per-runner comments are no longer needed. | Confirm with Asem: on 15 Oct he asked for them (PDF p.8), then said they matter less if the data is in the app (PDF p.10). | Decide yes or no; the tracker lists it as a new action. |
| H5. Layout holds on real iOS Safari and Samsung Internet. | Rehearsal on real phones (README says Chromium only in CI). | Pass if nothing overlaps the keyboard bar or is cut off. Not verified here. |

## 7. Roadmap

**Quick wins (small, low risk)**

- F2 - remove the auto-pick, fix the README.
- F6 - volunteer delete is soft only, plus clearer wording.
- F7 - unmask the day code, reword the name-taken refusal.
- F10 - Change order on the Saved screen.
- F9 - move the export into an "End of day" section.

**Structural changes**

- F1 - race-first screen with Check in / Order / Times on the race; order and times on one screen.
- F3 - relays (teams of four in running order; anchor shown in Order).
- F8 - final swap and "final not run".
- F5 - "heats ready" in To check.
- F4 - role split, after the role document is agreed with MSF.

## 8. Limitations

- **Commands run:** `git log`, `ls`, `find`, `grep`, `sed`, `cat` over `src/`, `e2e/`, `README.md` and `GLOSSARY.md`. The PDF transcript was read in full.
- **Not run:** the app, Playwright, `npm test`. No screenshots taken, so there are no "Observed" findings, and no claims about colour contrast, spacing or the look on a phone.
- **Not inspected:** `ClashVersions.tsx`, `DeletedRaces.tsx`, `RunnerNumber.tsx`, `Phones.tsx`, the CSS, and server results and export logic beyond what shapes screen wording.
- **Static review cannot prove:** how fast volunteers really work, whether polling every five seconds feels live enough with eight phones, or how the app behaves on a bad mobile signal at the track.
