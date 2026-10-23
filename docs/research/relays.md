# Relays: what Scouts' rulebooks, matrices and scoring database say

Research for issue #128 (relays). Researched 2026-10-23.

Question: what do Scouts' own documents say about relay events, relay teams, how relays are ranked and scored, how the scoring database records them, how teams are written down today, and how relays are ruled?

Facts only. Each fact carries a source tag; the sources are listed at the end. None of the source files are in git. No child's name or date of birth from the sample database is reproduced here; the database is described by structure only.

## Short answer

- Every Section has one relay event: Beavers and Cubs run **4x50m** (each leg 50m), Scouts run **4x100m** (each leg 100m). Event codes **R19** Boy Beavers, **R20** Girl Beavers, **R21** Boy Cubs, **R22** Girl Cubs, **R27** Boy Scouts, **R28** Girl Scouts. [N26 p6], [S26 p6], [DB-T Events]
- A team is **exactly four** children from **one group**: "The team must have all FOUR members to compete". One team per group per Section. If a group has only three, it may borrow **one** child: Cubs borrow a Beaver of the same gender, Scouts borrow a Cub of the same gender, Beavers borrow a Beaver of the other gender. A group with only two cannot enter. [N26 p6], [N26 p3]
- **Finals: the documents disagree.** All four rulebooks (2025 and 2026, North and South), both 2026 matrices, the scoring database and Scouts' app requirements say relays have heats and a final of 6 teams. Only the newest note, `MSF Relay.pdf`, says "No finals, just based on timings of heats". See Contradictions.
- Points are 5 / 3 / 1 for 1st / 2nd / 3rd. The database records a relay result **per team** (one wristband per place plus three teammate columns) and then expands it to **one row per child**: the group gets the 5/3/1 points once, each of the four runners gets a medal, and each runner is credited a quarter of the points. [N26 p4], [DB-T Input - Running], [DB-T Results Matrix]
- In North 2025 the running team wrote the teams down **before any relay race started**, entering four wristband numbers per team (Runner 1 to 4) into last year's prototype. [Meeting p4, p7]
- The rulebooks cover a dropped baton, staying in lane, and disqualifying a team for obstruction. They say nothing about changeover zones, and the false start rule is only stated for the other running events. [N26 p5, p6]

## 1. Relay events per day, Section, distance, code, and place in the programme

### Distances and codes

| Section | Event (database name) | Code | Rulebook distance | Track (rulebook) |
|---|---|---|---|---|
| Boy Beavers | 4x50m relay | R19 | 4x50M, each leg 50M | North 2026: straight track, day programme. South: not stated |
| Girl Beavers | 4x50m relay | R20 | 4x50M | as above |
| Boy Cubs | 4x50m relay | R21 | 4x50M | circular |
| Girl Cubs | 4x50m relay | R22 | 4x50M | circular |
| Boy Scouts | 4x100m relay | R27 | 4x100M, each leg 100M | circular |
| Girl Scouts | 4x100m relay | R28 | 4x100M | circular |

- Codes, names, Section, `Type = Team` and `Medal Count = 4` come from the Events sheet of both the blank template (rows 32 to 35, 40, 41) and the North 2025 sample (same rows and codes). [DB-T Events], [DB-S Events]
- The hidden older sheet `Events (2)` uses the same codes but names them "200m relay" (R19 to R22) and "400m relay" (R27, R28), i.e. total distance. [DB-T Events (2)]
- `MSF Relay.pdf` says "Beavers 50m relay, On a straight track; Cubs 50m relay, Circular track; Scouts 100m relay, Circular track". Read against the rulebooks, 50m and 100m are the leg lengths. [Relay note]
- North 2026 rulebook only: "Beavers will be completing the relay during the day programme, they will be using the straight track ... instead of running around the circular track, they will be running straight." Not in North 2025, South 2025 or South 2026. [N26 p6]
- The overview says event lists differ slightly between South and North by venue. Only a North database (2025 sample) and the blank template were provided, so South's codes are not confirmed. [Overview "Events"]

### Programme, North 2026 (Sheffield, 22 Nov) [NM26]

| Section | Relay slot |
|---|---|
| Boy Beavers | 10:30 to 10:55, "Running Zone: Relay (hurdles track)" |
| Girl Beavers | 12:25 to 12:50, "Running Zone: Relay (hurdles track)" |
| Girl Cubs, Boy Cubs, Girl Scouts, Boy Scouts | no relay in the day programme; **"RELAY FINALS" 16:55 to 18:00**, after Maghrib and before the closing ceremony at 18:00 |

