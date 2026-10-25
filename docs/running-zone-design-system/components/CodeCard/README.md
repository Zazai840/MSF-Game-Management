# CodeCard

Shows a code someone has to read out or type: the day code and the lead code on Day setup (screen 30).

**Anatomy**
1. Label (`display-eyebrow`, `ink-muted`): "Day code", "Lead code".
2. The code in `display-code` (44px, tabular, 0.04em tracking), so it reads across a field.
3. One or two sentences on who gets it and what happens when it changes.
4. A small button to make a new one; confirm in a Sheet first.

Codes avoid look-alike characters (0/O, 1/I/L) when they're generated.

**Tokens:** `card`, `shadow-card`, `radius-xl`, `space-16`.

**Don't**
- Hide the code behind a reveal button for the owner.
- Show the lead code on any volunteer screen.

**Markup**

```html
<section class="rz-codecard" aria-labelledby="daycode">
  <h2 class="rz-codecard__label" id="daycode">Day code</h2>
  <p class="rz-codecard__value">6509</p>
  <p class="rz-codecard__text">Volunteers type this to join today.</p>
  <button class="rz-btn rz-btn--small" type="button">Make a new day code</button>
</section>
```
