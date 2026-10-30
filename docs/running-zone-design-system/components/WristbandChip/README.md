# WristbandChip

A pill for each wristband number already entered on check-in (screens 6–7); tapping it changes the number.

**Use**
- Chips sit above the number field in entry order, in `<ul class="rz-chips">`, followed by the hint "Tap a number above to change it."
- Each chip is one `<button>` with the pencil icon, whose `aria-label` says what tapping does ("2041, Change").
- Tapping a chip rings it (`rz-chip--changing`, `aria-pressed="true"`) and moves its number into the number field, selected; the footer becomes Cancel / Remove / Save. Tapping the ringed chip again cancels.
- A kept number that a lead must check uses `rz-chip--warn`, and its label says so ("3046, kept for a lead to check. Change").

**Tokens:** `card`, 2px `line` border, `radius-pill`, `label` type (18px 800, tabular), `size-touch`; warning: `warn-soft`, `warn-line`; changing: `navy` border and 3px `navy` ring.

**Don't**
- Show names.
- Remove a chip without the tap and Remove (no swipe-to-delete).
- Shrink chips below 44px to fit more on a line; let them wrap.

**Markup**

```html
<ul class="rz-chips" aria-label="Wristbands entered">
  <li><button class="rz-chip" type="button" aria-pressed="false" aria-label="2041, Change">2041 <svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- pencil: see Icon --></svg></button></li>
  <li><button class="rz-chip rz-chip--changing" type="button" aria-pressed="true" aria-label="2042, Change">2042 <svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- pencil: see Icon --></svg></button></li>
  <li><button class="rz-chip" type="button" aria-pressed="false" aria-label="2043, Change">2043 <svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- pencil: see Icon --></svg></button></li>
  <li><button class="rz-chip rz-chip--warn" type="button" aria-pressed="false" aria-label="3046, kept for a lead to check. Change">3046 <svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- pencil: see Icon --></svg></button></li>
</ul>
<p class="rz-field__hint">Tap a number above to change it.</p>
```
