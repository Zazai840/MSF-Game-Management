# Screen recipes

> **Built as the race flow.** The volunteer and lead flows below (screens 2–24, 27–29) are replaced by [race-flow.md](race-flow.md): Races (Home), New race, Switch job and the race screen per role. Results, Day setup and Join keep the screens here, except that Join adds the job choice and Results and Day setup open from the lead's bar (see "The lead's bar" below).

> **Superseded in part.** [race-flow.md](race-flow.md) replaces the volunteer and zone-lead flows below (screens 2–24 and 27–28). Join, Results and Day setup still apply, except where race-flow.md changes them.

How each of the app's 32 screens is built from this system. Screen numbers match the review pack ("Running Zone: screens for review", 18 October 2026). Copy stays as it is in the app today unless a line below says otherwise.

Every screen:
- Starts `<div class="rz-screen rz-zone-running">`.
- Has a compact **AppBar** with a back link to the parent screen and the avatar. Home (2) and Home as a zone lead (21) use the hero AppBar instead.
- Ends with an **ActionFooter** whose first line is "Updated at 11:41:17 AM" plus a small **Refresh** button, named for what it refreshes ("Refresh Start line", "Refresh Finish order", "Refresh Times", "Refresh Results").

**The lead's bar.** On a lead's phone, Races, Results (25) and Day setup (30) end with a bar of three tabs below the ActionFooter: Races (`hurdle`), Results (`trophy`), Day setup (`sliders`).
- `<nav class="rz-leadnav" aria-label="Lead screens">`, one button per tab: the icon above the word, `crumb` type, `size-action` high, `navy` on `card`. The current screen's tab has `aria-current="page"` and is `on-navy` on `navy`.
- It stays at the bottom of the screen. On Races the sticky New race footer sits above it, and the toast there sits one bar higher.
- Results and Day setup have no back link: the bar is the way between the three screens. Every deeper lead screen keeps its back link and has no bar. A phone that is not a lead's never shows the bar.
- The layout is the same at every width.

Volunteer task screens use the back link only. Zone-lead screens (22–32) also show a **Breadcrumb** under the AppBar. With more than four levels, it starts with "…".

## Joining

**1 Join the Running Zone**
- Compact AppBar with no back link and no avatar: just "Running Zone" in `display-appbar`.
- `display-screen` "Join the Running Zone", then a `body` line ("Ask for the day code. Starting the first Olympics day? Use the owner password.").
- Two TextFields, text variant: "Day code or owner password" and "Full name".
- A block primary Button, "Join".
- A wrong code shows a WarningCallout under the first field with no actions. Suggested new copy: "That code isn't right. Check it with your zone lead."

## Volunteer home

**2 Home: choose your job**
- Hero AppBar: eyebrow "MSF Olympics", title "Running / Zone", and the ZoneSwitcher with Running current.
- `.rz-heading-row`: `display-screen` "Pick your job" with a pill Button, "I'm a zone lead".
- JobCards: Check in runners (`--checkin`), Record the finishing order (`--finish`), Enter times (`--times`).
- Each card with waiting races shows a Badge ("1 race ready", "2 races ready").
- Footer: refresh line only.

## Job 1: Check in runners

**3 Check in: pick the event.** `display-screen` "Which race is it?", then two lists:
- `rz-section` "Already at the start line": ListRows such as "60m Girl Cubs" with meta "R4 · Heat 4".
- `rz-section` "Check in a new race": ListRows 60m, 60m Hurdles, 200m, 400m.

**4 Check in: pick the section.** `display-screen` "60m: which section?". ListRows "Boy Beavers" … "Girl Scouts", each with an `rz-code-tag` (R1–R6) on the right.

**5 Check in: type the first wristband**
- Prompt: meta "60m · Girl Cubs", question "Runner 1: wristband number?" (compact prompt modifier, because the keyboard is open).
- Numeric TextField, label "Wristband number", placeholder "e.g. 205".
- Footer pair: secondary "That's everyone" (disabled until one number exists), primary "Next" (disabled while the field is empty).

