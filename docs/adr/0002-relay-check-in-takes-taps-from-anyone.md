# Relay check-in takes taps from anyone

[ADR 0003](0003-race-flow-drops-holds.md) has every write in the race flow carry the version of the step the phone last saw, and refuses one made on an older version. The Runners step of a relay race departs from that: each tap (tick a team into the heat, take it off, mark a child Here or Not yet, and on a final mark a whole team Here or Absent) is applied to the race as it stands, with no version check, from anyone on its start line. At a relay start, volunteers spread out to send children to their holding points (on the Scouts track, legs 1 and 3 at one line and legs 2 and 4 at another; on the Beavers and Cubs track, four separate points), so several of them check in one race at once. Version-checked writes from several phones would refuse each other. A tap is never refused for being out of date.

The trade-off: two volunteers tapping the same child at once can undo each other's mark without a warning (last tap wins). Every phone sees each tap within about a second, so the wrong mark is visible and is fixed with one more tap.

## Consequences

- The finishing order and the times on a relay race follow ADR 0003, as on any race, not ADR 0001.
- Each tap still moves the Runners step's version on, so a version-checked write elsewhere sees the change.
- A change to a team's four wristbands is not a tap: it is written whole against the team's version, whether from the teams sheet, from Edit on a start-line team card, or by a grip drag that puts its legs in a new order. A Save or drop on an older version is refused ("Aisha Noor changed this a moment ago", with Show latest) rather than applied.
