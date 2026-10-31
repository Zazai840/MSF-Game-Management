# Testers' 31 Oct items: what the current build already handles

Research for issue #233 (child of map #231). Researched 2026-10-31 against `origin/main` at `b6f411b` (after PR #228 "Relays in the race flow").

Question: which of the testers' 31 Oct feedback items does the current build already handle, fully or in part, and what exactly is still missing for each?

Method: the app was built and run end to end with Playwright at phone width (iPhone project, 390 x 844, touch) under Node 22, on a fresh test database. Four phones signed in at once: a Start line, a Finish line and a Timer volunteer, and a Zone lead. Each volunteer did their own step in the app (That's everyone, Save the order, No more finishers) on heats and finals of an individual event (Races tab, heats format) and of a relay. The lead did Runners and Finishing order in the app on a heat, made each final with "+ Final" from the Home card, and confirmed the medals. Some setup (teams, times, a timed event's race) went through the same API the app uses. Screenshots are in [`already-handled/`](already-handled/). The throwaway spec that drove the run is not kept.

## Short answer

| # | Item | Verdict |
|---|------|---------|
| 1 | Saved toast and return to Races after "That's everyone" | Partly: volunteers yes, lead no; no toast names the next step |
| 2 | Same after the finishing order | Partly: volunteers yes, lead no |
| 3 | Final from Races home, no "Heats complete" step | Mostly handled; "Heats complete" still in Results and still the only way back to a final after "Reopen heats" |
| 4 | "Confirm the medals" on the lead's Ready for you | Card is in the new look; the check sheet it opens is the old-look Results sheet, with no line on where to fix a mistake |
| 5 | Relays "work differently from the other tabs" | Race flow now the same; the Relays tab still differs in how teams are made and listed |

## 1. Toast and return to Races after "That's everyone"

What a volunteer sees (individual event and relay, heat and final alike): after "That's everyone" the phone goes back to Races and shows a toast at the foot of the screen, "Runners saved · Girl Cubs Heat 1" (on a final, "Runners saved · Girl Cubs Final"), with Undo. It stays 6 seconds unless focused. [01], [13], [24], [31]

- Source: `RaceShell.tsx` `markDone` hands `onSaved` the message `` `${stepLabels[done]} saved · ${event.section} ${raceName(race)}` `` and `App.tsx` line 108 sets it and goes to Races; `Toast.tsx` shows it with Undo (or Open race if someone changed the step since). Every step body (individual and relay: `Steps.tsx`, `TeamSteps.tsx`) calls the same `onDone`, so relays get the same toast.
- The toast names only the step just saved. No toast or line on Races points to the finishing order (or any step) as what comes next. The volunteer's card line reads "Heat 1 checked in". [01]

What a Zone lead sees: after "That's everyone" the lead stays on the race, on the Runners tab, with no toast. The Runners tab gets a tick and "3 checked in", but the body still asks "Runner 4: wristband number?" with the box open. [04]

- Source: `markDone` returns early for a lead: "A lead marking a step done stays on the race; everyone else goes back to Races with the toast."

Still missing versus the ask: a Saved toast and return to Races for the Zone lead role; any pointer to the next step in the toast.

## 2. Toast and return to Races after the finishing order

Volunteer: after "Save the order" the Finish line goes back to Races with "Finishing order saved · Girl Cubs Heat 1" and Undo; on a final "Finishing order saved · Girl Cubs Final" (a final has no Times, so this save also saves the race). Same on a relay heat and relay final. The Timer gets "Times saved · Girl Cubs Heat 1" after "No more finishers". [02], [03], [14], [25], [26], [32]

Zone lead: after "Save the order" the lead stays on the race with no toast. [05]

Still missing versus the ask: the toast and return to Races for the Zone lead role. Volunteers in all checked cases (individual and relay, heats and finals) already get it.

## 3. A final from Races home with no "Heats complete" step

