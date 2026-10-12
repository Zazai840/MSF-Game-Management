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
One run of one event: between 1 and 6 children or relay teams who line up and run together. Heats and finals are both races.
_Avoid_: Run, round

**Heat**:
A race within an event that has a final, formed at the start line from whoever is there.
_Avoid_: Qualifier, preliminary

**Final**:
The single deciding race of an event that has heats, run by the 6 qualifiers from the heats.
_Avoid_: Final heat, medal race

**Finals line-up**:
The 6 qualifiers for a final in seed order, fastest heat time first, produced when a lead marks an event's heats complete.
_Avoid_: Finalists list, running heats sheet, start list

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
A child who was checked in to a race but never started it. They are taken off that race, so they can still run in a later race of the event.
_Avoid_: DNS, no-show, absent, scratched

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

**Scoring team**:
The people outside the Running Zone who keep the Olympics scoring workbook and check eligibility. They are leads who can make the same rulings as a zone lead, and only they set up, export and clear an Olympics day.
_Avoid_: Scorers, results team, admin team

**Day code**:
The short code a volunteer types, with their first name, to join on one Olympics day. Each Olympics day has a new one.
_Avoid_: PIN, password, access code

**Lead code**:
The secret a volunteer who has joined types to become a lead. Making a new lead code turns every other lead back into a volunteer, except the scoring team.
_Avoid_: Admin password, lead PIN

**Job**:
One of the three pieces of work on a race that any volunteer can take on: Start line, Finish order or Times.
_Avoid_: Role, station, duty
