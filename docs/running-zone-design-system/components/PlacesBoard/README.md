# PlacesBoard

The finish line's places: one slot for every runner in the race, so a full heat fits on one screen. Spec: race-flow.md "New components"; rules in `components/bundle.css`.

**Markup** (icon paths from [Icon](../Icon/README.md))

```html
<ol class="rz-places" aria-label="Places: 2 of 8 recorded">
  <li><button type="button" class="rz-placeslot rz-placeslot--placed" aria-label="1st place: 2033. Change"><span class="rz-placeslot__ord">1st</span><span class="rz-placeslot__num">2033</span></button></li>
  <li><span class="rz-placeslot rz-placeslot--current" aria-current="step" aria-label="3rd place: choosing now"><span class="rz-placeslot__ord">3rd</span><span class="rz-placeslot__num">?</span></span></li>
  <li><span class="rz-placeslot rz-placeslot--empty" aria-label="4th place: empty"><span class="rz-placeslot__ord">4th</span><span class="rz-placeslot__num">–</span></span></li>
</ol>
```

**Rules**
- 4 columns of 44px slots on a phone (9–12 runners make 3 rows); more columns on wider screens.
- Placed: `navy` with a gold Saira ordinal; tap to fill that place again. Current: `gold` + 2px `navy` ring. Empty: dashed `line-strong`.
- Changing a placed slot: `rz-placeslot--changing`, the 2px `navy` ring with its runner still shown, `aria-label="Changing 1st: 2033"`. The prompt meta reads "Changing 1st: 2033", 2033 is among the runner buttons again, and a small "Keep 2033" button beside the prompt puts it back.