What a lead sees on Races home once every heat is saved: the card itself has a "+ Final" chip after the heat chips and "+", with the line "Heats 1 and 2 saved · make the final once every heat has run". Tapping it opens the sheet "Have all Girl Cubs heats run?" with "2 heats saved. The final takes the fastest 6, and no more heats can be added." and Make the final / Not yet. Make the final opens the new final. The relay card has the same chip and sheet ("... the fastest 6 teams ..."). [06], [10], [11], [27], [29], [30]

- So "+ Final" is reachable from the Home card itself, not only from the race chips or New race. It is also on the race screen's heat chips (`RaceShell.tsx`) and as "Final" / "Create the final" in New race for a lead. [08]
- A volunteer's card says "A lead makes the final once every heat has run." and has no "+ Final". [07]
- While something blocks the final, "+ Final" is greyed and the reason sits beside it ("Heat 1 has a time to check first"), opening that heat's step (`FinalReasonButton` in `parts.tsx`; `finalHold` in `race-flow.ts`).

What "+ Final" does underneath: it records Heats complete. After it, the event's audit notes read "Jo Lead iPhone marked Heats complete" and Results shows "Heats done · final to run". [12]

- Source: `src/server/races/race-flow.ts` line 167 calls `changeStage(...,'heats',...)`; `src/server/rulings/stages.ts`: "Heats complete seeds the final: the race flow's '+ Final' comes here too."

Where "Heats complete" still shows:

- Results on a heats event before the final has "Heats complete" as its main button, with "Results without a final" under it, for individual events and relays. Tapping it also makes the final. [09], [28]
- After the final is made, Results shows "Final complete", "Reopen heats" and "Results without a final". [12]
- After "Reopen heats" (for example to correct a heat time before the final runs), Results shows "Heats complete" again, and the Home card shows the F chip and "+" but no "+ Final", with the line "The final in progress · Heats 1 and 2 saved · make the final once every heat has run". The only way to complete the heats again and rebuild the final is "Heats complete" in Results. [12b], [12c]
  - Source: `finalAvailable` in `src/server/races/race-flow.ts` line 59 needs no final made yet; the reopened final still exists.

Still missing versus the ask: a way back to a final from Races home after "Reopen heats" (today it needs "Heats complete" in Results); the "Heats complete" button itself remains in Results as a second way to make the final.

## 4. "Confirm the medals" on the lead's Ready for you

What a lead sees: once the final is saved, the event card moves to Ready for you with "Final saved · confirm the medals" and a full-width navy "Confirm the medals" button above the chips. Relays the same. A timed event says "Every race saved · confirm the medals after the last race". [15], [18], [33]

Tapping it leaves the new look: it opens Results on the event (the older look: plain "Running Zone" bar, grey cards) with the check sheet over it. The sheet reads "Final complete" (timed: "Event complete"), "Must settle first: Nothing to settle", "Worth a look: No open warnings", "What this creates: Final positions" (timed: "Medal places"), "1st: 2000 / 2nd: 2003 / 3rd: 2001" (a relay: "1st: Team 3 · 2014 · 2015 · 2016 · 2017"), then Confirm and Close check sheet. [16], [16b], [19], [34]

- After Confirm the lead stays on Results: "Done · medals decided", "Reopen final", "Reopen heats", the Input - Running table. The card then sits under Done as "Medals decided". [17]
- Source: `RacesHome.tsx` card (`medalsToConfirm`, `leadLine` in `race-flow.ts`); `Results.tsx` opens `StageSheet` on `target.stage`.

Still missing versus the ask: the check sheet in the Running Zone look; a line on the sheet saying where to fix a mistake (the sheet has none); after Confirm the lead is left on old-look Results rather than Races.

## 5. Relays "work differently from the other tabs"

