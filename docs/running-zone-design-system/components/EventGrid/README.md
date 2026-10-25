# EventGrid

A two-column grid of section cells under each event heading on Results (screen 25), with a legend.

**Cells:** each is an `<a>` to that section's leaderboard. The label is "R4 · Girl Cubs" and the status is in words.
- **Not started** (`--idle`): transparent, dashed `line-strong` outline, "Not started".
- **Running** (`--running`): `card` with a 2px `navy` ring and a zone-coloured dot, "Heats running · 5 races".
- **Done** (`--done`): `navy` fill, `on-navy` text with a tick, "Final done".

**Legend:** shows the three swatches with their words above the first event. Event headings use `rz-section` ("60m", "60m Hurdles", "200m", "400m").

**Tokens:** `card`, `navy`, `on-navy`, `line-strong`, `--zone`, `radius-md`, `space-8`.

**Don't**
- Rely on the fill alone; the status words stay.
- Use more than two columns on a phone.

**Markup**

```html
<ul class="rz-legend" aria-label="Key">
  <li><span class="rz-legend__swatch rz-legend__swatch--done"></span>Done</li>
  <li><span class="rz-legend__swatch rz-legend__swatch--running"></span>Running</li>
  <li><span class="rz-legend__swatch rz-legend__swatch--idle"></span>Not started</li>
</ul>
<h2 class="rz-section">60m</h2>
<ul class="rz-events">
  <li><a class="rz-event rz-event--done" href="#r1"><span class="rz-event__name">R1 · Boy Beavers</span><span class="rz-event__status"><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- check: see Icon --></svg>Final done</span></a></li>
  <li><a class="rz-event rz-event--idle" href="#r2"><span class="rz-event__name">R2 · Girl Beavers</span><span class="rz-event__status">Not started</span></a></li>
  <li><a class="rz-event rz-event--running" href="#r3"><span class="rz-event__name">R3 · Boy Cubs</span><span class="rz-event__status">Heats running · 1 race</span></a></li>
  <li><a class="rz-event rz-event--running" href="#r4"><span class="rz-event__name">R4 · Girl Cubs</span><span class="rz-event__status">Heats running · 5 races</span></a></li>
</ul>
```
