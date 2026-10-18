# How reliably do phones keep a home-screen web app's stored data?

Research for [#69](https://github.com/Zazai840/MSF-Game-Management/issues/69). Researched 18 Oct 2026.

Context: the planned redesign keeps each volunteer's profile (id, name, secret token) only in the phone's browser storage (`localStorage`, see `src/client/api.ts`). If that storage is lost, the profile is gone on that phone.

## Bottom line

- **The browser will rarely delete the profile by itself.** Over a few weeks between Olympics days, the realistic losses come from people, not the platform.
- **Biggest real risk: the volunteer opens the app in a different place.** On iPhone, the home-screen app, the Safari tab, and an in-app browser (WhatsApp, Instagram) each have their own separate storage. A profile made in one is invisible in the others. Deleting and re-adding the home-screen icon on iPhone also starts empty.
- **Second risk: the user clears data.** Clearing Chrome site data on Android wipes the installed app too. Persistent storage does not protect against this.
- **Smallest risk: automatic eviction.** Safari's 7-day deletion does not hit home-screen apps used as apps. But a profile kept only in a Safari tab that is not visited for 7 days of Safari use can be wiped. Low-disk eviction is possible but uncommon, and `persist()` blocks it.
- **What the app can do:**
  1. Call `navigator.storage.persist()` once after the profile is created. It costs nothing and shows no prompt.
  2. Tell volunteers to always open the app from the home-screen icon (iPhone: add it from Safari itself, not from a link opened inside WhatsApp).
  3. Keep a cheap recovery path. A coordinator re-issuing the profile, or a short recovery code the volunteer can screenshot, covers every case above. None of the platform measures cover the "different place" case.

## Findings

### 1. Deletion after a period of non-use

**iOS / iPadOS Safari.** Since Safari 13.1 (2020), with tracking prevention on (the default), WebKit deletes "all of a website's script-writable storage after seven days of Safari use without user interaction on the site". This covers IndexedDB, localStorage, sessionStorage, service worker registrations and caches. It counts *days the browser is used*, not calendar days. ([WebKit blog: Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/); [MDN: Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria))

**Home-screen web apps on iOS.** WebKit's own statement: "Web applications added to the home screen are not part of Safari and thus have their own counter of days of use. Their days of use will match actual use of the web application which resets the timer. We do not expect the first-party in such a web application to have its website data deleted." It calls any such deletion a serious bug to report. ([WebKit blog 10218](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)) web.dev says the same more bluntly: the policy "does not apply to installed PWAs that have been added to the home screen". ([web.dev: Storage for the web](https://web.dev/articles/storage-for-the-web))

Practical reading: the app's counter only advances on days the app itself is opened, and opening it counts as interaction. So a home-screen app cannot hit 7 days of use without interaction.

Since iOS 26, every site added to the Home Screen opens as a web app by default, with or without a manifest. The user can switch off "Open as Web App" when adding it. In that case it is just a Safari bookmark, and the 7-day Safari rule applies again. ([WebKit: Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/); [Apple Support: Turn a website into an app](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/26/ios/26))

**Android Chrome.** No equivalent time-based deletion of a first-party site's storage is documented. Eviction is driven by storage pressure only (below). ([web.dev: Storage for the web](https://web.dev/articles/storage-for-the-web))

### 2. Eviction under storage pressure, and user clearing

**Both platforms** treat site data as "best-effort" by default. It is kept "as long as the origin is below its quota, the device has enough storage space, and the user doesn't choose to delete the data". Under pressure, browsers delete whole origins in least-recently-used order. Origins granted persistence are skipped. ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria))

**WebKit (Safari 17+, iOS 17+)** confirms that it evicts in least-recently-used order "when the system is under storage pressure". It deletes "the data of an origin ... as a whole", and spares origins with an active page or in persistent mode. ([WebKit blog: Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/))