**6 Check in: typing wristbands.** As 5, with WristbandChips above the field for numbers already entered, and the hint "Tap a number to remove it." Each chip's remove button is labelled "Remove 2041".

**7 Check in: amber warning on a number**
- The field takes the `--warn` modifier and a WarningCallout follows: "3046 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999."
- Actions: primary "Fix number", secondary "Keep".
- Earlier chips stay visible.

**8 Check in: check the runners**
- `display-screen` "Check the runners", `body` "5 runners lined up".
- ListRows "Runner 1 · 2041" …; a kept number shows a Kept StatusTag ("Kept · lead will check").
- Footer: display-primary "Save", secondary "Add another runner".

**9 Saved confirmation**
- Confirmation: gold star with tick, title "Saved" (new: a short display word above the existing message), text "Thank you. Your responses have been saved.", meta "60m Girl Cubs · Heat 5 · 5 runners".
- Footer: display-primary "Check in the next race" (wording follows the job), secondary "Home", then a row of small buttons, "Edit runners" and "Delete this race".

## Job 2: Record the finishing order

**10 Finishing order: pick the race**
- `display-screen` "Which race is it?".
- A `--resume` ListRow "Carry on with 60m Girl Cubs Heat 4".
- `rz-section` "Waiting for a finishing order" (oldest first).
- `rz-section` "Recent races".

**11 Finishing order: who came 1st?**
- Prompt: meta "60m · Girl Cubs · Heat 4 · 5 runners", question "Who came <em>1st?</em>", help "Tap runners in the order they crossed the line."
- RunnerTiles in a 2-column grid.
- Footer: display-primary "Nobody else crossed the line", secondary "+ Runner not on the list".

**12 Finishing order: part way through.** As 11, with the PlaceTrail above the prompt: navy tags "1ST 2033", "2ND 2031" and the gold current tag "3RD ?". Tapping a placed tag goes back to that place.

**13 Finishing order: runner not on the list.** As 5: prompt "Runner not on the list: wristband number?" and a numeric field with the same warnings. Footer pair: secondary "Cancel" (it leaves without adding anyone), primary "Add runner".

**14 Finishing order: remaining runners**
- PlaceTrail of everyone placed.
- Prompt "2032 has no place. What happened?" (compact).
- A block secondary Button for each outcome: "Did not finish", "Didn't run".
- Footer: secondary "+ Runner not on the list".

**15 Finishing order: check the order**
- Prompt "Check the order", help "Wrong place? Drag the handle on the right to move a runner."
- ReorderList: placed rows, then unplaced rows with a DNF tag ("Did not finish").
- Small Button "Change order".
- Footer: display-primary "Save", secondary "+ Runner not on the list".

## Job 3: Enter times

**16 Times: pick the race.** As 10, with "Carry on with …" first and races where counts disagree at the top of "Waiting for times". Those rows use the `--warn` ListRow.

**17 Times: type a place time**
- Prompt: meta "60m · Girl Cubs · Heat 3 · 5 runners · checked in 11:41 AM", question "1st place time?" (compact).
- PlaceTimeGrid: the current slot gold; filled slots show their time; "No finisher" in muted.
- Time box "Place time": the time itself, filling from the right as digits are typed (1234 shows 12.34, 13240 shows 1:32.40), hint "Type the digits on the timer. They fill from the right: 1 2 3 4 shows 12.34." Tap a place to retype it.
- Footer trio: secondary "Previous place", secondary "No more finishers", primary "Next".

**18 Times: a wrong time.** The current slot and the field take the warn state; the slot note reads "Faster than 1st place", or "Slow for 200m" for a time slower than 1.5 m/s for the race. A WarningCallout sits directly above the field: "The 2nd place time is faster than 1st. Fix it, or keep it if the timer really shows that." (or "The 3rd place time, 3:10.22, looks slow for 200m. ...") with "Fix time" and "Keep". A time that cannot be one (seconds over 59, 0.00, faster than 10 m/s) is refused instead, in the amber callout under the field, its digits selected.

