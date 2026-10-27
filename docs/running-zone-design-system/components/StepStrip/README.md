# StepStrip

A race's three steps (Runners, Positions, Times; a final has two) with each one's status in words. Spec: race-flow.md "New components"; rules in `components/bundle.css`.

**Markup** (icon paths from [Icon](../Icon/README.md))

```html
<ul class="rz-steps" aria-label="Heat 3 progress">
  <li class="rz-step"><span class="rz-step__label">Runners <svg class="rz-icon">CHECK</svg></span><span class="rz-step__status">5 checked in</span></li>
  <li class="rz-step"><span class="rz-step__label">Positions</span><span class="rz-step__status">3 of 5</span></li>
  <li class="rz-step rz-step--mine"><span class="rz-step__label">Times</span><span class="rz-step__status">You · 2 of 5</span></li>
</ul>
```

**Rules**
- Mine: `card` + 2px `navy` ring, status starts "You ·". Others: 1.5px `line` ring; done adds a `throwing-ink` tick.
- Every step is a `role="tab"` button. A volunteer's own step keeps its outline while open; tapping another opens it read-only, under an `rz-readonly` note: "Viewing Positions · read-only. It's the Finish line's step; you're the Timer." with Back to Times and Switch job.
- For a zone lead it is a `role="tablist"` of `role="tab"` buttons; the selected tab is `navy`. A warning note replaces the status ("1 to check", "More than usual").
- Cells at least 48px tall, label 13px/800, status 12px.
