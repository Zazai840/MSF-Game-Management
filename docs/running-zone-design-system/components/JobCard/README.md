# JobCard

> **Race flow:** now used only on Join and the Switch job sheet, as radio cards (`rz-jobcard`, `role="radio"`), one per job plus Zone lead. Home is the races list.

A large tappable card on Home and the Dashboard that opens one job.

**Use**
- One card per job, in a `<ul class="rz-jobs">`. The whole card is one `<a href>`.
- Anatomy, left to right: a star badge (`size-job-icon`) holding the job icon, then the title (`display-card`), a one-line description (`body-sm`, `ink-muted`), an optional Badge, and a chevron.
- **Job colours:**
  - `rz-job--checkin`: `running` star, flag icon.
  - `rz-job--finish`: `challenge` star, list icon.
  - `rz-job--times`: `gold` star, stopwatch icon.
  - `rz-job--dashboard`: `jumping` star, dashboard icon.
  - `rz-job--results`: `throwing` star, trophy icon.
  - These name the job and stay the same in every zone.
- **Badges:**
  - "1 race ready" (navy) counts work waiting for this job.
  - "5 to check" (`rz-badge--alert`) counts problems for a lead.
  - With nothing waiting, leave the badge out (not "0 races ready").

**The consumer provides:** href, title, description, an optional count.

**Tokens:** `card`, `shadow-card`, `radius-xl`, `navy`, `ink-muted`, `space-14`, `size-job-icon`.

**Don't**
- Put two actions in one card.
- Write a description longer than one sentence.
- Colour the card itself.

**Markup**

```html
<ul class="rz-jobs">
  <li>
    <a class="rz-job rz-job--checkin" href="#checkin">
      <span class="rz-job__icon"><svg class="rz-star" viewBox="0 0 40 40" aria-hidden="true"><!-- star: see Motifs --></svg><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- flag: see Icon --></svg></span>
      <span class="rz-job__body">
        <span class="rz-job__title">Check in runners</span>
        <span class="rz-job__desc">Type each runner's wristband number before the race starts</span>
      </span>
      <svg class="rz-icon rz-icon--bold" viewBox="0 0 24 24" aria-hidden="true"><!-- chevron-right: see Icon --></svg>
    </a>
  </li>
  <li>
    <a class="rz-job rz-job--finish" href="#finish">
      <span class="rz-job__icon"><svg class="rz-star" viewBox="0 0 40 40" aria-hidden="true"><!-- star: see Motifs --></svg><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- list: see Icon --></svg></span>
      <span class="rz-job__body">
        <span class="rz-job__title">Record the finishing order</span>
        <span class="rz-job__desc">Tap runners in the order they crossed the line</span>
        <span class="rz-badge">1 race ready</span>
      </span>
      <svg class="rz-icon rz-icon--bold" viewBox="0 0 24 24" aria-hidden="true"><!-- chevron-right: see Icon --></svg>
    </a>
  </li>
  <li>
    <a class="rz-job rz-job--times" href="#times">
      <span class="rz-job__icon"><svg class="rz-star" viewBox="0 0 40 40" aria-hidden="true"><!-- star: see Motifs --></svg><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- stopwatch: see Icon --></svg></span>
      <span class="rz-job__body">
        <span class="rz-job__title">Enter times</span>
        <span class="rz-job__desc">Type each place's time from the timer</span>
        <span class="rz-badge">2 races ready</span>
      </span>
      <svg class="rz-icon rz-icon--bold" viewBox="0 0 24 24" aria-hidden="true"><!-- chevron-right: see Icon --></svg>
    </a>
  </li>
</ul>
```
