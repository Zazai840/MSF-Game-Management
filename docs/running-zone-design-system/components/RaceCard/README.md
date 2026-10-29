# RaceCard

One event group (an event in one section) on Races: its title, code, a status line for my role, and its HeatChips. Spec: race-flow.md "New components"; rules in `components/bundle.css`.

**Markup** (icon paths from [Icon](../Icon/README.md))

```html
<article class="rz-racecard">
  <div class="rz-racecard__head"><h3 class="rz-racecard__title">60m · Girl Cubs</h3><span class="rz-code-tag">R4</span></div>
  <p class="rz-racecard__status">Heats 3 and 4 need times · Heats 1 and 2 done</p>
  <ol class="rz-heats" aria-label="Heats">…</ol>
</article>
```

**Rules**
- `card`, `shadow-card`, `radius-xl`, padding 12/14; title in `display-card`; status in `meta` + `ink-muted`.
- The status line is written for the viewer's role; a lead's names open issues ("Heat 3: A time looks wrong").
- Over 700px wide, cards flow into columns of at least 320px.
