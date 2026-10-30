# TeamSheet

A relay's teams in a [Sheet](../Sheet/README.md), opened by a relay card's Teams row: every team with its four children in leg order and what it is doing. The same sheet turns into one team's four leg boxes to make or change it. Spec: race-flow.md "9. Relays" and "New components"; rules in `components/bundle.css`.

**Use**
- **List.** Titled with the relay ("4x50m Relay · Girl Cubs"), then the line "8 teams · 2 still to run. Tap a team still to run to change it." Each team is a card: "Team 1", its state ("Heat 1 · ran", "Heat 2 · change it at check-in", "Still to run", "Still to run · 3 of 4"), and its four wristbands in a 4-column row under 1st 2nd 3rd 4th, "–" for an empty leg.
  - Only a team still to run is a button: a raised `card` with a pencil, labelled "Change Team 7: 2071 · 2072 · 2073 · 2074". The others are flat outlines.
  - **+ New team** (display-primary) is docked at the sheet's foot.
  - Once the final is made, nothing is tappable, there is no New team, and the line says why: "The final has been made, so the teams can't change. A lead can correct a team in Results."
- **Change anyway.** A team someone else set asks first, centred over the sheet (`role="alertdialog"`): "**Aisha Noor** has already set this team.", the team's wristbands, then **Change anyway** (primary) and **Cancel**, stacked so neither wraps at 360px.
- **Edit team 7 / New team 9.** The relay's name and "Type each child's wristband in running order, 1st leg first.", then four leg boxes, one per row: the label ("1st leg"), a number box (56px tall, 26px digits), and a 44px grip.
  - A refused number (already in this team or another team of the relay) shows the WarningCallout with Fix number only; a warned one (unknown, another section's, in another relay) with Fix number / Keep, once its box is left. The box turns amber.
  - A grip drag reorders the draft only; Save sends it, Cancel drops it. Grips come from the race flow's SortableList ("Move 2071", "Move empty 4th leg", arrow keys too); a drag starts only from the grip, so the sheet still scrolls.
  - The docked footer pairs **Cancel** and **Save team 9**. Edit on a team still to run adds a quiet red **Remove team 7** under them, which asks "Remove Team 7? Its number won't be used again." before removing.
  - A Save someone overtook shows "Aisha Noor changed this a moment ago." with **Show latest**.
- **From check-in.** Edit on a start-line TeamCard opens "Edit team 5" straight away, with no Change anyway. + New team there opens "New team · joins this heat". The leg boxes look the same wherever they open.

**Tokens:** `paper`, `card`, `shadow-card`, `shadow-raised`, `line`, `ink-muted`, `red-ink`, `overlay`, `radius-lg`, `radius-xl`, `size-action`, `size-touch`.

**Don't**
- Make a team that has run tappable: it is changed at check-in or by a lead in Results.
- Lock a team while someone has it open: other phones see "Aisha Noor is changing this team" and can still type other teams.
- Save a drag in the leg boxes before Save.

**Markup** (icon paths from [Icon](../Icon/README.md))

```html
<div class="rz-scrim">
  <div class="rz-sheet" role="dialog" aria-modal="true" aria-labelledby="teams-title">
    <div class="rz-sheet__grip" aria-hidden="true"></div>
    <div class="rz-sheet__head"><h2 class="rz-sheet__title" id="teams-title">4x50m Relay · Girl Cubs</h2><button type="button" class="rz-sheet__close" aria-label="Close"><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- close --></svg></button></div>
    <p class="rz-sheet__text">8 teams · 2 still to run. Tap a team still to run to change it.</p>
    <ul class="rz-teamsheet" aria-label="Teams">
      <li><div class="rz-teamsheet__team">
        <span class="rz-teamsheet__head"><span class="rz-teamsheet__name">Team 1</span><span class="rz-teamsheet__state">Heat 1 · ran</span></span>
        <span class="rz-teamsheet__legs"><span class="rz-teamsheet__leg"><span class="rz-teamsheet__ord">1st</span>2011</span><!-- 2nd, 3rd, 4th --></span>
      </div></li>
      <li><button type="button" class="rz-teamsheet__team rz-teamsheet__team--tap" aria-label="Change Team 7: 2071 · 2072 · 2073 · –">
        <span class="rz-teamsheet__head"><span class="rz-teamsheet__name">Team 7</span><span class="rz-teamsheet__state">Still to run · 3 of 4</span><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- pencil --></svg></span>
        <span class="rz-teamsheet__legs"><span class="rz-teamsheet__leg"><span class="rz-teamsheet__ord">1st</span>2071</span><!-- 2nd, 3rd, 4th --></span>
      </button></li>
    </ul>
    <div class="rz-sheet__foot"><button type="button" class="rz-btn rz-btn--display rz-btn--block"><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- plus --></svg>New team</button></div>
  </div>
</div>

<!-- Edit team 7 / New team 9: the leg boxes -->
<ol class="rz-legboxes" aria-label="Legs">
  <li class="rz-legbox"><label class="rz-field"><span class="rz-field__label">1st leg</span><input class="rz-field__input" type="text" inputmode="numeric" placeholder="Wristband" value="2071"></label>
    <button type="button" class="rz-orderrow__handle" aria-label="Move 2071" aria-roledescription="drag handle"><svg class="rz-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- drag --></svg></button></li>
</ol>
<div class="rz-sheet__foot"><div class="rz-footer__pair"><button type="button" class="rz-btn">Cancel</button><button type="button" class="rz-btn rz-btn--primary">Save team 7</button></div>
  <button type="button" class="rz-btn rz-btn--small rz-btn--block rz-teamsheet__remove">Remove team 7</button></div>

<!-- Change anyway, over the sheet -->
<div class="rz-confirm" role="alertdialog" aria-modal="true" aria-labelledby="ask">
  <div class="rz-confirm__box">
    <p class="rz-confirm__title" id="ask"><strong>Aisha Noor</strong> has already set this team.</p>
    <p class="rz-confirm__text">Team 7 · 2071 · 2072 · 2073 · –</p>
    <div class="rz-sheet__actions"><button type="button" class="rz-btn rz-btn--primary rz-btn--block">Change anyway</button><button type="button" class="rz-btn rz-btn--block">Cancel</button></div>
  </div>
</div>
```
