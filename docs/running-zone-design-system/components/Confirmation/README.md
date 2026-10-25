# Confirmation

The screen after any job is saved (screen 9): a gold star with a tick, a one-word title, the thank-you line and what was saved.

**Use**
- Centred block, then the ActionFooter:
  - display-primary for the obvious next job ("Check in the next race");
  - secondary "Home";
  - small buttons "Edit runners" and "Delete this race".
- Move focus to the title when it appears.

**Tokens:** `gold` star at 104px with a `navy` 3px tick, `display-*` title at 40px, `title-sm` message, `meta` line in `ink-muted`.

**Don't**
- Add confetti, animation or exclamation marks.
- Auto-advance; the volunteer chooses what is next.

**Markup**

```html
<section class="rz-done" aria-labelledby="saved-title">
  <div class="rz-done__mark"><svg class="rz-star" viewBox="0 0 40 40" aria-hidden="true"><!-- star: see Motifs --></svg><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- check: see Icon --></svg></div>
  <h1 class="rz-done__title" id="saved-title">Saved</h1>
  <p class="rz-done__text">Thank you. Your responses have been saved.</p>
  <p class="rz-done__meta">60m Girl Cubs · Heat 5 · 5 runners</p>
</section>
```
