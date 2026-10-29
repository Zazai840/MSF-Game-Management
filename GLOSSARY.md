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
One running competition for one section, such as 60m for Girl Cubs. Races shows each as a card with its races (the race flow plan calls it an event group).
_Avoid_: Competition, discipline

**Event code**:
The scoring team's identifier for an event (R1, R2, ...). It shows only in the Zone lead role; volunteers never see it.
_Avoid_: Event ID, event number

**Event format**:
How an event decides its medals: either heats then a final (60m and relays), unless a zone lead calls results without a final; or timed, where the fastest times across all its races win (60m hurdles, 200m, 400m).
_Avoid_: Race type

**Event type**:
Which tab of Races an event is on: Races, Hurdles or Relays. It is stored with the event, never read from its name: a new day's events come with theirs, and a lead adding an event chooses Races or Hurdles. Relays are the relay events.
_Avoid_: Category, kind

**Relay**:
An event run by relay teams instead of single children: the 4x50m Relay for Beavers and Cubs and the 4x100m Relay for Scouts. Like the 60m it has heats then a final, and every child of a medal-winning team gets the team's medal.
_Avoid_: Relay race (a race is one run), team event

### Races

**Race**:
One run of one event: one or more children or relay teams who line up and run together, with no upper limit. Heats and finals are both races.
_Avoid_: Run, round

**Heat**:
A race of an event that is not its final, formed at the start line from whoever is there, numbered Heat 1, Heat 2 and so on. Every event type names its runs this way, with or without a final, including a 200m or 400m decided by time alone (race-flow.md decision 1).
_Avoid_: Qualifier, preliminary

**Final**:
The single deciding race of an event that has heats, unless a zone lead calls results without a final. It starts with the 6 qualifiers from the heats, and can hold more runners when a lead adds them (for example both children in a tie for 6th place). Only a lead makes it, after confirming that every heat has run; making it completes the heats, so no more heats can be added (a final made too early is undone by reopening the heats in Results).
_Avoid_: Final heat, medal race

**Finals line-up**:
The 6 qualifiers for a final in seed order, fastest heat time first, produced when a lead marks an event's heats complete. Runners a lead adds to the final afterwards are not part of the line-up.
_Avoid_: Finalists list, running heats sheet, start list

**Results without a final**:
A zone lead's call, on an event with heats, to award its medals to the 3 fastest heat times instead of running its final.
_Avoid_: Skip final, cancel final, no final, heat-time medals

**Absent finalist**:
A child (or relay team) in a final's line-up who is not at the start line when the final is checked in. They keep their heat result but get no final place, and a lead can call up a replacement. A final's check-in starts with every finalist unmarked; each is marked Here or Absent, and That's everyone asks before recording the unmarked absent. Only those Here run the final. A relay team is Absent as a whole.
_Avoid_: Didn't run, no-show, scratched

**Call-up**:
A lead bringing the next-ranked heat runner or relay team (7th, then 8th) into a final in place of an absent finalist. Without a call-up the final runs short.
_Avoid_: Reserve, substitute, wildcard

**Check-in**:
Recording, at the start line and before the whistle, which children or relay teams are running in a race. The first check-in on an event's current race is what creates it. On a relay, anyone on the race screen ticks the teams that run and marks each child here.
_Avoid_: Registration, sign-in, line-up

**Relay team**:
Four children who run one relay together, known as Team 1, Team 2 and so on within their relay, with their wristband numbers in leg order. A team belongs to its relay's team list, not to a race; each race keeps the four children who actually ran in it.
_Avoid_: Squad, relay entry, team registration

**Leg**:
One child's part of a relay race. A team's wristband numbers are in leg order: the first runs the 1st leg, and the fourth crosses the finish line.
_Avoid_: Runner 1-4, lap, stage

**Team list**:
A relay's teams, typed at the prep area before the relays start. Teams are numbered in the order they are added and never renumbered; a team that has never been in a race can be removed, and its number is not used again.
_Avoid_: Start list, entries, registration

**Still to run**:
A relay team that no race of its relay holds, apart from deleted races. Only teams still to run are offered at a heat's check-in, and a team that didn't run goes back to them.
_Avoid_: Pool, waiting teams, unassigned

**Deleted race**:
A race removed from an event's results but kept so it can be restored, for example one created by mistake.
_Avoid_: Cancelled race, deleted game, void race

**Current race**:
On a relay's race screen, the one race of the relay being worked on now: its latest race that is neither saved nor deleted, or else the next heat (or race) waiting for its first check-in. Once a race is saved the next one becomes current by itself; once the heats are complete it is the final.
_Avoid_: Active race, open race, next race

