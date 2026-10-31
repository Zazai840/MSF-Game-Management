# Race flow: implementation plan

A plan for rebuilding the Running Zone around races instead of jobs. It **replaces the volunteer and lead flows in [screens.md](screens.md)**. Results, Day setup and Join keep their screens from screens.md except where this plan changes them.

Sources of truth, in order:
1. **This plan:** behaviour, data and rules.
2. **The mockups:** in the repo copy, the folder [`mockups/`](mockups/README.md) next to this file holds every screen as a PNG and as exact HTML. Online, they're on the canvas "Running Zone style directions", page **New race flow** (https://claude.ai/artifact/QATypwSYJ5fNyQcBUxjh7p). Each section below names its screen (artboard `N6-FinishLine` is `mockups/N6-FinishLine.png` and `mockups/html/N6-FinishLine.html`). Where a mockup and this plan disagree, this plan wins.
3. **The design system:** [README.md](README.md), `tokens.json` / `tokens.css` and `components/bundle.css`. Reuse its components and tokens; the new patterns are specified in "New components" below.

Before writing code, read the existing codebase's models, routes and realtime/refresh mechanism. Map this plan onto them. Don't create parallel models. If something below has no home in the current data, stop and ask rather than invent a backend.

## Goals and non-goals

**Goals**
- Home is the list of races. A volunteer picks a race and does their one job on it.
- Anyone can create a race. Jumping between heats of the same event and section is one tap, from the list or from inside a race.
- Each person sees only their own step. Zone leads see every step.
- Every place in a heat can be recorded, and a full heat fits on one phone screen.
- Simple: four volunteer screens (Join, Races, Race, plus sheets) instead of 19.

**Non-goals (this phase)**
- **Results and Day setup.** Keep their behaviour; only their entry point moves (see "Zone lead").
- **Any visual restyle** beyond what this plan and the design system specify.

## Concepts and data

| Concept | Meaning | Notes |
|---|---|---|
| Event type | Races, Hurdles, Relays | The three tabs on Home. |
| Event | A distance within a type: 60m, 200m, 400m (Races); 60m Hurdles (Hurdles); 4x50m Relay and 4x100m Relay (Relays) | Comes from Day setup's event list; New race only offers confirmed, switched-on events. |
| Section | Boy Beavers … Girl Scouts, with a code per event (R1–R6 for 60m; other events have their own codes, such as R16) | Use the existing code data. |
| Event group | One event × one section ("60m · Girl Cubs · R4") | One card on Home. Holds its races. |
| Race | One run of an event group: Heat *n* or the Final | Heat numbers count up per event group. Every event type uses "Heat": 200m and 400m runs that today's app calls "Race 1" become "Heat 1". Chips read "H1", "H2"; everywhere else write "Heat 1". |
| Step | Runners, Finishing order or Times, per race | Status is derived; see below. |
| Role | Start line, Finish line, Timer, or Zone lead | Belongs to the person, not the race. |

**Steps and status (per race)**
- **Runners:** wristbands checked in. Done when the start line taps "That's everyone".
- **Finishing order:** wristband → place. Done when the finish line taps "Save the order".
- **Times:** place → time. Done when the timer finishes the last place or taps "No more finishers".
- **Finishing order and Times are independent.** Times are keyed by place, the finishing order by wristband, and the two are joined by place for results and the lead view. Both can be worked on at the same time by different people. Neither waits for the other.
- **Runners is not a hard prerequisite either.** The finish line can add a runner who wasn't checked in ("+ Runner not on the list"). Finishing order just has no tiles to show until at least one runner exists.
- **Per race, per step, keep:** status (not started / in progress / done), count done, count expected, last editor, last updated time.

**Finals**
- Only events whose rules have finals get one. Per the rulebook that is **60m** and the **relays**. 60m Hurdles, 200m and 400m are decided by fastest overall time, with no final.
- The Final becomes available on an event group once **every heat has Times done**. Only a lead (Zone lead role) makes it, behind a confirm (see RaceCard).
- On creation, the final's runners are pre-filled with the fastest 6 across the heats (on a relay, the fastest 6 teams). Ties at 6th are resolved by the existing tie flow before creation; a tie at 6th blocks the final with a lead issue.
- One final per event group.

**Role**
- Chosen on Join and stored for the person on this device. It is restored on reload and survives sign-out of the race, not of the day.
- Switching role from any race changes the role everywhere until changed again.
- Zone lead needs the lead code once per day. After that the person can switch freely between lead and volunteer roles.

