# Race flow mockups

The nine screens of the race-first flow in [../race-flow.md](../race-flow.md), at phone size (390 × 844). Each screen comes in two forms:

- **`<name>.png`:** a picture of the screen at 2× (780 × 1688). Use it to see the layout.
  - These were rendered with stand-in fonts (a condensed grotesque for Saira, Liberation Sans for Nunito), because the renderer couldn't reach Google Fonts.
  - Layout, colours and copy are exact. Letter shapes and widths differ slightly.
- **`html/<name>.html`:** the screen's exact markup, using `../../tokens.css`, `../../components/bundle.css` and the real fonts from Google Fonts. Open it in a browser to see the true type.
  - When a PNG and the HTML disagree, the HTML is right.
  - Links between screens work.
  - Patterns that are new in this flow (role chip, event tabs, race card, heat chips, step strip, places board, runner buttons, order rows, toast) are written with inline styles here. Build them as real components in `components/bundle.css` from the specs in race-flow.md's "New components" table.

| Screen | Files | Plan section |
|---|---|---|
| 1 · Join and pick your job | `N1-Join.png`, `html/N1-Join.html` | 1. Join |
| 2 · Races (signed in as Timer) | `N2-Races.png`, `html/N2-Races.html` | 2. Races: Home |
| 3 · New race | `N3-NewRace.png`, `html/N3-NewRace.html` | 3. New race |
| 4 · Switch job | `N4-Role.png`, `html/N4-Role.html` | 4. Switch job |
| 5 · Race as Start line | `N5-StartLine.png`, `html/N5-StartLine.html` | 5. Start line |
| 6 · Race as Finish line | `N6-FinishLine.png`, `html/N6-FinishLine.html` | 6. Finish line |
| 6b · Check the order | `N6b-CheckOrder.png`, `html/N6b-CheckOrder.html` | 6b. Check the order |
| 7 · Race as Timer | `N7-Timer.png`, `html/N7-Timer.html` | 7. Timer |
| 8 · Race as Zone lead | `N8-Lead.png`, `html/N8-Lead.html` | 8. Zone lead |

The mockups show sample data (wristbands 2031–2038, Girl Cubs R4). Where a mockup and race-flow.md disagree, race-flow.md wins. For example, the 6-runner soft warning and the Undo "changed since" toast are specified in the plan but not drawn here.
