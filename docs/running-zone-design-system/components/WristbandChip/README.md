# WristbandChip

A removable pill for each wristband number already entered on check-in (screens 6–7) and "Runner not on the list" (13).

**Use**
- Chips sit above the number field in entry order, in `<ul class="rz-chips">`, followed by the hint "Tap a number to remove it."
- Each chip is one `<button>` whose `aria-label` says what tapping does ("Remove 2041").
- A kept number that a lead must check uses `rz-chip--warn`, and its label says so.

**Tokens:** `card`, 2px `line` border, `radius-pill`, `label` type (18px 800, tabular), `size-touch`; warning: `warn-soft`, `warn-line`.

**Don't**
- Show names.
- Remove a chip without the tap (no swipe-to-delete).
- Shrink chips below 44px to fit more on a line; let them wrap.

**Markup**

```html
<ul class="rz-chips" aria-label="Wristbands entered">
  <li><button class="rz-chip" type="button" aria-label="Remove 2041">2041 <svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- close: see Icon --></svg></button></li>
  <li><button class="rz-chip" type="button" aria-label="Remove 2042">2042 <svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- close: see Icon --></svg></button></li>
  <li><button class="rz-chip" type="button" aria-label="Remove 2043">2043 <svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- close: see Icon --></svg></button></li>
  <li><button class="rz-chip rz-chip--warn" type="button" aria-label="Remove 3046, kept for a lead to check">3046 <svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- close: see Icon --></svg></button></li>
</ul>
<p class="rz-field__hint">Tap a number to remove it.</p>
```
