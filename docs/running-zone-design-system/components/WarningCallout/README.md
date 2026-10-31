# WarningCallout

An amber box under a field or slot that says what looks wrong and offers **Fix** or **Keep**.

**When it shows**
- On Next, when a value is suspicious:
  - a wristband from another section, unknown or already raced;
  - a time faster than the place before;
  - counts that disagree.

**Content**
- Two sentences, from the warning copy in the README: what is odd, then the rule or the way out.
- **Fix …** (primary) puts focus back in the field with the value selected.
- **Keep** (secondary) accepts the value, marks it with a Kept tag, and adds it to the lead's To check list.
- The main button is on the right, as in the race-step footers: secondary first, primary last.

**Blocking errors** (wrong day code): the same box with no actions. A failed request reads "Could not connect - try again" when the phone cannot reach the app, or "Not saved - try again" when the app fails the save without a reason of its own.

**Markup:** give it `role="alert"` and an id; the field points at it with `aria-describedby` and takes `aria-invalid="true"` plus `rz-field--warn`.

**Tokens:** `warn-soft`, 2px `warn-line`, `warn-ink` icon, `navy` text (12.3:1), `radius-lg`.

**Don't**
- Use red.
- Use more than one callout at a time.
- Disable Next instead of warning.
- Write "Error".

**Markup**

```html
<div class="rz-callout" role="alert" id="wb2-warn">
  <p class="rz-callout__msg"><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- warning: see Icon --></svg><span>3046 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.</span></p>
  <div class="rz-callout__actions">
    <button class="rz-btn" type="button">Keep</button>
    <button class="rz-btn rz-btn--primary" type="button">Fix number</button>
  </div>
</div>
```
