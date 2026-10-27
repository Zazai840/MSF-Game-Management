Running Zone is the phone web app volunteers use to score the MSF Olympics, a sports day run by the Muslim Scout Fellowship for Beavers, Cubs and Scouts across the UK. Volunteers check runners in, record who crossed the line in what order, type times from a stopwatch, and zone leads settle problems and publish results. This system is the **Rulebook Games** direction: the colours of the *MSF Olympics 2026 South Rulebook*, laid out with a modern sports-broadcast feel.

Read this file first, then [race-flow.md](race-flow.md) (the race-first flow to build: its plan, data rules and new components), [screens.md](screens.md) (the original 32 screens; race-flow.md replaces its volunteer and lead flows) and [accessibility.md](accessibility.md) (contrast pairs and checks). Each component under `components/` has a README with its markup and a live preview. `components/bundle.css` is the reference implementation: copy it, or reproduce its rules exactly.

## Principles

1. **Readable in a sunny field.** Volunteers stand outdoors, often in glare, holding a stopwatch in the other hand. Use high contrast (`navy` on `paper` or `card`), big type, and nothing lighter than weight 600.
2. **One job per screen.** Each task screen asks one question in `display-prompt` ("Who came 3rd?") and gives one way forward at the foot. Lists and menus use `display-screen` instead.
3. **Thumb first.** Every target is at least `size-touch` (44px). Main actions sit at the bottom in the ActionFooter, and runner tiles are 150px tall.
4. **Sporty, not childish.** Use condensed italic display capitals, slanted tags, speed stripes and a hard-edged tile lift. No mascots, cartoons, emoji or bouncy animation.
5. **Rooted in the community.** The 8-point star (two overlapping squares) echoes Islamic geometric pattern and the star in the MSF logo. Use it as a quiet texture and as the "medal" shape, never as decoration for its own sake.
6. **Warn, don't block.** A suspicious value (wrong-section wristband, time faster than the place before) gets an amber warning with **Fix** and **Keep**. Keep always works and flags it for a zone lead.

## Content fundamentals

- **Voice.** Plain British English, spoken to a volunteer who has never used the app: "Tap runners in the order they crossed the line." Second person, present tense, short sentences. No jargon ("record", not "persist"; "wristband number", not "ID").
- **Case.** Write all copy in sentence case. Display styles uppercase it with CSS, so the source string stays "Who came 3rd?" and screen readers do not spell it out.
- **Buttons** are verbs or plain outcomes: "Save", "Next", "Fix number", "Keep", "That's everyone", "Nobody else crossed the line", "+ Runner not on the list", "Open race". No "OK", "Submit" or "Click here".
- **Questions as headings.** Task screens ask: "Which race is it?", "60m: which section?", "Runner 4: wristband number?", "2nd place time?", "2032 has no place. What happened?".
- **Warnings** say what is odd and what to do, in two sentences: "3046 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999." / "The 2nd place time is faster than 1st. Fix it, or keep it if the timer really shows that."
- **Children appear only as wristband numbers** (2033). Never show a child's name, photo or age. Adults (volunteers, leads) appear by full name and initials.
- **Formats.**
  - Times: seconds with two decimals, "12.34", and "1:32.40" past a minute. Volunteers type digits only and the app inserts the point.
  - Places: "1st, 2nd, 3rd, 4th" (uppercase when set in display type).
  - Clock: "11:41" or "11:41:17 AM" in the Updated-at line.
  - Separator: the middle dot " · " ("60m · Girl Cubs · Heat 4 · 5 runners").
  - Sections: "Girl Cubs · R4". Events: "60m", "60m Hurdles", "200m", "400m".
- **No exclamation marks, no emoji.** The Saved screen says "Thank you. Your responses have been saved." and nothing more excited.

## Colour

Light ground, navy ink, the rulebook's bright colours as fills. There is one theme, `field`. The scoreboard tokens colour one dark surface inside it; there is no dark mode.

