# Motifs

The three brand marks of the system. Copy the SVG exactly; don't redraw them.

## 8-point star (badge)

Two 26px squares with 3px corners, one turned 45°, on a 40px box. The fill comes from CSS (`currentColor`, or `fill` on `.rz-star`). Sizes: `size-job-icon` (58), `size-rank` (40), 104 on the Saved screen, 18 on runner tiles.

```html
<svg class="rz-star" viewBox="0 0 40 40" aria-hidden="true">
  <rect x="7" y="7" width="26" height="26" rx="3"/>
  <rect x="7" y="7" width="26" height="26" rx="3" transform="rotate(45 20 20)"/>
</svg>
```

## Star pattern (texture)

A 44px tile: the same star as 20px squares, with no corner radius, joined to its neighbours by 8px lines. Stroke `paper` at `opacity-pattern` (9%), 1.2px, no fill. Only on `navy` and the top of `scoreboard`. The pattern id must be unique on the page.

```html
<svg class="rz-pattern" aria-hidden="true">
  <defs>
    <pattern id="rz-star-1" width="44" height="44" patternUnits="userSpaceOnUse">
      <g>
        <rect x="12" y="12" width="20" height="20"/>
        <rect x="12" y="12" width="20" height="20" transform="rotate(45 22 22)"/>
        <path d="M0 22H8M36 22H44M22 0V8M22 36V44"/>
      </g>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#rz-star-1)"/>
</svg>
```

## Speed stripes

Three bars in `red`, `gold` and `running`, in that order, skewed `skew-stripe` (-24°). Use one set per screen, bleeding off the right edge of the app bar or board head.
- Hero: 22 × 86, 10px gaps, right −30px, top 56px.
- Compact: 14 × 80, 8px gaps, right 70px, top −10px.

```html
<div class="rz-stripes" aria-hidden="true"><span></span><span></span><span></span></div>
```

## The slant

`skew-tag` (-12°) on Badges, PlaceTrail tags and the TIE tag only.

**Don't**
- Put the pattern on `paper` or behind body text.
- Change the stripe order or colours per zone.
- Rotate or stretch the star.
- Combine star and stripes into a logo.