**19 Times: check the times**
- `display-screen` "Check the times" with an ok StatusTag "4 times · 4 finishers".
- If anything was kept, a `body` note: "Kept as typed. A zone lead will check it."
- ListRows "1st 12.34", each with a pencil icon button "Edit 1st place time". A kept row uses `--warn` with a note.
- Footer: display-primary "Save", secondary "5th did finish".

## Becoming a zone lead

**20 Become a zone lead.** Compact AppBar with back link "Home". `display-screen` "Become a zone lead", TextField (text variant) "Lead code or owner password", block primary Button "Become lead".

**21 Home as a zone lead.** As 2, with a sixth element above the JobCards: a JobCard `--dashboard` "Dashboard" with an alert Badge "5 to check".

## Lead dashboard

**22 Dashboard.** `display-screen` "Dashboard", then JobCards:
- "To check" (`--dashboard`, alert Badge "5 to check", description "Problems on races that need a zone lead to decide").
- "Results" (`--results`, description "Standings for every event, heats and finals").

**23 To check list.** `display-screen` "5 things need a zone lead", then IssueCards, newest first. Each has where ("R4 · 60m Girl Cubs · Heat 3"), time, title ("A time looks wrong"), a body sentence, and a small primary Button "Open race".

**24 Settle a tie.** A full screen at `/results/<code>/ties/<tieId>`, opened from a TIE tag, a race's "Open in Results" or Confirm the medals' "Settle tie"; Back (the only way out) returns there:
- Lead header "Tie at 11.30" with the event code. Prompt: meta "60m · Girl Cubs · decides 2nd and 3rd", question "How was the tie *decided?*", help "2006 (Heat 1) and 2012 (Heat 2) both ran 11.30."
- Stacked choices "No run-off needed", "Run-off held", "Decided without a run-off". The last two show "Order, 2nd first" with OrderRows (place from the tie's first place, the number, its heat below) that keep same-race order.
- Comment (needed only for Decided without a run-off), then a docked "Save tie" with its reason above while it cannot save. Saving shows "Tie saved · 60m Girl Cubs" and goes back.

**25 Confirm the medals.** A full screen at `/results/<code>/confirm-the-medals`, opened from a Races card, the Final tab, or the Heats tab of a timed event; Back (the only way out) returns there:
- Lead header "Confirm the medals" with the event code (the action, as on Results without a final and each Reopen: "Reopen heats"); the back arrow's fallback is the event. Prompt: meta "200m · Boy Cubs · 3 heats · no final" ("... · 2 heats · final" on a final), question "Confirm the *medals*", help "Check the places, then confirm. They go to the Day export."
- "Settle first" and "Worth a look": IssueCards, each with one small button naming its action and thing: "Settle tie" (the tie screen), "Open Heat 3" (the race page), "Open 2041" (the runner sheet over the screen). Settle first's are primary. A section with nothing in it is left out.
- "Medal places": "A place is wrong? Tap Fix beside it.", then a row per place: the place on a gold star, the number or team, its race and time below ("Heat 2 · 10.00"; "Final" on a final), a TIE tag while an open tie holds it, and a small "Fix" with the pencil, which opens that race on Correct times (Correct finishing order on a final) and comes back here.
- A docked "Confirm the medals", grey with "Settle 2 things first." above it while Settle first holds anything. Confirming shows "Medals confirmed · 200m Boy Cubs" and goes back.

## Results

**25 Results: all events**
- `display-screen` "Results". No legend and no distance headings.
- Three `rz-section`s, each an EventGrid in programme order and left out when empty: "Action required" (the same events as a lead's Action required on Races), "Running", "Done".
- Then a closed Disclosure "Not started (26)": the events with no races, as an EventGrid when opened.
- A cell: "60m · Girl Cubs" with its code tag (R4), then the status in its Races card's words ("Heat 1: 1 time to check"), " · Switched off" on a switched-off event, and "Latest note 10:42" when it has a note.

**26 Results: one event's leaderboard**
- The scoreboard surface: compact AppBar on `scoreboard` with the star pattern, back link "Results" in gold.
- `rz-board-title` "60m / Girl Cubs" with an R4 code tag, the live chip "Heats running · 5 races", and the note "Top 8 · Q = fastest 6".
- Leaderboard: qualifiers (star rank, Q tag, gold time), the qualifying line, places 7–8 with plain ranks, then places outside the top 8 as `--outside` rows. Tied rows carry a TIE tag.

**27 The runner sheet.** Tapping a runner (on the Heats leaderboard, the Final tab or a race page) opens a Sheet titled "Runner 2002" (or "Team 3"): a meta line (event, heat, place in race, time, any disqualification), the runner's Notes as IssueCards, then block Buttons: primary "Mark checked" (only with an open warning; saves at once), "Correct number", "Choose which result counts" (when the runner has more than one result), "Open Heat 1", and a danger "Disqualify 2002" last (or "Lift disqualification"). Correct number, Choose which result counts, Disqualify and Lift disqualification are race-flow screens with a docked button.

**28 A race page** at `/results/<code>/races/<raceId>`, and its Race actions:
- Lead header "Heat 1" with the event code, back to the event's tab; no "⋯".
- On top, the race's open To check problems as WarningCallouts in the To check wording, each with "It's right" (the kinds a lead can accept; it saves at once) and a primary button that opens the correction that fits: "Fix time" opens Correct times (Correct finishing order on a final); "Fix" opens Correct runner list (Correct teams on a relay) for a wristband warning, an entry added at the finish, a child in two relays and a team that ran short, and the Counted result screen for a child or team that ran twice; "Decide the tie" opens the tie.
- Meta "60m · Girl Cubs · checked in 10:05 · saved" (or "deleted", "not saved yet").
- A deleted race: a status WarningCallout "Deleted at 10:42 by Sara Ahmed: wrong section checked in. Its results do not count." ("Replaced by a re-run at …" for a re-run's race). A race not saved yet: "Heat 3 is not saved yet. Open it to finish its steps." with "Open Heat 3".
- An ok StatusTag "6 times · 6 finishers", then the lead's rows: place, wristband or team (its four children under it), time; a wrong time's reason, a kept warning or another To check reason ("Added at the finish", "Ran twice in this event", "TIE") on its own line, the row amber while one is open. A row opens the runner sheet.
- Below the rows, a block Button that names what its Sheet holds: "Correct or delete Heat 1" on a saved race, "Restore or delete Heat 1" on a deleted race, "Delete Heat 1" on a race not saved yet or replaced by a re-run.
- A Disclosure "Saved versions (5)", then Updated at.
- That Button, and "⋯" on the race screen, open one Sheet "Heat 1 · actions": Correct times (not on a final), Correct finishing order, Correct runner list (Correct teams on a relay), Re-run race, then a danger "Delete Heat 1" set apart. A deleted race: primary "Restore Heat 4" and a danger "Delete for good". A race not saved yet: where to finish its steps ("… on this screen first." on the race screen), "Open Heat 3" on a race page, and Delete.
- Re-run, Delete and Restore are race-flow screens at `<race>/re-run`, `/delete`, `/restore` (under the race page or `/races/<raceId>`): Re-run "Re-run *Heat 2?*", "Heat 2 moves to Deleted races. A new Heat 2 opens with the same runners checked in.", docked "Re-run Heat 2", landing on the new heat at its first step in place of the old race in history; Delete with stacked choices "Move to Deleted races" / "Delete for good" and a danger docked "Delete Heat 1" (or "… for good"), back to the screen before the race; Restore "Its results count again." (and the number it comes back as when its own is taken), docked "Restore Heat 4", staying on the restored race page.
- Correct times and Correct finishing order are race-flow screens at `<race>/correct-times` and `/correct-finishing-order`, back to the screen they were opened from on Save (one toast, one Notes line); Back without Save changes nothing. Both end with "Comment (optional)" (never focused on its own) and a docked Save greyed with its reason above it. Correct times: "Correct the *times*", a lead row per place (a wrong time amber with its reason) with a "No finisher" pill on the same line; tapping a row swaps it for the race flow's time box ("2nd place time"); out-of-order times show a WarningCallout with "Accept these out-of-order times"; docked "Save times" ("Change a time to save.", "Type a time for each place.", or the leftover places). Correct finishing order: "Correct the *finishing order*", OrderRows with the place's time under the wristband (or team), a small "No place" and the handle; No place opens a Sheet ("No place for 2002": Did not finish, Didn't run); those without a place follow under "No place" (Did not finish with "Give a place"); docked "Save finishing order" ("Change the order to save.").
- Correct runner list and Correct teams are race-flow screens at `<race>/correct-runner-list` and `/correct-teams`. Nothing saves until the docked button; Back leaves the race as it was. Correct runner list: "Correct the *runner list*", one lead row per runner (tap to retype on the number pad, docked Done) with a small red × to remove it, a small "Add runner", docked "Review runner list" (greyed with "Change, add or remove a runner first."). Warnings wait in a WarningCallout with Keep warnings / Fix runners; then "*7 runners.* Is that right?", each kept warning, the choice "Record the finish order again" / "New runners did not finish" when runners were added after the finish, an optional comment and docked "Save runner list". Correct teams: "Correct the *teams*", each team as leg chips with a small Take off (a chip opens "Change *Team 2's* 3rd leg" with Cancel / Done, checked as the start line checks a leg), "Still to run" with Add, an optional comment and docked "Save teams" (greyed with "Change a team first."). Each save is one toast ("Runner list saved · Girl Cubs Heat 1", "Teams saved · …") and one Notes line, back where it was opened.

**29 Heats complete check.** Removed. A lead makes the final with "+ Final" on the event's card, after a confirm ("Have all Girl Cubs heats run?"). "+ Final" is greyed, with the reason, while a heat is not saved or has something to settle first (a tie at 6th, a time to check).

## Day setup

**30 Day setup**
- `display-screen` "Day setup".
- One CodeCard with "Olympics password" and "Lead code" side by side (each code in `display-screen` size, so two fit across a 360px phone) and one line: "The Olympics password is for every volunteer. The lead code is only for zone leads." No button in the card.
- Seven ListRows in the order of the day, all on one phone screen: "This day" (meta "2026 · South · Day 1", or "Choose the region and day" in the `--warn` style until region and day are both set), "Events" (meta "26 events"), "Signed in today" (meta "4 people signed in today"), "Change Olympics password", "Make a new lead code" (asks in a Sheet), "Day export" (meta its status sentence, in the `--warn` style when changes came after the last download), "Start a new day".
- This day (`/day/this-day`), Day export (`/day/export`) and Start a new day (`/day/start-a-new-day`) are their own screens with a back arrow to Day setup, each holding one card: the Year, Region and Day choices saved on tap; the download with its status; the red-outlined card with "Type NEW DAY to confirm".
- "Updated at" with Refresh.

**31 Day setup: events**
- `display-screen` "Events".
- A card for each event: title "60m · Boy Beavers" with its code tag R1, meta "Races · Heats then final" (plus " · Switched off" when off), and small Buttons "Rename" and "Switch off". A refused save shows "Not saved - try again" on that card.
- A block Button "+ Add an event", then "Updated at" with Refresh.
- Rename and Add an event are full race-flow screens with a docked button ("Save name", "Add event").

**32 Day setup: Signed in today**
- `display-screen` "Signed in today", a `body` line "Role changes last for today only."
- A ListRow for each person: label the name ("Amina Yusuf (you)"), meta the level, Owner and role ("Lead · Owner · Zone lead", "Volunteer · Timer"). The lead's own row is not a button and has no chevron.
- A tap on another person's row opens a Sheet named after the person: block Buttons "Make lead" or "Make volunteer" (never Make volunteer for the owner; saved at once with a toast), then a red "Remove" set apart, which asks "Remove <name>?" in a second Sheet.
- A closed disclosure "Notes (3)" at the foot, then "Updated at" with Refresh.
