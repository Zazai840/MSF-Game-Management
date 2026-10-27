# AppBar

The navy bar at the top of every screen: the hero version on Home, the compact version everywhere else.

**Use**
- **Hero** (`rz-appbar--hero`) only on Home (screens 2 and 21). It holds:
  - the event eyebrow, "MSF Olympics";
  - the avatar;
  - the zone name in `display-hero`, with the second word in the zone colour;
  - optionally the ZoneSwitcher.
- **Compact** (`rz-appbar--compact`) on every other screen. It holds a back link and the avatar.
  - The back link names the **parent** screen: "Finishing order", "Times", "Home".
  - Screen 1 (Join) shows "Running Zone" in place of the back link and has no avatar.
- **Scoreboard** (`rz-appbar--compact rz-appbar--scoreboard`) on the results leaderboard. The back link is set in Nunito, in `gold`.

**The consumer provides:** the back-link target and label, the user's initials, and the full name in the avatar's `aria-label`. Inside the hero, the zone word takes `--zone` from the screen's zone class.

**Layers:** the star pattern (`rz-pattern`) and the speed stripes (`rz-stripes`) are `aria-hidden` decoration behind the content.
- Each inline pattern needs a page-unique id.
- The hero takes the full stripes; the compact bar takes `rz-stripes--small`; the scoreboard bar takes none (its stripes sit in the board head).

**Tokens**
- `navy` (`scoreboard` for the scoreboard bar), `on-navy`, `gold` (eyebrow, focus ring).
- `radius-2xl` (hero bottom corners), `size-avatar`, `size-touch`, `skew-stripe`, `opacity-pattern`.

**Don't**
- Put actions other than back and the avatar in the bar.
- Use the hero on a task screen.
- Stack two app bars.
- Put the star pattern on `paper`.

**Markup**

```html
<header class="rz-appbar rz-appbar--hero">
  <svg class="rz-pattern" aria-hidden="true"><!-- star pattern, id "rz-star-hero": see Motifs --></svg>
  <div class="rz-stripes" aria-hidden="true"><span></span><span></span><span></span></div>
  <div class="rz-appbar__top">
    <p class="rz-appbar__eyebrow">MSF Olympics</p>
    <a class="rz-avatar" href="#me" aria-label="Amina Yusuf, your details">AY</a>
  </div>
  <h1 class="rz-appbar__title">Running <span>Zone</span></h1>
</header>

<header class="rz-appbar rz-appbar--compact">
  <svg class="rz-pattern" aria-hidden="true"><!-- star pattern, id "rz-star-compact": see Motifs --></svg>
  <div class="rz-stripes rz-stripes--small" aria-hidden="true"><span></span><span></span><span></span></div>
  <a class="rz-backlink" href="#finish"><svg class="rz-icon rz-icon--bold" viewBox="0 0 24 24" aria-hidden="true"><!-- chevron-left: see Icon --></svg>Finishing order</a>
  <a class="rz-avatar" href="#me" aria-label="Amina Yusuf, your details">AY</a>
</header>

<header class="rz-appbar rz-appbar--compact rz-appbar--scoreboard">
  <svg class="rz-pattern" aria-hidden="true"><!-- star pattern, id "rz-star-board": see Motifs --></svg>
  <a class="rz-backlink" href="#results"><svg class="rz-icon rz-icon--bold" viewBox="0 0 24 24" aria-hidden="true"><!-- chevron-left: see Icon --></svg>Results</a>
  <a class="rz-avatar" href="#me" aria-label="Amina Yusuf, your details">AY</a>
</header>
```
