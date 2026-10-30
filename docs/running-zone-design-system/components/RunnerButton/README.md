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

## Team tile (relays)

On a relay's finish line each tile is a team: "Team 5" over the wristband of its 4th leg, the child the finish line sees cross, so a volunteer can match either. Spec: race-flow.md "9. Relays".

```html
<ul class="rz-runners rz-runners--teams" aria-label="Teams not yet placed">
  <li><button type="button" class="rz-runner rz-runner--team" aria-label="Team 5, 4th leg 2054, came 1st"><span>Team 5</span><span>2054</span></button></li>
  <li><button type="button" class="rz-runner rz-runner--team" aria-label="Team 3, no 4th leg, came 1st"><span>Team 3</span><span>–</span></button></li>
</ul>
```

- 2 columns, at least 104px tall, the same arch, fill and press as a runner tile.
- Two lines of equal size (Saira 900 32px tabular): the team, then its 4th leg's wristband, "–" when it has none.
- The `aria-label` says both and the place: "Team 5, 4th leg 2054, came 1st".
- Once placed, the PlacesBoard names the team "T5".
