# One writer per job replaces clashes

Superseded by [ADR 0003](0003-race-flow-drops-holds.md): no part of the race flow has holds.

Until the race screen, any volunteer could save any part of a race (its runners, finishing order or times) from their own phone, so two people could save different versions without seeing each other's. The app kept both as a clash and a zone lead chose which stood. We replaced that with one writer per job: each job (check-in, the finishing order, the times) on an event has at most one hold, every phone sees every entry live, a saved race can only be changed by a lead at its exact current version, and the server refuses any other write ("Ali took over the times", "Not saved - check your entries and enter it again") instead of keeping it. With no way left to make two versions, the clash records, the lead's version chooser, the volunteers' clash notice and the clash To check item were removed.

The trade-off: a volunteer can no longer just type into any job; they must hold it, or take it over after a confirm. In return volunteers never meet two versions, and leads never have to choose between them.

## Consequences

- Bringing clashes back means bringing back stored competing versions (`race_part_saves`, dropped in the race screen build) and their lead screen.
- Entries typed on a phone with no signal are not kept or replayed: a write that arrives after someone took over, or after the race moved on, is refused rather than stored for a lead.
- A phone that dies holding a job blocks nobody: anyone can Take over, and a lead can save a race stuck waiting on someone's Submit Race.
