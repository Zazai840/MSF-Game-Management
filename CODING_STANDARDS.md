# Coding standards

Judgement calls a reviewer checks a diff against. Anything a linter, the type checker or a test can catch belongs in `npm run verify`, not here.

## One wording, in `src/shared`

Text a person reads (a flag, a sign-off, a count, a To check line) is built by one function in `src/shared`, and every place that shows it calls that function: the lead's screens, the race screen and the Day export alike. Examples: `flagText` and `signOffText` in `src/shared/runner-rulings.ts`, `toCheckWording` in `src/shared/to-check.ts`, `runnersText` in `src/shared/races.ts`.

Flag a diff that builds the same sentence a second time, in a component or in the export, even when the copy matches today. Two copies drift.

## One rule for one fact

A fact both the server and a screen show (whether a row has notes, whether a warning is settled, which result counts) is decided by one shared function, and the badge, the sheet and the export all read its answer. Example: `resultNotes` and `hasNotes` in `src/shared/result-notes.ts` drive the note badge, the actions sheet's Notes and the export's Note column.

Flag a diff that re-derives such a fact in a component (filtering, pairing, counting) instead of asking the shared function, or that splits one rule between shared code and a component.

## Glossary words on screen

On-screen text and names in the code use the terms in `GLOSSARY.md` (lead, section, wristband number, warning, audit note, Day export, Notes, and so on). Each entry's _Avoid_ line lists the words to replace. A new domain concept gets a glossary entry in the same change.
