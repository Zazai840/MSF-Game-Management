# The race flow drops holds

ADR 0001 gave each job on an event one holder, with Take over, so two phones could never make two versions of a race. The race flow (docs/running-zone-design-system/race-flow.md) puts each person on one step of any race, chosen by their role, and asks that two people on the same step are never locked out. So no race has holds, relays included: anyone can write any step of any race. The one exception is the Runners step of a relay race, whose taps follow [ADR 0002](0002-relay-check-in-takes-taps-from-anyone.md).

What ADR 0001 really protected stays: every write still carries the version of the step the phone last saw, and the server refuses one made on an older version ("Tom Barker changed this a moment ago", with Show latest) instead of storing it. There are still never two versions to choose between.

With no holders, Submit Race goes too: each step is marked done (That's everyone, Save the order, No more finishers), and a race whose steps are all done and agree saves itself. A race whose steps disagree waits, done, for a lead. Undo reverses only the person's own done mark, and refuses once anyone has changed that step since.

Relays now run in the race flow too, and the old relay race screen, its routes, Submit Race and Take over are gone. A relay team has no hold either. It is made only by typing it into a heat at its start line, and two people can type different teams into one heat at once (ADR 0002). A change to a team's children, by a leg chip or a leg drag, is saved whole against the version of that team the phone last saw, from anyone, with nothing asked first; a Save on an older version is refused.

## Consequences

- Two people typing into the same step at once each see the other's change refused on their next write, never silently overwritten.
- Two people saving the same team at once: the second is refused, sees who changed it, and starts again from the latest with Show latest.
- A step marked done can still be written: a runner added at the finish changes Runners after That's everyone, and a leg drag on a relay team card after That's everyone keeps Runners done.
