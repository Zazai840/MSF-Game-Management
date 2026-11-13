# EventTabs

Races · Relays on Home, and an event's tabs in Results: a segmented control, one equal column per tab. Home's Races holds races and hurdles events, Relays the relays. The last tab is remembered per phone. Spec: race-flow.md "New components"; rules in `components/bundle.css`.

**Markup** (icon paths from [Icon](../Icon/README.md))

```html
<nav class="rz-tabs" aria-label="Event type" style="--tabs: 2; --tab: 0">
  <span class="rz-tab-cell" aria-hidden="true"></span>
  <button type="button" aria-current="page" data-lit>Races</button>
  <button type="button">Relays</button>
</nav>
```

**Rules**
- `card` with `shadow-card` and `radius-tab`, 4px inset; each tab 44px, Saira italic caps 18px.
- Columns flex to the number of tabs: Home's 2, an event's 3 (Heats · Final · Notes), 2 for an event with no final (Heats · Notes).
- The current tab has `aria-current="page"` at once. Its `navy` cell is one element behind the buttons (`rz-tab-cell`, first in the `nav`, hidden from assistive technology), one tab wide with `radius-sm` corners. `--tabs` is the number of tabs and `--tab` the cell's place, counted in tabs from the first. The buttons paint no background of their own.
- The tab the cell is on has `data-lit` and `on-navy` text; the other tabs are `navy` on `card`.
- **The cell slides.** On a change of tab the screen under the tabs changes at once and the cell slides to the new tab in 200ms with `--ease-out`; the words change colour over the same 200ms. A second tap while it moves sends it on from where it is. Each event remembers its own cell's place while the app is open. No motion on the first screen, when the number of tabs changes (the cell is then on the current tab at once), or under `prefers-reduced-motion: reduce`.
- The press shrink, the focus ring and the 44px touch height are those of every tab.
- Which tab an event is on follows from its stored type, never its name: races and hurdles on Races, relays on Relays.
- A phone that remembered the Hurdles tab of an older build opens on Races, with no message.
