# RunnerButton

A compact runner tile on the finish line: tap the runner who came next. Replaces RunnerTile there. Spec: race-flow.md "New components"; rules in `components/bundle.css`.

**Markup** (icon paths from [Icon](../Icon/README.md))

```html
<ul class="rz-runners" aria-label="Runners not yet placed">
  <li><button type="button" class="rz-runner" aria-label="2032 came 3rd">2032</button></li>
</ul>
```

**Rules**
- 3 columns, 72px tall, radius 36/36/12/12 (a shallow arch), `card`, `shadow-tile`, Saira 900 34px tabular.
- On press it moves down 4px and drops to `shadow-card` (not under reduced motion).
