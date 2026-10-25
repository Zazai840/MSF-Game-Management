# TextField

A labelled input. The numeric version is the workhorse: big tabular digits in a 64px box.

**Variants**
- **Numeric** (default): wristband numbers and place times.
  - `input-digits` (30px Nunito 800), `size-field` tall.
  - Always `inputmode="numeric" pattern="[0-9]*" autocomplete="off"`.
  - Placeholder is an example ("e.g. 205").
- **Text** (`rz-field--text`): day code, lead code, full name. 56px tall, 18px 700.
- **Warning** (`rz-field--warn`): the value needs a look. `warn-soft` ground, `warn-line` border, `aria-invalid="true"`, `aria-describedby` pointing at the WarningCallout that follows.

**Parts**
- `rz-field__label` (`meta` style, `ink-muted`) is always visible; the placeholder never replaces it.
- `rz-field__hint` (optional) shows the formatted value ("Shows as **12.34**") or the format rule ("Type digits only: 1234 shows as 12.34, 13240 as 1:32.40.").

**Times:** the volunteer types digits only. The app formats them (1234 → 12.34, 13240 → 1:32.40) and shows the result in the hint.

**Tokens:** `card`, 2px `navy` border, `radius-lg`, `placeholder`, `warn-soft`, `warn-line`.

**Don't**
- Validate as the user types; warn on Next.
- Clear the field on a warning.
- Use a red border.

**Markup**

```html
<div class="rz-field">
  <label class="rz-field__label" for="wb">Wristband number</label>
  <input class="rz-field__input" id="wb" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="e.g. 205">
</div>

<div class="rz-field">
  <label class="rz-field__label" for="pt">Place time</label>
  <input class="rz-field__input" id="pt" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="1234" aria-describedby="pt-hint">
  <p class="rz-field__hint" id="pt-hint">Shows as <strong>12.34</strong></p>
</div>

<div class="rz-field rz-field--warn">
  <label class="rz-field__label" for="wb2">Wristband number</label>
  <input class="rz-field__input" id="wb2" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="3046" aria-describedby="wb2-warn" aria-invalid="true">
</div>

<div class="rz-field rz-field--text">
  <label class="rz-field__label" for="name">Full name</label>
  <input class="rz-field__input" id="name" autocomplete="name">
</div>
```
