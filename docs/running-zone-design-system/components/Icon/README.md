# Icon

The app's line icons: a 24px grid, 2.2px stroke in `currentColor`, round caps and joins, no fill. Drawn for this system. There is no third-party icon set; draw new icons to the same rules.

**Markup:** inline SVG, so the colour follows the text. Add `rz-icon--bold` (2.6px) for chevrons and small sizes, and `rz-icon--sm` for 18px.

```html
<svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true">PATHS</svg>
```

Icons sit beside a word and are `aria-hidden`. If an icon must stand alone (drag handle, chip remove, pencil), the button carries the `aria-label`.

| Name | Use | Paths |
|---|---|---|
| `flag` | Check in runners | `<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>` |
| `list` | Record the finishing order | `<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 6h1M4 12h1M4 18h1"/>` |
| `stopwatch` | Enter times | `<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M10 2h4"/>` |
| `hurdle` | Running zone | `<path d="M6 21V9M18 21V9"/><path d="M4 7h16v4H4z"/>` |
| `jump` | Jumping zone | `<path d="M3 20c3-9 9-14 18-12"/><path d="M15 4h6"/><path d="M3 21h6"/>` |
| `throw` | Throwing zone | `<path d="M4 20L20 4"/><path d="M14 4h6v6"/>` |
| `target` | Challenge zone | `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>` |
| `dashboard` | Dashboard | `<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>` |
| `trophy` | Results | `<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8 20h8M10 17h4"/>` |
| `check` | Saved, ok tags, done cells | `<path d="M5 12.5l4.5 4.5L19 7.5"/>` |
| `warning` | WarningCallout | `<path d="M12 3.5L2.5 20h19L12 3.5z"/><path d="M12 10v4.5"/><path d="M12 17.5v.01"/>` |
| `close` | Remove a wristband chip | `<path d="M7 7l10 10M17 7L7 17"/>` |
| `plus` | Add actions (optional; "+" text works too) | `<path d="M12 5v14M5 12h14"/>` |
| `pencil` | Edit a time or runner | `<path d="M4 20l1-4L16 5l3 3L8 19l-4 1z"/><path d="M14 7l3 3"/>` |
| `refresh` | Refresh (optional beside the word) | `<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/>` |
| `drag` | ReorderList handle (dots: stroke-width 3.4) | `<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="3.4"/>` |
| `chevron-left` | Back link | `<path d="M15 6l-6 6 6 6"/>` |
| `chevron-right` | Rows and cards that navigate | `<path d="M9 6l6 6-6 6"/>` |

**Don't**
- Use filled, duotone or emoji icons.
- Mix in another icon set.
- Set an icon in a colour that fails 3:1 on its ground.
