# JobBand

The full-width band directly below the app bar, on Races and on a race, naming your job on the job's colour. It opens Switch job. Spec: race-flow.md "New components"; rules in `components/bundle.css`.

**Markup** (icon paths from [Icon](../Icon/README.md))

```html
<button type="button" class="rz-jobband rz-jobband--timer" aria-label="You are: Timer. Change job">
  <svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true">STOPWATCH</svg>
  <span>You are: <strong>Timer</strong></span>
  <svg class="rz-icon rz-icon--chevron" viewBox="0 0 24 24" aria-hidden="true">CHEVRON-DOWN</svg>
</button>
```

**Rules**
- Edge to edge, its content on the screen's gutter, at least `size-touch` tall.
- `navy` text on the job's colour, the same colours as the job cards: Start line `running` (`rz-jobband--start`), Finish line `challenge` (`--finish`), Timer `gold` (`--timer`), Zone lead `jumping` (`--lead`).
- "You are:" is 16px/800; the job is 22px display type, its capitals from CSS. Job icon and chevron 20px.
- The colour never stands alone: the band always says the job in words.
- The label says the job and that it changes: "You are: Timer. Change job".
- Not on lead screens (Results, Day setup): only a zone lead opens them.