## Screens

### 1. Join (artboard `N1-Join`)
- Fields: Full name, Password (the Olympics password, shown as typed), "What's your job today?" as three radio cards (Start line / Finish line / Timer), each with its job star and one-line description.
- Copy under the cards: "You can switch job on any race. Zone lead? Type your lead code as the password."
- Typing the lead code as the password signs in as Zone lead and skips the job choice.
- A wrong password shows "That password isn't right. Check it with a lead and try again." in the amber warning callout under the Password box. Join with no job stays on the form with "Choose your job" in amber under the cards. The keyboard's Go key joins.
- A signed-in phone with no job yet (a name tapped under Welcome back, or a lead's access ended) shows only the job cards: one tap opens Races; Zone lead asks for the lead code first.
- Display-primary "Join" goes to Races.

### 2. Races: Home (artboard `N2-Races`)

**App bar** (compact, navy, star pattern): eyebrow "MSF Olympics" and title "Running Zone" ("Zone" in `--zone`). On the right are the **RoleChip** and the avatar.

**EventTabs:** Races · Hurdles · Relays.
- Remember the last tab per device. Default to Races.
- Relays lists the relay cards the same way (see "9. Relays").

**List**, grouped into sections. Hide a section that is empty.
1. **Ready for you:** event groups with at least one race whose step for *my role* can be worked on now and isn't done. For a zone lead: groups with an open issue (see "Zone lead"), and groups whose medals wait on the lead's **Confirm the medals** (see "Medals waiting on the lead" below).
2. **In progress:** every other group with a race that isn't fully done, or a final ready to create.
3. **Teams ready, no heats yet** (Relays only): a relay with teams and no races yet. Its status line reads "3 teams ready · no heats yet".
4. **Done:** collapsed Disclosure, "Done (4)", listing groups whose medals are decided (Event complete, Final complete or Results without a final); until then a group stays in progress, even with every race saved. A lead's card in Done reads "Medals decided".

**Ordering**
- Within Ready for you: the group whose oldest waiting race was created first comes first. A lead's Ready for you puts the group that started waiting last first: its newest issue, or for medals waiting, its last race's save.
- Elsewhere: most recently updated first.

**RaceCard**, one per event group:
- Title "60m · Girl Cubs", a code tag (R4), and one status line in words written for my role ("Heats 3 and 4 need times · Heats 1 and 2 done", "Heat 1 checked in", "Heats 1 and 2 and the final done").
- Then the **HeatChips** row: one chip per race in order, then "+" (add the next heat).
- When it applies, a lead (Zone lead role) gets a "+ Final" chip; tapping it opens a confirm sheet ("Have all Girl Cubs heats run? 3 heats saved. The final takes the fastest 6, and no more heats can be added." with Make the final and Not yet; on a relay "the fastest 6 teams"). A volunteer sees "A lead makes the final once every heat has run." under the chips instead. A locked final isn't shown on the card.
- Tapping a chip opens that race.

**Medals waiting on the lead** (every tab, Zone lead role only)
- A lead's card waits once every race so far is saved and its medals wait on the lead's Confirm in Results: a final saved (Final complete), or a timed event (200m, 400m, 60m Hurdles: Event complete). Results without a final never waits: the lead's call decides the medals at once.
- A waiting card sits in the lead's **Ready for you**. Its status line reads:
  - "Final saved · confirm the medals" for a saved final;
  - "Every race saved · confirm the medals after the last race" for a timed event;
  - the event's To check line instead, while it has anything to check. The confirm wording comes only once To check is clear.
- Under the status line, while To check is clear, a primary **Confirm the medals** button opens Results on that event with its Final complete or Event complete check sheet open. The back arrow returns to Races.
- Once the Confirm is recorded the card moves to Done and reads "Medals decided".
- Volunteers' cards keep their wording and sections.

**Footer**: Updated-at line with Refresh, and the display-primary "+ New race" (on Relays, "+ New team" and "+ New relay" side by side).

**After saving any step**, return here and show the **Toast**: "Times saved · Girl Cubs Heat 2" with **Undo**.
- The toast lasts 6 seconds.
- **Undo reverses only this person's own save**, the local change they just made. It restores the step to exactly how it was before that save and reopens the race at that step. It never touches other steps or other people's edits. Other steps don't depend on it: times are keyed by place and the finishing order by wristband.
- **If someone else has changed the same step since the save**, Undo would wipe out their work. So the toast shows "Tom Barker changed this since. Open the race to edit it." with an "Open race" button instead of Undo.

**Empty state** (no races in the tab): "No races yet. Tap New race when a race lines up."

### 3. New race (artboard `N3-NewRace`)

A Sheet over Races:
- **Event:** choice buttons for every races and hurdles event, grouped under the tab names Races and Hurdles whichever of those tabs it was opened from, so a volunteer on the wrong tab still finds theirs. It has no Relays group: on Relays, + New relay lists only the relays. Back from the new race, Races shows that event's tab.
- **Section:** a 2-column grid with codes.
- **Race:** "Heat *n*" (the next number for that event group, pre-selected) and "Final".
  - Final is disabled until every heat has times. It is absent for events with no final.
  - Under the choice, a line of explanation: "Girl Cubs already has heats 1 to 4. The final opens when every heat has times, with the fastest 6 filled in."
- **Button:** display-primary "Create heat 5", wording following the choice.
- **Opening it from a card's "+" chip** pre-selects that event and section and goes straight to the race on create. Opening it from "+ New race" pre-selects nothing.
- **On create**, open the new race in my role's view.
- **Anyone can create.** If someone else created the same next heat number a moment ago, open theirs rather than making a duplicate. Heat numbers must be unique per event group server-side.

### 4. Switch job (artboard `N4-Role`)

A Sheet opened by the RoleChip from any screen:
- A radio group of Start line / Finish line / Timer. Tapping one switches immediately and closes the sheet; on a race, the race stays open in the new view.
- Below, separated, a "Zone lead" row. It asks for the lead code once per day, then switches.
- Copy: "This changes what you see on every race. Switch back any time."

### 5–8. The race screen

One route per race (`/races/:raceId`), the same shell for every role.

**Shell, top to bottom**
1. **Compact app bar:** back to Races; the h1 "60m · Girl Cubs" with its code tag; the RoleChip. Zone leads also get a "⋯" button for race actions.
2. **HeatChips** for this event group. The current race is the gold chip (`aria-current="page"`); the others link to their race in the same role. "+" adds the next heat. Swiping left or right on the body also moves between heats.
3. **StepStrip:** three read-only cells (Runners · Finishing order · Times). Each shows its status in words ("5 checked in", "2 of 8", "Not started"). My step is outlined in navy and starts with "You ·", kept short ("You · not yet", "You · 2 of 8", "You · done"). Each label and status stays on one line, labels top-aligned, at 360px and 390px. For zone leads the strip becomes tabs (see 8).
4. **The body for my role.** Only my step's controls render; nothing from other steps.
5. **ActionFooter** for my step.

**Live updates**
- The StepStrip and HeatChips update live from other people's work (use the app's existing realtime or polling).
- On volunteer race screens the Updated-at line is dropped; it stays on Races and the lead view.

