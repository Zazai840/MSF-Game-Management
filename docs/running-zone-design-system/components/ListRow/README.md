# ListRow

One tappable row in a picker list ("Which race is it?", "60m: which section?") or a settings list (Phones, Events).

**Use**
- Rows sit in `<ul class="rz-list">` under an `rz-section` heading (`display-section`): "Already at the start line", "Waiting for times", "Recent races".
- A row is one `<a href>` (navigation) or `<button>` (choose in place).
- **Contents:** `rz-listrow__label` (Nunito 16/800) with an optional `rz-listrow__meta` line, and on the right one of:
  - a chevron, for navigation;
  - an `rz-code-tag`, the section code (R4) in the zone colour, slanted;
  - a StatusTag.
- **Variants:**
  - `--resume`: navy 2px outline. The "Carry on with …" row, always first.
  - `--warn`: warning ground. A race whose counts disagree; it sorts to the top of its list.

**The consumer provides:** label, meta, href, and an optional trailing tag.

**Tokens:** `card`, `shadow-card`, `radius-md`, `size-action` min height, `space-8` between rows, type styles `button` and `caption`.

**Don't**
- Put two links in a row.
- Truncate the race name; let it wrap.
- Use a zone colour for anything but the code tag.

**Markup**

```html
<a class="rz-listrow rz-listrow--resume" href="#resume">
  <span class="rz-listrow__main"><span class="rz-listrow__label">Carry on with 60m Girl Cubs Heat 4</span></span>
  <svg class="rz-icon rz-icon--bold" viewBox="0 0 24 24" aria-hidden="true"><!-- chevron-right: see Icon --></svg>
</a>
<h2 class="rz-section">Waiting for a finishing order</h2>
<ul class="rz-list">
  <li><a class="rz-listrow" href="#r4h4">
    <span class="rz-listrow__main"><span class="rz-listrow__label">60m Girl Cubs</span><span class="rz-listrow__meta">Heat 4 · 5 runners</span></span>
    <span class="rz-code-tag">R4</span>
  </a></li>
  <li><a class="rz-listrow rz-listrow--warn" href="#r4h3">
    <span class="rz-listrow__main"><span class="rz-listrow__label">60m Girl Cubs</span><span class="rz-listrow__meta">Heat 3 · 5 checked in, 4 placed</span></span>
    <span class="rz-tag rz-tag--warn">Counts differ</span>
  </a></li>
  <li><a class="rz-listrow" href="#phones">
    <span class="rz-listrow__main"><span class="rz-listrow__label">Phones</span><span class="rz-listrow__meta">4 people joined today</span></span>
    <svg class="rz-icon rz-icon--bold" viewBox="0 0 24 24" aria-hidden="true"><!-- chevron-right: see Icon --></svg>
  </a></li>
</ul>
```
