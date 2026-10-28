# UX audit: races and relays workflows (28 Oct 2026)

Research for [#180](https://github.com/Zazai840/MSF-Game-Management/issues/180), part of the map [#179](https://github.com/Zazai840/MSF-Game-Management/issues/179).

The question: what does a fresh audit of the races and relays workflows find, judged against the owner's bar? The bar, in the owner's words: "the user does not need to think while they are using it, nor do they need training, it must be so simple to use that it just works seamlessly".

## Summary

- **Build audited:** `main` at `bded31d` (PR #177 merged), production build, served locally with a fresh test day.
- **How:** Playwright drove each screen on a 390 x 844 phone (touch, 2x pixels), as a Start line, Finish line, Timer and Zone lead volunteer, on several phones at once where a flow needs them. Heats were set up through the app and its own API helpers (`e2e/fixtures.ts`). Every finding below was seen in the running app unless it says otherwise. The screenshots sit in [`ux-audit-races-relays-2026-10-28/`](ux-audit-races-relays-2026-10-28/).
- **Lens:** Don Norman's *The Design of Everyday Things* (discoverability, signifiers, mapping, feedback, conceptual model, constraints, error recovery). The other yardstick is the Running Zone design system (`docs/running-zone-design-system/README.md`, `race-flow.md`, `accessibility.md`).
- **Left out:** everything the testers already asked for (see the map's Destination): Join field order and the "Password" label, event codes on the New race sheet, That's everyone and Next docked above the keyboard, tap to edit a typed wristband, the Log out menu, relays restyled like races, reordering at a relay final, and a final-submitted status for the lead. Lead Results and Day setup are out of scope.

**In one line:** the race flow's happy path works with no training, but two traps catch volunteers on finals. A timer who opens a 60m final gets a blank white screen. Any volunteer can end a section's heats with one stray tap on "+ Final". A handful of quieter problems also make people stop and think: hidden defaults, a vanishing runner, lead jargon in error messages, and status words that say "done" too early.

### Ranked findings

Ranked by how often it bites on the day multiplied by how badly.

| # | Finding | Who | How bad | How often |
|---|---|---|---|---|
| 1 | A timer who opens a 60m final gets a blank white screen, and reloading keeps it blank | Timer | Blocks the volunteer | Every 60m final a timer opens |
| 2 | One tap on "+ Final" by any volunteer ends the heats for that section, with no confirm | Everyone | Children cannot run their heat until a lead steps in | Possible between every two heats of every 60m section |
| 3 | Check the order hides the runners left over below the fold, already marked "Did not finish" | Finish line | Wrong result saved quietly | Every heat of 8 or more with someone not placed |
| 4 | The timer is asked for a time for a runner who did not finish | Timer | Confusion; the timer has to know to tap No more finishers | Every heat with a Did not finish |
| 5 | On a big heat the timer's wrong-time warning, Fix time and Keep sit behind the footer | Timer | Stuck until they think to scroll | Big heats with a time out of order |
| 6 | Errors volunteers see are lead jargon in red text, and the app offers actions it will then refuse | Everyone | Dead end, "ask a lead" | Every time a final is blocked or heats are closed |
| 7 | Tapping a placed runner on the finish line makes that runner vanish, with no way to cancel | Finish line | Lost runner, order to rebuild | Every slip of the thumb on the places board |
| 8 | Final check-in marks every finalist Here before anyone looks, and races and relays do opposite things | Start line | Absent finalists recorded as running | Every final |
| 9 | Card status words say "done" too early, and timed events fold away under a closed "Done" | Everyone | Wrong idea of where a race is | All day |
| 10 | The lead's Times tab paints every row amber when only one time is wrong | Zone lead | Lead cannot see which row | Every heat with a kept wrong time |
| 11 | The lead's card repeats the same issue line instead of counting it | Zone lead | Noise | Any heat with several issues |
| 12 | Opening a relay on the Teams screen locks every other phone out until someone taps Take over | Relay volunteers | Stuck, or a takeover war | Every time two people do teams |
| 13 | The Teams screen's four boxes have no leg labels | Relay prep | Legs typed out of order | Every team typed |
| 14 | The Olympics password is hidden as dots while typed | Everyone joining | Typos not seen | Every join |
| 15 | Joining without a job leads to a second screen whose button is greyed out | Everyone joining | Small stop | Some joins |
| 16 | Joining with a name already used quietly makes "Sara Ahmed 2" | Returning volunteers | Two of the same person in records | Every phone swap |
| 17 | One step has four names, and some copy talks about screens that no longer exist | Everyone | Small doubt | All day |
| 18 | New race only offers the current tab's events | Everyone | Small stop | When on the wrong tab |
| 19 | The lead's Race actions list runners by wristband, not by place | Zone lead | Slower checking | Every correction |
| 20 | Visual defects: footer inset, step labels out of line, wrapped buttons, off-system colours | Everyone | Looks unfinished | All day |

## Users and journeys

- **Start line:** joins, chooses Start line, makes a race (New race or "+" on a card), types wristbands, taps That's everyone, and on a final marks who is here.
- **Finish line:** opens a race from Ready for you, taps runners in order, checks the order, saves positions.
- **Timer:** opens a race, types each place's time, keeps or fixes a time out of order, finishes with the last time or No more finishers.
- **Zone lead:** joins with the lead code (or switches with it), sees issues on cards, opens a race's tabs, accepts or fixes issues, uses Race actions.
- **Relay volunteers:** type teams on the Teams screen at the prep area, then on the relay race screen tick teams in, mark each child here, record order and times, and press Submit Race.

Assumption: volunteers are adults (often parents or Rover Scouts) with no training, standing outdoors in sun and noise, holding a stopwatch or clipboard. They do one job for a while and switch jobs a few times a day.

## Coverage

| Area | Screens seen | Screenshots |
|---|---|---|
| Join | Empty, wrong password, same name on a second phone, no job chosen | 01-05 |
| Races home | Each role, empty and full, toast after each step, Hurdles tab, lead | 03, 06, 16, 17, 25, 26, 31, 32, 33, 40, 48, 51, 52 |
| New race | Empty, event, section, after the final | 07-09b, 36, 37 |
| Start line, heat | Empty, 3 runners, wrong section, already in race, 6-runner note, 12 runners | 10-15 |
| Finish line, heat | 12 runners, placed, tapped a placed slot, check the order, Didn't run | 18-24 |
| Timer, heat | Empty, typing, wrong time, ten times | 27-30 |
| Finals (60m) | One-tap final, each role, blank Timer, reload, Who is here, finish line, check order | 34, 35, 38, 39, 46-50 |
| Zone lead, heat | Runners, Positions, Times tabs, Race actions, It's right, lead menu | 41-45, 53 |
| Relays tab | Volunteer and lead, with and without teams | 54, 60, 74, 77 |
| Teams screen | List, new team, wrong-section leg, two teams, held by someone else | 55-61 |
| Relay race screen | Check-in, ticked, here, order and times, timer, Submit Race, waiting, Save as lead, next heat, relay final | 62-81 |
| Job sheet and Your profile | Switch job, Zone lead code, profile, read-only view of another step | 82-86 |

Not covered: real phone keyboards (Playwright has none, so the keyboard covering things is inferred from layout), iOS Safari and Samsung Internet, sunlight readability, and the Undo toast's "changed since" variant.

## Findings

### 1. A timer who opens a 60m final gets a blank white screen, and reloading keeps it blank

- **Where:** Races home, "F" chip on a 60m card, with the job set to Timer. [34](ux-audit-races-relays-2026-10-28/34-final-made-by-one-tap-timer.png), [38 timer](ux-audit-races-relays-2026-10-28/38-boy-cubs-final-timer.png), [39 after reload](ux-audit-races-relays-2026-10-28/39-timer-final-after-reload.png). The same final opens fine for Start line, Finish line and Zone lead ([38 start](ux-audit-races-relays-2026-10-28/38-boy-cubs-final-start.png)).
- **What they trip on:** the whole page goes white: no header, no back arrow, no job chip. The browser reports `Cannot read properties of undefined (reading 'expected')`. The address stays on `/races/<id>`, so a reload lands on the same blank page. Only the phone's own Back gesture gets out, and nothing tells the volunteer to try that.
- **Why:** a 60m final has no Times step (runners and positions only), but the Timer body reads the Times step without checking (`src/client/races/Steps.tsx`, `Timer`: `const status=read.steps.times!` then `status.expected`). Norman: feedback and error recovery. The person is left with no signal and no way back. This is a crash, not a design choice.
- **Suggested change:** fix now, ahead of the specs. On a race with no Times step, a timer sees a plain screen: "Finals have no times. The finish line's order decides the final." with "Back to Races". Keep the "F" chip from looking like work for a timer, so it is never gold or ringed for them.
- **Rank:** 1. Every 60m final (six sections a day) shows its F chip to timers, and timers naturally tap it.

### 2. One tap on "+ Final" by any volunteer ends the heats for that section, with no confirm

- **Where:** Races home card and race screen heat chips. After heat 1 is saved the card says "Heat 1 done · the final is ready to create" and shows "+ Final", to a timer as well ([31](ux-audit-races-relays-2026-10-28/31-races-home-after-times.png)). One tap made the Boy Cubs final straight away ([34](ux-audit-races-relays-2026-10-28/34-final-made-by-one-tap-timer.png)). Afterwards the card has no "+", and New race still offers "Create heat 2" ([36](ux-audit-races-relays-2026-10-28/36-new-race-after-final.png)), which fails with "Stage complete - ask a lead" ([37](ux-audit-races-relays-2026-10-28/37-new-race-heat-refused.png)).
- **What they trip on:** on the day, heats of a section run one after another, so "every heat saved" is true between every two heats. The final then looks "ready" all the time. A volunteer who thinks they are helping, or just slips, makes the final from the fastest 6 so far. That also marks the section's heats complete, so the children still waiting cannot be checked in until a lead reopens the stage. The tap has no confirm and no undo.
- **Why:** constraints and mapping. A one-way, high-cost action sits beside everyday chips, looks like them, and goes off in one tap. The server treats making the final as "heats complete" (`src/server/races/race-flow.ts`, `POST /api/races` with `kind:'final'` calls `changeStage(...,'heats',...)`). The card's words ("ready to create") invite the tap.
- **Suggested change:** an owner decision, so options in order of preference:
  1. Only a zone lead sees "+ Final". Volunteers see "Final: a lead opens it once every heat has run".
  2. Keep it for everyone, but open a sheet first: "Have all Girl Cubs heats run? The final takes the fastest 6 and no more heats can be added." with "Make the final" and "Not yet".
  
  Either way, stop calling it "ready" just because nothing is in progress at that moment.
- **Rank:** 2. A wrong tap stops children racing, and the button is on screen most of the morning.

### 3. Check the order hides the runners left over below the fold, already marked "Did not finish"

- **Where:** Finish line, Check the order, after "Nobody else crossed the line" on a 12-runner heat. In the first screenful the list of places runs down to the footer and "Save positions" sits right under it ([23](ux-audit-races-relays-2026-10-28/23-check-order.png)). The "Not placed" heading and the two runners left over, each already tagged "Did not finish", are only seen after scrolling ([23b](ux-audit-races-relays-2026-10-28/23b-check-order-full.png), [24](ux-audit-races-relays-2026-10-28/24-check-order-didnt-run.png)).
- **What they trip on:** the screen looks complete, so the volunteer taps Save positions. Two children are saved as Did not finish without anyone deciding that. Even when the rows are seen, nothing hints that tapping a row switches it between "Did not finish" and "Didn't run". The only sign is the tag.
- **Why:** visibility, and automation surprise. A default with real consequences is made for the user, out of sight. The relay screen already does this better: it asks "Team 3 has no place. What happened?" with Did not finish and Didn't run buttons.
- **Suggested change:** put "Not placed" above the places list, or as a summary line just above Save positions ("2 not placed: 3046, 2021"). Ask about each leftover runner in turn, as the relay screen does, rather than defaulting. Show both choices as buttons on the row, not a toggle tag.
- **Rank:** 3. A wrong result saved quietly, on every big heat where someone is not placed.

### 4. The timer is asked for a time for a runner who did not finish

- **Where:** Timer on the 12-runner heat after the finish line saved 10 places, 1 Did not finish and 1 Didn't run. The strip says "Positions 11 of 11", and the timer gets 11 slots, then "11th place time?" after ten times ([30](ux-audit-races-relays-2026-10-28/30-timer-ten-times.png)).
- **What they trip on:** the stopwatch has 10 times, but the app keeps asking for an 11th. Times are only marked done by the last place's time or by "No more finishers", so the timer has to work out that the 11th place does not exist.
- **Why:** mapping and feedback. The slot count follows the runner count, not the finishers the finish line has already saved (`Timer`: `slots=Math.max(status.expected,places.length)`). "11 of 11" on Positions counts the Did not finish runner as positioned.
- **Suggested change:** once positions are saved, the timer's slots are the number of places (10). Strip and meta say "10 finished · 1 did not finish". Times are done at the 10th time.
- **Rank:** 4. Most heats have someone who stops or falls.

### 5. On a big heat the timer's wrong-time warning, Fix time and Keep sit behind the footer

- **Where:** Timer, 11 places, with the 3rd time faster than the 2nd ([29](ux-audit-races-relays-2026-10-28/29-timer-wrong-time.png)). The slots are 3 across and 60px tall, so the number box and the amber warning are pushed down. The warning is cut off by the footer, and Fix time and Keep are not on screen. Next and No more finishers are greyed out with no reason given.
- **What they trip on:** nothing on screen works, and the reason is hidden. On a real phone the keyboard takes the lower half of the screen, so it is worse (inferred: Playwright has no keyboard).
- **Why:** visibility and feedback. The design system's own check says each role can do its step on a 12-runner heat "without scrolling past the footer". The finish line gets a compact layout over 9 runners. The timer does not.
- **Suggested change:** a compact place grid for big heats (4 across, 44px tall, as the PlacesBoard). Show the warning directly under the slot it is about, or above the number box. While a warning waits, the footer can say "Fix or keep the 3rd place time first". This is separate from the testers' request to dock Next above the keyboard, but should be built with it.
- **Rank:** 5.

### 6. Errors volunteers see are lead jargon in red text, and the app offers actions it will then refuse

- **Where:**
  - "Stage complete - ask a lead" after Create heat 2 on a section whose final exists ([37](ux-audit-races-relays-2026-10-28/37-new-race-heat-refused.png)).
  - "Must settle first - open the completion check sheet" after a start line tapped "+ Final" on a card that said "the final is ready to create". An earlier heat had a kept wrong time ([46](ux-audit-races-relays-2026-10-28/46-final-start-line.png)).
  - The Join error "That is not the Olympics password or today's lead code..." ([02](ux-audit-races-relays-2026-10-28/02-join-wrong-password.png)).
- **What they trip on:** "stage" and "completion check sheet" are lead words. The sheet is not something a volunteer can open. The message sits at the top of Races, away from the card it is about, and stays there. In both race cases the app had just offered the action: New race still offers "Create heat 2", and the card still shows "+ Final".
- **Why:** constraints (don't offer what will be refused), mapping (put the message by its cause) and plain language. Design system: "Error that blocks: a WarningCallout under the field with one action. No red text alone", and warnings "say what is odd and what to do, in two sentences".
- **Suggested change:**
  - Hide or disable actions the server will refuse, and give the reason in place. On the card: "The final opens once a lead checks a time in heat 1." In the New race sheet: "Girl Cubs heats are finished. Ask a lead to add another heat."
  - Restyle every blocking error as the amber WarningCallout.
  - Retire "stage", "settle" and "completion check sheet" from volunteer copy.
- **Rank:** 6.

### 7. Tapping a placed runner on the finish line makes that runner vanish, with no way to cancel

- **Where:** Finish line placing screen. With 2014 in 1st, tapping the 1st slot turns it back into "1ST ?" ([20](ux-audit-races-relays-2026-10-28/20-finish-line-tapped-placed-slot.png)). 2014 is no longer shown anywhere: not in the slot, and not among the runner buttons. The meta says "9 to place".
- **What they trip on:** the slots are right above the runner buttons, so a thumb slip is easy. After the slip the volunteer cannot put 2014 back, because there is no Cancel and no 2014 button. They must place someone else in 1st and repair the order later by dragging.
- **Why:** error recovery and visibility. A reversible action needs an obvious undo, and an object should not disappear while it is being changed.
- **Suggested change:** while a slot is being changed, keep its runner shown (struck through or outlined: "Changing 1st: 2014"), add a "Keep 2014" cancel, and include 2014 among the buttons so it can be chosen again.
- **Rank:** 7.

### 8. Final check-in marks every finalist Here before anyone looks, and races and relays do opposite things

- **Where:** Start line on a 60m final: every seed shows a filled "Here" button from the start ([38](ux-audit-races-relays-2026-10-28/38-boy-cubs-final-start.png), [47](ux-audit-races-relays-2026-10-28/47-final-start-line-absent.png)). On a relay final each team starts at "0 of 4 here", and every child must be tapped ([81](ux-audit-races-relays-2026-10-28/81-relay-final-check-in.png)).
- **What they trip on:** a volunteer can tap That's everyone without checking, and absent finalists are recorded as running. The button also shows a state ("Here") rather than what a tap does, so a volunteer may tap it to "confirm" and mark a child absent. Finals feel different on the two tabs.
- **Why:** automation surprise and affordance. The default decides for the user, and the toggle's label is ambiguous. Consistency between the two tabs is also missing.
- **Suggested change:** start every finalist unmarked, with two clear buttons, "Here" and "Absent", or one tick per child. "That's everyone" asks about anyone still unmarked. Use the same pattern on races and relays (the relays spec can carry this).
- **Rank:** 8.

### 9. Card status words say "done" too early, and timed events fold away under a closed "Done"

- **Where:**
  - Start line card after That's everyone: "Heat 1 done" with a navy ticked chip, though positions and times have not started ([16](ux-audit-races-relays-2026-10-28/16-races-home-after-thats-everyone-toast.png)).
  - After the final's check-in: "All 3 heats done", counting the final as a heat ([48](ux-audit-races-relays-2026-10-28/48-races-home-after-final-checkin.png)).
  - "The final needs runners" when the final's six runners are already filled in ([37](ux-audit-races-relays-2026-10-28/37-new-race-heat-refused.png)).
  - The Hurdles tab with one saved heat shows only "Done (1)", collapsed, so the tab looks empty ([33](ux-audit-races-relays-2026-10-28/33-hurdles-tab.png)). 200m and hurdles groups go under Done after every heat, though more heats will follow.
- **What they trip on:** "done" read as "the whole heat is finished". "Needs runners" read as "type wristbands". A volunteer looking for 60m Hurdles Boy Cubs to add heat 2 sees an empty tab.
- **Why:** conceptual model. The words describe the app's internal step, not the volunteer's task.
- **Suggested change:**
  - Say the step: "Heat 1 checked in", "Heats 1 and 2 and the final done", "The final: check who is here".
  - Keep timed events under In progress until a lead marks them complete. Or open the Done disclosure when it holds the only cards on the tab.
- **Rank:** 9.

### 10. The lead's Times tab paints every row amber when only one time is wrong

- **Where:** Zone lead, heat 1, Times tab. Only 3rd place (12.88) is faster than 2nd, but all ten rows have the amber warning look ([44](ux-audit-races-relays-2026-10-28/44-lead-heat-times.png)).
- **What they trip on:** the lead reads the callout, then cannot find the row it means.
- **Why:** mapping. The warning look uses a race-wide flag for every row (`src/client/races/LeadStep.tsx`: `warn=race.parts.times.value?.outOfOrder && time!=null`).
- **Suggested change:** amber only on the row(s) out of order, as the timer's own grid does ([30](ux-audit-races-relays-2026-10-28/30-timer-ten-times.png)).
- **Rank:** 10.

### 11. The lead's card repeats the same issue line instead of counting it

- **Where:** Lead's Races home, 200m Boy Beavers: "Heat 2: A wristband number needs checking · Heat 2: A wristband number needs checking · 7 more" ([40](ux-audit-races-relays-2026-10-28/40-races-home-lead.png)).
- **What they trip on:** the line wraps to three lines and says nothing the first half did not.
- **Why:** feedback and signal-to-noise.
- **Suggested change:** group by race and kind: "Heat 2: 9 wristbands to check".
- **Rank:** 11.

### 12. Opening a relay on the Teams screen locks every other phone out until someone taps Take over

- **Where:** Teams screen. Opening Girl Cubs on one phone shows "You are entering" ([59](ux-audit-races-relays-2026-10-28/59-teams-two-teams.png)). A second phone then sees "Aisha Noor is entering. You see it read-only." with "Take over the teams" ([61](ux-audit-races-relays-2026-10-28/61-teams-held-by-someone-else.png)). The hold stays after the first person walks away. The relay race screen's "Do the order" and "Do the times" holds also carry on into the next heat: heat 2 opened with "Order: Yasmin Order" still set ([76](ux-audit-races-relays-2026-10-28/76-relay-after-save-heat2-current.png)).
- **What they trip on:** just opening a card (to look) takes a lock. A second helper at the prep area must take over, which throws the first out.
- **Why:** conceptual model. The race flow dropped holds (ADR 0003), so relays now teach a different rule. Opening to look should not be the same act as starting to change.
- **Suggested change:** drop the holds when relays move into the race flow, as races did. Until then, take the hold only on "+ Add team" or on tapping a team, and let it lapse when the phone leaves the screen. This touches the map's open question about the older relay code, so it needs an owner decision with the relays spec.
- **Rank:** 12.

### 13. The Teams screen's four boxes have no leg labels

- **Where:** Teams screen, new team ([58](ux-audit-races-relays-2026-10-28/58-teams-wrong-section-leg.png)). Four unlabelled boxes. The leg order is only explained in the line under the "Teams" heading ("1st leg first").
- **What they trip on:** typing legs in the order the children are standing rather than the order they run. Leg order decides who runs the last leg, which is the wristband the finish line watches for.
- **Why:** knowledge in the world. The check-in rows already label legs "1st ... 4th" ([65](ux-audit-races-relays-2026-10-28/65-relay-check-in-here.png)).
- **Suggested change:** a small "1st 2nd 3rd 4th" over the boxes, or in each empty box.
- **Rank:** 13.

### 14. The Olympics password is hidden as dots while typed

- **Where:** Join ([02](ux-audit-races-relays-2026-10-28/02-join-wrong-password.png)). Also raised in the 17 Oct audit (F7) and still true.
- **What they trip on:** the shared code is short and typed in the sun. A typo shows only as "That is not the Olympics password".
- **Why:** constraints and feedback. The code is shared aloud with every volunteer, so hiding it protects little.
- **Suggested change:** show it as typed, or add a "Show" toggle. Decide alongside the testers' "Password" label change.
- **Rank:** 14.

### 15. Joining without a job leads to a second screen whose button is greyed out

- **Where:** Join with no job card picked, then Join. A second screen asks "What's your job today?" again, now with a Zone lead card, and a greyed "Join" button ([05](ux-audit-races-relays-2026-10-28/05-join-no-job.png)).
- **What they trip on:** the volunteer is already joined (their initials are in the corner), yet the button still says Join and does nothing until a card is chosen. The help line also changes ("Tap Zone lead and type the lead code" instead of "Type the lead code instead of the Olympics password").
- **Why:** consistency, and "prefer explaining why over disabling" (design system, States).
- **Suggested change:** keep the person on the Join form with "Choose your job" in amber under the cards. If the second screen stays, its button reads "Go to races" and is never greyed out without a reason.
- **Rank:** 15.

### 16. Joining with a name already used quietly makes "Sara Ahmed 2"

- **Where:** a second phone joining as Sara Ahmed: "Sara Ahmed is already taken, so you're signed in as Sara Ahmed 2" ([04](ux-audit-races-relays-2026-10-28/04-join-same-name-second-phone.png)). The profile API itself offers a better path ("If that's you, tap That's me and show a lead"), but the Join form never shows it.
- **What they trip on:** a volunteer whose phone died comes back as a second person. Leads and "changed by" notices then name "Sara Ahmed 2".
- **Why:** conceptual model. One person should be one name.
- **Suggested change:** on Join, ask "Is this you on a new phone?" with "That's me" (the existing path) and "No, add an initial".
- **Rank:** 16.

### 17. One step has four names, and some copy talks about screens that no longer exist

- **Where:**
  - The finish line's step is "Positions" on the strip and in "Save positions", "Finishing order" in the glossary and on a relay final, and "Order and Times" or "Order" on a relay heat.
  - Relay check-in says "a lead sees it in To check" ([65](ux-audit-races-relays-2026-10-28/65-relay-check-in-here.png)). The race flow removed the To check screen.
  - The Relays tab carries a "Beta" badge ([03](ux-audit-races-relays-2026-10-28/03-races-home-empty-finish-line.png)), which tells volunteers it may not work.
  - Relay titles use title case ("Check-in Teams", "Submit Race"), not sentence case.
- **Why:** consistency and plain language (design system, Content fundamentals).
- **Suggested change:** pick one name per step and use it everywhere, for example "Finishing order" with the button "Save the order". Drop "To check" and "Beta" from volunteer copy. Use sentence case. The relays spec can carry the relay part.
- **Rank:** 17.

### 18. New race only offers the current tab's events

- **Where:** New race on the Races tab lists 60m, 200m and 400m, but not 60m Hurdles ([07](ux-audit-races-relays-2026-10-28/07-new-race-sheet-empty.png)).
- **What they trip on:** a volunteer at the hurdles who forgot to switch tab cannot find their event, and nothing says where it is.
- **Suggested change:** a line under the events, "Hurdles and relays are on their own tabs", with a link to switch. Or list every event, grouped by tab.
- **Rank:** 18.

### 19. The lead's Race actions list runners by wristband, not by place

- **Where:** Zone lead, "⋯" Race actions ([45](ux-audit-races-relays-2026-10-28/45-lead-race-actions.png)): rows run 2nd, 4th, 5th, 1st, 6th... in the older look.
- **Suggested change:** sort by place, with no-place runners last. Restyling this sheet sits with the lead screens, which are out of scope for now.
- **Rank:** 19.

### 20. Visual defects

Each was measured in the running app at 390 x 844.

- **Start line footer is inset 5px.** That's everyone and Next span 25-365px, while the number box above and every other footer span 20-370px ([10](ux-audit-races-relays-2026-10-28/10-start-line-heat-empty.png), [12](ux-audit-races-relays-2026-10-28/12-start-line-wrong-section.png)). The Timer trio and the Finish line footer line up at 20px.
- **Step strip labels out of line.** When "You · Not started" wraps to a second line, that cell's label sits 8px higher than its neighbours (label tops 134px against 142px) ([10](ux-audit-races-relays-2026-10-28/10-start-line-heat-empty.png), [18](ux-audit-races-relays-2026-10-28/18-finish-line-12-runners.png)). Top-align the labels, or keep the status to one line ("You · not yet").
- **Wrapped button labels.** "No more finishers" wraps to two lines in the Timer footer ([30](ux-audit-races-relays-2026-10-28/30-timer-ten-times.png)). "That's everyone" and "Add another runner" wrap inside the 6-runner callout ([14](ux-audit-races-relays-2026-10-28/14-start-line-six-warning.png)).
- **Timer slots off the system.** The current slot is gold with no navy ring, while the finish line's current slot has one. The wrong-time slot uses the gold "now" fill with muted text instead of the amber warning look. While a warning waits, every other slot fades as if disabled ([29](ux-audit-races-relays-2026-10-28/29-timer-wrong-time.png), [30](ux-audit-races-relays-2026-10-28/30-timer-ten-times.png)).
- **Final check-in pill against the edge.** The Here and Absent pill sits about 4px from the row's right edge, while the text has about 14px on the left ([47](ux-audit-races-relays-2026-10-28/47-final-start-line-absent.png)).
- **Red error text.** Errors are red text on cream with no border or icon (Join, Races home), unlike the amber callouts everywhere else ([02](ux-audit-races-relays-2026-10-28/02-join-wrong-password.png), [37](ux-audit-races-relays-2026-10-28/37-new-race-heat-refused.png)).
- **New race sheet labels.** The "Event", "Section" and "Race" labels look about 2px right of the choice buttons below them ([09](ux-audit-races-relays-2026-10-28/09-new-race-sheet-section.png)). This one was seen in the screenshot but not measured.
- **Your profile has two ways back.** It has both a back arrow and a Back button, and no way to change job ([84](ux-audit-races-relays-2026-10-28/84-your-profile.png)). The testers' Log out menu may replace this screen.

## What already works well

- **Warnings that do not block.** Wrong-section and already-in-race numbers get two plain sentences with Fix number and Keep ([12](ux-audit-races-relays-2026-10-28/12-start-line-wrong-section.png), [13](ux-audit-races-relays-2026-10-28/13-start-line-duplicate.png)). Times out of order are handled the same way, and Keep works.
- **A 12-runner heat fits on the finish line** with no scrolling, and the big arched runner buttons are easy to hit ([18](ux-audit-races-relays-2026-10-28/18-finish-line-12-runners.png)).
- **The 6-runner note** appears once, explains itself, and offers the likely answer first ([14](ux-audit-races-relays-2026-10-28/14-start-line-six-warning.png)).
- **The toast after each step** names what was saved and offers Undo ([16](ux-audit-races-relays-2026-10-28/16-races-home-after-thats-everyone-toast.png)).
- **Tapping another role's step** opens a read-only view that says whose step it is and offers Switch job ([86](ux-audit-races-relays-2026-10-28/86-read-only-other-step.png)).
- **"Ready for you"** puts the right card first for each role ([17](ux-audit-races-relays-2026-10-28/17-races-home-finish-line-ready.png), [26](ux-audit-races-relays-2026-10-28/26-races-home-timer.png)).
- **The lead's issue callout** says exactly what is wrong and offers "Fix time" and "It's right" in place ([44](ux-audit-races-relays-2026-10-28/44-lead-heat-times.png)).

## Seen but already asked for (not ranked)

These are tester requests or decisions the relays spec already plans. They are listed so nobody re-raises them as new:

- The relay screens, Teams screen and Your profile are still in the older look: red avatar, full name in the header, no job chip ([55](ux-audit-races-relays-2026-10-28/55-teams-screen.png), [62](ux-audit-races-relays-2026-10-28/62-relay-race-screen.png)).
- On relays the chosen job means nothing. Everyone sees check-in, order and times, and the job chip disappears.
- Submit Race waits for every job holder ([72](ux-audit-races-relays-2026-10-28/72-relay-after-one-submit.png), [73](ux-audit-races-relays-2026-10-28/73-relay-timer-sees-waiting.png)). The relay screen also gives no visible way into the relay final until a lead marks the heats complete. With one team left that has not run, it sits on "Heat 3 · 1 team to run" ([78](ux-audit-races-relays-2026-10-28/78-relay-after-heats.png)).
- Tap a typed wristband to change it; That's everyone and Next above the keyboard; Log out; event codes on the New race sheet.

## Method notes and limits

- A fresh test database (`msf_spec22_180_e2e`) served by `npm start` after `npm run build`, with `RESET_TEST_DAY=1`. Owner signed in through `/api/owner-sign-in`. Volunteers signed in through the Join form or the same API calls as `e2e/fixtures.ts`. Some heats were set up through the fixtures' helpers (`recordRace`, `writeTeam`, `tickTeam`). Relay heats complete was set through the lead API, because lead Results is out of scope.
- The scripts that drove the app were throwaway and are not committed. No app code was changed.
- Not verified:
  - A real on-screen keyboard (findings 5 and the testers' docked buttons).
  - iOS Safari and Samsung Internet.
  - Contrast in sunlight.
  - The Undo "changed since" variant.
  - The lead's Correct, Re-run and Disqualify actions.
- The 17 Oct audit on `archive/norman-ux-audit` was checked. Only its F7, a masked code and a name already taken, still applies to today's screens: findings 14 and 16. Its other findings describe screens the race flow replaced.
