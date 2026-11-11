# Phones report their role

Until now a person's role (Start line, Finish line, Timer or Zone lead) was kept only on their phone. In the 9 November demonstration run a lead could not tell who was responsible for a late step, because the app did not know who had which role (spec #290).

So each phone now tells the server its role: when a profile joins, and each time the role is switched. The server stores it on the profile's signed-in record for the Olympics day, and clears it on Log out, when a lead removes the person, and on a new day. Each home read tells the phone which role the server holds for it, and the phone reports again when that is not the role it shows, so a report that did not arrive is sent again without anyone doing anything.

The role is information only. It is not a hold and it limits nothing: anyone can still write any step of any race ([ADR 0003](0003-race-flow-drops-holds.md) stands). The server refuses only a role that does not exist, and Zone lead from a person who is not a lead.

The stored role is the last one reported. There is no presence tracking: the server does not know whether the phone is open now, in a pocket or switched off. Two people can report the same role, and both are shown; nothing warns about it.

Only leads receive other people's names and roles (Signed in today, and the steps of a lead's Race screen). A volunteer's requests carry that volunteer's own role and nobody else's.

## Consequences

- Reporting a role is not a change of the day: it raises no revision, writes no audit note and does not make a day export out of date. It does wake the live streams, so a lead's open Race screen shows a switch of role at once: a stream sends a snapshot that differs at the same revision.
- A role can be stale. A person who puts the phone away without Log out keeps the last role reported until Log out, Remove or a new day.
- A lead who is made a volunteer is no longer shown as Zone lead; their phone asks for a job again and reports the new one.
- A phone with no role yet (signed in, job not chosen) has none on the server, and Signed in today shows none.