**Two people on the same step:**
- Don't lock.
- Save per action (each wristband, each place, each time), not per screen.
- If an incoming change touches what I'm editing, show a banner: "Tom Barker changed this a moment ago." with "Show latest". Never overwrite silently.

#### 5. Start line: check in runners (artboard `N5-StartLine`)
- **Prompt (compact):** meta "Heat 5 · 3 runners so far", question "Runner *n*: wristband number?".
- **WristbandChips** for runners added; tap one to remove. Below them, the numeric TextField.
- **Footer pair:** "That's everyone" (marks Runners done and returns to Races) and "Next" (adds the number).
- **Keep the existing warnings** (wrong section, unknown, already raced) as the WarningCallout with Fix number / Keep.
- **Soft capacity warning at 6 runners.** Specified in "Soft warning: usual heat size" below.

#### 6. Finish line: record the finishing order (artboard `N6-FinishLine`)

**PlacesBoard**
- A 4-column grid with **one slot for every runner in the race** (1st … *n*th).
- Placed slots are navy: gold ordinal plus wristband. Tap one to change it.
- A slot being changed is outlined with its runner still in it; the meta reads "Changing 1st: 2014", 2014 is among the runner buttons again, and "Keep 2014" puts it back.
- The current place is gold: "3RD ?", `aria-current="step"`.
- Empty slots are dashed: "4TH –".
- The grid grows with the runner count; 9–12 runners make 3 rows.

**Prompt (compact):** meta "Heat 4 · 8 runners · 6 to place", question "Who came *3rd?*".