- The Beavers columns are blank at the end-of-day relay slot (16:40 to 17:45). 60m finals for all Sections are 15:45 to 16:30. [NM26]
- "for north, we put all the relays at the end of the day just because of timings ... we're against the clock trying to get all the relays done in time". [Meeting p9, 15:03]; also [Debrief p2, pain point 7]

### Programme, South 2026 (London, 14 and 15 Nov) [SM26]

| Section | Relay slot |
|---|---|
| Girl Cubs | 11:30 to 12:00, "4x50m RELAYS (Indoor)" |
| Girl Beavers | 12:30 to 13:00, "4x50m RELAYS (Indoor)" |
| Girl Scouts | 12:30 to 13:00, "4x100m RELAYS (Outdoor)" |
| Boy Cubs | 13:50 to 14:20, "4x50m RELAYS (Indoor)" |
| Boy Scouts | 14:25 to 14:55, "4x100m RELAYS (Indoor)" |
| Boy Beavers | 14:55 to 15:45, "4x50m RELAYS (Indoor)" |

- Then **"60m FINALS + RELAY FINALS" 16:55 to 17:45** for all six Sections, before the closing ceremony at 17:45. [SM26]
- In South "the matrix basically has all the activities scattered around the day". [Meeting p9, 14:33]
- Girl Scouts run the 4x100m outdoors and Boy Scouts indoors on the same programme. [SM26]

## 2. Who makes up a team

- "Each group can enter ONE team of FOUR for each section. The team must have all FOUR members to compete." [N25 p6], [S25 p6], [N26 p6], [S26 p6]
- "Groups cannot participate if they only have two attendees from the competing section." [same pages]
- Beavers: "If there are THREE Boy Beaver racing, you can fill the missing runner using ONE Girl Beaver (and vice versa)". [N26 p6], [S26 p6]
- Cubs: "If there are THREE Cubs racing, you can fill the missing runner using ONE Beaver from the SAME gender". [N26 p6]
- Scouts: "If have THREE Scouts racing, you can fill the missing runner using ONE Cub from the SAME gender". [N26 p6]
- General rule for all team activities: "where there is ONE player short of a full team, you may enter ONE player from the same gender, from ONLY the Section below. Beavers can use ONE from the opposite gender". [N26 p3], same in all four rulebooks
- So a team is never three runners and never mixes more than one outsider. The only mixed-gender team is a Beaver team; the only mixed-Section teams are Cubs with one Beaver or Scouts with one Cub.
- Same group: Scouts' app requirements ask that validation confirm "all team members are from correct section and are from same group as each other". [Req p2] The database checks each teammate's group against the group of the first listed runner. [DB-T Input - Running, Running - Heats] The overview calls team members from different groups, genders or Sections "generally against the rules (exceptions apply)". [Overview "Name Finder"]
- The North 2025 sample shows the rule in use: one placed Boy Beavers team includes one Girl Beaver. [DB-S Results Matrix, R19 rows]
- Wristbands cannot show a Beaver's gender: Beavers are 0001 to 0999 for both genders, Cubs and Scouts have separate boy and girl ranges (1000s Cub boys, 2000s Cub girls, 3000s Scout boys, 4000s Scout girls). [Chat-App 11/10 12:58, 14:05 item 5]
- A child in a relay and individual events: "There is no limit to the number of activities an individual competitor can enter". [N26 p3]
- A child in two teams: with one team per group per Section, a child can be on only one team of their own Section's relay. **Not addressed:** whether a borrowed child (a Beaver on a Cubs team, a Cub on a Scouts team) may also run in their own Section's relay. No document says.
- Teams cannot be swapped mid-event: stated only for Tug of War ("cannot be changed at any point"), not for relays. [N26 p10]

## 3. Teams per race and more teams than lanes

- Both relay diagrams draw a **six-lane** track. [Diagram-S], [Diagram-BC]
- Scouts' app requirements: relay heats are "multiple races to accommodate all competitors"; the final is "up to 6 teams racing in a one-off race". [Req p2]
- Last year's prototype race screen has Place 1 to Place 6 wristband boxes. [Meeting p3]
- No document gives a maximum teams per heat or how heats are formed for relays. For individual races Asem says races go by "whoever arrives first" and are not preset. [Chat-App 11/10 13:41]
- Scale: South about 16 groups per day, North about 24, so up to 16 or 24 teams per relay event, one per group. [Debrief p1], [Meeting p9]

### Changeover positions (diagrams) [Diagram-S], [Diagram-BC]

