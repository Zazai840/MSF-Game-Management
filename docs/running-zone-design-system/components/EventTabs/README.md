# EventTabs

Races · Hurdles · Relays on Home: a 3-column segmented control. The last tab is remembered per phone. Spec: race-flow.md "New components"; rules in `components/bundle.css`.

**Markup** (icon paths from [Icon](../Icon/README.md))

```html
<nav class="rz-tabs" aria-label="Event type">
  <button type="button" aria-current="page">Races</button>
  <button type="button">Hurdles</button>
  <button type="button">Relays</button>
</nav>
```

**Rules**
- `card` with `shadow-card` and `radius-tab`, 4px inset; each tab 44px, Saira italic caps 18px.
- The current tab is `navy` with `on-navy` text and `aria-current="page"`.
- Which tab an event is on is its stored type, never its name.
