# Toast

After a step is saved, on Races: what was saved, with Undo. Undo reverses only your own save. Spec: race-flow.md "New components"; rules in `components/bundle.css`.

**Markup** (icon paths from [Icon](../Icon/README.md))

```html
<div class="rz-toast" role="status">
  <span class="rz-toast__msg"><svg class="rz-icon">CHECK</svg>Times saved</span>
  <button type="button">Undo</button>
</div>
```

**Rules**
- Fixed above the footer, `navy`, 14px radius, `shadow-raised`; gold tick and a gold Undo at least 44px.
- 6 seconds, paused while focused. If someone else has changed the step since, it reads "Tom Barker changed this" with Open race instead of Undo.
