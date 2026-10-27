# ZoneSwitcher

Four icon tabs in the hero AppBar, one per rulebook zone: Running, Jumping, Throwing, Challenge.

**Use**
- Show it only when the day has more than one zone set up. A single-zone day (Running only, as now) leaves it out, and the zone name in the hero says where you are.
- The current zone has `aria-current="page"`. Its tab is filled with the zone colour and has a `navy` icon.
- Other zones are outlined in their colour, with labels in `scoreboard-muted`.
- Order is always Running, Jumping, Throwing, Challenge, as in the rulebook.

**The consumer provides:** the list of zones that exist today, their hrefs and which one is current.

**Tokens**
- `running`, `jumping`, `throwing`, `challenge` on `navy` (4.8–6.2:1).
- `on-navy` and `scoreboard-muted` labels.
- `radius-tab`, `size-touch`, type style `micro`.

**Don't**
- Use it outside the hero.
- Use more than four tabs.
- Drop the word labels.

**Markup**

```html
<nav aria-label="Zones">
  <ul class="rz-zones">
    <li><a class="rz-zone rz-zone--running" href="#running" aria-current="page"><span class="rz-zone__icon"><svg class="rz-icon rz-icon--bold" viewBox="0 0 24 24" aria-hidden="true"><!-- hurdle: see Icon --></svg></span>Running</a></li>
    <li><a class="rz-zone rz-zone--jumping" href="#jumping"><span class="rz-zone__icon"><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- jump: see Icon --></svg></span>Jumping</a></li>
    <li><a class="rz-zone rz-zone--throwing" href="#throwing"><span class="rz-zone__icon"><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- throw: see Icon --></svg></span>Throwing</a></li>
    <li><a class="rz-zone rz-zone--challenge" href="#challenge"><span class="rz-zone__icon"><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- target: see Icon --></svg></span>Challenge</a></li>
  </ul>
</nav>
```
