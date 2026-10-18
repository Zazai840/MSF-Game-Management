# MSF Olympics Running Zone

The running events of the MSF (Muslim Scout Fellowship) Olympics, where volunteers run races and record who finished where, and the scoring team turns results into finalists and medals.

## Language

### Competition

**Olympics day**:
One independent competition day with its own wristbands, events and results; nothing carries over between days. 2026 has three: South day 1, South day 2 and North.
_Avoid_: Event day, session

**Day export**:
The Excel file of an Olympics day's running results, laid out the way the scoring team uses, and the lasting record of that day.
_Avoid_: Backup, archive, dump

**Running Zone**:
The area of an Olympics day where all running events take place.
_Avoid_: Race section, running section

**Section**:
The competition category a child competes in: Boy Beavers, Girl Beavers, Boy Cubs, Girl Cubs, Boy Scouts or Girl Scouts.
_Avoid_: Age group, category, division

**Event**:
One running competition for one section, such as 60m for Girl Cubs.
_Avoid_: Competition, discipline

**Event code**:
The scoring team's identifier for an event (R1, R2, ...).
_Avoid_: Event ID, event number

**Event format**:
How an event decides its medals: either heats then a final (60m and relays), or timed, where the fastest times across all its races win (60m hurdles, 200m, 400m).
_Avoid_: Event type, race type

### Races

**Race**:
One run of one event: one or more children or relay teams who line up and run together, with no upper limit. Heats and finals are both races.
_Avoid_: Run, round

**Heat**:
A race within an event that has a final, formed at the start line from whoever is there.
_Avoid_: Qualifier, preliminary

**Final**:
The single deciding race of an event that has heats. It starts with the 6 qualifiers from the heats, and can hold more runners when a lead adds them (for example both children in a tie for 6th place).
_Avoid_: Final heat, medal race

**Finals line-up**:
The 6 qualifiers for a final in seed order, fastest heat time first, produced when a lead marks an event's heats complete. Runners a lead adds to the final afterwards are not part of the line-up.
_Avoid_: Finalists list, running heats sheet, start list

**Absent finalist**:
A child in a final's line-up who is not at the start line when the final is checked in. They keep their heat result but get no final place, and a lead can call up a replacement. Before a final the start line asks "Is everyone here?" and the volunteer taps anyone absent.
_Avoid_: Didn't run, no-show, scratched

**Call-up**:
A lead bringing the next-ranked heat runner (7th, then 8th) into a final in place of an absent finalist. Without a call-up the final runs short.
_Avoid_: Reserve, substitute, wildcard

**Check-in**:
Recording, at the start line and before the whistle, which children or relay teams are running in a race. Check-in is what creates a race.
_Avoid_: Registration, sign-in, line-up

**Relay team**:
Four children who run one relay event together, known by their four wristband numbers; any one of the numbers finds the team. A relay team belongs to its event, not to a race, and is usually entered on the event's team list before the relays start.
_Avoid_: Squad, relay entry, team registration

**Deleted race**:
A race removed from an event's results but kept so it can be restored, for example one created by mistake.
_Avoid_: Cancelled race, deleted game, void race

**Finishing order**:
The order in which a race's children crossed the line, recorded as wristband numbers from 1st to last. It gives each child who finished their place in the race.
_Avoid_: Results, placings, positions list

**Time**:
How long a place in a race took, to a hundredth of a second, read from the photo finish in place order without knowing who held it. A child's time is the time of the place the finishing order gives them, so correcting either list re-pairs them.
_Avoid_: Result, score, split

**Clash**:
Two different versions of the same part of a race (its runners, finishing order or times), saved by different people without seeing each other's. The zone lead decides which stands.
_Avoid_: Conflict, duplicate, mismatch

**Tie**:
Two or more children (or relay teams) of the same event with exactly the same time from different races. Equal times within one race are not a tie: the finishing order separates them.
_Avoid_: Dead heat, draw

**Run-off**:
A short extra run between tied children, held at the zone lead's call, whose order breaks the tie. It is not a race: the zone lead records its outcome against the tie.
_Avoid_: Tie-break race, decider

**Re-run**:
Running a whole race again with the same children because its record can't be trusted or recovered, called by the zone lead as a last resort. The first race becomes a deleted race and the re-run is a new race of the same event. It is not a run-off.
_Avoid_: Rerace, restart, repeat race

**Disqualification**:
The zone lead's ruling, with a reason, that a child (or relay team) is out of an event's ranking because of something they did in a race, such as two false starts or obstruction. The child stays shown in the race.
_Avoid_: DQ, ban, removal

