# HeatChips

One chip per race of an event group, then "+" for the next heat and, once every heat is saved, "+ Final". States follow the viewer's step. Spec: race-flow.md "New components"; rules in `components/bundle.css`.

**Markup** (icon paths from [Icon](../Icon/README.md))

```html
<ol class="rz-heats" aria-label="Heats">
  <li><button type="button" class="rz-heat rz-heat--done" aria-label="Heat 1, times done">H1 <svg class="rz-icon">CHECK</svg></button></li>
  <li><button type="button" class="rz-heat rz-heat--current" aria-current="page" aria-label="Heat 3, needs times, this race">H3</button></li>
  <li><button type="button" class="rz-heat rz-heat--pending" aria-label="Heat 4, needs times">H4</button></li>
  <li><button type="button" class="rz-heat rz-heat--add" aria-label="Add heat 5">+</button></li>
</ol>
```

**Rules**
- Done: `navy` + tick (`--done`). Ready for me on Home: `gold` (`--ready`). Current race: `gold` + 2px `navy` ring (`--current`). Ready but not current: `card` + `navy` ring + gold dot (`--pending`). Waiting: `card` + 2px `line`. Add: dashed `line-strong` (`--add`). Create final: dashed `navy` (`--final`).
- Every chip's `aria-label` says its state in words, never colour alone.
- Minimum 52 × 44, `radius-md`, Saira 18px "H1"; the final is "F".
