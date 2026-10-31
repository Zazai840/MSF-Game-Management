# Typing a race time on a phone: which pattern gives the fewest errors

Research for issue #234 (child of #231). Researched 2026-10-31.

Question: which way of typing a race time (about 8 s to 1:30, to a hundredth, read off a SprintTimer photo finish by teenage volunteers) produces the fewest errors on iPhone Safari and Android Chrome? Candidates: (A) today's digits-only box on the number pad, (B) a `__:__.__` mask on the number pad, (C) `inputmode="decimal"` with strict validation, (D) the full keyboard with strict validation, (E) right-to-left "calculator" fill.

## Short answer

- **The evidence favours digits only on the number pad, read right to left (last two digits are hundredths), with the formatted time shown large where the volunteer is looking, plus checks that refuse impossible times.** That is today's parsing (A); the open choice is whether the formatted time sits in the box itself (E) or under it (A today). No study compares these exact patterns, so this is reasoned from platform behaviour, design-system guidance and number-entry error research, not measured. [Wiseman], [Thimbleby & Cairns], [GOV.UK text input], [NN/g checklist]
- **No numeric keypad on either platform has a colon.** iPhone's number pad has digits only; its decimal pad adds only the locale's decimal separator. Android's open-source keyboard shows `:` only for native time fields, which Chrome never requests. So any pattern that needs typed `:` forces the full keyboard. [WebKit keyboard test], [Apple UIKeyboardType], [Chromium ImeUtils], [AOSP number keys]
- **A left-to-right mask (B) fits this data badly and has known traps.** A fixed `__:__.__` fills from the left, so 12.34 s must be typed `001234`; `1234` becomes 12:34. Rewriting the value as you type moves the cursor to the end (the HTML standard says so), backspace over a separator can do nothing, and screen readers misreport masked fields. Baymard: masks "must work flawlessly to avoid doing more harm than good". [HTML value setter], [Baymard masks], [Filament Group], [Adam Silver], this repo's test page below
- **Decimal keypad (C) and full keyboard (D) bring back the decimal-point key**, the source of about 13% of errors in the one keystroke-level number-entry study found (decimal missing, added, or swapped with 0), and the decimal key's character depends on the phone's region. The full keyboard also has small keys and needs a mode switch for digits. [Wiseman], [WebKit bug 247242]
- **The cost of digits-only:** a dropped or doubled digit becomes a ten-times error (`124` saves as 1.24 instead of 12.34) rather than a small one. That is a reason to add checks, not to drop the pattern: big errors are easy to catch automatically, small ones are not. Thimbleby & Cairns model that blocking invalid numbers roughly halves out-by-ten errors. [Wiseman], [Thimbleby & Cairns]

## 1. Which keypad each setting shows

From WebKit's own keyboard test (which pins the expected iOS keyboard for every `type`/`inputmode`/`pattern` combination) and Chromium's Android input code:

| Field | iPhone Safari | Android Chrome |
|---|---|---|
| `inputmode="numeric"` (today) | Number pad: 0-9 and delete; no `.`, no `:` [WebKit keyboard test], [Apple UIKeyboardType] | Number class (`TYPE_CLASS_NUMBER`) [Chromium ImeUtils]. On the open-source Android keyboard that layout has 0-9, `-`, `,`, `.`, space; no `:` [AOSP number keys]. Gboard and Samsung Keyboard: see section 5 |
| `pattern="[0-9]*"` alone | Number pad (WebKit special-cases `\d*` and `[0-9]*` on text inputs) [WebKit keyboard test] | No effect: Chrome's keyboard choice reads only `type` and `inputmode` [Chromium ImeUtils] |
| `inputmode="decimal"` | Decimal pad: 0-9 plus the region's decimal separator; no minus key, and Apple says UIKit has no such pad [WebKit bug 193825]. The separator can disagree with the page (shows `.` while the field shows `,`) [WebKit bug 247242] | Number class with the decimal flag [Chromium ImeUtils]; same open-source layout as above [AOSP number keys] |
| `inputmode="tel"` | Phone pad: 0-9, `+ * #`; no `.` [WebKit keyboard test], [WHATWG inputmode] | Phone class [Chromium ImeUtils] |
| `type="number"` | Numbers-and-punctuation keyboard (the full keyboard's number page; `.` and `:` reachable) [WebKit keyboard test] | Number class with decimal flag [Chromium ImeUtils]. GOV.UK says do not use it (silent letter discarding, scroll-wheel changes, assistive tech problems) [GOV.UK number blog] |
| plain `type="text"` | Full keyboard; `:` and `.` via the 123 key | Full keyboard |

`inputmode` takes priority over `pattern` and `type` on iOS [WebKit keyboard test]. The WHATWG standard defines `numeric` as a keyboard "capable of numeric input ... useful for PIN entry" and `decimal` as "fractional numeric input" showing "the format separator for the locale"; both are hints a browser "should" follow, not requirements [WHATWG inputmode]. MDN: on both, "devices may or may not show a minus key" [MDN inputmode]. `inputmode` has been Baseline across browsers since December 2021 [MDN inputmode]; GOV.UK adopted `type="text" inputmode="numeric"` for numbers and keeps `pattern="[0-9]*"` only for older iOS [GOV.UK number blog], [GOV.UK text input].

Consequence: today's field gives the iPhone volunteer a pad on which only digits can be typed. An Android volunteer can also type `.` (and `,`, `-`, space), which today's `digitsOnly` silently strips (section 3).

## 2. What the evidence says about errors

**Design-system guidance.** GOV.UK: whole numbers use `inputmode="numeric"`, decimals `inputmode="decimal"`, never `type="number"` unless research shows a need [GOV.UK text input]. NN/g's mobile checklist asks "What is the right keyboard for this field?" and "Do you allow users to enter it in whatever format they like? ... You can autoformat it for them." [NN/g checklist]. NN/g on date fields: whatever separators users type "should be recognized" [NN/g date input]. Apple's HIG: "Choose a keyboard that matches the type of content people are editing." [Apple HIG keyboards]. I found no Material Design guidance on numeric masks or time entry in a text field that I could read in full (the Material 3 site would not render), so Material is not cited.

**Masks.** Baymard recommends masks for restricted fields such as phone numbers and dates, because they show the expected format before typing, but warns that "input masks must work flawlessly to avoid doing more harm than good" and that "the input mask logic hasn't fully accounted for how users edit inputs within the field" on many sites [Baymard masks]. Baymard's card-number research found live formatting (spaces in groups) gives "fewer card validation errors" and makes it "easier ... to spot any typos" because users compare chunks against the card [Baymard card spaces]. That supports showing the time formatted as the photo finish shows it, which right-to-left fill (E) and today's readout (A) both do. Against masks: Filament Group found value-rewriting masks can "render the form unusable" for VoiceOver and JAWS users and that placeholder underscores are read out as "aural garbage" [Filament Group]; Adam Silver (former GOV.UK designer, no study cited) lists cursor jumps, silently ignored keys, masks that look already filled in, and broken text replacement [Adam Silver]. Evidence for masks is practitioner testing on phone and card numbers; nothing found on time entry.

**Number-entry error research.** The one keystroke-level taxonomy found (Wiseman, Cairns & Cox 2011; 20 participants, iPad keypad, 350 errors) [Wiseman]:

| Error | Share | Relevance here |
|---|---|---|
| Digit(s) wrong | 13.7% | Same in every pattern |
| Anagram (transposed) | 12.3% | Same in every pattern |
| Digit(s) missing / added | 6.6% / 5.4% | Digits-only: becomes a ten-times error. With a typed `.`: a smaller error |
| 0 instead of decimal / decimal instead of 0 | 5.1% / 2.0% | Only where a decimal key exists (C, D, Android number class) |
| Decimal missing / decimal added | 3.7% / 2.3% | Only where the user types the decimal point |
| Out by order of magnitude | 3.4% | All patterns |

The decimal-key errors (about 13% together) cannot happen when no decimal point is typed. The authors trace the 0/decimal swap to keypads that put those keys in non-standard places. Limits: lab memory and audio tasks with postgraduate students, not reading from a photo; small sample.

Thimbleby & Cairns (2010) argue most number-entry systems silently accept malformed input, and model that blocking invalid numbers "results in roughly halving the probability of an out by 10 error"; they say there are "no data on the situated effectiveness" of the approach. They also recommend making the decimal point more salient [Thimbleby & Cairns]. GOV.UK backlog research on date entry saw many users "looking at the keyboard" and not noticing what had landed in the field [GOV.UK date backlog]; GOV.UK says never auto-tab between date fields [GOV.UK date input]. So splitting the time into minutes / seconds / hundredths boxes is not a good fit either.

**Right-to-left fill.** No study found. It is a first-party Google pattern: the Android Clock app's timer shifts each digit in from the right and backspace shifts the last one out (on its own on-screen keypad, so no text cursor) [AOSP DeskClock timer]. Today's parser already reads digits this way; E only changes what the box shows.

## 3. Pitfalls of each pattern

**A. Digits only, number pad, readout under the box (today)**
- The box shows `1234`, not `12.34`; the formatted time is in the hint underneath. People typing while looking at the keypad may not look at either [GOV.UK date backlog].
- Dropped or doubled digit gives a ten-times error (`124` is 1.24). The only per-place check today is "faster than the place before" (`src/shared/wrong-times.ts`), which misses a too-fast **1st** place and a too-slow last place.
- Seconds over 59 are not refused: `19234` saves as 2:32.34 (the 92 seconds roll into minutes) - confirmed on the test page. Thimbleby & Cairns would block this [Thimbleby & Cairns].
- Android only: the keypad has `.`, which is stripped. `12.34` still works; `12.3` or `8.5` silently become 1.23 and 0.85 (confirmed on the test page in Chromium). iPhone cannot type `.` at all.
- Strength: the value is never rewritten except to strip non-digits, so the cursor, backspace, paste and text selection behave natively.

**B. Left-to-right `__:__.__` mask on the number pad**
- A fixed mask fills from the left: 12.34 s must be typed `001234`. Typed as `1234` it shows `12:34` (12 minutes). Most times here are under a minute, so this is the wrong direction for this data (confirmed on the test page).
- Setting the value from script moves the cursor to the end of the text, by the HTML standard [HTML value setter]. On the test page in Chromium, a digit typed in the middle jumped the cursor to the end, and backspace right after `:` deleted the colon, which the mask put straight back: nothing happened.
- Mask libraries that read `keydown` break on Android, where on-screen keys arrive as `key: "Unidentified"`, `keyCode: 229` [crbug 737349 thread]; `beforeinput` during IME composition cannot be cancelled [Input Events]. Screen-reader problems as above [Filament Group].

**C. Decimal keypad, free text, strict check**
- No colon on iPhone or Android numeric keypads, so 1:32.40 needs a stand-in (`1.32.40`) or a switch to the full keyboard.
- The decimal key follows the phone's region: `,` in much of Europe, and it can disagree with the page [WebKit bug 247242]. Parsing must accept both.
- Brings back the decimal-key errors (about 13% in [Wiseman]); missing hundredths (`12.3`) must be refused, not padded.

**D. Full keyboard, strict check**
- Small keys, a mode switch to reach digits, and autocorrect/text replacement to switch off. Apple and NN/g both say to match the keyboard to the content [Apple HIG keyboards], [NN/g checklist].
- Strict refusal of `12,34`, `12:34` (meaning seconds) or `12.3` turns typos into blocking errors; NN/g and GOV.UK prefer accepting variants [NN/g date input], [GOV.UK date input].
- Strength: colon and dot are both reachable, so the typed text can match the photo finish exactly.

**E. Right-to-left calculator fill on the number pad**
- The box itself shows `0.01`, `0.12`, `1.23`, `12.34`, `1:32.40` as you type, so the volunteer compares like with like against the photo finish [Baymard card spaces].
- Every keystroke rewrites the value, so the cursor goes to the end [HTML value setter]. The model only works if editing is always at the end: on the test page backspace is intercepted (`beforeinput`, `deleteContentBackward`) to remove the last digit wherever the cursor is; a digit typed mid-field is accepted but the cursor jumps to the end (Chromium). Whether Android keyboards send a cancellable `beforeinput` for backspace, and what VoiceOver/TalkBack announce for the rewritten value, needs a real phone [Input Events], [crbug 737349 thread].
- Same ten-times and seconds-over-59 risks as A (same parser).

## 4. Test page and what desktop Chromium showed

`docs/research/time-entry-variants.html` (throwaway, not part of the app) has all five variants side by side, each with a "Saves as" readout and a log of `keydown` / `beforeinput` / `input` events (input type, `isComposing`, `cancelable`, cursor position) so the same page can be opened on a phone. Driven with Playwright in desktop Chromium (Playwright 1.56, headless; WebKit was not installed, so not run):

| Action | A today | B LTR mask | C decimal | D full | E RTL fill |
|---|---|---|---|---|---|
| Type `1234` | `1234`, 12.34 | `12:34`, not a time | not a time | not a time | `12.34`, 12.34 |
| Backspace with cursor after 3rd character | deletes the 3rd character, 1.24 | nothing (colon re-added), cursor to end | `124` | `124` | removes last digit, 1.23 |
| Type `9` at position 1 of `1234` | 2:32.34 (92 s rolled over) | `19:23.4`, cursor to end | refused | refused | 2:32.34, cursor to end |
| Type `12.3` | 1.23 | `12:3` | refused | refused | 1.23 |
| Paste `1:32.40` | 1:32.40 | `13:24.0` | 1:32.40 | 1:32.40 | 1:32.40 |

Desktop Chromium uses a physical keyboard, so this checks the page's own logic only. It says nothing about which keypad appears, IME composition, `keyCode 229`, or screen readers.

## 5. What still needs a real phone

1. **Android keypad for `inputmode="numeric"` on Gboard and Samsung Keyboard** (the two most likely on volunteers' phones): which extra keys appear (`.`, `,`, `-`, space)? The open-source keyboard shows them [AOSP number keys]; Gboard and Samsung are closed source.
2. **iPhone number pad has no Return key**: confirm Next in the footer stays reachable and the keypad stays open between places (today's `KeepFocus` behaviour) for whichever pattern is chosen.
3. **For E**: on iPhone Safari and Android Chrome with Gboard and Samsung Keyboard, does backspace arrive as a cancellable `beforeinput`? Does tapping into the middle then typing behave? Does the keyboard flicker or the predictive bar fight the rewrite? Use the log on the test page.
4. **VoiceOver and TalkBack** on A and E: is each digit and the result ("12.34") announced sensibly?
5. **A short timed trial with two or three volunteers** typing ten real photo-finish times on A and E: count wrong saved times and how long each takes. This is the only way to settle A versus E; the literature does not.

## Implications for #235 (not decided here)

- Keep `inputmode="numeric"` and the right-to-left digits parser; do not adopt B or D.
- Add refusing checks the parser lacks: seconds over 59 when minutes are present; a too-fast first place and too-slow last place (plausibility floor and ceiling per distance, or relative to the other places), which catch the ten-times errors digits-only creates.
- Decide whether the formatted time moves into the box (E) after the phone checks above; if E misbehaves on any phone, keep A and make the "Shows as" readout larger and closer to the digits.
- Android `.`: either keep stripping (so `12.34` keeps working) and refuse a single digit after a typed `.`, or treat a typed `.` as "the next two digits are hundredths". Needs an owner decision.

## Unverified / gaps

- No controlled study of masked versus free numeric entry, or of implied-decimal versus typed-decimal entry, was found. Baymard's mask findings are on phone and card numbers; Wiseman's taxonomy is lab memorisation on an iPad keypad.
- The Baymard figure "89% of test subjects did not follow formatting examples for restricted fields" comes from the mask article as fetched; its method and sample are not stated there.
- Material Design guidance on masks and numeric entry could not be read (the site needs JavaScript); not cited.
- Whether Chrome on Android still reports `keyCode 229` for every on-screen key in 2026 was not re-checked; the source is a 2017 W3C thread.
- WebKit was not run under Playwright (not installed locally). Desktop WebKit would not show the iOS keypad anyway.
- iPad shows different keyboards for the same settings; not looked at, as volunteers use phones.

## Sources

- [WHATWG inputmode] HTML Standard, "Input modalities: the inputmode attribute": https://html.spec.whatwg.org/multipage/interaction.html#input-modalities:-the-inputmode-attribute
- [HTML value setter] HTML Standard, value IDL attribute, mode "value" (cursor moves to end when the value changes): https://html.spec.whatwg.org/multipage/input.html#dom-input-value-value
- [Input Events] W3C Input Events Level 2 (beforeinput inside IME composition is not cancelable): https://w3c.github.io/input-events/
- [MDN inputmode] https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inputmode
- [WebKit keyboard test] WebKit `KeyboardInputTestsIOS.mm`, expected keyboard per type/inputmode/pattern: https://github.com/WebKit/WebKit/blob/7ba3fe7698d306bf361b4a988dcc33b124549a65/Tools/TestWebKitAPI/Tests/WebKit/WKWebView/ios/KeyboardInputTestsIOS.mm#L640-L700
- [Apple UIKeyboardType] numberPad ("a numeric keypad for PIN entry"), decimalPad ("numbers and a decimal point"), numbersAndPunctuation: https://developer.apple.com/documentation/uikit/uikeyboardtype
- [Apple HIG keyboards] Human Interface Guidelines, Virtual keyboards: https://developer.apple.com/design/human-interface-guidelines/virtual-keyboards
- [WebKit bug 193825] inputmode=decimal has no minus key; UIKit has no such pad: https://bugs.webkit.org/show_bug.cgi?id=193825
- [WebKit bug 247242] decimal keyboard separator disagrees with the field's locale (open): https://bugs.webkit.org/show_bug.cgi?id=247242
- [Chromium ImeUtils] Chrome on Android, inputmode to Android InputType mapping: https://github.com/chromium/chromium/blob/5e964ef45b04b191d91c9a2d0abd3104137adf33/content/public/android/java/src/org/chromium/content/browser/input/ImeUtils.java#L71-L130
- [AOSP number keys] Android open-source keyboard (LatinIME) number layout, `:` only in time mode: https://android.googlesource.com/platform/packages/inputmethods/LatinIME/+/refs/heads/main/java/res/xml/rows_number_normal.xml
- [AOSP DeskClock timer] Android Clock timer, right-to-left digit entry (`append`/`delete`): https://android.googlesource.com/platform/packages/apps/DeskClock/+/refs/heads/main/src/com/android/deskclock/timer/TimerSetupView.kt
- [crbug 737349 thread] W3C editing task force thread on Android `keyCode 229`: https://lists.w3.org/Archives/Public/public-editing-tf/2017Jun/0006.html
- [GOV.UK text input] GOV.UK Design System, Text input (numbers, avoid type=number): https://design-system.service.gov.uk/components/text-input/
- [GOV.UK number blog] Why the GOV.UK Design System team changed the input type for numbers (2020): https://technology.blog.gov.uk/2020/02/24/why-the-gov-uk-design-system-team-changed-the-input-type-for-numbers/
- [GOV.UK date input] GOV.UK Design System, Date input ("Never automatically tab users between the fields"): https://design-system.service.gov.uk/components/date-input/
- [GOV.UK date backlog] GOV.UK Design System backlog, date input research comments: https://github.com/alphagov/govuk-design-system-backlog/issues/42
- [NN/g checklist] NN/g, A Checklist for Designing Mobile Input Fields: https://www.nngroup.com/articles/mobile-input-checklist/
- [NN/g date input] NN/g, Date-Input Form Fields: https://www.nngroup.com/articles/date-input/
- [Baymard masks] Baymard Institute, input masking: https://baymard.com/blog/input-masking-form-field
- [Baymard card spaces] Baymard Institute, card number field auto-format spaces: https://baymard.com/blog/credit-card-field-auto-format-spaces
- [Filament Group] Politespace, on masks and screen readers: https://www.filamentgroup.com/lab/politespace
- [Adam Silver] The problem with input masks and what to do instead: https://adamsilver.io/blog/the-problem-with-input-masks-and-what-to-do-instead/
- [Wiseman] Wiseman, Cairns & Cox, "A Taxonomy of Number Entry Error", BCS HCI 2011: https://www-users.york.ac.uk/~pc530/pubs/Wiseman_HCI2011.pdf
- [Thimbleby & Cairns] Thimbleby & Cairns, "Reducing number entry errors: solving a widespread, serious problem", J. R. Soc. Interface 7(51), 2010: https://pmc.ncbi.nlm.nih.gov/articles/PMC2935596/
