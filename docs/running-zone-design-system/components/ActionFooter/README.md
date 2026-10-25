# ActionFooter

> **Race flow:** volunteer race screens drop the Updated-at line; it stays on Races and the lead view.

The bottom of every screen: when the data last arrived, a Refresh button, and the screen's way forward.

**Use**
- Make it sticky (`rz-footer--sticky`) so the actions stay under the thumb.
- The first line is always `Updated at <time>` with a small Button named for what it refreshes ("Refresh Start line", "Refresh Finish order", "Refresh Times", "Refresh Results").
- Put that line in an `aria-live="polite"` element.
- Then the actions, in one of three layouts:
  - **Task:** one display-primary button (`rz-btn--display rz-btn--block`), then at most one secondary block button.
  - **Pair** (`rz-footer__pair`): secondary on the left, primary on the right ("That's everyone" / "Next").
  - **Trio** (`rz-footer__trio`): Back / an escape hatch / Next. Only on time entry.
- Home and list screens have the Updated-at line only.

**The consumer provides:** the time, the refresh handler and the action buttons.

**Tokens:** `paper`, `ink-muted`, `space-10` between buttons, `space-24` bottom padding, `size-action` and `size-button`.

**Don't**
- Use more than one primary button.
- Use more than three buttons in a row.
- Put destructive actions here (they go on the race detail screen or in a sheet).

**Markup**

```html
<footer class="rz-footer">
  <p class="rz-refresh" aria-live="polite">Updated at 11:41:17 AM <button class="rz-btn rz-btn--small" type="button">Refresh Finish order</button></p>
  <button class="rz-btn rz-btn--display rz-btn--block" type="button">Nobody else crossed the line</button>
  <button class="rz-btn rz-btn--block" type="button">+ Runner not on the list</button>
</footer>

<footer class="rz-footer">
  <p class="rz-refresh" aria-live="polite">Updated at 11:41:14 AM <button class="rz-btn rz-btn--small" type="button">Refresh Start line</button></p>
  <div class="rz-footer__pair">
    <button class="rz-btn" type="button">That's everyone</button>
    <button class="rz-btn rz-btn--primary" type="button">Next</button>
  </div>
</footer>

<footer class="rz-footer">
  <div class="rz-footer__trio">
    <button class="rz-btn" type="button">Back</button>
    <button class="rz-btn" type="button">No more finishers</button>
    <button class="rz-btn rz-btn--primary" type="button">Next</button>
  </div>
</footer>
```
