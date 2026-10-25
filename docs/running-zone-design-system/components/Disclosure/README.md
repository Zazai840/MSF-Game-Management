# Disclosure

A native `<details>` that hides secondary history: "Saved versions (5)" on a race in detail (screen 28).

**Use**
- The summary is a 44px row: a chevron that turns from right to down, then the label with its count in brackets.
- The body is a short list in `body-sm`, `ink-muted`, one entry per line with middle-dot separators.
- Use it for history and audit detail, never for actions or warnings.

**Tokens:** `navy` summary text at 800, `ink-muted` body, `size-touch`, 150ms chevron turn (none with reduced motion).

**Don't**
- Nest disclosures.
- Hide anything the user must act on.

**Markup**

```html
<details class="rz-disclosure">
  <summary>Saved versions (5)</summary>
  <div class="rz-disclosure__body">
    <span>11:41:12 · checked in · Amina Yusuf</span>
    <span>11:43:02 · finishing order · Tom Barker</span>
    <span>11:47:30 · times · Grace Mensah</span>
  </div>
</details>
```
