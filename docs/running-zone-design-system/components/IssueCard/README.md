# IssueCard

One problem waiting for a zone lead on the To check list (screen 23).

**Use**
- Newest first, in `<ul class="rz-issues">`.
- **Anatomy:**
  1. Meta line: where (with a `red-ink` dot), then the time it was raised.
  2. Title (`title-sm`): what happened, in plain words ("A time looks wrong", "A runner was added at the finish", "A wristband number needs checking").
  3. Body: one or two sentences with the numbers.
  4. A small primary "Open race".
- The card leaves the list once the lead resolves it.

**Tokens:** `card`, `shadow-card`, `radius-xl`, `red-ink` dot, `ink-muted` meta and body, `navy` title.

**Don't**
- Use a coloured left border or a red card.
- Put more than one action on a card.
- Hide the numbers behind "See details".

**Markup**

```html
<ul class="rz-issues">
  <li class="rz-issue">
    <p class="rz-issue__meta"><span class="rz-issue__where">R4 · 60m Girl Cubs · Heat 3</span><time>11:41</time></p>
    <h2 class="rz-issue__title">A time looks wrong</h2>
    <p class="rz-issue__body">2nd place (11.80) is faster than 1st (12.34). The timer kept it as typed.</p>
    <a class="rz-btn rz-btn--primary rz-btn--small" href="#race">Open race</a>
  </li>
</ul>
```