**RunnerButtons**
- A 3-column grid of every unplaced runner, in check-in order.
- Tapping one places that runner in the current place, removes the button, and advances the current place.
- **Every place must be recordable**: keep offering places until all runners are placed, and allow extra places when "+ Runner not on the list" adds someone.

**Footer**
- Display-primary "Nobody else crossed the line" (goes to 6b).
- Secondary "+ Runner not on the list" (the numeric field and warnings from 5). This also triggers the soft capacity warning when it takes the race above 6.

**When the last runner is placed**, go to 6b automatically.

#### 6b. Finish line: check the order (artboard `N6b-CheckOrder`)
- **Prompt:** meta "Heat 4 · drag a handle to move a runner", question "Check the order".
- **OrderRows** (44px): place, wristband, drag handle labelled "Move 2033". Arrow keys also move the focused row. Places renumber on drop.
- **"2 not placed"** heading, below the order and just above the footer, with a small "+ Runner not on the list" button. Each unplaced runner is a dashed row with two pill buttons, Did not finish and Didn't run (`aria-pressed`), neither chosen at the start.
- **Footer:** display-primary "Save the order". It marks Finishing order done, returns to Races and shows the toast. While any unplaced runner is unanswered it saves nothing, shows the amber callout "Say what happened to 2 runners first." above the rows, and scrolls to the first unanswered row.
- **Back** returns to 6 without losing anything.

#### 7. Timer: enter times (artboard `N7-Timer`)
- Same behaviour as today's time entry.
- **Prompt (compact):** meta "Heat 3 · 5 runners", question "3rd place time?".
- **PlaceTimeGrid**, one slot per place.
  - The number of places is the larger of the runner count and the number of places recorded so far.
  - The current slot is gold with a navy ring; tap any slot to retype it.
  - Over 9 places the grid is compact: 4 across, 44px tall.
- **Numeric TextField** with the hint "Shows as **13.05**. Type digits only."
- **Footer trio:** Back / No more finishers / Next, each on one line.
- **Keep the "faster than the place before" warning** (Fix time / Keep), directly above the TextField. While it waits, the footer says "Fix or keep the 3rd place time first" above its buttons.
- **HeatChips for a timer:** a heat that needs times but isn't current gets a navy ring and a small gold dot.

#### 8. Zone lead (artboard `N8-Lead`)
- **Shell differences**
  - The RoleChip reads "Lead" on a `jumping` fill.
  - "⋯" opens a Sheet of race actions: Re-run race, Delete race, Settle a tie (only when one exists), Correct runner list (Correct teams on a relay), Disqualify runner.
  - These are today's lead actions from screens 24, 27 and 28, moved here.
- **StepStrip becomes tabs:** Runners ✓ / Finishing order ✓ / Times "⚠ 1 to check" (`role="tablist"`). The selected tab is navy.
- **Each tab shows that step's data, editable:**
  - Runners: the chip list.
  - Finishing order: OrderRows.
  - Times: rows joining place, wristband and time, each with a pencil button.
- **Problems sit on the row they're about.** A kept warning or a count mismatch shows as an inline WarningCallout with actions: "Fix time" and "It's right". "It's right" clears the issue and records who accepted it.
- **No To-check screen.** Issues live on races. On Home, a lead's "Ready for you" section is the groups with open issues (and those whose medals wait on the lead), and each card's status line names them ("Heat 3: a time looks wrong").
- **Avatar menu:** the avatar opens a menu with Results and Day setup, the existing screens, then Log out.

### 9. Relays

Relays run in the race flow like Races and Hurdles: a step per role, each step marked done, the race saving itself, Undo on the toast. There is no Submit Race, no hold and no Take over ([ADR 0003](../adr/0003-race-flow-drops-holds.md)); the Runners step of a relay takes taps from anyone ([ADR 0002](../adr/0002-relay-check-in-takes-taps-from-anyone.md)). Anything not named here works as on races. A relay race's entries are teams: "Team 5" with its four children in leg order, the 4th leg being the child the finish line sees cross.

**Relays tab**
- One RaceCard per relay and section ("4x50m Relay · Girl Cubs") with its usual status line ("Heat 1 needs runners") and HeatChips, then a **Teams row**: "Teams 8 · 2 still to run ›", or "Teams 6 ›" once none is left to run. Tapping it opens the teams sheet.
- A relay with teams and no heats sits under **Teams ready, no heats yet** (after In progress), reading "3 teams ready · no heats yet". A relay with no teams and no races is not listed. With nothing listed: "No relay teams yet. Tap New team to type the first."
- The footer holds **+ New team** (secondary) and **+ New relay** (display-primary) side by side.
  - + New relay is New race titled New relay, listing only the relays; it makes the next heat. Several heats of one relay can be open at once.
  - + New team with one relay on the day opens New team in that relay's teams sheet. With more, a sheet titled New team asks for the event and section first ("Type a new team").

