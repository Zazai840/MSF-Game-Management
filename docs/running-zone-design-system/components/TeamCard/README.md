# TeamCard

A relay team at the start line: the team in this heat (or a seeded team in the final) with its four children in leg order, each child's leg moved by a grip. Spec: race-flow.md "9. Relays" and "New components"; rules in `components/bundle.css`.

**Use**
- **Heat.** The head row holds "Team 5", a note, then small Buttons **Edit** and **Take off**. Every child of a team in the heat is checked in, with no Here per child. Each leg is an attendance row: "1st leg" over the wristband, and a 44px grip. An empty leg reads "–" on a dashed row (`is-absent`).
- **Final.** The whole team is one card. The head reads "1st fastest · Team 2" ("Called up", "Added"), with **Edit** beside the name and **Here** / **Absent** pills for the whole team, neither lit at first; tapping a lit one again clears it. Each leg is a 44px row under a `line` rule, with no per-child Here. An Absent card is dashed. Every card but an Absent one has Edit and the grips. Only teams Here run the final.
- **Note** beside the name, in `warn-ink`: "Runs short · 3 of 4" for a team short of four (it never blocks the race), or "Aisha Noor is changing this team" while another phone has it open in Edit.
- **Grips** come from the race flow's SortableList: drag only from the grip, the labels follow live, arrow keys move the focused grip. The grip reads "Move 2071", or "Move empty 4th leg". A drop saves the race and the team list together, every child still checked in. The dragged row lifts with `shadow-raised`.
- Grips are hidden on a team another phone is changing, and on every card while this phone has a team open in Edit.

**Tokens:** `card`, `shadow-card`, `shadow-raised`, `line`, `line-strong`, `warn-ink`, `ink-muted`, `radius-md`, `size-touch`.

**Don't**
- Light Here or Absent for anyone at the start of a final: the volunteer marks each team.
- Put a Here / Not yet on a child of a team in a heat: the team is checked in whole.
- Put grips on a team another phone is changing.

**Markup** (icon paths from [Icon](../Icon/README.md))

```html
<section class="rz-teamcard" aria-label="Team 5">
  <div class="rz-teamcard__head"><h3 class="rz-teamcard__name">Team 5</h3><span class="rz-teamcard__note">Runs short · 3 of 4</span>
    <span class="rz-teamcard__marks"><button type="button" class="rz-btn rz-btn--small" aria-label="Edit Team 5">Edit</button></span></div>
  <ol class="rz-attendance rz-attendance--one rz-teamgrips" aria-label="Team 5 legs">
    <li><span class="rz-attendance__who"><span class="rz-attendance__seed">1st leg</span><span class="label">2071</span></span>
      <button type="button" class="rz-orderrow__handle" aria-label="Move 2071" aria-roledescription="drag handle"><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- drag --></svg></button></li>
    <li class="is-absent"><span class="rz-attendance__who"><span class="rz-attendance__seed">4th leg</span><span class="label">–</span></span>
      <button type="button" class="rz-orderrow__handle" aria-label="Move empty 4th leg" aria-roledescription="drag handle"><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- drag --></svg></button></li>
  </ol>
</section>

<section class="rz-teamcard rz-teamcard--final" aria-label="Team 2">
  <div class="rz-teamcard__head"><h3 class="rz-teamcard__name"><span class="rz-teamcard__seed">1st fastest · </span>Team 2</h3>
    <button type="button" class="rz-btn rz-btn--small" aria-label="Edit Team 2">Edit</button>
    <span class="rz-teamcard__marks"><button type="button" class="rz-btn rz-btn--pill rz-btn--primary" aria-pressed="true" aria-label="Team 2: Here">Here</button><button type="button" class="rz-btn rz-btn--pill" aria-pressed="false" aria-label="Team 2: Absent">Absent</button></span></div>
  <ol class="rz-teamlegs rz-teamgrips" aria-label="Team 2 legs">
    <li><span class="rz-teamlegs__leg">1st leg</span><span class="label">2061</span><button type="button" class="rz-orderrow__handle" aria-label="Move 2061" aria-roledescription="drag handle"><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- drag --></svg></button></li>
  </ol>
</section>
```
