# PlaceTimeGrid

A three-column grid of place slots on time entry (screens 17–18): which place you are typing, what is done, and what looks wrong.

**Slot states**
- **Default:** `card`, ordinal (`display-tag`-sized Saira) and time (`label`).
- **Current** (`--current`, `aria-current="step"`): a `gold` fill. Exactly one at a time.
- **Warning** (`--warn`): `warn-soft` with a 2px `warn-line` ring, plus `rz-slot__note` saying why ("Faster than 1st place").
- **Empty** (`--empty`): "–" in `ink-muted`.
- **No finisher** (`--none`): the words "No finisher" in `ink-muted`.

Every slot is a `<button>`; tapping one makes it current so its time can be retyped.

**Tokens:** `card`, `gold`, `warn-soft`, `warn-line`, `radius-md`, `size-field`, `space-8`.

**Don't**
- Show more than one current slot.
- Show times without their place.
- Hide the warning note when the slot is current.

**Markup**

```html
<ol class="rz-slots" aria-label="Place times">
  <li><button class="rz-slot" type="button"><span class="rz-slot__ord">1st</span><span class="rz-slot__time">12.34</span></button></li>
  <li><button class="rz-slot rz-slot--warn" type="button" aria-current="step"><span class="rz-slot__ord">2nd</span><span class="rz-slot__time">11.80</span><span class="rz-slot__note">Faster than 1st place</span></button></li>
  <li><button class="rz-slot rz-slot--current" type="button"><span class="rz-slot__ord">3rd</span><span class="rz-slot__time">–</span></button></li>
  <li><button class="rz-slot rz-slot--empty" type="button"><span class="rz-slot__ord">4th</span><span class="rz-slot__time">–</span></button></li>
  <li><button class="rz-slot rz-slot--none" type="button"><span class="rz-slot__ord">5th</span><span class="rz-slot__time">No finisher</span></button></li>
</ol>
```
