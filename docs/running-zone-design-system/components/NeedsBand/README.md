# NeedsBand

The full-width line directly below the [JobBand](../JobBand/README.md) on a race: what the race still needs to reach Results, the same sentence for every role and the zone lead. Spec: race-flow.md "New components"; rules in `components/bundle.css`. The sentence comes from `raceNeeds` in `src/shared/race-flow.ts`.

**Markup** (icon paths from [Icon](../Icon/README.md))

```html
<p class="rz-needsband" aria-live="polite"><span>Not in Results yet. Finish line: tap Save the order.</span></p>
<p class="rz-needsband rz-needsband--saved" aria-live="polite">
  <svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true">CHECK</svg><span>In Results.</span>
</p>
```

**Rules**
- Edge to edge, its text on the screen's gutter. Not tappable.
- 13px/700 `navy` on `card`; the check is 16px `throwing-ink`. The done-button sentences fit one line at 360px; a longer detail wraps.
- A missing detail first ("Not in Results yet: 6th place has no time."), else the first done button not tapped and its role, and "In Results." once the race is saved.
- The words are "in Results" and "not in Results yet", never "not saved": every tap is saved.
- A volunteer's band starts with whose turn it is (`raceNeedsFor`): "Your turn · 2 runners have no place" with a gold dot (`rz-needsband--mine`) for the role whose step it is, "Waiting for Finish line · 2 runners have no place" for the others. A lead's band keeps the plain sentence.
- It changes as the race does, with no reload; `aria-live="polite"` reads the change out.
