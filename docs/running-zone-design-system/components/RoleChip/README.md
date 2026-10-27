# RoleChip

The pill on the app bar naming your job, which opens Switch job. Spec: race-flow.md "New components"; rules in `components/bundle.css`.

**Markup** (icon paths from [Icon](../Icon/README.md))

```html
<button type="button" class="rz-rolechip" aria-label="Your job: Timer. Change job">
  <svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true">STOPWATCH</svg>Timer
  <svg class="rz-icon rz-icon--chevron" viewBox="0 0 24 24" aria-hidden="true">CHEVRON-DOWN</svg>
</button>
```

**Rules**
- `paper` fill, `navy` text, 14px/800, job icon 18px, chevron 16px, at least `size-touch` tall.
- A zone lead's reads "Lead" on `jumping` (`rz-rolechip--lead`).
- The label says the job and that it changes: "Your job: Timer. Change job".
