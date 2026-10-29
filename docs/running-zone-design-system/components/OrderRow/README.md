# OrderRow

A row of Check the order: place, wristband and a drag handle. Arrow keys on the handle move the row too. Spec: race-flow.md "New components"; rules in `components/bundle.css`.

**Markup** (icon paths from [Icon](../Icon/README.md))

```html
<ol class="rz-orderrows" aria-label="Finishing order">
  <li class="rz-orderrow"><span class="rz-orderrow__place">1st</span><span class="rz-orderrow__num">2033</span><button type="button" class="rz-orderrow__handle" aria-label="Move 2033"><svg class="rz-icon">DRAG</svg></button></li>
</ol>
```

**Rules**
- 44px rows, grid `44px 1fr 44px`; `card` + `shadow-card`, `shadow-raised` while dragging.
- An unplaced runner is a dashed row (`rz-orderrow--unplaced`, a `role="group"` named by the wristband) with two pill buttons, Did not finish and Didn't run (`aria-pressed`), neither chosen until tapped.
