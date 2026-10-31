# Consistency audit of every screen, volunteer and lead

Research for issue #232 (child of map #231). Researched 2026-10-31 against `origin/main` at `b6f411b` (after PR #228 "Relays in the race flow").

Question: what does a consistency audit of every screen of the app (volunteer and lead) find? Which screens still use the older look, and where does the same kind of action behave or read differently from one screen to another?

Reference: the Running Zone design system ([README](../running-zone-design-system/README.md), [race-flow.md](../running-zone-design-system/race-flow.md), `components/`, `tokens.css`) and [GLOSSARY.md](../../GLOSSARY.md).

Method: the app was built and run end to end with Playwright at phone width (iPhone project, 390 x 844, touch; one check at 360 x 800) under Node 22, on a fresh test database. Phones signed in as a Start line, a Finish line and a Timer volunteer, a phone with no job yet, and a Zone lead. Setup (events, saved races, a tie between heats, a deleted race, relay teams) went through the same API the app uses; every screen was then opened and used in the app. The lead walked Races, a race (each tab), Race actions (each correction, Delete, Re-run, Restore), Results (list, an event, runner actions, tie sheet, check sheets, race page, deleted race, final panel), Day setup, Events and Phones, and forced one save failure. A second script checked behaviour: the phone's own Back, a tap outside an old sheet, the back arrow after "Open in Results", the confirmation after a correction from the race screen, and where a Re-run lands. Screenshots are in [`consistency-audit/`](consistency-audit/). The throwaway specs that drove the run are not kept. Code references are to `origin/main` at `b6f411b`.

Each finding below is written for the owner in ASD-STE100 Simplified Technical English (1-3 short sentences, naming the screen). Evidence follows under each one.

## Already on the map (not repeated here)

The audit touched these, but each already has its own ticket on map #231:

- Time entry on the Timer screen: #234, #235.
- One Races tab for Races and Hurdles: #236.
- Relay teams made inside the heat (the "New team" button, the Teams row, "No relay teams yet. Tap New team…"): #237.
- The Saved toast after "That's everyone" and the finishing order, and the lead staying on the race with no toast after a step: #238.
- A deleted heat's number used again: #239.
- A final made with no "Heats complete" step (the "Heats complete" and "Reopen heats" buttons in Results): #240.
- "Ready for you", "1st seed" and the check sheet's line on where to fix a mistake: #241.
- Day setup changes ("Confirm event list", Year, Region and Day): #242.
- The tie sheet and the "Confirm the medals" check sheet in the new design: #243.

## Ranked findings

### 1. Phone Back on lead screens

**Results, Day setup and their screens do not add a step to the phone's history. When a lead presses the phone's Back button on an event in Results, the app opens the last race that the lead looked at. It does not go back to Results or to Races.**

- `App.tsx:51-55`: `go()` pushes a history entry only when the path changes, and every lead screen (Results, an event, a race page, Day setup, Phones, Events) has the path `/`, the same as Races. Inside `Lead.tsx` and `Results.tsx`, screens change by state only.
- Checked in the app: Races, open race Heat 1, back to Races, avatar menu, Results, an event, then the phone's Back: the URL became `/races/<id>` and the race screen opened.

### 2. Every lead screen except the race screen keeps the old look

**All Results, Day setup, Events and Phones screens, and every lead sheet, still use the old look. They have a grey-blue page, white cards, a plain navy header and an orange focus ring. The full list is under "Old-look screens" below.**

- Old look: `theme.css` / `style.css` classes (`button-secondary`, `button-quiet`, `button-small`, `button-danger`, `warning-box`, `calm-note`), `lead/*.css`, `lead/ActionSheet.tsx`, `shell/AppHeader.tsx`, `flow/BackArrow.tsx`. New look: `<Screen>` in `races/parts.tsx` with `rz-*` classes.
- Screenshots: [42 Results](consistency-audit/42-results-list.png), [43 an event](consistency-audit/43-results-event-timed.png), [60 Day setup](consistency-audit/60-day-setup.png), [62 Phones](consistency-audit/62-phones.png), [63 Events](consistency-audit/63-events.png).

### 3. Race actions on the race screen