**Did not finish**:
A child who started a race but did not cross the line, for example after a fall. They stay in the race with no time and no place.
_Avoid_: DNF, retired, dropped out

**Didn't run**:
A child who was checked in to a race but never started it. They are taken off that race, so they can still run in a later race of the event. A finalist missing before a final starts is an absent finalist instead.
_Avoid_: DNS, no-show, absent, scratched

**No finisher**:
A place at the bottom of a race's times that no child crossed the line for, as seen by the timer. It names no child: who did not finish or didn't run comes from the finishing order, and the race counts once both agree on how many finished.
_Avoid_: Blank time, empty place, DNF time

**Wrong time**:
A time that looks wrong for its race: a later place faster than an earlier one, or a count of times that disagrees with the number of finishers. It is shown in amber wherever times appear; a volunteer can retype a place or keep its time as typed, and a kept out-of-order time goes to To check for a lead.
_Avoid_: Error, invalid time, bad time

**Audit note**:
A record kept against an event of something the zone lead did to its results, such as settling a tie or a disqualification: what, who, when, and their comment.
_Avoid_: Log entry, comment, history

**Warning**:
A note attached to a child in a race when their wristband number looks wrong for it: a number no section uses, a number from another section, or a child who already ran in this event. It never stops the child running; the zone lead checks it, corrects the number or disqualifies.
_Avoid_: Error, alert, validation failure

### People

**Wristband number**:
The number on a child's wristband, which identifies them for the whole of one Olympics day and is reused on other days. Its range shows the section, except Beaver boys from Beaver girls.
_Avoid_: Competitor number, attendee number, bib number

**Volunteer**:
A person helping run races in the Running Zone, often an Explorer aged 16 to 18.
_Avoid_: Official, marshal, operator

**Zone lead**:
The volunteer in charge of the Running Zone on the day, who settles clashes, disputes and exceptions. More than one person can act as zone lead. Every zone lead is a lead.
_Avoid_: Admin, race manager, supervisor

**Lead**:
A person trusted with everything beyond the jobs: the live leaderboard and making rulings on a race's problems. Zone leads are leads, and so are scoring team members.
_Avoid_: Admin, organiser, superuser

**Dashboard**:
A lead's own screen, opened from Home, with three ways in: To check, Results and Day setup (Day setup for the scoring team only).
_Avoid_: Lead area, admin panel, control panel

**To check**:
The list of race problems that need a lead to decide, such as a clash, a tie, a warning or a kept wrong time, each opening its race. Its count shows as "N to check" on the Dashboard button.
_Avoid_: Needs you, inbox, alerts

**Scoring team**:
The people outside the Running Zone who keep the Olympics scoring workbook and check eligibility. They are leads who can make the same rulings as a zone lead, and only they set up, export and clear an Olympics day.
_Avoid_: Scorers, results team, admin team

**Olympics password**:
The one password for the whole Olympics that lets a phone in, the same on every Olympics day. A phone types it once and stays in until the scoring team changes it or someone signs out on that phone. It replaces the day code.
_Avoid_: Day code, event password, PIN, access code

**Profile**:
A person's lasting identity in the app, made once with their full name and kept across Olympics days. Each phone shows only the profiles made on it. A profile's role (volunteer, lead or scoring team) starts again as volunteer on each new Olympics day. No two profiles share a full name, so a name is one person across the whole Olympics. Someone whose profile is gone from their phone gets it back on another phone once a lead has checked in person that it's them. A profile is never renamed, and removing it from a phone only forgets it there.
_Avoid_: Account, user, login

**Signed in**:
A profile using the app on the current Olympics day, with its role for that day. The scoring team sees everyone signed in today and can change their role or sign them out.
_Avoid_: Joined phone, logged in, online

**Lead code**:
The secret a person types to make their profile a lead for the current Olympics day: with their full name before signing in, or on its own once signed in. Holding it is trust enough to make a new profile, so a lead whose name is already taken by a profile on another phone gets a new profile with a number added to the name. Making a new lead code turns every other lead back into a volunteer, except the scoring team.
_Avoid_: Admin password, lead PIN

**Owner password**:
The app owner's master password, typed where the Olympics password goes, that makes the person scoring team. It never changes, so the scoring team can always get back in after the Olympics password changes, and it never clears an Olympics day by itself.
_Avoid_: Admin password, master code

**Job**:
One of the three pieces of work on a race that any volunteer can take on: Start line, Finish order or Times.
_Avoid_: Role, station, duty

### Testing

**Test build**:
A public deployment of the app for testers to try before an Olympics day. Its header shows the commit it was built from and a Report a bug link; its data may be cleared at any time.
_Avoid_: Staging, demo, beta
