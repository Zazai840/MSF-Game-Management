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
- **Relays.** Keep the Relays tab, showing an empty state ("Relays are coming soon."). Don't design or build the relay flow.
- **Results and Day setup.** Keep their behaviour; only their entry point moves (see "Zone lead").
- **Any visual restyle** beyond what this plan and the design system specify.

## Concepts and data

| Concept | Meaning | Notes |
|---|---|---|
| Event type | Races, Hurdles, Relays | The three tabs on Home. |
| Event | A distance within a type: 60m, 200m, 400m (Races); 60m Hurdles (Hurdles) | Comes from Day setup's event list; New race only offers confirmed, switched-on events. |
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
- Only events whose rules have finals get one. Per the rulebook that is **60m** (and relays, out of scope). 60m Hurdles, 200m and 400m are decided by fastest overall time, with no final.
- The Final becomes available on an event group once **every heat has Times done**. Anyone can create it.
- On creation, the final's runners are pre-filled with the fastest 6 across the heats. Ties at 6th are resolved by the existing tie flow before creation; a tie at 6th blocks the final with a lead issue.
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
- Relays shows the empty state only.

**List**, grouped into sections. Hide a section that is empty.
1. **Ready for you:** event groups with at least one race whose step for *my role* can be worked on now and isn't done. For a zone lead: groups with an open issue (see "Zone lead").
2. **In progress:** every other group with a race that isn't fully done, or a final ready to create.
3. **Done:** collapsed Disclosure, "Done (4)", listing groups where every race is fully done.

**Ordering**
- Within Ready for you: the group whose oldest waiting race was created first comes first.
- Elsewhere: most recently updated first.

**RaceCard**, one per event group:
- Title "60m · Girl Cubs", a code tag (R4), and one status line in words written for my role ("Heats 3 and 4 need times · 1 and 2 done").
- Then the **HeatChips** row: one chip per race in order, then "+" (add the next heat).
- When it applies, a lead (Zone lead role) gets a "+ Final" chip; tapping it opens a confirm sheet ("Have all Girl Cubs heats run? 3 heats saved. The final takes the fastest 6, and no more heats can be added." with Make the final and Not yet). A volunteer sees "A lead makes the final once every heat has run." under the chips instead. A locked final isn't shown on the card.
- Tapping a chip opens that race.

**Footer**: Updated-at line with Refresh, and the display-primary "+ New race".

**After saving any step**, return here and show the **Toast**: "Times saved · Girl Cubs Heat 2" with **Undo**.
- The toast lasts 6 seconds.
- **Undo reverses only this person's own save**, the local change they just made. It restores the step to exactly how it was before that save and reopens the race at that step. It never touches other steps or other people's edits. Other steps don't depend on it: times are keyed by place and positions by wristband.
- **If someone else has changed the same step since the save**, Undo would wipe out their work. So the toast shows "Tom Barker changed this since. Open the race to edit it." with an "Open race" button instead of Undo.

**Empty state** (no races in the tab): "No races yet. Tap New race when a race lines up."

### 3. New race (artboard `N3-NewRace`)

A Sheet over Races:
- **Event:** choice buttons, for this tab's events only.
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

#### 6. Finish line: record positions (artboard `N6-FinishLine`)

**PlacesBoard**
- A 4-column grid with **one slot for every runner in the race** (1st … *n*th).
- Placed slots are navy: gold ordinal plus wristband. Tap one to change it.
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
- **"Not placed"** heading with a small "+ Runner not on the list" button. Each unplaced runner is a dashed row with a DNF tag ("Did not finish" by default). Tapping the row toggles Did not finish / Didn't run.
- **Footer:** display-primary "Save the order". It marks Finishing order done, returns to Races and shows the toast.
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
  - "⋯" opens a Sheet of race actions: Re-run race, Delete race, Settle a tie (only when one exists), Correct runner list, Disqualify runner.
  - These are today's lead actions from screens 24, 27 and 28, moved here.
- **StepStrip becomes tabs:** Runners ✓ / Finishing order ✓ / Times "⚠ 1 to check" (`role="tablist"`). The selected tab is navy.
- **Each tab shows that step's data, editable:**
  - Runners: the chip list.
  - Finishing order: OrderRows.
  - Times: rows joining place, wristband and time, each with a pencil button.
- **Problems sit on the row they're about.** A kept warning or a count mismatch shows as an inline WarningCallout with actions: "Fix time" and "It's right". "It's right" clears the issue and records who accepted it.
- **No To-check screen.** Issues live on races. On Home, a lead's "Ready for you" section is the groups with open issues, and each card's status line names them ("Heat 3: a time looks wrong").
- **Lead menu:** the avatar opens a menu with Results and Day setup, the existing screens.

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
| 25–26, 29 Results, leaderboard, heats complete | Unchanged; reached from the lead menu. The final now comes from "+ Final" on the card. |
| 30–32 Day setup | Unchanged; reached from the lead menu |

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
   - Tabs, editable steps, inline issues with "It's right", the "⋯" actions, the lead menu, Ready for you for leads.
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