Now the same as Races and Hurdles (since PR #228): heat chips, the three steps and step strip, That's everyone / Save the order / No more finishers, the toast and return to Races, "+ Final" on the card and its sheet, Confirm the medals, Done as "Medals decided". [24]-[34]

Still different on the Relays tab:

- Footer: two buttons, "New team" and "New relay", where Races and Hurdles have one "New race". [20], [21], [27]
- Empty tab: "No relay teams yet. Tap New team to type the first." (Races: "No races yet. Tap New race when a race lines up."). [20]
- Teams are a separate Team list typed before the heat: each relay card has a "Teams 3 · 3 still to run" row that opens the teams sheet (each team's four legs, Still to run tag, "New team"). A relay with teams and no heats sits in its own section, "Teams ready, no heats yet". [21], [22]
- The relay heat's start line is a different screen: "Which teams are running?", each team's four legs with Here per child, Edit per team, a Still to run list ("Add Team 1") and "+ New team" inside the heat. The individual start line types one wristband at a time ("Runner 4: wristband number?"). [23], [04]
- A relay final's start line marks Here / Absent per team under seed headings ("1st seed · Team 1"), where an individual final marks each runner (`e2e/relay-flow-final.spec.ts`, `Steps.tsx` `Attendance`).
- New relay lists only relays; New race lists Races and Hurdles events (`NewRaceSheet.tsx`; GLOSSARY "Races").

Still missing versus the ask: teams are still made apart from the heat (Teams row, teams sheet, "New team" in the footer, "Teams ready, no heats yet"), which is what makes the tab work differently; the map's relay-teams decision covers it.

## Seen along the way (facts, not asked)

- Results says "Top 8 highlighted · Q: fastest 6" on an event with only 6 ranked runners. [09]
- After "Reopen heats" the Home card's "+" sits after the F chip, and its line says both "The final in progress" and "make the final once every heat has run". [12c]
- After Confirm, the old-look "Saved" pill floats in the middle of the Results page. [17]

## Not checked

- Hurdles tab: not run; it uses the same `RacesHome` and race screen code as Races.
- Android width (360 px) and desktop: only the iPhone width was run.
- Undo on the toast: not exercised (covered by existing e2e specs).
- Timed events' volunteer toasts: same code path as heats; not run separately.

## Screenshots

[01]: already-handled/01-volunteer-runners-toast.png
[02]: already-handled/02-volunteer-order-toast.png
[03]: already-handled/03-volunteer-times-toast.png
[04]: already-handled/04-lead-runners-done-stays.png
[05]: already-handled/05-lead-order-done-stays.png
[06]: already-handled/06-lead-home-plus-final.png
[07]: already-handled/07-volunteer-home-heats-saved.png
[08]: already-handled/08-lead-new-race-sheet.png
[09]: already-handled/09-results-before-final.png
[10]: already-handled/10-lead-final-sheet.png
[11]: already-handled/11-lead-final-made.png
[12]: already-handled/12-results-after-final-made.png
[12b]: already-handled/12b-results-after-reopen-heats.png
[12c]: already-handled/12c-lead-card-after-reopen-heats.png
[13]: already-handled/13-volunteer-final-runners-toast.png
[14]: already-handled/14-volunteer-final-order-toast.png
[15]: already-handled/15-lead-ready-confirm-the-medals.png
[16]: already-handled/16-lead-final-complete-sheet.png
[16b]: already-handled/16b-lead-final-complete-sheet-full.png
[17]: already-handled/17-lead-after-confirm.png
[18]: already-handled/18-lead-timed-confirm-the-medals.png
[19]: already-handled/19-lead-event-complete-sheet.png
[20]: already-handled/20-relays-tab-empty.png
[21]: already-handled/21-relays-tab-teams-ready.png
[22]: already-handled/22-relay-teams-sheet.png
[23]: already-handled/23-relay-start-line.png
[24]: already-handled/24-relay-volunteer-runners-toast.png
[25]: already-handled/25-relay-volunteer-order-toast.png
[26]: already-handled/26-relay-volunteer-times-toast.png
[27]: already-handled/27-lead-relays-plus-final.png
[28]: already-handled/28-relay-results-before-final.png
[29]: already-handled/29-lead-relay-final-sheet.png
[30]: already-handled/30-lead-relay-final-made.png
[31]: already-handled/31-relay-volunteer-final-runners-toast.png
[32]: already-handled/32-relay-volunteer-final-order-toast.png
[33]: already-handled/33-lead-relay-confirm-the-medals.png
[34]: already-handled/34-lead-relay-final-complete-sheet.png