- **Grounds.** `paper` is every page. `card` is anything raised on it (cards, rows, tiles, inputs). `navy` is the app bar and primary buttons. `scoreboard` is used only behind the results leaderboard.
- **Ink.** Text on `paper` and `card` is `navy`, or `ink-muted` when secondary. Text on `navy` and `scoreboard` is `on-navy`, or `scoreboard-muted` when secondary.
- **Text on bright fills is always `navy`** (gold, zone colours, warn-soft). Never put white or `paper` text on `gold` or a zone colour.
- **`gold` means "now" or "best".** Use it for the current place being recorded, the current time slot, place ordinals on navy, qualifiers' times on the scoreboard, the TIE tag and the Saved star. Don't use it as a general accent.
- **`red` is a stripe, not a message.** It appears only in the speed stripes and the qualifying line. For danger and the one emphasised word in a prompt, use `red-ink`.
- **Zone colours** come from the rulebook: `running` (blue), `jumping` (purple), `throwing` (green), `challenge` (orange).
  - Set one zone class on the screen root (`.rz-zone-running` …). Components then read `--zone` for fills and `--zone-ink` for text on paper.
  - Use a zone colour as text on `paper` only through its `-ink` token.
  - Jumping and throwing are lighter than the rulebook's print colours, so navy text reads on them. Their usage notes give the print values.
- **Job colours.** The three job stars on Home use `running` blue (Check in), `challenge` orange (Finishing order) and `gold` (Times), in the order of the rulebook's Scoring page. They name the job, not the zone. Keep them the same in every zone.
- **Warnings** use `warn-soft` behind, a 2px `warn-line` border, a `warn-ink` icon and `navy` text.
- **Don't** add new colours, gradients, tints of the zone colours, or more than one bright fill competing in one card.

## Typography

