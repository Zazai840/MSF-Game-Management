# Screen recipes

> **Built as the race flow.** The volunteer and lead flows below (screens 2–24, 27–29) are replaced by [race-flow.md](race-flow.md): Races (Home), New race, Switch job and the race screen per role. Results, Day setup and Join keep the screens here, except that Join adds the job choice and Results and Day setup open from the lead menu.

> **Superseded in part.** [race-flow.md](race-flow.md) replaces the volunteer and zone-lead flows below (screens 2–24 and 27–28). Join, Results and Day setup still apply, except where race-flow.md changes them.

How each of the app's 32 screens is built from this system. Screen numbers match the review pack ("Running Zone: screens for review", 18 October 2026). Copy stays as it is in the app today unless a line below says otherwise.

Every screen:
- Starts `<div class="rz-screen rz-zone-running">`.
- Has a compact **AppBar** with a back link to the parent screen and the avatar. Home (2) and Home as a zone lead (21) use the hero AppBar instead.
- Ends with an **ActionFooter** whose first line is "Updated at 11:41:17 AM" plus a small **Refresh** button, named for what it refreshes ("Refresh Start line", "Refresh Finish order", "Refresh Times", "Refresh Results").

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

**13 Finishing order: runner not on the list.** As 5: prompt "Runner not on the list: wristband number?" and a numeric field with the same warnings. Footer pair: secondary "Back to order", primary "Next".

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
- Numeric TextField "Place time", hint "Shows as <strong>12.34</strong>" and "Type digits only: 1234 shows as 12.34, 13240 as 1:32.40. Tap a place to retype it."
- Footer trio: secondary "Back", secondary "No more finishers", primary "Next".

**18 Times: time faster than the place before.** The current slot and the field take the warn state; the slot note reads "Faster than 1st place". A WarningCallout follows: "The 2nd place time is faster than 1st. Fix it, or keep it if the timer really shows that." with "Fix time" and "Keep".

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

**24 Settle a tie.** The Leaderboard behind with a Sheet over it:
- Title "Tie at 11.30", text "2006 and 2012 have the same time in different races."
- Block secondary actions "No run-off needed", "Run-off held", "Decided without a run-off", then "Close tie".

## Results

**25 Results: all events**
- `display-screen` "Results" and the EventGrid legend (Done, Running, Not started).
- For each event, an `rz-section` ("60m", "60m Hurdles", "200m"…) and an EventGrid of its sections: "R4 · Girl Cubs" with status "Heats running · 5 races".

**26 Results: one event's leaderboard**
- The scoreboard surface: compact AppBar on `scoreboard` with the star pattern, back link "Results" in gold.
- `rz-board-title` "60m / Girl Cubs" with an R4 code tag, the live chip "Heats running · 5 races", and the note "Top 8 · Q = fastest 6".
- Leaderboard: qualifiers (star rank, Q tag, gold time), the qualifying line, places 7–8 with plain ranks, then places outside the top 8 as `--outside` rows. Tied rows carry a TIE tag.

**27 Runner actions (disqualify).** Tapping a leaderboard row opens a Sheet titled "Runner 2002" with a block danger Button "Disqualify", a block primary "Correct number" and a block secondary "Close actions".

**28 A race in detail**
- `display-screen` "Heat 1 · 60m Girl Cubs", meta "Checked in 11:41:12 AM".
- A row of small Buttons: "Correct times", "Correct runner list", "Re-run race", "Delete race".
- `rz-section` "Current record", a `body` line listing runners, an ok StatusTag "6 times · 6 finishers".
- ListRows "2001 · Place 2 · 10.45".
- A Disclosure "Saved versions (5)".

**29 Heats complete check.** A Sheet titled "Heats complete":
- `rz-section` "Must settle first": IssueCard-style rows, "Tie: 2006, 2012", "Heat 3: times out of order", "Heat 4: awaiting times", "Heat 5: checked in".
- `rz-section` "Worth a look": `body` "These warnings do not block completion." then the warnings.
- `rz-section` "What this creates": "Finals line-up".
- The final action stays disabled while anything under "Must settle first" remains.

## Day setup

**30 Day setup**
- `display-screen` "Day setup".
- CodeCard "Day code" (6509) with the text "Volunteers type this to join today." and a small Button "Make a new day code".
- CodeCard "Lead code" (KG6C42) with "Give this only to zone leads. It opens the Dashboard." and a small Button "Make a new lead code".
- ListRows "Phones" (meta "4 people joined today") and "Events" (meta "20 events · checked and confirmed").
- `rz-section` "Day export".

**31 Day setup: events**
- `display-screen` "Events", an ok StatusTag "Event list confirmed".
- A card for each event: label "R1 · 60m", meta "Boy Beavers · Heats then final", and small Buttons "Rename R1" and "Switch off R1".

**32 Day setup: phones**
- `display-screen` "Phones", a `body` line explaining Remove.
- A card for each person: name ("Amina Yusuf (you)"), role meta ("Scoring team" / "Volunteer"), and small Buttons "Remove from scoring team" and "Remove".
- A ListRow "Phone and access audit notes" at the end.
