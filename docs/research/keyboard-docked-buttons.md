# Keeping docked buttons just above the phone keyboard

Research for issue #181 (child of the planning map #179), about the bug "Next button does not align sometimes when typing" (#66). Researched 2026-10-28.

Question: how can a screen's main buttons ("That's everyone" and "Next" under the wristband input, "Join" under the Join form) stay docked directly above the on-screen keyboard at every moment while an input is focused, on iPhone Safari (iOS 27 and iOS 26, in a Safari tab and added to the Home Screen) and Android Chrome, without the user scrolling, and without a tap on a docked button closing the keyboard when the flow goes on to another input?

## Short answer

- **Neither phone shrinks the page for the keyboard by default.** iPhone Safari and Chrome on Android (since Chrome 108) shrink only the *visual* viewport (what you can see) and leave the *layout* viewport (what `position: fixed`, `position: sticky` and `vh`/`dvh` are measured against) at full height. So a footer at `bottom: 0` sits behind the keyboard until the user scrolls. That is #66. [Chrome viewport change], [Resize explainer], [web.dev units]
- **Android: one line of HTML fixes it.** `interactive-widget=resizes-content` in the viewport meta makes Chrome (108+) and Firefox for Android (132+) shrink the layout viewport too, so the existing sticky footer lands above the keyboard with no script. Safari ignores it: WebKit bug 259770 is still NEW and unassigned (last touched September 2026). [CSS Viewport spec], [Chrome viewport change], [Firefox 132], [WebKit 259770]
- **iPhone: needs a little script.** Read `window.visualViewport` (Safari 13+) on its `resize` and `scroll` events and place the footer at the bottom of the *visual* viewport. Nothing in CSS alone does this on Safari: no `interactive-widget`, no VirtualKeyboard API, no `env(keyboard-inset-*)`, and `dvh` ignores the keyboard. [MDN VisualViewport], [BCD], [WebKit 230225], [web.dev units]
- **Keeping the keyboard open on a tap:** cancel `mousedown` on the button (the app's `KeepFocus` already does this for Next). Under the Pointer Events spec, focus moves on mouse down only if the event was not cancelled. But browsers do not send `mousedown` to a *disabled* button, so tapping a greyed-out Next still takes focus away from the input. [Pointer Events], [Chromium disabled intent]
- **Recommended for this app:** add `interactive-widget=resizes-content`. Then use one shared visual-viewport hook, mounted once, that docks every `rz-footer--sticky` to the bottom of the visual viewport while an input is focused. Keep `KeepFocus` on every docked button whose flow carries on typing, and use `aria-disabled` instead of `disabled` on those buttons. The details and risks are below.

## 1. Two viewports, and why the footer hides

- The CSS Viewport spec defines the `interactive-widget` key and three behaviours. With `resizes-visual`, widgets "MUST resize the visual viewport but MUST NOT resize the initial viewport". With `resizes-content`, they "MUST resize the initial viewport". With `overlays-content`, they resize neither. "If no value, or an invalid value, is set, the behavior of `resizes-visual` is used." [CSS Viewport spec]
- Chrome 108 on Android moved to `resizes-visual` by default, to "bring Chrome on Android's behavior up to par with that of Chrome on iOS and Safari on iOS". With only the visual viewport resized, fixed elements stay in place and the keyboard can cover them. [Chrome viewport change]
- The Chrome explainer adds what iOS does on focus: "browsers offset the Visual Viewport against the Layout Viewport so that the input remains in view". Under `resizes-visual`, viewport units and full-screen elements keep their size. [Resize explainer]
- MDN: "the on-screen keyboard (OSK) can shrink the visual viewport without affecting the layout viewport". [MDN VisualViewport]
- The large, small and dynamic viewport units (`lvh`, `svh`, `dvh`) do not help. "The on-screen keyboard ... is not considered part of the UA UI. Therefore it does not affect the size of the viewport units." `dvh` tracks only the browser's toolbars. Chrome's opt-in for the keyboard to count is `interactive-widget=resizes-content`. Support: Chrome 108, Safari 15.4, Firefox 101. [web.dev units], [BCD]

**What this means for the code today.** `.rz-app` is `min-height: 100dvh` and `.rz-footer--sticky` is `position: sticky; bottom: 0` (`src/client/races/race-flow.css`, `src/client/races/rz.css`). Sticky positioning is measured against the scrollport, which is the layout viewport. So on both phones the footer sits at the bottom of the layout viewport, behind the keyboard. It only lines up once the user scrolls the visual viewport down to the end of the layout viewport. That matches #66 ("The user needs to scroll up to make the buttons align"). The viewport meta in `index.html` is `width=device-width, initial-scale=1`, with no `interactive-widget`, so Android gets the same default as iPhone.

## 2. What each platform feature gives you

| Feature | What it does | Chrome Android | iOS Safari | Firefox Android |
|---|---|---|---|---|
| `interactive-widget=resizes-content` (viewport meta) | Keyboard shrinks the layout viewport, so fixed, sticky and `dvh` follow it | 108+ [Chrome viewport change] | No (WebKit bug 259770, NEW) [WebKit 259770] | 132+ (`resizes-visual` became the default then; implemented in bug 1831649) [Firefox 132], [Mozilla 1831649] |
| `window.visualViewport` `resize`/`scroll` | Script reads the visible rectangle (`offsetTop`, `height`) | 61/62+ | 13+ | 68+ [BCD] |
| `visualViewport` `scrollend` | Fires once a visual viewport scroll ends | 126+ | No | No [BCD] |
| VirtualKeyboard API (`navigator.virtualKeyboard.overlaysContent`, `geometrychange`) | Page takes over keyboard placement | 94+ | No (WebKit bug 230225, NEW since 2021) | No [BCD], [Chrome VirtualKeyboard], [WebKit 230225] |
| `env(keyboard-inset-*)` | Keyboard rectangle in CSS (only with `overlaysContent = true`) | 94+ | No | No [BCD], [Chrome VirtualKeyboard] |
| `svh`/`lvh`/`dvh` | Toolbar-aware heights; ignore the keyboard | 108+ | 15.4+ | 101+ [BCD], [web.dev units] |
| `env(safe-area-inset-*)` | Space to keep clear of the home indicator and notch | 69+ | 11+ | No entry [BCD] |

Notes:

- The VirtualKeyboard API is Chromium-only and needs `overlaysContent = true`. That turns off the browser's own work: "Otherwise, the browser adjusts the layout and scrolls focused inputs into view." It adds nothing for Android that `resizes-content` does not already give, and nothing at all for iPhone. [Chrome VirtualKeyboard]
- WebKit's bug for the keyboard height (176205) was closed in 2019 as a duplicate of the Visual Viewport API. An Apple engineer wrote: "With visual viewport API, can just listen for "resize" event on window.visualViewport." That is still Apple's only answer. [WebKit 176205]
- Safari 27 (WWDC26) lists no change to the keyboard, `interactive-widget`, the VirtualKeyboard API or the visual viewport. It does list "Fixed an issue where sticky-positioned elements could flicker rapidly after scrolling." [WebKit WWDC26]

## 3. iPhone specifics: Safari tab and Home Screen

- Since iOS 26, "By default, every website added to the Home Screen opens as a web app." So the Home Screen case is the normal one for volunteers who add the app, and it must be checked as well as the Safari tab. [WebKit WWDC25]
- Home Screen apps have their own visual viewport bugs:
  - `visualViewport.offsetTop` "sometimes reads 0 in the resize handler while the soft keyboard is open" in Home Screen apps, and is correct a moment later. The workarounds are a 50 ms timeout or a double `requestAnimationFrame`. Bug 237851 is NEW. [WebKit 237851]
  - On iPad Home Screen apps, the viewport stays shifted after the keyboard closes. The workaround resets `document.documentElement.scrollTop` once the heights match again. Bug 254861 is NEW. [WebKit 254861]
  - `visualViewport.height` is unreliable after a rotation in Home Screen mode. [WebKit 218983]
- iOS 26 introduced a bug where, after the keyboard closes, `visualViewport` does not return to its full size: there was a persistent ~24 px gap between `visualViewport.height` and `window.innerHeight`, and fixed elements moved when the scroll direction changed. Apple said the cause was a system component and a fix shipped around iOS 26.1. Reports carry on into late 2025, and one from October 2026 concerns Chrome on iOS 26.6.1. Apple also explained that `bottom: 0` fixed elements on iOS 26 deliberately sit above the floating "Liquid Glass" toolbar. [WebKit 297779], [Apple forum 800125]

Takeaway: on iPhone, trust visual viewport numbers only while an input is focused (when the keyboard is really up). Read them a frame after the event, and drop back to plain `bottom: 0` when focus leaves. Then a stale offset after the keyboard closes cannot leave the footer floating.

## 4. Techniques that work

### 4a. Android: `interactive-widget=resizes-content`

```html
<meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content">
```

The layout viewport, the initial containing block and `dvh` shrink to the space above the keyboard, so `position: sticky; bottom: 0` inside a `min-height: 100dvh` column sits right on the keyboard. The browser moves it during layout, so it does not lag behind scrolling. [CSS Viewport spec], [Resize explainer]. Side effects:

- The Chrome explainer warns that with `resizes-content`, fixed elements "can end up elsewhere in the layout". Anything sized in `dvh` (for example `.rz-sheet { max-height: 90dvh }`) shrinks while the keyboard is up, which is what a sheet with an input wants. [Resize explainer]
- Safari ignores the key, so it is safe to add on every platform. [WebKit 259770]

### 4b. iPhone (and anything else): follow the visual viewport

MDN's pattern: listen to `visualViewport` `resize` and `scroll`. "Since the bar is position: fixed we need to offset it by the visual viewport's offset from the layout viewport origin." MDN warns that this "can result in the fixed element flickering during scrolling". [MDN VisualViewport]

Two ways to do the maths:

1. **Inset from the bottom of the layout viewport** (what `src/client/flow/ActionBar.tsx` does today): `inset = innerHeight - visualViewport.height - visualViewport.offsetTop`, then `bottom: inset`. This depends on `window.innerHeight` being the layout viewport's height. The iOS 26 reports show `innerHeight` and `visualViewport.height` drifting apart after the keyboard closes, which leaves a stale inset. [WebKit 297779], [Apple forum 800125]
2. **Place it from the visual viewport's own edges** (recommended): `top: 0; transform: translateY(calc(var(--vv-top) + var(--vv-height) - 100%))`. Here `--vv-top` is `visualViewport.offsetTop` and `--vv-height` is `visualViewport.height`, both relative to the layout viewport origin. [MDN VisualViewport]. This never reads the layout viewport's height. It also gives the right answer with no keyboard (where the visual and layout viewports line up), and under Android `resizes-content` (the two viewports are the same).

Practical rules:

- Update on `visualViewport` `resize` and `scroll`, plus `focusin`/`focusout`. Do the write inside `requestAnimationFrame` (doubled for Home Screen apps). [WebKit 237851]
- Dock to the visual viewport only while an editable element has focus. Otherwise use the normal sticky footer. This keeps the stale-offset bugs from section 3 out of screens with no keyboard. [WebKit 297779], [WebKit 254861]
- The page must keep room for the footer, so the last row never hides behind it. `ActionBar.tsx` already does this with a `ResizeObserver` writing `--action-bar-height` and `scroll-padding-bottom` (`src/client/flow/flow.css`).
- To cut the flicker MDN warns about, keep typing screens short enough that the page does not need to scroll while the keyboard is up. The design system already asks for this: a compact prompt while the keyboard is open, and "without scrolling past the footer" on a 390 x 844 phone (`docs/running-zone-design-system/components/Prompt/README.md`, `race-flow.md`). [MDN VisualViewport]

### 4c. Keeping the keyboard open when a docked button is tapped

- Pointer Events (which now holds the mouse event definitions): in the "handle native mouse down" steps, focus moves only "If result is true and target is a focusable area that is click focusable". That is, focus moves only if `mousedown` was not cancelled. Cancelling `pointerdown` suppresses the compatibility `mousedown` ("Canceling this event also prevents subsequent firing of compatibility mouse events"). Neither cancel stops `click`: "Calling preventDefault during a pointer event MUST NOT have an effect on whether click ... " fires. [Pointer Events], [UI Events]
- On iOS, a tap on a clickable element sends `mouseover`, `mousemove`, `mousedown`, `mouseup`, `click` in that order, so a `mousedown` handler runs for touch too. [Apple Safari Web Content Guide]
- So `onMouseDown={event => event.preventDefault()}` (the app's `KeepFocus` in `src/client/races/Steps.tsx`, and the Cancel button in `src/client/teams/TeamsScreen.tsx`) is the standard, spec-backed way to keep the input focused. The spec makes the focus step depend on `mousedown` itself. Whether a cancelled `pointerdown` alone also stops the focus change is not stated, so prefer `mousedown`. [Pointer Events]
- **Pitfall: disabled buttons.** Chromium's "Send Mouse Events to Disabled Form Controls" change dispatches "mouse events other than click, mouseup, and mousedown" on disabled form controls, so `mousedown` still never reaches one (matching Firefox). So `KeepFocus` cannot cancel anything on a *disabled* Next. A tap on a greyed-out Next can take focus away from the input and close the keyboard. Use `aria-disabled="true"` and ignore the click instead of `disabled` on these buttons. [Chromium disabled intent]
- Buttons that end the typing flow ("That's everyone", "Join", "No more finishers") should let the keyboard close. They do not need `KeepFocus`.

## 5. Safe area

- `env(safe-area-inset-*)` "define a rectangle by its top, right, bottom, and left insets from the edge of the viewport". [CSS env spec]
- WebKit: the default `viewport-fit` is `auto`, "which results in the automatic insetting behavior": the browser keeps the page clear of the rounded corners and sensor housing itself. `viewport-fit=cover` hands that job to the page. [WebKit iPhone X]
- `index.html` has no `viewport-fit=cover`. `.rz-footer` adds no safe-area padding, while `.action-bar` always adds `env(safe-area-inset-bottom)`. While the keyboard is up, the home indicator is behind the keyboard, so any bottom safe-area padding then becomes a gap between the buttons and the keyboard. If the app ever adopts `viewport-fit=cover`, add the bottom inset to the footer only while it is *not* docked to the keyboard.

## 6. Recommended approach for this app

1. **`index.html`:** add `interactive-widget=resizes-content` to the viewport meta. On Android Chrome and Firefox, the existing `rz-footer--sticky` then sits on the keyboard with no script. [Chrome viewport change], [Firefox 132]
2. **One keyboard hook, mounted once:** move `useKeyboardInset` out of `src/client/flow/ActionBar.tsx` into a shared module, mounted once near the app root. While an editable element is focused, it writes `--vv-top` and `--vv-height` (from `visualViewport`, in a frame callback) and `data-keyboard="open"` on `<html>`. When focus leaves, it clears them. Both `ActionBar` and `rz-footer--sticky` read the same variables, so there is one implementation, not two.
3. **Footer CSS:** under `html[data-keyboard="open"]`, `.rz-footer--sticky` becomes `position: fixed; left: 0; right: 0; top: 0; transform: translateY(calc(var(--vv-top) + var(--vv-height) - 100%))`. The page keeps room for it, as `ActionBar` already does with `--action-bar-height`. Without the attribute, it stays exactly as today.
4. **Focus:** keep `KeepFocus` on every docked button whose flow carries on typing (Next and Add runner on the start line, Back and Next on Times), and switch those from `disabled` to `aria-disabled` so a tap on a greyed-out button cannot close the keyboard. [Chromium disabled intent]
5. **Safe area:** no bottom safe-area padding while docked (see section 5).
6. **Test on real phones:** Playwright cannot raise an on-screen keyboard, so the layout maths can be unit-tested with a fake `visualViewport`. The real check has to be on devices: iPhone on iOS 27 and iOS 26, each in a Safari tab and from the Home Screen, and an Android phone on current Chrome. Cover the wristband screen, the Times screen and the Join form, tapping Next many times in a row and scrolling while the keyboard is up.

## Open risks

- **Flicker on iPhone while scrolling with the keyboard up.** The footer is moved by script after the browser scrolls, so it can trail by a frame. MDN warns about exactly this. Short typing screens make it rare, but it cannot be removed on Safari until WebKit ships `interactive-widget` (bug 259770, no Apple reply). [MDN VisualViewport], [WebKit 259770]
- **iOS visual viewport bugs in Home Screen mode** (offset read as 0, viewport not restored, wrong height after rotation) are open in WebKit. The focus-only docking and frame-delayed reads are workarounds, not guarantees. [WebKit 237851], [WebKit 254861], [WebKit 218983]
- **iOS 26 stale viewport after the keyboard closes** was fixed around 26.1 by most reports, but recurrences are reported. Previous-major-version phones that were never updated past 26.0 may still show it. [WebKit 297779], [Apple forum 800125]
- **Disabled-button focus loss** is inferred from the spec and Chromium's dispatch rules, not tested on a device. Confirm it on a phone before changing `disabled` to `aria-disabled`. [Chromium disabled intent]
- **`resizes-content` reflows the page** each time the keyboard opens on Android, which can move other things sized in `dvh`. Check the sheets and the 12-runner Finish line layout on Android after adding it. [Resize explainer]

## Sources

- [Chrome viewport change]: Chrome for Developers, "Prepare for viewport resize behavior changes coming to Chrome on Android" - https://developer.chrome.com/blog/viewport-resize-behavior
- [Resize explainer]: Bramus Van Damme (Chrome), viewport resize behaviour explainer - https://github.com/bramus/viewport-resize-behavior/blob/main/explainer.md
- [CSS Viewport spec]: CSS Viewport Module Level 1, `interactive-widget` - https://drafts.csswg.org/css-viewport/#interactive-widget-section
- [Firefox 132]: Firefox for Android 132 release notes - https://www.mozilla.org/firefox/android/132.0/releasenotes/ (and Bugzilla 1916002 - https://bugzilla.mozilla.org/show_bug.cgi?id=1916002)
- [Mozilla 1831649]: Bugzilla 1831649, implement `interactive-widget` - https://bugzilla.mozilla.org/show_bug.cgi?id=1831649
- [WebKit 259770]: WebKit bug 259770, "Implement the interactive-widget property in the viewport meta tag" - https://bugs.webkit.org/show_bug.cgi?id=259770
- [WebKit 230225]: WebKit bug 230225, "Implement the VirtualKeyboard API" - https://bugs.webkit.org/show_bug.cgi?id=230225
- [WebKit 176205]: WebKit bug 176205, no way to account for the virtual keyboard height - https://bugs.webkit.org/show_bug.cgi?id=176205
- [WebKit 237851]: WebKit bug 237851, `visualViewport.offsetTop` sometimes 0 in web app mode - https://bugs.webkit.org/show_bug.cgi?id=237851
- [WebKit 254861]: WebKit bug 254861, iPadOS viewport not restored after keyboard in installed web apps - https://bugs.webkit.org/show_bug.cgi?id=254861
- [WebKit 218983]: WebKit bug 218983, `visualViewport.height` unreliable in standalone mode - https://bugs.webkit.org/show_bug.cgi?id=218983
- [WebKit 297779]: WebKit bug 297779, iOS 26 fixed elements move when the scroll direction changes - https://bugs.webkit.org/show_bug.cgi?id=297779
- [Apple forum 800125]: Apple Developer Forums, iOS 26 fixed elements after keyboard dismissal - https://developer.apple.com/forums/thread/800125
- [WebKit WWDC25]: WebKit blog, "News from WWDC25: Web technology coming this fall in Safari 26 beta" - https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/
- [WebKit WWDC26]: WebKit blog, "News from WWDC26: WebKit in Safari 27 beta" - https://webkit.org/blog/17967/news-from-wwdc26-webkit-in-safari-27-beta/
- [MDN VisualViewport]: MDN, VisualViewport and the Visual Viewport API - https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport and https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API
- [BCD]: MDN browser-compat-data (`api/VisualViewport.json`, `api/VirtualKeyboard.json`, `css/types/env.json`, `css/types/length.json`), read 2026-10-28 - https://github.com/mdn/browser-compat-data
- [Chrome VirtualKeyboard]: Chrome for Developers, "Full control with the VirtualKeyboard API" - https://developer.chrome.com/docs/web-platform/virtual-keyboard
- [web.dev units]: web.dev, "The large, small, and dynamic viewport units" - https://web.dev/blog/viewport-units
- [Pointer Events]: W3C Pointer Events (pointerdown, compatibility mouse events, "handle native mouse down") - https://w3c.github.io/pointerevents/
- [UI Events]: W3C UI Events, mouse events moved to Pointer Events - https://w3c.github.io/uievents/
- [Apple Safari Web Content Guide]: Apple, "Handling Events" - https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/HandlingEvents/HandlingEvents.html
- [Chromium disabled intent]: blink-dev, "Intent to Ship: Send Mouse Events to Disabled Form Controls" - https://groups.google.com/a/chromium.org/g/blink-dev/c/9i0H0J0BzE4
- [CSS env spec]: CSS Environment Variables Module Level 1, safe area insets - https://drafts.csswg.org/css-env-1/#safe-area-insets
- [WebKit iPhone X]: WebKit blog, "Designing Websites for iPhone X" - https://webkit.org/blog/7929/designing-websites-for-iphone-x/
