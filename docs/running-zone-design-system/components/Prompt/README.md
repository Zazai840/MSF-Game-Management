# Prompt

The heading block of a screen. Task screens ask one question (`rz-prompt`); menus and lists get a title row (`rz-heading-row`).

**Task prompt** (`rz-prompt`), three lines in this order:
1. `rz-prompt__meta`: race context with middle dots, `meta` style in `ink-muted` ("60m · Girl Cubs · Heat 4 · 5 runners").
2. `rz-prompt__q`: the question as the page's `<h1>`, `display-prompt` (54px).
   - Wrap the single key word in `<em>`; it changes colour to `red-ink` and nothing else ("Who came <em>3rd?</em>").
   - Write the copy in sentence case; CSS uppercases it.
3. `rz-prompt__help`: one instruction sentence, `body`, `ink-muted`.

Add `rz-prompt--compact` (40px question) when the keyboard is open: wristband and time entry.

**Heading row** (`rz-heading-row`): an `<h1 class="rz-screen-title">` (`display-screen`) with at most one pill Button on the right ("I'm a zone lead").

**Don't**
- Emphasise more than one word.
- Put two prompts on a screen.
- Write a question longer than two lines at 390px; shorten the copy instead.

**Markup**

```html
<div class="rz-heading-row">
  <h1 class="rz-screen-title">Pick your job</h1>
  <button class="rz-btn rz-btn--pill" type="button">I'm a zone lead</button>
</div>

<div class="rz-prompt">
  <p class="rz-prompt__meta">60m · Girl Cubs · Heat 4 · 5 runners</p>
  <h1 class="rz-prompt__q">Who came <em>3rd?</em></h1>
  <p class="rz-prompt__help">Tap runners in the order they crossed the line.</p>
</div>
```
