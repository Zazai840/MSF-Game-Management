# Badge

A slanted Saira tag that counts waiting work or labels a stage.

**Variants**
- **Default** (navy): work waiting for a volunteer, "1 race ready", "2 races ready".
- `--alert` (`red-ink`): problems for a lead, "5 to check".
- `--gold`: the race stage when it matters, "Final".
- `--zone`: the zone colour behind a section code (R4); same look as `rz-code-tag`.

Text is navy on gold and zone fills; `on-navy` on navy and red-ink.

**Tokens:** `skew-tag`, `display-tag` (14px, 0.06em, caps), `navy`, `red-ink`, `gold`, `--zone`.

**Don't**
- Show "0 races ready" (hide the badge).
- Write more than three words.
- Make a badge a button.

**Markup**

```html
<span class="rz-badge">1 race ready</span>
<span class="rz-badge rz-badge--alert">5 to check</span>
<span class="rz-badge rz-badge--gold">Final</span>
<span class="rz-badge rz-badge--zone">R4</span>
```