**Teams sheet** (TeamSheet)
- A Sheet titled with the relay ("4x50m Relay · Girl Cubs"). Its line reads "8 teams · 2 still to run. Tap a team still to run to change it." ("No teams yet. Tap New team to type the first." while empty).
- Each team is a card: "Team 1", what it is doing ("Heat 1 · ran", "Heat 2 · change it at check-in", "Still to run", "Still to run · 3 of 4"), and its four wristbands in a row under 1st 2nd 3rd 4th, "–" for an empty leg. Only a team still to run is tappable (a raised card with a pencil); the others are flat outlines.
- **+ New team** is docked at the foot of the sheet.
- **Change anyway.** Tapping a team someone else set first asks, over the sheet: "**Aisha Noor** has already set this team." with "Team 7 · 2071 · 2072 · 2073 · 2074", then **Change anyway** and **Cancel**, stacked. Change anyway opens the leg boxes; the Save is still checked against the team's version.
- **Edit team 7 / New team 9.** The same sheet swaps to the relay's name and "Type each child's wristband in running order, 1st leg first.", then the four **leg boxes**, one per row: the label ("1st leg"), the big number box, and a grip.
  - A number already in this team or another team of the relay is refused as it is typed ("2071 is already in Team 3. Check the wristband.") with **Fix number** only.
  - An unknown number, another section's, or a child already in another relay's team is warned once its box is left, with **Fix number** / **Keep**.
  - Dragging a grip moves that number to another leg, in the draft only: Save sends it, Cancel drops it. The grip reads "Move 2071", or "Move empty 4th leg".
  - The docked footer pairs **Cancel** and **Save team 9**. Edit on a team still to run also has a quiet **Remove team 7** under them, which asks "Remove Team 7? Its number won't be used again." with Remove / Keep it.
  - A Save on a team someone changed meanwhile is refused: "Aisha Noor changed this a moment ago." with **Show latest**, which starts the boxes again from theirs.
- Each team saves on its own and nothing locks: two phones can type different teams of one relay at once. While a team's boxes are open, other phones see "Aisha Noor is changing this team" on it.
- Once the final is made the list is read-only: no team is tappable, there is no + New team, and the line reads "The final has been made, so the teams can't change. A lead can correct a team in Results."

**Start line on a heat** (TeamCard)
- Prompt meta "Heat 2 · 2 teams · 7 children here", question "Which teams are running?". Every child of a team in the heat is checked in: there is no Here per child.
- A card per team in the heat: "Team 5" with **Edit** and **Take off**. Beside the name, "Runs short · 3 of 4" for a team short of four (it never blocks the race), or "Aisha Noor is changing this team" while another phone has it open. Then a row per leg: "1st leg" over the wristband, and a grip. An empty leg reads "–".
- Dragging a grip moves the child to another leg. The drop is the team's edit with its legs in the new order: it saves the race and the team list together, every child still checked in. A short team's empty leg drags like a child, so the 4th leg can be a real child. Two drops at once: the second is refused as changed and the phone shows the latest.
- Grips are hidden on a team another phone has open, and on every card while this phone has a team open in Edit. They stay until the race is saved; a drop after That's everyone keeps Runners done.
- **Edit** opens the team's leg boxes in the teams sheet straight away, titled "Edit team 5", with no Change anyway; its Save also writes the team's entry in this race.
- **Still to run** follows the cards: each team with its four wristbands ("–" for an empty leg) and **Add**, then **+ New team**, which opens "New team · joins this heat"; the saved team joins the heat. A team another phone has open reads "Aisha Noor is changing this team" with no Add until they finish; one this phone has open shows no mark and keeps Add. With none left: "Every team on the list is in a heat."
- Add on a team already in another heat not yet saved is refused with where it is: "Team 1 is already in Heat 2".
- Every tap (Add, Take off) counts from anyone at once, and the last tap wins. The docked footer holds **That's everyone**, which marks Runners done.

