# Sheet

A modal panel that slides up from the bottom for a decision about one thing: a tie (24), the runner sheet (27), making the final ("Have all Girl Cubs heats run?").

**Use**
- `role="dialog" aria-modal="true"`, labelled by its title. Focus goes to the first action, is trapped inside, and returns to the opener on close. Escape closes it.
- **Anatomy:**
  1. Grip.
  2. Title (`display-screen`, 28px): names the thing ("Tie at 11.30", "Runner 2002").
  3. One `body` sentence.
  4. Stacked block actions.
- The closing action comes last as a small button ("Close tie").
- Destructive actions use the danger Button, and the scrim does not close a sheet that holds one.
- Slides up in 220ms and leaves in 150ms (Close, Escape, the scrim, the phone's Back, or a pull down on its grip or title: it follows the finger, and closes when let go past a quarter of its height or flicked down); appears and goes instantly with reduced motion.

**Tokens:** `paper`, `radius-2xl` top corners, `shadow-raised`, `overlay` scrim, `line-strong` grip.

**Don't**
- Stack sheets.
- Put a form longer than one field in a sheet (make a screen).
- Use a centred modal.

**Markup**

```html
<div class="rz-scrim rz-scrim--contained">
  <div class="rz-sheet" role="dialog" aria-modal="true" aria-labelledby="tie-title">
    <div class="rz-sheet__grip" aria-hidden="true"></div>
    <h2 class="rz-sheet__title" id="tie-title">Tie at 11.30</h2>
    <p class="rz-sheet__text">2006 and 2012 have the same time in different races.</p>
    <div class="rz-sheet__actions">
      <button class="rz-btn rz-btn--block" type="button">No run-off needed</button>
      <button class="rz-btn rz-btn--block" type="button">Run-off held</button>
      <button class="rz-btn rz-btn--block" type="button">Decided without a run-off</button>
      <button class="rz-btn rz-btn--small rz-btn--block" type="button">Close tie</button>
    </div>
  </div>
</div>
```