**Submit Race**:
On a relay's race screen, a volunteer's confirmation that the results of the current race are right. Everyone holding a job with entries on the race must submit; any of them can tap Not yet to send the race back for changes, which clears every submission.
_Avoid_: Confirm, sign off, check step

**Saved race**:
A race whose results count: in the race flow, every step is done and nothing blocks it (it saves itself); on a relay's race screen, everyone it asked has submitted it; or a lead saved it. Only saved races reach results, To check and the day export, and only a lead can change one.
_Avoid_: Finished race, complete race, closed race

**Finishing order**:
The order in which a race's children crossed the line, recorded as wristband numbers from 1st to last; on a relay, the teams in the order their 4th leg crossed. It gives each child who finished their place in the race.
_Avoid_: Results, placings, positions list

**Time**:
How long a place in a race took, to a hundredth of a second, read from the photo finish in place order. A child's time is the time of the place the finishing order gives them, so correcting either list re-pairs them. A relay team has one time, from the start until its 4th leg crosses the line.
_Avoid_: Result, score, split

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
A child (or relay team) who started a race but did not cross the line, for example after a fall or a lost baton. They stay in the race with no time and no place.
_Avoid_: DNF, retired, dropped out

**Didn't run**:
A child (or relay team) who was checked in to a race but never started it. They are taken off that race, so they can still run in a later race of the event; a relay team goes back to its relay's teams still to run. A finalist missing before a final starts is an absent finalist instead.
_Avoid_: DNS, no-show, absent, scratched

**No finisher**:
A place at the bottom of a saved race's times that no child holds, marked by a lead when a correction leaves more times than finishers. It names no child: who did not finish or didn't run comes from the finishing order, and the race counts once both agree on how many finished. Volunteers never mark it, since every place in the finishing order needs a time.
_Avoid_: Blank time, empty place, DNF time

**Wrong time**:
A time that looks wrong for its race: a later place faster than an earlier one. It is shown in amber wherever times appear; the volunteer holding the times can retype a place or keep its time as typed, and a kept wrong time goes to To check for a lead.
_Avoid_: Error, invalid time, bad time

**Audit note**:
A record kept against an event of something the zone lead did to its results, such as settling a tie or a disqualification, or of a race changing hands, such as a take over: what, who, when, and any comment.
_Avoid_: Log entry, comment, history

**Warning**:
A note attached to a child in a race when their wristband number looks wrong for it: a number no section uses, a number from another section, a child who already ran in this event, or a child who is also in another relay's team. It never stops the child running; the zone lead checks it, corrects the number or disqualifies.
_Avoid_: Error, alert, validation failure

**Notes**:
What the lead's actions sheet shows about one child or relay team in one race: its warnings, and any addition at the finish, each with who settled it (checked by a lead, settled by disqualification, or not checked yet), then the audit notes about that child or their whole race, oldest first. The "note" badge on a leaderboard row and the Day export's Note column come from the same notes.
_Avoid_: Participant notes, comments, history

### People

**Wristband number**:
The number on a child's wristband, which identifies them for the whole of one Olympics day and is reused on other days. Its range shows the section, except Beaver boys from Beaver girls.
_Avoid_: Competitor number, attendee number, bib number

**Volunteer**:
A person helping run races in the Running Zone, often an Explorer aged 16 to 18.
_Avoid_: Official, marshal, operator

**Zone lead**:
The volunteer in charge of the Running Zone on the day, who settles disputes and exceptions. More than one person can act as zone lead. Every zone lead is a lead.
_Avoid_: Admin, race manager, supervisor

**Lead**:
Anyone who typed today's lead code (or the owner password), trusted with everything beyond the jobs: the live leaderboard, making rulings on a race's problems, and Day setup. Every lead can do everything. Zone leads are leads, and so are scoring team members.
_Avoid_: Admin, organiser, superuser

**Lead menu**:
What a lead's avatar opens on Races: Results, Day setup and their details. It replaced the Dashboard.
_Avoid_: Dashboard, admin panel, control panel

**To check**:
The race problems that need a lead to decide, such as a tie, a warning or a kept wrong time. They sit on their race: a lead's Ready for you lists the event cards with one, and each shows on the step it is about, with It's right or the way to settle it. There is no list screen.
_Avoid_: Needs you, inbox, alerts

**Scoring team**:
The people outside the Running Zone who keep the Olympics scoring workbook and check eligibility. It is not a role: they sign in as leads, like the zone leads.
_Avoid_: Scorers, results team, admin team

**Olympics password**:
The one password for the whole Olympics that lets a phone in, the same on every Olympics day. A phone types it once and stays in until a lead changes it or someone signs out on that phone. It replaces the day code. Volunteers see it as "Password" on Join; only a lead's Day setup calls it the Olympics password.
_Avoid_: Day code, event password, PIN, access code

