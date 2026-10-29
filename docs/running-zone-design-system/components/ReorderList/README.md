# ReorderList

The finishing order as rows that can be dragged into a new order (screen 15), followed by the runners who were not placed.

**Use**
- Placed rows sit in an `<ol>`: place (Saira), wristband (20px 800), then a drag handle.
  - The handle is a 44px `<button>` labelled "Move 2033". It also moves with the arrow keys.
  - The "Change order" button offers Move up / Move down for people who can't drag.
- While dragging, the row takes `is-dragging` (`shadow-raised`); places renumber on drop.
- Unplaced runners follow, just above Save the order, under "2 not placed", in a `<ul>` of `rz-orderrow--unplaced` rows: a dashed `line-strong` outline, the wristband, then two pill buttons, Did not finish and Didn't run (`aria-pressed`), neither chosen at first. The chosen one turns primary.
- Save the order stays tappable; while any runner is unanswered it saves nothing and says "Say what happened to 2 runners first." in a WarningCallout.

**Tokens:** `card`, `shadow-card`, `shadow-raised`, `line-strong`, `radius-md`, `size-touch`.

**Don't**
- Allow dragging an unplaced row into the order; use "+ Runner not on the list" or the place trail.
- Choose Did not finish or Didn't run for someone: the volunteer says which.
- Hide the handles.

**Markup**

```html
<ol class="rz-order" aria-label="Finishing order">
  <li class="rz-order__row"><span class="rz-order__place">1st</span><span class="rz-order__num">2033</span><span></span><button class="rz-order__handle" type="button" aria-label="Move 2033"><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- drag: see Icon --></svg></button></li>
  <li class="rz-order__row is-dragging"><span class="rz-order__place">2nd</span><span class="rz-order__num">2031</span><span></span><button class="rz-order__handle" type="button" aria-label="Move 2031"><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- drag: see Icon --></svg></button></li>
  <li class="rz-order__row"><span class="rz-order__place">3rd</span><span class="rz-order__num">2035</span><span></span><button class="rz-order__handle" type="button" aria-label="Move 2035"><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- drag: see Icon --></svg></button></li>
</ol>
<ul class="rz-orderrows" aria-label="Not placed">
  <li><div role="group" aria-label="2032" class="rz-orderrow rz-orderrow--unplaced"><span class="rz-orderrow__num">2032</span><button class="rz-btn rz-btn--pill rz-btn--primary" type="button" aria-pressed="true">Did not finish</button><button class="rz-btn rz-btn--pill" type="button" aria-pressed="false">Didn't run</button></div></li>
  <li><div role="group" aria-label="2036" class="rz-orderrow rz-orderrow--unplaced"><span class="rz-orderrow__num">2036</span><button class="rz-btn rz-btn--pill" type="button" aria-pressed="false">Did not finish</button><button class="rz-btn rz-btn--pill" type="button" aria-pressed="false">Didn't run</button></div></li>
</ul>
```
