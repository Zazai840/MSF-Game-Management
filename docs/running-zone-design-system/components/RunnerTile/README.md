# RunnerTile

> **Superseded by [RunnerButton](../RunnerButton/README.md)** on the race flow's finish line (race-flow.md). Kept for reference.

The big arch-topped buttons volunteers tap, in finishing order, as runners cross the line (screens 11–12).

**Use**
- A two-column grid (`rz-tiles`) of every runner not yet placed, in check-in order.
- Tapping a tile places that runner in the current place; the tile leaves the grid.
- Anatomy: a small star in the zone colour, then the wristband number in `display-numeral` (52px).
- The `aria-label` says the outcome: "2032 came 3rd".

**Shape and lift:** top corners `radius-arch`, bottom corners `radius-lg`, height `size-tile`. At rest `shadow-tile` gives a hard 4px navy base; on press the tile moves down 4px and drops to `shadow-card`.

**Don't**
- Shrink the tiles to fit more than 8 on a screen (scroll instead).
- Reorder tiles while the volunteer is tapping.
- Add names or section labels.
- Use the arch shape anywhere else.

**Markup**

```html
<ul class="rz-tiles" aria-label="Runners not yet placed">
  <li><button class="rz-tile" type="button" aria-label="2032 came 3rd"><svg class="rz-star" viewBox="0 0 40 40" aria-hidden="true"><!-- star: see Motifs --></svg><span class="rz-tile__num">2032</span></button></li>
  <li><button class="rz-tile" type="button" aria-label="2034 came 3rd"><svg class="rz-star" viewBox="0 0 40 40" aria-hidden="true"><!-- star: see Motifs --></svg><span class="rz-tile__num">2034</span></button></li>
  <li><button class="rz-tile" type="button" aria-label="2035 came 3rd"><svg class="rz-star" viewBox="0 0 40 40" aria-hidden="true"><!-- star: see Motifs --></svg><span class="rz-tile__num">2035</span></button></li>
</ul>
```