- Scouts relay: runners **1 and 3** hold at the start/finish line, runners **2 and 4** hold on the opposite side of the track, i.e. two changeover points, each leg half a lap.
- "Beavers & Cubs Relay": runners 1, 2, 3, 4 hold at four points a quarter lap apart on the circular track.
- Both show a **prep area** in the infield and a "holding" mark next to each position.

## 4. How medals and points are decided, and equal times

- Points: "1st place = 5 points, 2nd place = 3 points, 3rd place = 1 point." [N26 p4]
- Rulebooks, all four: "60M & RELAY: The fastest 6 competitors from each section will be selected to run in FINALS, with 1st, 2nd, 3rd place being awarded from the FINAL race." [N25 p4], [S25 p4], [N26 p4], [S26 p4]
- `MSF Relay.pdf`: "No finals, just based on timings of heats". [Relay note]
- Scouts' app requirements: "Team (all relay races have heats and finals)". Heats report the top 8 teams by time (with all 4 wristband numbers, time, position); the final reports the top 3 by position, no times needed. [Req p2]
- Database: each relay has a "FINALS" block in `Running - Heats` like the 60m (see section 5). The card creator labels the 4x100m relay scoring card "HEATS". [DB-T Running - Heats, Card Creator (2-pagers)]
- Equal times: no relay-specific rule. Scouts' requirements: notify the running team of ties in the top 8 teams before sending to scoring "so they can judge whether a run-off is required" (e.g. 7th and 8th tied when a top 6 team is disqualified); finals cannot tie because positions are decided in one race. [Req p2]
- Asem: the zone lead makes the first call on a run-off and passes it to the scoring team; "a note might require the zone lead to highlight which person won the runoff". [Chat-App 11/10 14:05 item 8]
- Scouts say ties are rare in running and mostly happen in speed bounce and throwing. [Meeting p6, 04:11]
- Group ranking ties (not relay-specific): group points, then gold, then silver, then bronze. [Meeting p5, p6], [Overview "Section Results"]

## 5. How the database and matrices record a relay

### Events sheet [DB-T Events]

Columns: `Event`, `Event Code`, `Zone`, `Event Name`, `Measurement` (Time for relays), `Colour`, `Section`, `Type` (Team), `Medal Count` (4 for relays, 2 for 3-legged race, 4 for Tug of War, 1 for individual events), `Event Complete`, `Gold`, `Silver`, `Bronze`, `Count`, `Count Complete`.

### Input - Running: one row per event, per team placing [DB-T], [DB-S]

- Header row 2: `Event` (code) in B, then auto-filled `Zone`, `Event Name`, `Section`, `Event Type`; **`1st` in J, `2nd` in M, `3rd` in P** (one wristband each, with a Section check beside each); **`1st` in U, `2nd` in AA, `3rd` in AG** (six teammate wristband columns per place: U to Z, AA to AF, AG to AL); `1st`/`2nd`/`3rd` group codes in AN to AP; `Group Check` from AT; `Section Check` from BL; `Flag` in CD.
- In the North 2025 sample, each relay row holds one wristband per place in J/M/P plus **three** teammates in U to W, AA to AC, AG to AI. So a relay result is one row per event, with each placed team entered as 1 + 3 wristbands.
- The group of a placed team is taken from its first wristband (AN to AP); each teammate's group is checked against it.
- No time column. Asem: "The time part isn't added to the scoring database but is useful for when there's potential ties and for auditing purposes." [Chat-App 11/10 14:05 item 7]
- Only the top 3 are entered here, from the paper scoring sheets. [Overview "Input" tabs]

### Results Matrix: one row per child [DB-T], [DB-S]

