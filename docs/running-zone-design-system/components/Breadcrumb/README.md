# Breadcrumb

> **Race flow:** no longer used on race screens; the race's app bar has a back link to Races.

A trail of links under the compact AppBar on zone-lead screens (22–32), so a lead can jump back several levels.

**Use**
- Volunteer task screens don't have one; the AppBar's back link is enough there.
- With more than four levels, replace the leading crumbs with one "…" link to the nearest hidden level, labelled "Back to Dashboard".
- The last crumb is the current page: a `<span aria-current="page">` in `ink-muted`, not a link.

**The consumer provides:** the ordered path of `{label, href}`.

**Tokens:** `paper`, `line` (bottom hairline), `navy` links underlined at 1.5px, `ink-muted` separators and current page, type style `crumb`. Links are at least 32px tall.

**Don't**
- Bold the current page.
- Use the breadcrumb as the only way back on a volunteer screen.
- Let it wrap past two lines (truncate instead).

**Markup**

```html
<nav class="rz-crumbs" aria-label="Breadcrumb">
  <ol>
    <li><a href="#home">Home</a></li>
    <li><a href="#dashboard">Dashboard</a></li>
    <li><a href="#results">Results</a></li>
    <li><span aria-current="page">60m Girl Cubs</span></li>
  </ol>
</nav>

<nav class="rz-crumbs" aria-label="Breadcrumb">
  <ol>
    <li><a href="#dashboard" aria-label="Back to Dashboard">…</a></li>
    <li><a href="#results">Results</a></li>
    <li><a href="#event">60m Girl Cubs</a></li>
    <li><span aria-current="page">Heat 1</span></li>
  </ol>
</nav>
```