**Start line on a final**
- Prompt meta "Final · 5 of 6 teams here", question "Which teams are here?".
- A card per seeded team (and any team a lead called up or added): "1st seed · Team 2" with **Edit** beside the name, then **Here** / **Absent** for the whole team, neither lit at first; tapping a lit mark again clears it. Its legs follow ("1st leg", wristband), with no per-child Here. An Absent card is dashed.
- Unless a team is Absent, its legs have grips and Edit works, as on a heat.
- As on a children's final, only teams marked Here run it: the finish line shows no team until the start line marks one Here, and an unmarked or Absent team can't be placed.
- That's everyone with a team unmarked asks first: "Team 4 is not marked. Record them absent?" with Record them absent / Go back.

**Finish line**
- Team tiles (RunnerButton, team tile), two to a row: "Team 5" over its 4th leg's wristband "2054" (or "–"), the same size. `aria-label="Team 5, 4th leg 2054, came 1st"`.
- The PlacesBoard names a placed team "T5". Prompt meta "Heat 2 · 3 teams · 3 to place", as on races, question "Which team came *1st?*". With no team in it yet: "No team is in this heat yet", on a final "No team is marked Here yet".
- Footer: "No other team crossed the line" and, on a heat, "+ Team not on the list": a sheet of the teams still to run, each with Add ("Add the team whose 4th leg crossed the line. It takes the next place."), never a typed wristband; "Every team is in a heat already." when none is left. A final has no "+ Team not on the list": its teams are its seeds, call-ups and a lead's additions.
- **Check the order** rows read "Team 6 · 2064". A team left over has its name on one line and **Did not finish** / **Didn't run** side by side below; "Say what happened to 2 teams first." until each is answered. Didn't run takes the team off the race, back to still to run. While a slot is being changed: "Changing 1st: Team 5" with **Keep Team 5**.

**Timer**
- As on races, one time per team, to the 4th leg crossing. The prompt meta reads "Heat 2 · time each team's 4th leg" (no finished count). A final has no Times.

**Finals**
- "+ Final" on a relay card is the lead's, behind the same confirm, worded for teams: "Have all Girl Cubs heats run? 3 heats saved. The final takes the fastest 6 teams, and no more heats can be added." Volunteers see "A lead makes the final once every heat has run."

**Zone lead**
- Every step tab shows "Team 5" with its four children in leg order wherever a team appears (Runners chips, Finishing order rows, Times rows, To check callouts; a tie lists each tied team). Relay problems (a team that ran short, a child in two relays, a kept warning, a wrong time) sit on the step they are about, with It's right or the way to settle it. A team that ran short reads "A team ran short".
- "⋯" race actions are a race's, with Correct teams in place of Correct runner list.
- Results, the race page, Correct teams and the final's line-up keep their older look.

## Soft warning: usual heat size

A heat usually has 6 runners (6 lanes, and the 60m final takes the fastest 6). Warn, don't block.

- **Scope:** only events on the **Races** tab (60m, 200m, 400m), heats and finals. Hurdles and Relays don't show it.
- **Setting:** `usualRunnersPerRace`, default **6**, configurable per event in Day setup if that already supports per-event settings. Otherwise use a constant.
- **Trigger:**
  - On the start line, when the runner count reaches the usual number (the 6th wristband is added).
  - Again at the finish line when "+ Runner not on the list" takes the count above it.
  - Only once per race per person. Never at the 7th, 8th…