There are two Google Fonts families. Load both with one link:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Saira:ital,wdth,wght@1,62.5..100,600..900&family=Nunito:wght@600;700;800&display=swap">
```

- **Display: Saira**, the variable face, loaded italic-only.
  - Always `font-style: italic`, `font-stretch: 75%` and `text-transform: uppercase`. bundle.css adds the stretch and the uppercase to every `display-*` class.
  - Use it for headings, prompts, numerals, times, tags and the display-primary button.
  - It stands in for the rulebook's Soccer League and Calps, which are not web fonts.
- **Body: Nunito**, the rulebook's rounded body face.
  - Weight 600 for running text, 700 for labels and meta, 800 for wristband numbers, button labels and titles.
  - Never use 400 on a phone outdoors.
- **Hierarchy on a task screen:** `meta` context line, then `display-prompt` question, then `body` help line. Wristband numbers are `display-numeral` on tiles and `label` elsewhere. Times are `display-time` on the scoreboard and `label` in slots.
- **Numbers** always use tabular figures (`font-variant-numeric: tabular-nums`) so columns of times line up.
- **Emphasis** in a prompt is one word in `red-ink` (an `<em>` that changes colour only). Never use bold inside body text.
- **Don't** set body copy in Saira, set Saira upright or at full width, letter-space Nunito, or use a third family.

## Layout and spacing

- **Phone first.** The base is 390 × 844 with `space-20` side gutters. Lay out in a single column. Over 600px wide, centre a 440px column on `paper`; don't make a desktop layout.
- **Screen anatomy, top to bottom:**
  1. AppBar: hero on Home, compact elsewhere.
  2. Breadcrumb, on zone-lead screens only.
  3. Content, with `space-16` between blocks.
  4. ActionFooter, sticky at the bottom with the Updated-at line and the screen's actions.
- **Gaps.**
  - `space-12` between cards.
  - `space-8` between list rows and chips.
  - `space-14` between runner tiles.
  - `space-10` between stacked footer buttons.
  - Use the steps in `tokens.json` only, never in-between values.
- **Sizes.**
  - Primary footer action: `size-action` (56px).
  - Other buttons: `size-button` (52px).
  - Small pill buttons and every other target: at least `size-touch` (44px).
  - Numeric input: `size-field` (64px).
  - Runner tile: `size-tile` (150px).

## Shape

- **Radii by role:**
  - `radius-xs`: slanted tags.
  - `radius-md`: rows, slots, avatar.
  - `radius-lg`: buttons, inputs, callouts.
  - `radius-xl`: cards.
  - `radius-2xl`: the hero app bar's bottom corners and a sheet's top corners.
  - `radius-pill`: small buttons, chips, status tags.
- **The arch.** Runner tiles have `radius-arch` top corners and `radius-lg` bottom corners, like a mosque window or a podium step. Only runner tiles use the arch.
- **The slant.** Badges, place-trail tags, the TIE tag and the R4 tag lean at `skew-tag` (-12°). The speed stripes lean at `skew-stripe` (-24°). Nothing else is skewed, and body text never is.

## Depth

The design is flat. Cards are set apart by `shadow-card`, a 1.5px inset hairline, not a blur.

- Runner tiles alone have `shadow-tile`, a hard 4px navy base. On press, they drop 4px and lose the base.
- Only a bottom sheet and a row being dragged use `shadow-raised`.
- No other shadows, glows or glass effects.

## Motifs

- **8-point star pattern.** A 44px tile of two overlapping 20px squares joined by short lines. It is stroked in `paper` at `opacity-pattern` (9%) and appears only on `navy` (the app bar) and the top of the `scoreboard`. It must stay too faint to compete with text. Never put it on `paper`.
- **Speed stripes.** Three skewed bars, `red`, `gold` and `running`, at the right edge of the app bar: 22 × 86 in the hero, 14 × 80 in the compact bar. Use one set per screen, always in that order and always partly bleeding off an edge.
- **Star badge.** The same 8-point star, solid, sits behind job icons (`size-job-icon`), scoreboard ranks (`size-rank`) and the Saved tick, and appears small on runner tiles (18px).
- SVG source for all three is in `components/Motifs/README.md`. Give each inline `<pattern>` a unique id per page.

## Iconography

- Icons are inline SVG line icons on a 24px grid: stroke `currentColor`, width 2.2 (2.4–2.6 on small or bold uses), round caps and joins, no fill. The set and its paths are in `components/Icon/README.md`.
- Icons always sit beside a word, except the drag handle, the chip remove × and the chevron. Those three carry an `aria-label` ("Move 2033", "Remove 2041").
- **Zone pictograms:** a hurdle for Running, an arc for Jumping, an arrow for Throwing, a target for Challenge. **Job icons:** a flag (Check in), a numbered list (Finishing order), a stopwatch (Times).
- **Logo.** This system has no logo file. In the app, the event name ("MSF Olympics" in `display-eyebrow`) stands in for it. If the official Muslim Scout Fellowship logo is needed (say on the Join screen), use the file supplied by MSF, unaltered, on `paper`. Never redraw or recolour it.
- No emoji, no illustrations of children, no stock icons in mixed styles.

## Motion

Motion is minimal and functional.

- Pressing a button moves it down 1px; pressing a runner tile moves it down 4px.
- The disclosure chevron rotates in 150ms ease-out.
- A sheet slides up in 200ms ease-out.
- Nothing loops, bounces or celebrates.
- Under `prefers-reduced-motion: reduce`, drop the movement and keep the state change.

## States

- **Focus:** a solid 3px `navy` outline 2px outside the element, or `gold` on `navy` and `scoreboard`. Never remove it.
- **Pressed:** move down as described in Motion. There are no colour changes on press.
- **Disabled:** `disabled-fill` with `disabled-ink`, no border, `cursor: not-allowed`. Prefer explaining why over disabling ("Type a wristband number first").
- **Current / selected:** `gold` fill with `navy` text (current place, current time slot), or `aria-current` with a filled zone tab.
- **Warning:** `warn-soft` + `warn-line` on the field, slot, chip or row that needs a look, plus a WarningCallout or a Kept tag that says why.
- **Error that blocks** (wrong day code): a WarningCallout under the field with one action. No red text alone.
- **Loading / stale:** the Updated-at line shows when data last arrived, and Refresh fetches again. Don't use spinners over content.
- **Empty:** a `body` sentence saying what will appear and when ("Races appear here once someone checks runners in.").

## Building screens

- **Load order:** fonts link, then `tokens.css`, then `components/bundle.css`.
- **Root:** wrap each screen in `<div class="rz-screen rz-zone-running">`. The zone class sets `--zone` and `--zone-ink` for everything inside.
- **Markup:** use real elements. A `<button>` for anything that does something in place, `<a href>` for navigation, `<input>` with a `<label>`, `<ol>` for ordered places and leaderboards. Copy the markup from each component's README.
- **Numeric inputs** use `inputmode="numeric"`, `pattern="[0-9]*"` and `autocomplete="off"`. Times are typed as digits only and the hint shows the formatted value ("Shows as 12.34").
- **Never** put `paper` text on `gold` or a zone colour, put `red` under text, or put a second display-primary button on a screen.
