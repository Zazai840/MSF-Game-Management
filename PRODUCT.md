# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

A phone-first web app, installable to the home screen (`public/manifest.webmanifest`, portrait, standalone). Lead screens also work on wider screens.

## Users

- **Volunteers** at the Running Zone of an MSF Olympics day. Each phone does one job at a time: **Start line** (checks runners in by wristband number), **Finish line** (records the finishing order) or **Timer** (types each place's time from the photo finish or stopwatch). Most have never used the app before the day and get no training.
- **Zone leads** settle problems (ties, wrong times, absent finalists, disqualifications), make finals, confirm medals and download the day export.
- **The owner** starts the day, holds the owner password and hands out the Olympics password and lead code.
- **The scoring team** never uses the app directly. They receive the day export and turn it into finalists and medals.

Children appear only as wristband numbers, never by name, photo or age. Adults appear by their own full name.

## Product Purpose

Running Zone lets volunteers run every race of an Olympics day on their own phones and gives the scoring team a correct, complete record of the day, in the layout they already use. Success means every race is recorded once, every problem is caught and settled by a lead on the day, and the day export needs no retyping.

## Positioning

It replaces paper score sheets and stopwatch notes on the field. Its fixed output is the scoring team's existing Excel workbook (Input - Running, Finals, All results, Audit notes, Day details), so the app fits the scoring process instead of changing it. Several phones work the same race live, each doing one job, and the app catches suspicious entries as they are made rather than after the day.

## Operating Context

- Outdoors on a sports field, often in glare, with a stopwatch or clipboard in the other hand.
- An Olympics day is independent: its own wristbands, events and results; nothing carries over. 2026 has three days: South day 1, South day 2 and North.
- Scale of one day: about 800 children and 40 to 60 phones signed in at once.
- Sections: Boy and Girl Beavers, Cubs and Scouts. Events: 60m, 60m Hurdles, 200m, 400m, and relays (4x50m, 4x100m). Event formats: heats then a final, or timed.
- Volunteers join with the Olympics password and their full name; leads type the lead code. The app runs on Railway (production `main`, plus a staging test build).
- Language for the domain is fixed in `GLOSSARY.md`; decisions are in `docs/adr/`.

## Capabilities and Constraints

- Every tap is saved to the server as it is made; nothing is kept only on the phone. Phones follow each other live and keep showing what they have while reconnecting.
- Warn, don't block: a suspicious value gets an amber warning with Fix and Keep; only an impossible value is refused.
- Leads alone change a saved race, make finals, disqualify and confirm medals; every lead change leaves an audit note.
- The day export must keep the scoring team's layout exactly.
- Must stay fast on cheap phones over weak field signal (a JS budget runs in the build).
- **Open decision:** the product's horizon after the 2026 days. It may stay the Running Zone app reused each year, or grow to other zones (Jumping, Throwing, Challenge). Not decided.

## Brand Commitments

- Name: **MSF Running Zone** ("Running Zone" for short), for the **Muslim Scout Foundation** Olympics.
- Visual identity follows the MSF Olympics Rulebook. The existing system is recorded in `docs/running-zone-design-system/` (README, tokens, components, accessibility).
- Voice: plain British English, spoken to a volunteer who has never used the app. Second person, present tense, short sentences, sentence case. No jargon, no exclamation marks, no emoji. Buttons are verbs or plain outcomes. Owner-facing findings and specs use ASD-STE100 Simplified Technical English.
- Sporty, not childish: no mascots or cartoons.

## Evidence on Hand

- Rulebooks and scoring templates: `App-Developers/` (2025 North and South rulebooks, Olympics database template and sample, DOB eligibility calculator).
- Customer discovery: `Customer-Discovery/` (requirement notes and organiser chat exports; private, contain real names).
- Load evidence: a 60-phone test on production passed (about 11 changes a second, no failures).
- There are no testimonials, case studies, press or usage statistics. Never invent them. Never put volunteers' or testers' real names in public docs.

## Product Principles

1. **Right first time on the field.** Catch a wrong entry the moment it is typed, with a plain fix, so the record needs no repair later.
2. **No training needed.** Each screen does one job for one role and says what to do next in words a first-time volunteer understands.
3. **The scoring team's record is the product.** Whatever the screens do, the day export must be complete, correct and in their layout.
4. **Leads settle, volunteers record.** Volunteers never wait on a lead to keep going; leads see every open problem and close it.
5. **Children stay anonymous.** Wristband numbers only, everywhere.

## Accessibility & Inclusion

WCAG 2.2 AA as the floor, pushed further for outdoor phone use: higher contrast, heavier type and 44px+ targets. Status never by colour alone, a non-drag route for every reorder, reduced motion honoured, `lang="en-GB"`. Details in `docs/running-zone-design-system/accessibility.md`.
