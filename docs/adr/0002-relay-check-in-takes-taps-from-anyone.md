# Relay check-in takes taps from anyone

[ADR 0001](0001-one-writer-per-job-replaces-clashes.md) gives every job on a race one holder, whose writes replace the job's whole column and are refused when they were made on an out-of-date view. Relay check-in departs from that: it has no hold, and each tap (tick a team into the race, take it off, mark a child here or not here, Done on a team's edit) is applied to the race as it stands, with no version check, from anyone on the race screen. At a relay start, volunteers spread out to send children to their holding points (on the Scouts track, legs 1 and 3 at one line and legs 2 and 4 at another; on the Beavers and Cubs track, four separate points), so several of them check in one race at once. A hold would leave all but one waiting, and whole-list writes from several phones would refuse each other. A tap is never refused for being out of date.

The trade-off: two volunteers tapping the same child at once can undo each other's mark without a warning (last tap wins). Every phone sees each tap within about a second, so the wrong mark is visible and is fixed with one more tap.

## Consequences

- The finishing order and the times on a relay race keep one holder and whole-column writes, as ADR 0001 says.
- A change to a team's four wristbands is not a tap: it is written whole on Done, guarded by a per-team version and a "being changed by" marker, so a late Done from a phone whose change was overtaken is refused rather than applied.
- Submit Race on a relay asks only the order and times holders, since check-in has nobody to ask.
