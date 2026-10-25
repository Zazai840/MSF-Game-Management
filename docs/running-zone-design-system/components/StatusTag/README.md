# StatusTag

A small pill that states a row's status in words.

**Variants**
- `--kept` / `--warn`: `warn-soft`, `warn-line` border, `warn-ink` text. A value kept despite a warning ("Kept · lead will check") or a list row that needs a look ("Counts differ").
- `--dnf`: `line` fill, navy text. "Did not finish", "Didn't run".
- `--ok`: a tick and `throwing-ink` text (`throwing` on dark), no fill. "4 times · 4 finishers", "Event list confirmed".
- `--q`: an outline in the zone colour. "Q" marks a qualifier for the final.
- `--tie`: a slanted `gold` tag. "TIE" on tied leaderboard rows.

**Tokens:** `caption` type at 800, `radius-pill`, `skew-tag` (tie only).

**Don't**
- Use a tag without its word.
- Invent new tones; a new status uses the nearest variant.

**Markup**

```html
<span class="rz-tag rz-tag--kept">Kept · lead will check</span>
<span class="rz-tag rz-tag--dnf">Did not finish</span>
<span class="rz-tag rz-tag--ok"><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- check: see Icon --></svg>4 times · 4 finishers</span>
<span class="rz-tag rz-tag--q">Q</span>
<span class="rz-tag rz-tag--tie">Tie</span>
```