- **UI:** a WarningCallout under the chips, with `role="status"` (not `alert`; it isn't an error).
  - Copy: "That's 6 runners, the usual number for a heat. Tap That's everyone, or add more if this heat really has more."
  - Actions: primary "That's everyone", secondary "Add another runner". The field stays usable; typing a number counts as "Add another".
- **After the warning:** the prompt meta keeps saying it in words ("Heat 5 · 7 runners · more than usual").
  - The lead view shows a StatusTag "More than usual" on the Runners tab.
  - It is **not** a lead issue and doesn't appear in Ready for you.
- **Finals:** the final is created with exactly 6 (the fastest 6). Adding a 7th to a final shows the same callout with the copy "Finals usually have 6 runners. Add another only if a lead has agreed."

## New components

Build these in `components/bundle.css` alongside the existing ones, using only tokens. Each gets a README and preview in the design system. The mockups show exact sizes; the values below are the rules.

| Component | Spec |
|---|---|
| **RoleChip** | A pill link on the app bar: `paper` fill (lead: `jumping`), `navy` text, 14px/800, job icon 18px, chevron-down 16px, `size-touch` tall. `aria-label="Your job: Timer. Change job"`. Opens the Switch job sheet. |
| **EventTabs** | 3-column segmented control on `card` with `shadow-card` and `radius-tab`, 4px inset. Each tab is a link 44px tall, `radius-md`-ish (10px), Saira italic caps 18px. The current tab is a `navy` fill with `on-navy` text and `aria-current="page"`. |
| **RaceCard** | `card`, `shadow-card`, `radius-xl`, padding 12/14. Title in `display-card`; code tag; status line in `meta` + `ink-muted`; HeatChips row. |
| **HeatChips** | An `<ol>` of chips, minimum 52 × 44, `radius-md`, Saira 18px "H1". States are set by the **viewer's step**:<br>• Done: `navy` + tick.<br>• Ready for me: `gold` (on Home).<br>• Current race: `gold` + 2px `navy` ring.<br>• Ready but not current: `card` + 2px `navy` ring + gold dot.<br>• Waiting: `card` + 2px `line`.<br>• Add: 44px dashed `line-strong` with a plus.<br>• Create final: dashed `navy` "+ Final".<br>Every chip's `aria-label` says its state in words ("Heat 3, needs times"). |
| **StepStrip** | 3-column grid of cells at least 48px tall, `radius-md`. Label 13px/800, status 12px.<br>• Mine: `card` + 2px `navy` ring, status starts "You ·".<br>• Others: 1.5px `line` ring; a done step adds a `throwing-ink` tick.<br>Read-only `<li>`s for volunteers; `role="tab"` buttons for leads (selected: `navy` fill, `on-navy` text). |
| **PlacesBoard** | 4-column grid of 44px slots, 10px radius.<br>• Placed: `navy`, gold Saira ordinal + 16px/800 wristband; a button to change it.<br>• Current: `gold` + 2px `navy` ring, "3RD ?".<br>• Empty: 1.5px dashed `line-strong`, `ink-muted`. |
| **RunnerButton** | Compact runner tile: 3-column grid, 72px tall, radius 36/36/12/12 (a shallow arch), `card`, `shadow-tile`, Saira 900 34px tabular. On press, move down 4px and drop to `shadow-card`. `aria-label="2032 came 3rd"`. This **replaces** the 150px RunnerTile on the finish line. |
| **OrderRow** | 44px row, grid `44px 1fr 44px`: Saira ordinal, wristband 18px/800, a drag handle button. `card` + `shadow-card`; while dragging, `shadow-raised`. An unplaced row is dashed `line-strong`, with a DNF StatusTag. |
| **Toast** | Fixed above the footer, `navy`, `radius-lg`-ish (14px), `shadow-raised`. Gold tick + 14px/700 message + a gold "Undo" button at least 44px. `role="status"`. 6 seconds, paused while focused. The "changed since" variant swaps Undo for "Open race" and the message for "Tom Barker changed this since. Open the race to edit it." |
| **TeamCard** | A relay team at the start line. Head row (at least 44px): "Team 5" 18px/800 `navy`, a 13px/700 `warn-ink` note ("Runs short · 3 of 4", "Aisha Noor is changing this team"), then small Buttons Edit and Take off at the end. On a heat its legs are attendance rows (`card`, `shadow-card`, `radius-md`): "1st leg" 12px/700 `ink-muted` over the wristband, and a 44px grip. On a final the whole card is one `card` with "1st seed · " before the name, Here / Absent pills in the head, and each leg a 44px row under a 1px `line` rule; an Absent card is dashed `line-strong`. A dragged leg lifts with `shadow-raised`. |
| **TeamSheet** | A Sheet. List: a card per team, 1.5px `line` outline and `radius-lg`; a team that can be changed is `card` + `shadow-card` with a pencil, its four legs on `paper` in a 4-column grid under 12px ordinals. Edit / New team: one leg box per row, grid `56px 1fr 44px` (label, a 56px tall TextField at 26px, grip). Its actions stay docked at the sheet's foot (`paper`). Change anyway is a centred question over the sheet (`card`, `radius-xl`, `overlay` scrim), its two buttons stacked. |
| **RunnerButton, team tile** | The relay variant of RunnerButton: 2 columns, at least 104px tall, two lines of equal size (32px), "Team 5" over its 4th leg's wristband "2054". `aria-label="Team 5, 4th leg 2054, came 1st"`. |

Update existing READMEs where the new flow changes them:
- RunnerTile: superseded by RunnerButton.
- PlaceTrail: superseded by PlacesBoard.
- JobCard: now used only on Join and the role sheet, as radio cards.
- Breadcrumb: no longer used on race screens.
- ActionFooter: Updated-at line dropped on volunteer race screens.

## What happens to today's screens

| Old screen(s) | New home |
|---|---|
| 1 Join | Join (adds the job choice) |
| 2 Home: choose your job | Races (Home); the job lives in the RoleChip |
| 3–4, 10, 16 Pick event / section / race | Races list + HeatChips + New race sheet |
| 5–8 Check-in steps | Race · Start line |
| 9 Saved confirmation | Toast with Undo on Races |
| 11–14 Finishing order steps | Race · Finish line (PlacesBoard + RunnerButtons) |
| 15 Check the order | Race · Finish line · check the order |
| 17–19 Times steps | Race · Timer |
| 20–21 Become a zone lead / lead home | The Zone lead row in the role sheet; Races as lead |
| 22–23 Dashboard / To check | Removed: issues show on race cards and in the lead's race tabs |
| 24, 27, 28 Settle tie, runner actions, race detail | The "⋯" race actions sheet and the lead tabs |
| 25–26, 29 Results, leaderboard, heats complete | Unchanged; reached from the avatar menu. The final now comes from "+ Final" on the card. |
| 30–32 Day setup | Unchanged; reached from the avatar menu |
| Relay race screen (holds, Take over, Submit Race) and the Teams screen | Relays tab in the race flow, with each relay's teams sheet (see "9. Relays") |

## Build order

Ship each milestone behind the existing app; each one is usable on its own.

1. **Data and routes.**
   - Event groups, races with heat numbers (unique per group), derived step status, and the per-person role.
   - The `/races` and `/races/:raceId` routes.
   - *Done when:* the API returns every group with its races and step statuses for a given role.
2. **Races (Home) and New race.**
   - EventTabs, RaceCard, HeatChips, sections and ordering, the New race sheet, the duplicate-heat guard, the empty states.
   - *Done when:* two phones creating "Girl Cubs heat 5" at once end up with one race.
3. **Race shell and the role sheet.**
   - App bar, HeatChips with swipe, StepStrip with live updates, RoleChip, Switch job.
   - *Done when:* switching role on a race swaps the body without leaving the race.
4. **Start line body**, with the existing warnings and the 6-runner soft warning.
5. **Finish line body and check the order.**
   - PlacesBoard, RunnerButtons, auto-advance to review, OrderRows with keyboard moves, DNF toggles, save.
   - *Done when:* a 12-runner heat can be fully placed and saved on a 390 × 844 screen with no horizontal scroll.
6. **Timer body**, moved onto the shell. Behaviour unchanged.
7. **Zone lead.**
   - Tabs, editable steps, inline issues with "It's right", the "⋯" actions, the avatar menu, Ready for you for leads.
   - Remove the Dashboard and To-check screens.
8. **Finals:** "+ Final" on the card and in the sheet, the fastest 6 pre-filled, the tie block.
9. **Toast with Undo**, and removal of the Saved screen.
10. **Design system update:** the new component CSS, READMEs and previews; rewrite screens.md for the new flow.

## Checks before calling it done

- **Each role on a phone (390 × 844)** can do their step on a 6-runner and a 12-runner heat without scrolling past the footer, and every target is at least 44px.
- **Two volunteers at once:** a finish-line phone and a timer phone work on the same heat at the same time. Both saves land, and the lead's Times tab shows wristband + time joined by place.
- **Accessibility:** the WCAG checks in [accessibility.md](accessibility.md) pass on every new component. In particular, every HeatChip and StepStrip state is readable in words without colour.
- **Soft warning:** shows once at the 6th runner on a Races-tab event, never on Hurdles, and never blocks. It reappears for a 7th runner added at the finish line only if it hasn't been shown to that person on that race.
- **Undo:** each step's save can be undone from the toast. It restores exactly the person's own change and leaves no orphaned data. If someone else edited the same step in between, the toast offers "Open race" instead, and nothing is undone.

## Decisions already made

1. **Heat naming is the same for every event type.** All runs are "Heat *n*" (chips "H1"), including 200m and 400m.
2. **The 6-runner soft warning applies to the Races tab only** (60m, 200m, 400m), with 6 as the default for all of them.
3. **Undo reverses only the person's own, local save**, and steps aside if someone else has changed the same step since.
