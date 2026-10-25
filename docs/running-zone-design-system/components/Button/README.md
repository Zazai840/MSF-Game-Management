# Button

Every action in the app. All variants are at least 44px tall and use `radius-lg` or `radius-pill`.

**Variants**

| Class | Look | Use |
|---|---|---|
| `rz-btn rz-btn--display` | 56px navy, Saira italic caps | The one main action at the foot of a task screen ("Nobody else crossed the line", "Save"). At most one per screen. |
| `rz-btn rz-btn--primary` | 52px navy, Nunito 800 | In-content main action ("Fix number", "Join", "Open race"); "Next" in a footer pair. |
| `rz-btn` | 52px, 2px navy outline | Secondary ("Keep", "That's everyone", "+ Runner not on the list"). |
| `rz-btn rz-btn--danger` | `red-ink` fill, `on-navy` text | Disqualify, Delete race. Only inside a Sheet or after a confirm. |
| `rz-btn rz-btn--small` | 44px pill, `card` with `line` border | Utility actions: Refresh, Rename R1, Switch off R1, Edit runners. |
| `rz-btn rz-btn--pill` | 44px pill, navy outline | Mode switches: "I'm a zone lead". |
| `disabled` / `aria-disabled="true"` | `disabled-fill`, `disabled-ink` | Only when the reason is visible nearby. |

Add `rz-btn--block` for full width.

**Labels:** a verb or plain outcome, sentence case, no full stop: "Save", "Fix time", "Become lead". Use a leading "+" only for add actions.

**Press:** moves down 1px; no colour change. **Focus:** 3px `navy` ring, offset 2px (`gold` on dark).

**Don't**
- Put two display-primary buttons on a screen.
- Use white text on `gold` or a zone colour.
- Make an icon-only button without an `aria-label`.
- Use a link styled as a button to do an action, or the reverse.

**Markup**

```html
<button class="rz-btn rz-btn--display rz-btn--block" type="button">Nobody else crossed the line</button>
<div class="rz-row">
  <button class="rz-btn rz-btn--primary" type="button">Fix number</button>
  <button class="rz-btn" type="button">Keep</button>
  <button class="rz-btn rz-btn--danger" type="button">Disqualify</button>
  <button class="rz-btn rz-btn--primary" type="button" disabled>Next</button>
</div>
<div class="rz-row">
  <button class="rz-btn rz-btn--small" type="button">Refresh</button>
  <button class="rz-btn rz-btn--small" type="button">Rename R1</button>
  <button class="rz-btn rz-btn--pill" type="button">I'm a zone lead</button>
</div>
```
