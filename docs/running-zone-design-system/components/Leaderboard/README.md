# Leaderboard

Standings for one event and section on the dark scoreboard surface (screen 26). This is the only dark screen in the app.

**Board head**
- The event title (`display-title`), with the section name on its second line in the zone colour.
- The section code Badge (R4).
- The live chip ("Heats running · 5 races", with the `live` dot).
- The rule note in `scoreboard-muted` ("Top 8 · Q = fastest 6").
- The star pattern and speed stripes sit behind the head only.

**Rows:** an `<ol>`; each row is a `<button>` that opens the runner's actions sheet.
- **Qualifier** (`rz-lb--q`):
  - rank on a zone-coloured star (`size-rank`) in `navy`;
  - wristband in `label`, with a Q tag;
  - detail in `scoreboard-muted` ("Heat 1 · 1st in race");
  - time in `display-time`, `gold`.
- **Other highlighted places:** rank in a plain outline square (`radius-sm`, `scoreboard-line-strong`) and the time in `on-navy`.
- **Outside the highlighted top places** (`rz-lb--outside`): transparent with a dashed outline, and the detail says "outside top 8".
- **Tied rows** carry a TIE tag before the time; tapping one opens the Settle-a-tie sheet.
- **Qualifying line** (`rz-qline`): two `red` bars with "Qualifying line" between, as a list item with an `aria-label` that explains it. Only on events where the fastest 6 go to a final (60m and relay).

**Tokens:** `scoreboard`, `scoreboard-row`, `scoreboard-line`, `scoreboard-line-strong`, `scoreboard-muted`, `on-navy`, `gold`, `red`, `live`, `--zone`.

**Don't**
- Use the scoreboard surface elsewhere.
- Show children's names.
- Colour a row by result without a word or tag.
- Animate rank changes.

**Markup**

```html
<section class="rz-scoreboard" aria-labelledby="board-title">
  <svg class="rz-pattern" aria-hidden="true"><!-- star pattern, id "rz-star-lb": see Motifs --></svg>
  <div class="rz-stripes" aria-hidden="true"><span></span><span></span><span></span></div>
  <div class="rz-board-head">
    <div class="rz-row" style="align-items:flex-end">
      <h1 class="rz-board-title" id="board-title">60m <span>Girl Cubs</span></h1>
      <span class="rz-badge rz-badge--zone">R4</span>
    </div>
    <div class="rz-row" style="gap:10px">
      <span class="rz-live">Heats running · 5 races</span>
      <span class="rz-board-note">Top 8 · Q = fastest 6</span>
    </div>
  </div>
  <ol class="rz-board">
    <li><button class="rz-lb rz-lb--q" type="button">
      <span class="rz-lb__rank"><svg class="rz-star" viewBox="0 0 40 40" aria-hidden="true"><!-- star: see Motifs --></svg><span>1</span></span>
      <span class="rz-lb__who"><span class="rz-lb__band">2003 <span class="rz-tag rz-tag--q">Q</span></span><span class="rz-lb__detail">Heat 1 · 1st in race</span></span>
      <span class="rz-lb__end"><span class="rz-lb__time">10.12</span></span>
    </button></li>
    <li><button class="rz-lb rz-lb--q" type="button">
      <span class="rz-lb__rank"><svg class="rz-star" viewBox="0 0 40 40" aria-hidden="true"><!-- star: see Motifs --></svg><span>2</span></span>
      <span class="rz-lb__who"><span class="rz-lb__band">2014 <span class="rz-tag rz-tag--q">Q</span></span><span class="rz-lb__detail">Heat 2 · 1st in race</span></span>
      <span class="rz-lb__end"><span class="rz-lb__time">10.20</span></span>
    </button></li>
    <li class="rz-qline" aria-label="Qualifying line: places above go through to the final"><span aria-hidden="true">Qualifying line</span></li>
    <li><button class="rz-lb" type="button">
      <span class="rz-lb__rank rz-lb__rank--plain">7</span>
      <span class="rz-lb__who"><span class="rz-lb__band">2002</span><span class="rz-lb__detail">Heat 1 · 4th in race</span></span>
      <span class="rz-lb__end"><span class="rz-lb__time">11.02</span></span>
    </button></li>
    <li><button class="rz-lb" type="button">
      <span class="rz-lb__rank rz-lb__rank--plain">8</span>
      <span class="rz-lb__who"><span class="rz-lb__band">2006</span><span class="rz-lb__detail">Heat 1 · 5th in race</span></span>
      <span class="rz-lb__end"><span class="rz-tag rz-tag--tie">Tie</span><span class="rz-lb__time">11.30</span></span>
    </button></li>
    <li><button class="rz-lb rz-lb--outside" type="button">
      <span class="rz-lb__rank rz-lb__rank--plain">9</span>
      <span class="rz-lb__who"><span class="rz-lb__band">2012</span><span class="rz-lb__detail">Heat 2 · 4th in race · outside top 8</span></span>
      <span class="rz-lb__end"><span class="rz-tag rz-tag--tie">Tie</span><span class="rz-lb__time">11.30</span></span>
    </button></li>
  </ol>
</section>
```