**Profile**:
A person's lasting identity in the app, made once with their full name and kept across Olympics days. Each phone shows only the profiles made on it. A profile's role (volunteer or lead) starts again as volunteer on each new Olympics day. No two profiles share a full name, so a name is one person across the whole Olympics. Someone whose profile is on another phone gets it back by tapping That's me at Join, once they have typed the password; it moves at once and the old phone forgets it. A profile is never renamed, and removing it from a phone only forgets it there.
_Avoid_: Account, user, login

**That's me**:
Join's answer to "Is this you on a new phone?", asked when the name typed belongs to a profile held on another phone. It moves that profile to this phone at once, with no lead to wait for, and the old phone forgets the name on its next request (ADR 0006). "No, I'm someone else" asks for a middle name or initial instead.
_Avoid_: Claim profile, transfer

**Signed in**:
A profile using the app on the current Olympics day, with its role for that day. A lead sees everyone signed in today and can change anyone else's role or sign them out, though nobody can make the owner a volunteer.
_Avoid_: Joined phone, logged in, online

**Lead code**:
The secret a person types to make their profile a lead for the current Olympics day: with their full name before signing in, or on its own once signed in. Holding it is trust enough to make a new profile; a name already taken by a profile on another phone gets That's me at Join, as with the Olympics password. Making a new lead code turns every other lead back into a volunteer, except whoever made it and the owner.
_Avoid_: Admin password, lead PIN

**Owner password**:
The app owner's master password, typed where the Olympics password goes, that makes the person a lead marked as the owner, whom nobody can make a volunteer. It never changes, so the owner can always get back in after the Olympics password changes, and it never clears an Olympics day by itself.
_Avoid_: Admin password, master code

**Owner**:
The lead who signed in with the owner password. Nobody can make the owner a volunteer, and making a new lead code keeps them a lead. It is not a role: the owner is a lead.
_Avoid_: Admin, super lead

**Races**:
Home: the event cards of one tab (Races, Hurdles or Relays) in Ready for you, In progress and Done, each with its heat chips. New race makes the next heat, or for a lead the final.
_Avoid_: Event list, dashboard

**Race**, as a screen:
One race of the race flow (/races/:raceId): its event's heat chips, its steps, and only the body for your role. A lead sees every step as tabs.
_Avoid_: Race page (the lead's), job screen

**Step**:
One part of a race as the race flow works it: Runners (check-in), Finishing order or Times. A final has no Times. Each step is done when marked (That's everyone, Save the order, No more finishers, or the last place's time); a race whose steps are all done and agree is saved by itself. Steps never wait for each other: times are by place, the finishing order by wristband.
_Avoid_: Job (the relay race screen's), stage (an event's), Positions

**Role**:
The step a person does on every race, kept on their phone for the day: Start line (Runners), Finish line (Finishing order), Timer (Times), or Zone lead, who sees every step. Chosen on Join (or, when signing in by a name under Welcome back, on the job cards that follow) and switched from the role chip; Zone lead needs the lead code once per day.
_Avoid_: Job, station, position

**Undo**:
The toast's way to reverse your own save of a step, only while nobody else has changed that step since. It reopens the race at that step, and un-saves a race the save had saved.
_Avoid_: Revert, roll back

**Race screen**:
A relay's screen where volunteers work its current race together, opened from the Relays tab by tapping the relay. Every job is on it, and each phone sees the others' entries as they are made.
_Avoid_: Job screen, race page (the lead's), entry screen

**Teams screen**:
The one screen, opened from Home's Relays tab, where every relay's team list is typed at the prep area.
_Avoid_: Team page, prep screen, registration screen

**Job**:
On a relay's race screen, a piece of work that any volunteer can take on and one volunteer holds at a time: on a race, check-in, the finishing order or the times; on a relay, also typing its team list. A final has no times job, and a relay's check-in is not a job: anyone on its race screen does it.
_Avoid_: Role, station, duty, section

**Hold**:
On a relay, being the one volunteer who may enter a job's part of its races (ADR 0003: the race flow has none). Opening a job on the race screen takes its hold when nobody has it; everyone else sees that job read-only. A hold carries on to the event's next heat or race, but not to its final.
_Avoid_: Claim, lock, owner

**Take over**:
Taking a job's hold from the volunteer who has it, after a confirm, carrying on from what they had already entered. It is how a job changes hands when its holder is gone or stuck.
_Avoid_: Steal, release, reassign

### Testing

**Test build**:
A public deployment of the app for testers to try before an Olympics day. Its header shows the commit it was built from and a Report a bug link; its data may be cleared at any time.
_Avoid_: Staging, demo, beta