**On a race, the "⋯" button opens Race actions as a full-screen panel in the old look. It hides the race and has its own "Close" button at the top right. All other lead tools on the race screen are new-look bottom sheets.**

- `RaceShell.tsx:108` and `:115-123` (`LeadRaceSheet`, a portal outside the race flow's `<Screen>`; its comment says "It keeps the older look"). It renders `RacePage` (`lead/RacePage.tsx`), the same page as a race in Results.
- Screenshots: [33](consistency-audit/33-lead-race-actions-unsaved.png), [37](consistency-audit/37-lead-race-actions-saved.png); compare the race under it, [35](consistency-audit/35-lead-saved-race-times-tab.png).

### 4. How a save is confirmed

**The app confirms a save in three different ways. Race steps show a toast with Undo for 6 seconds, but Results, Day setup, Events and Phones show a small "Saved" pill for 3 seconds with no Undo. Race actions on the race screen show no confirmation after a save.**

- Toast: `races/Toast.tsx` (6 s, Undo, `rz-toast`). [11](consistency-audit/11-toast-after-thats-everyone.png).
- "Saved" pill: `lead/Lead.tsx:15-16,42,54-55` and `lead/dashboard.css:24-30` (3 s, no Undo). [52](consistency-audit/52-after-heats-complete.png), [65](consistency-audit/65-events-saved-note.png).
- Nothing: `RaceShell.tsx:121` passes `onSaved={setResults}`, which shows nothing. Checked in the app: after "Save times" in Correct times from the race screen, no "Saved" text and no status message appeared. [73](consistency-audit/73-race-actions-after-correct-times.png).
- The relay teams sheet's "Save team N" also closes with no confirmation (`races/TeamSheet.tsx:92`).

### 5. Remove and new lead code act with no question

**On Phones, "Remove" signs a person out at once, with no question. On Day setup, "Make a new lead code" removes lead access from the other leads at once, with no question. "Change Olympics password" asks first.**

- `lead/Phones.tsx:31` (Remove calls `save()` directly). `lead/Day.tsx:98` (Make a new lead code calls `run()` directly). Compare `lead/Day.tsx:50-54` (Change password asks "Every phone, including yours, goes back to Join…").
- Screenshots: [62](consistency-audit/62-phones.png), [60](consistency-audit/60-day-setup.png), [61](consistency-audit/61-change-password.png).

### 6. Delete race does not look dangerous

**In Race actions, "Delete race" has the same style as the four corrections. Its confirm shows "Move to Deleted races" and "Confirm permanent deletion" as two equal navy buttons. The new look uses a red danger button for "Remove" on a relay team.**

- `lead/RaceActions.tsx:31` (all five actions are `button-secondary`), `:39-42` (both delete choices are plain primary buttons). Compare `races/TeamSheet.tsx:101` (`rz-btn--danger`) and the design's danger style.
- Screenshots: [37](consistency-audit/37-lead-race-actions-saved.png), [34](consistency-audit/34-lead-delete-race-confirm.png).

### 7. Where a Re-run lands

**After "Confirm re-run" on the race screen, Race actions stays open on the deleted race. When the lead closes it, the race screen still shows the deleted heat ("A lead deleted Heat 2"). The heat chips did not show the new heat, so the lead must go back to Races to find it.**

- `lead/RaceActions.tsx:25` (only Delete closes the page with `onRemoved`; Re-run refreshes in place). `RaceShell.tsx:108`.
- Checked in the app: [74](consistency-audit/74-after-rerun-from-race.png) (panel still open: "Heat 2 · Replaced by Heat 3 (re-run)"), [75](consistency-audit/75-race-screen-after-rerun-closed.png) (chips H1, H2 and "+", no H3, about 1 s after closing). Seen once; the missing chip may be a timing effect of the live stream.

### 8. Long event names cut off on a lead's race

**On a race, the lead's app bar cuts long event names. At 360 px wide, "4x100m Relay · Girl Scouts" shows as "4X100M RE…", so the lead cannot see the section. Volunteers have more room because they have no code tag and no "⋯" button.**

- `races/race-flow.css:63` (`.rz-appbar__race h1` has `text-overflow: ellipsis`), `races/parts.tsx:66-72` (`RaceBar`: title, code tag, job chip, "⋯").
- Screenshots: [71 at 360 px](consistency-audit/71-lead-relay-title-360.png), [70 at 390 px](consistency-audit/70-lead-relay-title-390.png), [32](consistency-audit/32-lead-race-unsaved.png).

### 9. Old sheets and new sheets close differently

**Old-look sheets (runner actions, race corrections, tie sheet, check sheets) open in the middle of the screen. They have no × button, and a tap outside them does nothing. New-look sheets slide up from the bottom, have a × button and close on a tap outside.**

- Old: `lead/ActionSheet.tsx:21` (no click handler on the overlay, Escape only while focus is inside), `lead/results.css:77` (centred). New: `races/parts.tsx:136-151` (`Sheet`: scrim tap, Escape, × button).
- Checked in the app: a tap at the top of the screen left the tie sheet open. Screenshots: [46](consistency-audit/46-runner-actions.png), [38](consistency-audit/38-lead-correct-times.png) vs [05](consistency-audit/05-role-sheet.png), [07](consistency-audit/07-new-race-sheet.png).

### 10. The "+" heat chip does two things

**On a Races card, the "+" chip opens the New race sheet and needs a second tap on "Create heat N". On a race screen, the same "+" chip makes the new heat at once.**

- `races/RacesHome.tsx:77` (opens `NewRaceSheet` with `direct:true`), `races/RaceShell.tsx:60-64,85` (`create('heat')` straight away).
- Screenshot: [23a](consistency-audit/23a-add-heat-sheet.png) (the sheet from the card's "+").

### 11. Back after "Open in Results"

**When a lead taps "Open in Results" on a race, the back arrow in Results says "Back to Races". It does not go back to the race that the lead came from.**

- `lead/Results.tsx:63-65` (with a `target`, back goes to `backTo`, which `Lead.tsx:48` sets to "Races").
- Checked in the app: the arrow's label was "Back to Races". [72](consistency-audit/72-open-in-results-from-race.png).

### 12. Three forms of back control

**The back control has three different forms. A race has a chevron in the app bar. Lead screens have an arrow on its own row under the header, and Race actions has a "Close" button.**

- `races/parts.tsx:68` (chevron in `RaceBar`), `flow/BackArrow.tsx:14-21` (arrow row, no word), `RaceShell.tsx:120` ("Close").
- Screenshots: [10](consistency-audit/10-start-line-checkin.png), [42](consistency-audit/42-results-list.png), [37](consistency-audit/37-lead-race-actions-saved.png).

### 13. "Back" means different things on race steps

**On race steps, the word "Back" means three different things. On the Timer it goes to the previous place. On the Finish line it leaves "Check the order" (a small button at the top) or "Runner not on the list" (a button in the footer).**

- `races/Steps.tsx:363` (Timer footer), `:255` (Check the order, heading row), `:230` (add-runner footer).
- Screenshots: [17](consistency-audit/17-timer.png), [15](consistency-audit/15-finish-check-order.png).

### 14. A failed save on Events shows in the wrong place

**On Events, a failed "Rename" or "Switch off" shows "Not saved - tap Save again" at the top of the screen, under "Confirm event list". The screen has no Save button, and the message is far from the event that failed.**

- `lead/Day.tsx:138,150,160` (rename, confirm and switch all report to the key `'list'`, shown once at the top with the word "Save"). `:24` (the "Not saved - tap {again} again" line).
- Checked in the app with a forced failure on Switch off R1: [66](consistency-audit/66-events-error.png). (Event list confirmation itself is #242.)

### 15. Old screens have no docked buttons

**Old-look screens and sheets have no docked footer. Their buttons scroll with the content, so a long sheet puts "Save" or "Confirm" below the screen. Race steps, Races and Join keep their main button docked at the foot.**

- `lead/RaceActions.tsx:101`, `lead/StageSheet.tsx:30-31`, `lead/RunnerActions.tsx:52,57,61` (buttons at the end of the content). New: `races/parts.tsx:175-184` (`DockedFooter`).
- Screenshot: [55](consistency-audit/55-results-without-final-sheet.png) (Results without a final: the Confirm button is below the screen).

### 16. Two save models in Race actions

**In Race actions, "Correct finishing order" saves each drag at once and closes with "Done". "Correct times" and "Correct runner list" save only when the lead taps a Save button. Only a small hint line tells the lead which model a sheet uses.**

- `lead/RaceActions.tsx:122,133` (order: "Each change saves at once", "Done"), `:101` ("Save times"), `:199` ("Save runner list").
- Screenshots: [39](consistency-audit/39-lead-correct-order.png), [38](consistency-audit/38-lead-correct-times.png), [40](consistency-audit/40-lead-correct-runners.png).

### 17. The "Saved" pill covers content

**On old-look screens, the "Saved" pill floats at the foot of the page and covers what is under it for 3 seconds. In the race flow, the toast sits above the docked footer.**

- `lead/dashboard.css:25` (`position:fixed; bottom:20px`), `races/race-flow.css:165` (`.rz-toast`, 150 px above the foot).
- Screenshots: [52](consistency-audit/52-after-heats-complete.png) (over "Reopen heats"), [65](consistency-audit/65-events-saved-note.png) (over an event card).

### 18. Lead screens have the old header and no job chip

**Lead screens use the old header: "Running Zone", the full name and a red round avatar. Races and the race screen use the new header with the job chip and a square avatar. On a lead screen, the lead cannot change job.**

- `shell/AppHeader.tsx:33-40` vs `races/parts.tsx:57-62` (`HomeBar`), `App.tsx:106,113`.
- Screenshots: [42](consistency-audit/42-results-list.png) vs [30](consistency-audit/30-lead-races-home.png).

### 19. The opening screen

**While the app opens, it shows "Opening…" and a Refresh button in the old look, on a grey-blue page. The next screen is in the new look, so every person sees the colours change when the app starts.**

- `App.tsx:88`.
- Screenshot: [03](consistency-audit/03-opening.png) (with `/api/home` slowed to 1.5 s).

### 20. The cursor goes into the Comment box

**Delete race, Re-run race, Restore race and Results without a final put the cursor in the Comment box when they open. The box shows an orange ring. In the design, the focus ring is navy, and amber means a warning.**

- `lead/ActionSheet.tsx:11` (focuses the first field), `theme.css:51,87` (`--focus:#d78800`) vs `races/rz.css:143` (navy focus ring).
- Screenshots: [34](consistency-audit/34-lead-delete-race-confirm.png), [41](consistency-audit/41-lead-rerun-confirm.png), [54](consistency-audit/54-restore-confirm.png), [55](consistency-audit/55-results-without-final-sheet.png), [47](consistency-audit/47-runner-disqualify.png).

### 21. Races and Results give an event's state in different words

**Races and Results describe the same event in different words. On Races the card says "The final in progress · Heats 1 and 2 saved". In Results the same event says "Heats done · final to run", and the colour key says "Done", "Running" and "Not started".**

- `shared/race-flow.ts` (`groupStatus`, `leadLine`) vs `shared/event-state.ts` (`eventState`), `lead/Results.tsx:108`.
- Screenshots: [56](consistency-audit/56-lead-races-after-heats.png) vs [59](consistency-audit/59-final-panel.png), [42](consistency-audit/42-results-list.png).

### 22. Events are named two ways

**Races writes an event as "200m · Boy Cubs" with the event code in a tag. Results writes it as "200m Boy Cubs" with no dot, and its cards show only "R15 · Boy Cubs" under a "200m" heading.**

- `races/RacesHome.tsx:73` vs `lead/Results.tsx:82,113` and `lead/RacePage.tsx:33`. The design's separator is " · ".
- Screenshots: [30](consistency-audit/30-lead-races-home.png), [43](consistency-audit/43-results-event-timed.png), [42](consistency-audit/42-results-list.png).

### 23. Phones and "Signed in today"

**Day setup calls the list of people "Phones". The screen that opens is called "Signed in today".**

- `lead/Day.tsx:101-102` vs `lead/Lead.tsx:12,49` and `lead/Phones.tsx:21-22`.
- Screenshots: [60](consistency-audit/60-day-setup.png), [62](consistency-audit/62-phones.png).

### 24. The close button has eight names

**The button that closes an old-look sheet or panel has eight names: "Cancel", "Cancel correction", "Keep current record", "Close actions", "Close tie", "Close check sheet", "Done" and "Close". New-look sheets use "Cancel", "Not yet" or the × button.**

- `lead/RunnerActions.tsx:48,52`, `lead/RaceActions.tsx:42,101,133,201`, `lead/TieSheet.tsx:44`, `lead/StageSheet.tsx:31`, `RaceShell.tsx:120`, `lead/FinalPanel.tsx:28` ("Cancel" as `button-quiet`).

### 25. The main button changes side

**In race-step footers and the relay team sheet, the main button is on the right. In callouts and in every old-look screen, the main button is on the left or at the top.**

- Right: `races/Steps.tsx:128-131` ("That's everyone" | "Next"), `races/TeamSheet.tsx:131-132` ("Cancel" | "Save team N"). Left/top: `races/Steps.tsx:120` ("Fix number" | "Keep"), `lead/Day.tsx:52-53` ("Yes, change password" | "Keep the old password"), `lead/RaceActions.tsx:41-42`.
- Screenshots: [10](consistency-audit/10-start-line-checkin.png), [61](consistency-audit/61-change-password.png), [34](consistency-audit/34-lead-delete-race-confirm.png).

### 26. Error words and error boxes differ

**The app words a failed request in many ways, for example "Could not connect", "Could not connect - please try again", "Not saved - try again" and "Could not save - try again". New-look screens show errors in an amber callout with a warning icon. Old-look screens show an amber box with no icon.**

- Client strings: `App.tsx:48`, `api.ts:108,114`, `lead/Results.tsx:49`, `lead/Phones.tsx:17,23`, `lead/Lead.tsx:38`, `lead/RaceActions.tsx:26`, `races/LeadStep.tsx:39`, `lead/TieSheet.tsx:26`, `lead/StageSheet.tsx:17`, `lead/FinalPanel.tsx:15`, `lead/RunnerActions.tsx:36`, `lead/RunnerNumber.tsx:42`, `races/Toast.tsx:25`, `live.ts:54`. Old box: `theme.css:117` (`.warning-box,[role=alert]`); new: `races/parts.tsx:165-170` (`Callout`).
- Screenshots: [66](consistency-audit/66-events-error.png) vs [02](consistency-audit/02-join-wrong-password.png).

### 27. Empty states on old screens

**Old-look empty states say only that nothing is there, for example "No deleted races", "No runners ranked yet" and "Final finishing order not recorded yet.". The design asks for a sentence that says what will appear and when, as Races does.**

- `lead/DeletedRaces.tsx:13`, `lead/Results.tsx:88`, `lead/FinalPanel.tsx:30`, `lead/RaceActions.tsx:196` ("No runners"), `lead/RaceTeams.tsx:37` ("No teams"). Design README, "States": "Empty".
- Screenshots: [43](consistency-audit/43-results-event-timed.png), [59](consistency-audit/59-final-panel.png).

### 28. Three forms of "Updated at"

**The "Updated at" line has three forms. Races shows the time with seconds and a Refresh button. Results, Day setup and Race actions show the time without seconds and an underlined Refresh link, and a lead's race shows the line with no Refresh.**

- `races/RacesHome.tsx:96`, `lead/Results.tsx:117`, `lead/Lead.tsx:53`, `lead/RacePage.tsx:39`, `races/LeadStep.tsx:58`.
- Screenshots: [04](consistency-audit/04-races-start-line.png), [42](consistency-audit/42-results-list.png), [35](consistency-audit/35-lead-saved-race-times-tab.png).

### 29. Three styles for "open a race" in Results

**Results uses three styles of button to open a race. "Open final" and "Open deleted Heat 3" are navy, "Open Heat 1" is outlined, and a race under "Not ranked yet" is a small outlined button with only its name.**

- `lead/FinalPanel.tsx:31`, `lead/DeletedRaces.tsx:13`, `lead/Results.tsx:97-98`.
- Screenshots: [59](consistency-audit/59-final-panel.png), [43](consistency-audit/43-results-event-timed.png).

### 30. Race actions points to Races from inside the race

**For a race not yet saved, Race actions says "Heat 3 is in progress - finish its steps on Races". The lead opened it from that race, so the words point to the wrong place.**

- `shared/races.ts` (`inProgressLine`), `lead/RaceActions.tsx:31`.
- Screenshot: [33](consistency-audit/33-lead-race-actions-unsaved.png).

### 31. The job is named two ways

**The job sheet is called "Your job", but Join and the job choice screen ask "What's your job today?". The job chip for a lead says "Lead", but the job cards say "Zone lead".**

- `races/RoleSheet.tsx:26`, `App.tsx:129`, `access/SignIn.tsx:73`, `races/parts.tsx:47-50` (`roleLabels`).
- Screenshots: [05](consistency-audit/05-role-sheet.png), [19](consistency-audit/19-job-choice.png), [30](consistency-audit/30-lead-races-home.png).

### 32. The highlight line in Results

**On a heats event, Results says "Top 8 highlighted · Q: fastest 6". The two numbers do not agree, and the screen does not say why 8 rows are highlighted.**

- `lead/Results.tsx:87` (`band.highlightCount`, `band.lineLabel`).
- Screenshot: [59](consistency-audit/59-final-panel.png).

### 33. Text wraps in Race actions

**In Race actions, the place column wraps "No place" onto two lines. In Correct times, the "No finisher" label wraps under its tick box.**

- `lead/RacePage.tsx:53`, `lead/RaceActions.tsx:97`, `lead/race-page.css`.
- Screenshots: [33](consistency-audit/33-lead-race-actions-unsaved.png), [38](consistency-audit/38-lead-correct-times.png).

### 34. The empty line on Races is too close to the tabs

**On an empty Races tab, "No races yet. Tap New race when a race lines up." sits 6 px under the tabs. A section heading sits 12 px under the tabs, so the empty line looks crowded.**

- `races/race-flow.css:45,50,57` (`.rz-main` 6 px top padding; `.rz-section` adds 6 px; `.rz-empty` adds none).
- Screenshots: [08](consistency-audit/08-races-hurdles-tab.png), [09](consistency-audit/09-races-relays-tab.png).

### 35. Close buttons change width

**In old-look sheets, "Close tie" and "Close check sheet" are narrow buttons. "Cancel correction", "Keep current record" and "Close actions" are full width.**

- `lead/TieSheet.tsx:44`, `lead/StageSheet.tsx:31` vs `lead/RaceActions.tsx:42,101`, `lead/RunnerActions.tsx:48`.
- Screenshots: [44](consistency-audit/44-tie-sheet.png), [51](consistency-audit/51-check-sheet-heats-complete.png), [38](consistency-audit/38-lead-correct-times.png).

### 36. A grey band in Correct runner list

**In Correct runner list, "Add runner" and "Review runner list" sit on a grey band. The band does not match the white sheet around it.**

- `lead/RaceActions.tsx:197` (`.sheet-actions`), `lead/race-page.css`.
- Screenshot: [40](consistency-audit/40-lead-correct-runners.png).

## Old-look screens

Every screen and sheet below renders outside `<Screen>` (or, for Race actions, in a portal outside it) with the old `theme.css` / `style.css` / `lead/*.css` classes.

Shell
1. The opening screen, "Opening…" with Refresh (`App.tsx:88`). [03](consistency-audit/03-opening.png)
2. "Opening Lead…" and "Lead access needed" (`App.tsx:115-116`).
3. The old header and the back-arrow row on every lead screen (`shell/AppHeader.tsx`, `flow/BackArrow.tsx`).
4. The "Saved" pill (`lead/Lead.tsx:54-55`).

Results
5. Results, the list of events with the colour key (`lead/Results.tsx:107-116`). [42](consistency-audit/42-results-list.png)
6. An event in Results: leaderboard, TIE tags, "Not ranked yet", Races buttons, the check-sheet buttons, the "Input - Running" table, Audit notes (`lead/Results.tsx:80-106`). [43](consistency-audit/43-results-event-timed.png)
7. The final panel: seeded line-up, call-up, "Add a team to the final" (`lead/FinalPanel.tsx`). [59](consistency-audit/59-final-panel.png)
8. Deleted races, the section and a deleted race's page with Restore race and Delete permanently (`lead/DeletedRaces.tsx`, `lead/RaceActions.tsx:31`). [53](consistency-audit/53-deleted-race-page.png)
9. The race page in Results (`lead/RacePage.tsx`). [49](consistency-audit/49-results-race-page.png)
10. Race actions from a race's "⋯", the same race page as a full-screen panel (`RaceShell.tsx:115-123`). [37](consistency-audit/37-lead-race-actions-saved.png)
11. Race action sheets: Correct times, Correct finishing order, Correct runner list, Correct teams (with the team's leg boxes), Re-run race, Delete race, Restore race, Delete permanently (`lead/RaceActions.tsx`, `lead/RaceTeams.tsx`, `lead/TeamEdit.tsx`). [38](consistency-audit/38-lead-correct-times.png), [39](consistency-audit/39-lead-correct-order.png), [40](consistency-audit/40-lead-correct-runners.png), [41](consistency-audit/41-lead-rerun-confirm.png), [34](consistency-audit/34-lead-delete-race-confirm.png), [54](consistency-audit/54-restore-confirm.png)
12. Runner actions: Disqualify, Lift disqualification, Correct number (with the leg choice on a relay team), Mark checked, Mark addition checked, Choose which result counts (`lead/RunnerActions.tsx`, `lead/RunnerNumber.tsx`). [46](consistency-audit/46-runner-actions.png), [47](consistency-audit/47-runner-disqualify.png)
13. The tie sheet (`lead/TieSheet.tsx`); its redesign is #243. [44](consistency-audit/44-tie-sheet.png), [45](consistency-audit/45-tie-sheet-run-off.png)
14. The check sheets: Heats complete, Final complete, Event complete, Results without a final, and Reopen heats / final / event / results (`lead/StageSheet.tsx`); the "Confirm the medals" one is #243. [48](consistency-audit/48-check-sheet-event-complete.png), [51](consistency-audit/51-check-sheet-heats-complete.png), [55](consistency-audit/55-results-without-final-sheet.png)

Day setup
15. Day setup: Olympics password and Change Olympics password, Lead code and Make a new lead code, the Phones and Events rows, Day export, Start a new day (`lead/Day.tsx:68-124`); its content changes are #242. [60](consistency-audit/60-day-setup.png), [61](consistency-audit/61-change-password.png)
16. Events: Confirm event list, Rename, Switch off / on, Add an event (`lead/Day.tsx:127-176`). [63](consistency-audit/63-events.png), [64](consistency-audit/64-events-rename.png)
17. Phones ("Signed in today"): Make lead, Make volunteer, Remove, audit notes (`lead/Phones.tsx`). [62](consistency-audit/62-phones.png)

Every volunteer screen is already in the new look: Join, the job choice, Races (all three tabs), New race and New relay, Your job, the avatar menu, each race step for Start line, Finish line and Timer (heats, finals, relays), the relay teams sheet, and the toast. The lead's Races home and race screen (tabs, callouts, "+ Final" sheet) are in the new look too, apart from Race actions.

## Notes for builders (not owner decisions)

- `flow/ActionBar.tsx` has no caller on `origin/main`; its CSS (`flow/flow.css:9-29`) and the `--action-bar-height` padding in `lead/results.css:77` only serve it.
- `lead/ActionSheet.tsx` handles Escape only while focus is inside the sheet: after a tap outside, Escape no longer closes it.

## Not checked

- Android (360 px) only for the app-bar title; every other screen was checked at 390 x 844.
- Real keyboards: the race steps' keyboard docking was not re-checked (#234 and #235 cover time entry).
- A relay final's panel in Results ("Add a team to the final"), Lift disqualification, "Choose which result counts", Mark checked, "Correct teams" and Start a new day were read in code, not opened in the app.
- Two phones at once (the toast's "changed since" text, "Show latest") were not re-run here; #233's report covers them.
