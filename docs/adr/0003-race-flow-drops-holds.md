# The race flow drops holds for individual events

ADR 0001 gave each job on an event one holder, with Take over, so two phones could never make two versions of a race. The race flow (docs/running-zone-design-system/race-flow.md) puts each person on one step of any race, chosen by their role, and asks that two people on the same step are never locked out. So races of individual events (Races and Hurdles) have no holds: anyone can write any step of any race.

What ADR 0001 really protected stays: every write still carries the version of the step the phone last saw, and the server refuses one made on an older version ("Tom Barker changed this a moment ago", with Show latest) instead of storing it. There are still never two versions to choose between. Relays keep their race screen, holds and Submit Race unchanged.

With no holders, Submit Race goes too for individual events: each step is marked done (That's everyone, Save positions, No more finishers), and a race whose steps are all done and agree saves itself. A race whose steps disagree waits, done, for a lead. Undo reverses only the person's own done mark, and refuses once anyone has changed that step since.

## Consequences

- Two people typing into the same step at once each see the other's change refused on their next write, never silently overwritten.
- The old race screen routes stay on the server for relays only: they refuse an individual event with "Open this race from Races".
- A step marked done can still be written: a runner added at the finish changes Runners after That's everyone.
