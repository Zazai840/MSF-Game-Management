# PlaceTrail

> **Superseded by [PlacesBoard](../PlacesBoard/README.md)** on the race flow's finish line (race-flow.md). Kept for reference.

The slanted tags above the finishing-order prompt that show who has been placed so far (screens 12 and 14).

**Use**
- An `<ol>` of `rz-place` tags in place order.
- Placed tags are navy, with the ordinal (`1st`) in `gold` Saira and the wristband in `label` type.
- Each placed tag is a `<button>`: tapping it goes back to that place.
- The last item is the place being decided: `rz-place--current`, a `gold` fill with `navy` text ("3rd ?") and `aria-current="step"`. It is not a button.
- Hide the trail before 1st is placed (screen 11).

**Tokens:** `navy`, `on-navy`, `gold`, `radius-xs`, `skew-tag`, `size-touch`, `space-10`.

**Don't**
- Skew anything else in the row.
- Use colour as the only difference between placed and current; the "?" says it.

**Markup**

```html
<ol class="rz-trail" aria-label="Places so far">
  <li><button class="rz-place" type="button" aria-label="1st place: 2033. Change"><span class="rz-place__ord">1st</span>2033</button></li>
  <li><button class="rz-place" type="button" aria-label="2nd place: 2031. Change"><span class="rz-place__ord">2nd</span>2031</button></li>
  <li><span class="rz-place rz-place--current" aria-current="step">3rd ?</span></li>
</ol>
```