**Chrome** deletes "all site data from the least recently used origin first" when the browser runs out of space. ([web.dev: Storage for the web](https://web.dev/articles/storage-for-the-web))

Our profile is a few hundred bytes, so we never approach any quota. Pressure eviction only happens when the phone itself is nearly full. That is plausible on teenagers' phones, but even then our origin is only evicted if it is among the least recently used.

**User clearing data.** Persistent storage does not protect against this: data "is only deleted if the user chooses to remove it using their site settings". ([web.dev: Persistent storage](https://web.dev/articles/persistent-storage)) On Android, the installed app shares Chrome's data store, so "if the user clears their Chrome profile, or chooses to delete site data, that will apply to the app as well". ([web.dev: WebAPKs on Android](https://web.dev/articles/webapks)) On iOS, the home-screen app's storage is separate from Safari's (see 3). I found no primary source on whether Safari's "Clear History and Website Data" also clears home-screen app data. Treat that as unverified.

### 3. Is home-screen storage separate from the browser tab?

**iOS: yes, fully separate.** "Home Screen apps are created as isolated entities without shared state with the browser" - this is "by design" (Brent Fulgham, WebKit, 2022, [WebKit bug 181849](https://bugs.webkit.org/show_bug.cgi?id=181849)). web.dev: "it creates a new storage container, and nothing is shared between the PWA and mobile Safari", and "each installation will have its own isolated storage". ([Storage for the web](https://web.dev/articles/storage-for-the-web); [Learn PWA: Installation](https://web.dev/learn/pwa/installation)) Consequences:
- A profile created in a Safari tab does not appear in the home-screen app, and the reverse.
- Removing the icon and adding it again gives an empty store.
- Not from a primary source, but standard iOS behaviour: links opened inside apps like WhatsApp or Instagram use that app's own web view, with yet another separate store.

**Android Chrome: no, shared.** "Even though the progressive web app is installed via an APK, Chrome uses the current profile to store any data, and it will not be segregated away ... any client side storage is accessible". ([web.dev: WebAPKs on Android](https://web.dev/articles/webapks)) A profile made in a Chrome tab therefore shows up in the installed app. This applies only to the same browser: Samsung Internet or Firefox have their own stores.

### 4. Does `navigator.storage.persist()` help?

**Chrome / Android.** Granted or denied silently, with no prompt, based on "level of site engagement", "whether the site has been installed or bookmarked", and "whether the site has been granted notification permission". A denied request can be retried later. Persistent data "is kept by the browser, even if storage is running low", and it explicitly includes "DOM Storage (Local Storage)" alongside IndexedDB. ([web.dev: Persistent storage](https://web.dev/articles/persistent-storage)) So it helps against pressure eviction, but only once Chrome judges the site important. An installed app qualifies.

**Safari / iOS.** Supported since Safari 15.2. ([web.dev: Persistent storage](https://web.dev/articles/persistent-storage)) "WebKit currently grants a request based on heuristics like whether the website is opened as a Home Screen Web App." ([WebKit blog 14403](https://webkit.org/blog/14403/updates-to-storage-policy/)) No prompt is shown. ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)) So it is likely granted in the home-screen app and likely denied in a plain Safari tab. Persistent origins are skipped by eviction. No primary source says whether persistence also exempts a Safari-tab origin from the 7-day rule. Assume it does not.

Neither platform's persistence protects against the user clearing data, or against the separate iOS stores.

### 5. localStorage vs IndexedDB, and other gotchas

- **Same treatment for eviction and persistence.** WebKit's 7-day rule, WebKit's quota and eviction policy, and Chrome's persistent storage all cover localStorage and IndexedDB together, and evict per origin as a whole. ([WebKit 10218](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/); [WebKit 14403](https://webkit.org/blog/14403/updates-to-storage-policy/); [web.dev: Persistent storage](https://web.dev/articles/persistent-storage)) Switching to IndexedDB buys no durability. web.dev discourages localStorage only for performance reasons (it is synchronous and limited to about 5 MB), which does not matter for a tiny profile. ([web.dev: Storage for the web](https://web.dev/articles/storage-for-the-web))
- **Private browsing.** Storage in a private tab is thrown away when the tab closes (general browser behaviour; not re-verified against a primary source here). A volunteer who joins in a private tab loses the profile when they close it.
- **iOS version differences.** The 7-day rule has existed since iOS 13.4 / Safari 13.1. Origin-level quotas and the heuristic `persist()` grant arrived in iOS 17 / Safari 17 ([WebKit 14403](https://webkit.org/blog/14403/updates-to-storage-policy/)). `persist()` exists from 15.2. "Every Home Screen site is a web app" arrived in iOS 26. Older iPhones that cannot update behave like the earlier rules, but the home-screen exemption from the 7-day rule applies to all of them.
- **Unverified.** These are reasoning, not tested on devices: Safari "Clear History and Website Data" vs home-screen app data, and whether `persist()` changes the 7-day rule in a Safari tab.

## Sources

- WebKit blog, Full Third-Party Cookie Blocking and More (Safari 13.1): https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- WebKit blog, Updates to Storage Policy (Safari 17): https://webkit.org/blog/14403/updates-to-storage-policy/
- WebKit blog, WebKit Features in Safari 26.0: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- WebKit bug 181849, "Add to homescreen" apps don't share storage with Safari: https://bugs.webkit.org/show_bug.cgi?id=181849
- Apple Support, Turn a website into an app in Safari on iPhone: https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/26/ios/26
- MDN, Storage quotas and eviction criteria: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- web.dev, Storage for the web: https://web.dev/articles/storage-for-the-web
- web.dev, Persistent storage: https://web.dev/articles/persistent-storage
- web.dev, WebAPKs on Android: https://web.dev/articles/webapks
- web.dev, Learn PWA - Installation: https://web.dev/learn/pwa/installation
