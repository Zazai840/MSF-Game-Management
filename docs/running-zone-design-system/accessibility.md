# Accessibility

The target is WCAG 2.2 AA. Outdoor phone use pushes the rest further: bigger targets, heavier type and higher contrast than the minimum.

## Rules

- **Contrast.**
  - Text needs 4.5:1 against its ground (3:1 at 24px+, or 19px+ bold).
  - Borders that identify a control, focus rings, icons and other meaningful marks need 3:1.
  - Use only the pairs in the table below. A pair that isn't listed is not approved.
- **Never colour alone.**
  - Every status carries a word: "Not started", "Heats running", "Did not finish", "Kept · lead will check", "TIE", "Q".
  - Dashed outlines, gold fills and zone colours reinforce the word; they never replace it.
- **Targets.** Everything tappable is at least 44 × 44 (`size-touch`). Runner tiles are 150px tall and footer actions 52–56px.
- **Focus.**
  - A solid 3px `navy` outline 2px outside the element; `gold` on `navy` and `scoreboard`.
  - Never remove it, and never rely on a colour change alone.
- **Real elements.**
  - `<button>` for actions and `<a href>` for navigation.
  - `<label>` tied to every `<input>`.
  - `<ol>` for the place trail, finishing order and leaderboard.
  - `<details>` for disclosures.
  - `aria-current="page"` on the current zone and the last breadcrumb.
  - `aria-current="step"` on the current place tag and time slot.
- **Icon-only controls get a name.** "Remove 2041" (chip), "Move 2033" (drag handle), "Edit 1st place time" (pencil). Decorative SVG gets `aria-hidden="true"`.
- **Display capitals come from CSS** (`text-transform`). The source text stays in sentence case so screen readers read words, not letters.
- **Reordering has a non-drag route.**
  - Each drag handle also responds to the arrow keys.
  - The "Change order" button opens a list where each row has Move up and Move down buttons.
- **Live updates.** When Refresh brings new data, update the Updated-at line inside an `aria-live="polite"` region. Don't move focus.
- **Warnings** are announced: the WarningCallout has `role="alert"` when it appears after typing, and its first action takes focus only if the user pressed Next.
- **Sheets** are modal dialogs.
  - They trap focus and close on Escape and on the Close action.
  - Focus returns to the row that opened them.
  - The scrim is not a close button for destructive sheets.
- **Motion.** Honour `prefers-reduced-motion`; nothing in the app needs motion to be understood.
- **Language.** `lang="en-GB"` on the root. The optional greeting in Arabic script, if used, gets `lang="ar" dir="rtl"`.

## Approved colour pairs

| Foreground | Background | Ratio | Used for |
|---|---|---|---|
| `navy` | `paper` | 11.24:1 | Body text; focus ring on light grounds |
| `navy` | `card` | 12.93:1 | Text on cards, rows, tiles, inputs |
| `ink-muted` | `paper` | 7.67:1 | Secondary text |
| `ink-muted` | `card` | 8.83:1 | Secondary text on cards |
| `ink-muted` | `warn-soft` | 8.39:1 | Hints inside warnings |
| `navy` | `line` | 9.13:1 | DNF tag text |
| `on-navy` | `navy` | 11.24:1 | App bar, primary buttons, place-trail tags |
| `on-navy` | `scoreboard` | 12.75:1 | Scoreboard text |
| `on-navy` | `scoreboard-row` | 10.27:1 | Leaderboard rows |
| `scoreboard-muted` | `scoreboard` | 8.55:1 | Scoreboard secondary text |
| `scoreboard-muted` | `scoreboard-row` | 6.89:1 | Row details |
| `scoreboard-muted` | `navy` | 7.53:1 | Inactive zone labels |
| `gold` | `navy` | 7.97:1 | Place ordinals, back link on dark, focus ring on dark |
| `gold` | `scoreboard` | 9.04:1 | Qualifier times, focus ring on scoreboard |
| `gold` | `scoreboard-row` | 7.29:1 | Qualifier times in rows |
| `navy` | `gold` | 7.97:1 | Current place and slot, TIE tag, gold badge |
| `navy` | `running` | 4.81:1 | Running fills (rank star, active tab, R4 tag) |
| `navy` | `jumping` | 5.10:1 | Jumping fills |
| `navy` | `throwing` | 6.22:1 | Throwing fills |
| `navy` | `challenge` | 5.17:1 | Challenge fills, Finishing-order job star |
| `running` | `navy` | 4.81:1 | Zone word in the hero, zone tab outline |
| `running` | `scoreboard` | 5.45:1 | Zone word in the scoreboard title |
| `jumping` | `navy` | 5.10:1 | Jumping on dark |
| `throwing` | `navy` | 6.22:1 | Throwing on dark |
| `challenge` | `navy` | 5.17:1 | Challenge on dark |
| `running-ink` | `paper` | 5.01:1 | Running colour as text on paper |
| `jumping-ink` | `paper` | 6.29:1 | Jumping colour as text on paper |
| `throwing-ink` | `paper` | 5.29:1 | Throwing colour as text; ok tick |
| `throwing-ink` | `card` | 6.08:1 | Ok tick on cards |
| `challenge-ink` | `paper` | 4.89:1 | Challenge colour as text on paper |
| `red-ink` | `paper` | 4.75:1 | Emphasised prompt word, to-check dot |
| `red-ink` | `card` | 5.46:1 | To-check dot on cards |
| `on-navy` | `red-ink` | 4.75:1 | Danger button, alert badge |
| `navy` | `warn-soft` | 12.28:1 | Warning text |
| `warn-ink` | `warn-soft` | 7.16:1 | Kept tag, warning icon |
| `warn-line` | `paper` | 3.81:1 | Warning border (needs 3:1) |
| `warn-line` | `card` | 4.39:1 | Warning border |
| `warn-line` | `warn-soft` | 4.17:1 | Warning border |
| `placeholder` | `card` | 5.31:1 | Input placeholder |
| `disabled-ink` | `disabled-fill` | 4.88:1 | Disabled button label |
| `scoreboard-line-strong` | `scoreboard` | 3.35:1 | Live chip, outline rank on the board ground |
| `throwing` | `scoreboard` | 7.06:1 | Live dot |
| `red` | `scoreboard` | 3.75:1 | Qualifying line (a mark, labelled in words) |

## Pairs that fail, and are only decoration

| Pair | Ratio | Rule |
|---|---|---|
| `running` on `paper` | 2.34:1 | Never text; use `running-ink`. Fine as a fill with navy on it. |
| `gold` on `paper` | 1.41:1 | Never text or a thin line on paper; only a fill with navy on it. |
| `red` on `paper` | 3.40:1 | Stripe and qualifying line only; never text. |
| `line` on `paper` | 1.23:1 | Card hairline; the card must also have a label, chevron or the tile's navy base. |
| `line-strong` on `paper` | 1.82:1 | Dashed "not placed / not started" outline; the row must say its state in words. |
| `scoreboard-line-strong` on `scoreboard-row` | 2.70:1 | Outline rank inside a row; the rank number carries the meaning. |

## Checks before shipping a screen

1. Every text colour on the screen is in the approved table on the ground it sits on.
2. Tab through: every control is reachable, in visual order, with a visible ring.
3. Zoom to 200%: nothing is clipped. Prompts wrap; the footer still fits.
4. VoiceOver or TalkBack: the prompt is read as a heading, places as an ordered list, and every icon-only button has a name.
5. Outdoors or at full brightness in sunlight, every number is readable at arm's length.
