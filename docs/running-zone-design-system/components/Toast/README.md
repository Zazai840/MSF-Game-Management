# Toast

After a step is saved, on Races: what was saved, with Undo. Undo reverses only your own save. Spec: race-flow.md "New components"; rules in `components/bundle.css`.

**Markup** (icon paths from [Icon](../Icon/README.md))

```html
<div class="rz-toast" role="status">
  <span class="rz-toast__msg"><svg class="rz-icon">CHECK</svg>Times saved · Girl Cubs Heat 2</span>
  <button type="button">Undo</button>
</div>
```

**Rules**
- Fixed above the footer, `navy`, `shadow-raised`; gold tick and a gold Undo at least 44px.
- A pill: as wide as its words, centred, `radius-pill`, never wider than the screen less its side gutters. 36px tall as a line alone, 44px (`size-touch`) with a button.
- A line too long for one row wraps to two, and the pill becomes a rounded box (`rz-toast--box`, `radius-lg`) so no words are cut. The app adds that class when the line wraps; it is not a variant to choose.
- 6 seconds, paused while focused. If someone else has changed the step since, it reads "Tom Barker changed this since. Open the race to edit it." with Open race instead of Undo.