- Columns: `Input`, `Lookup`, `Count`, `Col_Index`, `Event`, `Event Name`, `Event Type`, `Team Size`, `Position`, `Competitor`, `Name`, `Section`, `Group`, `Group Name`, `Group Points`, `Ref Points`, `Individual Points`, `Gold`, `Silver`, `Bronze`.
- Each event has 21 rows: 3 places x 7 slots (the place's wristband plus its 6 teammate columns). Empty slots have no group and count for nothing.
- `Group Points`: 5 / 3 / 1 on the first row of each place only, so the group scores once per team.
- `Individual Points`: for Team events, `Ref Points / Team Size`, so 1.25 / 0.75 / 0.25 per relay runner. In the sample R19 rows: first-place runners show 1.25 each, second 0.75, third 0.25.
- `Gold`/`Silver`/`Bronze`: 1 on every runner's row. Medals Tally sums them by group, so a winning relay team brings its group 4 gold medals. [DB-T Medals Tally]
- Group totals (Group Details, Section Results, Total Results) sum `Group Points`. [DB-T Group Details]

### Running - Heats: the finalists sheet [DB-T], [Overview "Running - Heats"]

- Twelve blocks, each titled **FINALS**: 60m for six Sections (R1 to R6) and the six relays (R19 to R22, R27, R28).
- Each block has positions 1 to 6 and a "Competitor Number(s): (use one box unless it is a team event)" area of four wristband boxes, with group and Section checks per box and a flag.
- The overview: heats sheets "capture the top 6 for each event so the finalists can be called upon at the end of programme", and the tab "has no bearing on results matrix".

### Paper scoring card [DB-T All Cards, Card Creator (2-pagers)]

- Per relay event: Section, event name, `Type: Team`, code, "Competitor Number(s): (found on wristbands)", `Results / Time`, `Position`, 26 numbered rows.

### Matrices

- The 2026 programme matrices are timetables only (Section columns, 5-minute rows, zone and event blocks). They hold no results and no event codes. [NM26], [SM26]

## 6. When and where teams are written down today, and by whom

- North 2025, running team (Mohammed): "we get all the kids to come down before we start doing any of the races. And then we record the teams, the wristband numbers for each team ... we'll have the first set of four ready, and we would just have them write the wristband number, next runner, wristband number ... and then that would then be saved." It was "a lot quicker than doing it on a sheet of paper". [Meeting p7, 07:44 to 08:31]
- Summary of the same call: "Relay teams' wristband numbers were pre-recorded; faster than paper but compiling everything fell to one person." [Meeting p5]
- The prototype's "Team Management, Enter Teams (Relays Only)" screen: one wristband field, optional team comments, Next Runner and Save Team buttons, "Collected 0/4", and a Saved Teams table with columns Team (numbered 1, 2, 3...), Runner 1, Runner 2, Runner 3, Runner 4. [Meeting p4]
- Leaders are responsible for getting "the relevant members of their team" to the correct starting location; a group that misses its programme slot loses the chance to score in that activity. [N26 p3]
- The relay diagrams put a **prep area** in the track infield. [Diagram-S], [Diagram-BC]
- Debrief requirement heard from Scouts: "Relay teams registered upfront: wristbands per team before racing starts." [Debrief p3]
- Validation happens later, at the scoring database; the running zone does not see eligibility details. [Chat-App 11/10 13:49]
- Not found: who records teams in South, or for the North 2026 Beaver relays in the day programme.

## 7. Relay rulings

- **Dropped baton:** "Should the baton be dropped during any part of the race, the competitor should pick it up if it is still in their lane and continue running. If it has rolled away, then the competitor should wait for a volunteer to hand it back to them." [N26 p6], all four rulebooks
- **Lanes, Beavers and Cubs:** "After passing the baton, the runners should stay in their lanes until the course is clear of other athletes - obstructing another team results in disqualification." [N26 p6]
- **Lanes, Scouts:** "Runners 1 and 2 must stay in their lane for their leg of the race. Runners 3 and 4 are allowed to cut into the inside lane for their leg of the race." [N26 p6]
- **False starts:** stated under "60M HEATS, 60M HURDLES, 200M/400M, General Rules": everyone returns to the start; a competitor with TWO false starts in one race is disqualified. The relay page does not repeat it. [N26 p5]
- **Changeover outside a zone:** not mentioned in any document.
- **Disqualification, general:** competitors outside their age group are disqualified unless the event rules say otherwise; referees make final decisions; groups are penalised for misbehaviour or crossing the track during a race. [N26 p3]
- **Audit note:** Scouts' requirements ask for a note wherever a disqualification is confirmed, a run-off completed or an exception made. [Req p2]
- "Volunteers will explain on the day if there is any confusion." [N26 p6]

## Contradictions

1. **Finals or no finals.** `MSF Relay.pdf` (newest, file dated 23 Oct 2026): no finals, ranked on heat times. Against it: all four rulebooks ("60M & RELAY ... FINALS"), the North 2026 matrix ("RELAY FINALS" 16:55 to 18:00), the South 2026 matrix ("60m FINALS + RELAY FINALS"), Scouts' app requirements ("all relay races have heats and finals"), and the database's FINALS blocks for R19 to R28. The repo's GLOSSARY.md also says relays are heats then a final. The note may be a 2026 decision made after the rulebooks and matrices were published; no document says so.
2. **Beavers track.** `MSF Relay.pdf` and the North 2026 rulebook: Beavers on a straight track. The diagram titled "Beavers & Cubs Relay" draws four changeover points on a circular track. The South 2026 rulebook has no straight-track sentence, and the South matrix places Beavers relays "Indoor" without saying which track. North 2025 has no straight-track sentence either.
3. **2025 vs 2026.** Relay rules are the same in 2025 and 2026 except North 2026 adds the Beavers straight-track, day-programme sentence. [diff of N25/N26 and S25/S26 text]
4. **North vs South 2026.** North runs Cubs and Scouts relays in one block at the end of the day (Beavers in the morning on the hurdles track); South runs each Section's relay in the day and has a shared "60m FINALS + RELAY FINALS" slot. [NM26], [SM26]
5. **Names of distances.** "4x50m relay" / "4x100m relay" (Events) vs "200m relay" / "400m relay" (hidden Events (2)) vs "50m relay" / "100m relay" (`MSF Relay.pdf`). Same events, different naming.
6. **Event code R25 in the repo tests** (`tests/day.test.ts`) is a made-up relay; in the database no event has code R25 or R26 (the 600m rows between R24 and R27 have no code) and the real relay codes are R19 to R22, R27, R28. [DB-T Events rows 36 to 41]

### Against the facts already known

| Known | Documents |
|---|---|
| Relays have no finals, ranked on heat times | Only `MSF Relay.pdf` says so; everything else says heats and a final of 6 (Contradiction 1) |
| Beavers 50m straight track | Confirmed for North 2026 (rulebook, matrix "hurdles track"); 50m is the leg length (4x50m). South unconfirmed; the Beavers & Cubs diagram shows a circular track |
| Cubs 50m circular | Confirmed (4x50m) |
| Scouts 100m circular | Confirmed (4x100m) |
| 4 wristbands per team | Confirmed: exactly four, "must have all FOUR members", one may be borrowed |
| Up to 6 teams | Consistent: six-lane diagrams, final "up to 6 teams", prototype has 6 places. No document states a heat maximum |

## Not found

- Maximum teams per relay heat, and how relay heats are formed.
- Changeover zone rules.
- Whether a borrowed child may also run their own Section's relay.
- Who writes teams down in South, and in North 2026 for the morning Beaver relays.
- South's event codes (no South database provided).
- How equal heat times are settled if there is no final.

## Sources

Owner's main checkout is `/Users/zazai/workspace/zazai840/MSF-Game-Management/`. Page numbers are PDF pages.

- [N25] `App-Developers/MSF Olympics 2025 NORTH Rulebook.pdf`
- [S25] `App-Developers/MSF Olympics 2025 SOUTH Rulebook.pdf`
- [N26] `Customer-Discovery/WhatsApp Chat - MSF Olympics App/00003048-North Rules 2026.pdf`
- [S26] `Customer-Discovery/WhatsApp Chat - MSF Olympics App/00003050-South Rules 2026.pdf`
- [NM26] `Customer-Discovery/WhatsApp Chat - MSF Olympics App/00003052-NORTH Olympics Matrix v2 2026.pdf` (1 page)
- [SM26] `Customer-Discovery/WhatsApp Chat - MSF Olympics App/00003053-SOUTH Olympics Matrix 2026 v2.pdf` (1 page)
- [DB-T] `App-Developers/Olympics Database - BLANK TEMPLATE (NEW).xlsx` (sheets named in each fact)
- [DB-S] `App-Developers/Olympics Database - North (2025) - SAMPLE.xlsx` (structure only)
- [Overview] `App-Developers/Olympics Database Overview.docx` (section named in each fact)
- [Req] `Customer-Discovery/App Requirements (Notes).pdf` (written by Asem, scoring team lead, per [Chat-App] 11/10 14:05 item 7)
- [Meeting] `Customer-Discovery/WhatsApp Chat - Drafted - Scouts Olympics/00003044-MSF Meeting 1.pdf` (notes, screenshots and transcript of the first call with Scouts)
- [Debrief] `Customer-Discovery/WhatsApp Chat - Drafted - Scouts Olympics/00003049-Drafted - MSF Olympics Debrief.pdf` (our team's write-up of what Scouts said)
- [Chat-App] `Customer-Discovery/WhatsApp Chat - MSF Olympics App/_chat.txt` (date and time of message given)
- [Relay note] `/Users/zazai/Downloads/MSF Relay.pdf` (Scouts' note, 1 page)
- [Diagram-S] `/Users/zazai/Desktop/Scouts APp/Scouts Relay.jpg`
- [Diagram-BC] `/Users/zazai/Desktop/Scouts APp/Beavers & Cubs Relay.jpg`

Read but nothing on relays: the volunteer walkthrough (our concept document; it lists "the exact race/relay entry files" as still to confirm, p3), the 11 Oct internal call transcript, the Drafted chat, and the Eligibility DOB Calculator.
