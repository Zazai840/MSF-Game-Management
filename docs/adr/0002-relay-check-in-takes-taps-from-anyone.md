# Relay check-in takes taps from anyone

[ADR 0003](0003-race-flow-drops-holds.md) has every write in the race flow carry the version of the step the phone last saw, and refuses one made on an older version. The Runners step of a relay race departs from that: saving a typed team into the heat, Take off, Add from Still to run, and on a final marking a whole team Here or Absent are each applied to the race as it stands, with no version check, from anyone on its start line. At a relay start, volunteers spread out to send children to their holding points (on the Scouts track, legs 1 and 3 at one line and legs 2 and 4 at another; on the Beavers and Cubs track, four separate points), so several of them check in one race at once, and two phones can type teams into one heat at once. Version-checked writes from several phones would refuse each other. None of these is ever refused for being out of date.

A relay heat has no per-child Here: every child of a team in the heat is checked in, so there is no per-child mark for two phones to fight over. Earlier, each child was marked Here or Not yet by a tap, and two volunteers tapping the same child at once could undo each other's mark; those taps are gone.

The trade-off that is left: two volunteers taking the same team off and adding it back at once can undo each other (last tap wins). Every phone sees each tap within about a second, so the wrong state is visible and is fixed with one more tap.

## Consequences

- The finishing order and the times on a relay race follow ADR 0003, as on any race, not ADR 0001.
- Each tap still moves the Runners step's version on, so a version-checked write elsewhere sees the change.
- A change to a child's number is not a tap: it is written whole against the team's version, whether from the teams sheet, from Edit on a start-line team card, or by a grip drag that puts its legs in a new order. A Save or drop on an older version is refused ("Aisha Noor changed this a moment ago", with Show latest) rather than applied.
