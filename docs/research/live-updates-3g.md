# Live updates on 3G: Server-Sent Events vs WebSockets vs faster polling

Research for issue #92 (child of map #91, two-screen volunteer flow). Researched 2026-10-19.

Question: the shared race screen must show one phone's entries (wristbands, times, section claims, Submit presses) on the other phones within about a second, at Lee Valley Athletics Centre and English Institute of Sport Sheffield, where signal is likely 3G or worse. Which live-update method is smoothest there, given Railway's proxy and phones running the app as a home-screen web app on iOS Safari and Android Chrome?

## Short answer

**Use Server-Sent Events (one-way server push), read with `fetch()` rather than `EventSource`, and keep every write as an ordinary POST.** Each pushed event carries the whole current race (it is small), and every (re)connect starts with that snapshot, so catching up after a drop needs no replay log.

- Push beats polling on mobile for both latency and battery: "Polling is exceptionally expensive on mobile networks; minimize it" and "push delivery is more efficient than polling". [HPBN mobile]
- SSE beats WebSockets here because the traffic is one-way (server to phones) apart from the writes, which are already plain HTTP requests with auth, validation and error handling. Railway's own guide recommends SSE for one-way streams and WebSockets for frequent messages in both directions. [Railway SSE vs WS]
- SSE rides on HTTP/2 through Railway's edge, so the stream and the POSTs share one connection; WebSockets on Railway are HTTP/1.1 only. [Railway limits]
- Read it with `fetch()` because this app sends its bearer token in an `authorization` header (`src/client/api.ts`), and `EventSource` cannot set headers. `fetch()` also lets the app own reconnects; `EventSource` gives up for good after any non-200 reply (for example a 502 mid-deploy or a 401). [WHATWG SSE]
- **Limit no method removes:** on 3G, a phone whose radio has gone idle needs up to about 2 seconds just to wake the radio, before any data moves. [HPBN mobile networks] "Within about a second" is realistic while volunteers are actively entering (radios stay awake), and 1-3 seconds is realistic for the first update after a quiet spell. Faster polling does not fix this; it only spends more battery keeping the radio awake.

## 1. The three options on a poor mobile link

| | Faster polling (e.g. every 1 s) | Server-Sent Events | WebSockets |
|---|---|---|---|
| Delay to show another phone's entry | Up to the interval + a full request round trip (3G: 100-500 ms per round trip [HPBN mobile networks]) | Server write time + half a round trip, once connected | Same as SSE |
| Data on the air | A request + response every interval per phone, even when nothing changed | Only when something changes, plus a small heartbeat | Same as SSE, plus WebSocket framing and pings |
| Battery | Worst: a request every second keeps the 3G radio in its high-power state all the time ("Every network transfer, no matter the size, incurs an energy tail") [HPBN mobile] | Good: idle connection costs nothing between events | Good |
| Writes | Normal POSTs | Normal POSTs (same HTTP/2 connection) | Either POSTs alongside, or a second write path over the socket with its own auth, acks and errors |
| Reconnect after a drop | Implicit: next poll | App must reconnect (with `fetch()`), then get a snapshot | App must reconnect, then get a snapshot |
| Railway | No issues | 15-minute cap per request, 5-minute idle cap: reconnect at least every 15 min, heartbeat at least every 5 min [Railway limits] | No time limits, HTTP/1.1 only [Railway limits] |
| Server work in this app (Fastify) | None | One streaming route plus an in-process notifier | A WebSocket library (none installed) plus a message protocol |

3G specifics from High Performance Browser Networking (Grigorik), the standard reference on this:

- Waking the radio: "the same transition from idle to DCH can take up to two seconds"; from the intermediate FACH state, "up to one and a half seconds". RRC promotion adds "500-2,500 ms for 3G networks". [HPBN mobile networks], [HPBN mobile]
- The radio drops from high power to FACH after a network-set idle timer (the book's example: 10 seconds). [HPBN mobile networks]
- "Intermittent network access is a performance anti-pattern on mobile networks." [HPBN mobile]
- "Transient errors will happen; plan for them, and use a retry strategy" and "Use a backoff algorithm for request retries; do not spin forever." [HPBN mobile]

So during a race, when someone on the screen enters or taps something every few seconds, every phone's radio stays in or near high-power state and a pushed event arrives in roughly half a 3G round trip. Polling at 1 s would have the same "awake" cost on every phone all the time, plus up to 1 s of extra wait, plus a full request per update.

## 2. Railway's proxy

From Railway's Specs and Limits page [Railway limits]:

- "HTTP requests can run for up to 15 minutes if data keeps transferring" and are closed "after 5 minutes with no data transferred". An SSE stream is an ordinary HTTP response, so both apply. [Railway SSE vs WS]
- "Idle HTTP/1.1 connections are closed after 60 seconds between requests" (not HTTP/2 or WebSockets).
- "Support for HTTP/1.1 and HTTP/2" from the internet, and "websockets over HTTP/1.1". WebSocket connections "are exempt from these duration and inactivity limits" and "can stay open indefinitely, even while idle".
- 10,000 concurrent connections and 10,000 requests per connection. Irrelevant at our scale (tens of phones).
- Railway's SSE guide: "Send a heartbeat (such as an SSE comment line) at least every 5 minutes", reconnect when a stream outlives 15 minutes, and "implement reconnection logic on the client side for both protocols" because connections "can still drop for other reasons, such as deploys or network interruptions". [Railway SSE vs WS]
- Not documented: whether the edge buffers or compresses streamed responses. Must be checked on the Railway test build (see section 6).

Browser connection limit: over HTTP/1.x a browser allows only 6 SSE connections per domain across all tabs; over HTTP/2 the limit is negotiated, default 100 streams. [MDN EventSource] With HTTP/2 at Railway's edge and one stream per phone this does not bite. Even on HTTP/1.1 it only matters with several tabs open on one phone.

The 15-minute cap is harmless: the client simply reconnects and gets a fresh snapshot. The server can end each stream itself after, say, 10 minutes so the reconnect is planned rather than a cut.

## 3. Phones going to the background

- **Android Chrome:** a hidden page has its timers throttled (once per second, and after 5 minutes hidden, as rarely as once per minute) [Chrome timer throttling]; browsers may then **freeze** it ("JavaScript timers and fetch callbacks don't run") or discard it entirely when short of resources. Chrome's guidance on freeze is to close connections, including WebSockets, and stop polling, then "reopen any closed connections or restart any polling" on resume, and to use `visibilitychange` as the reliable signal ("especially true on mobile"). [Chrome page lifecycle]
- **iOS Safari / home-screen apps:** Apple publishes no specification of how long a backgrounded web page keeps its network connections. Developer reports and WebKit bug threads describe WebSockets being dropped shortly after the app leaves the foreground (one report: about 30 seconds) and close/error events sometimes not firing. [WebKit bug 228296], [Apple forum 696310] Treat any connection as gone once the page is hidden.
- **Consequence (same for SSE and WebSockets):** no method keeps a backgrounded phone live. The app should close the stream on `visibilitychange` to hidden and reopen it (getting a fresh snapshot) when visible. The app already pauses polling while hidden (`document.visibilityState` checks in `useJobData.ts` and elsewhere), so this matches today's behaviour. A phone that comes back sees the current race within one round trip.

## 4. Why not WebSockets

WebSockets would work, and Railway's lack of time limits on them is a plus. But for this app:

- Data flows mostly server to phones; writes are a few taps per race and are already well-handled POSTs (auth header, validation, 401 reasons, `StaleRequest`). Moving writes onto a socket duplicates all of that; keeping them as POSTs leaves the socket doing only what SSE does.
- WebSockets on Railway are HTTP/1.1 only, so the socket is a second connection beside the HTTP/2 one the POSTs use. Two connections on 3G means two handshakes after every signal drop.
- The browser WebSocket API also cannot set an `authorization` header, so it needs a token in the URL or a first message, the same auth problem as `EventSource`.
- No library is installed (`package.json`: Fastify, pg). SSE needs none.
- Reconnect, heartbeat and snapshot-on-connect are needed either way; WebSockets do not save that work.

## 5. Why not faster polling

Polling at 1 s gives a worst-case delay of 1 s plus a round trip, sends a request per phone per second whether or not anything changed, and keeps every radio in high-power state the whole time a race screen is open. That is the pattern HPBN calls exceptionally expensive. [HPBN mobile] On a congested venue cell, slow requests also overlap, so polling degrades into a queue of stale reads. Polling's only real advantage, no reconnect logic, disappears once the stream sends a snapshot on every connect.

## 6. What the app must do around SSE

Client (one hook replacing the 5-second interval on the race screen):

1. Open the stream with `fetch('/api/races/:id/live', {headers:{authorization:...}})` and read `response.body` line by line (SSE text format: `data:` lines, blank line ends an event, `:` lines are comments). [WHATWG SSE], [MDN Streams]
2. Treat a 401 exactly as `api()` does today (same reasons, same storage clearing). Treat any other failure or end of stream as "reconnect".
3. Reconnect with backoff (for example 0.5 s, 1 s, 2 s, capped at about 5 s), never spinning. [HPBN mobile] Show the existing "Could not connect" / last-updated state while disconnected.
4. Watchdog: the server sends a heartbeat comment every 15 seconds (the WHATWG spec suggests "a comment line ... every 15 seconds or so" for proxies [WHATWG SSE]); if nothing arrives for about 30-45 seconds, abort and reconnect. A dead mobile link often gives no error at all, so this is the only way to notice.
5. Close the stream when the page is hidden; reopen when visible (also on `pageshow`). [Chrome page lifecycle]
6. Writes stay as POSTs. Each write's response already returns the new state, so the writer updates immediately; others get it from the stream.

Server (Fastify, single Railway instance today):

1. A streaming route that checks the bearer token like other routes, sets `content-type: text/event-stream`, `cache-control: no-cache`, sends the current race snapshot at once, then pushes the new snapshot after every successful write to that race.
2. An in-process notifier (Node `EventEmitter` keyed by race id) called after each committed write. Shortcut with a known limit: this works only while the app runs as one instance; if Railway is ever scaled to several replicas, fan out through Postgres `LISTEN`/`NOTIFY` instead.
3. Heartbeat comment every 15 s; end the stream after about 10 minutes so the client reconnects before Railway's 15-minute cap.
4. Include a version number in each snapshot so the client ignores an older snapshot that arrives after a newer POST response.

Catch-up after a drop is therefore "reconnect and take the snapshot". No `Last-Event-ID` replay log is needed, because every event is the full state of a small race, and the client never needs the intermediate steps.

To verify on the Railway test build before the spec relies on it (cannot be checked from docs):

- That a streamed response is delivered event by event, not buffered (watch with `curl -N`).
- That browsers reach the `.up.railway.app` domain over HTTP/2 (`curl -sI --http2`), so the stream and POSTs share one connection.
- Real-world latency on a throttled 3G profile (Chrome DevTools or Playwright network throttling), two phones on one race.

## Sources

- [Railway limits] Railway, Public Networking - Specs and Limits. https://docs.railway.com/networking/public-networking/specs-and-limits
- [Railway SSE vs WS] Railway, Choose Between SSE and WebSockets. https://docs.railway.com/guides/sse-vs-websockets
- [WHATWG SSE] WHATWG HTML Living Standard, Server-sent events (reconnection, `Last-Event-ID`, non-200 fails the connection, 15-second comment lines, battery note). https://html.spec.whatwg.org/multipage/server-sent-events.html
- [MDN EventSource] MDN, EventSource (6-connection limit on HTTP/1.x, 100 streams on HTTP/2). https://developer.mozilla.org/en-US/docs/Web/API/EventSource
- [MDN Streams] MDN, Response.body. https://developer.mozilla.org/en-US/docs/Web/API/Response/body
- [Chrome page lifecycle] Chrome for Developers, Page Lifecycle API. https://developer.chrome.com/docs/web-platform/page-lifecycle-api
- [Chrome timer throttling] Chrome for Developers, Heavy throttling of chained JS timers beginning in Chrome 88. https://developer.chrome.com/blog/timer-throttling-in-chrome-88
- [HPBN mobile networks] Ilya Grigorik, High Performance Browser Networking, ch. 7 Mobile Networks. https://hpbn.co/mobile-networks/
- [HPBN mobile] Ilya Grigorik, High Performance Browser Networking, ch. 8 Optimizing for Mobile Networks. https://hpbn.co/optimizing-for-mobile-networks/
- [WebKit bug 228296] WebKit Bugzilla, background behaviour of home-screen web apps (secondary: no first-party WebKit/Apple doc on background network policy exists). https://bugs.webkit.org/show_bug.cgi?id=228296
- [Apple forum 696310] Apple Developer Forums, WebSocket issue in iOS 15 Safari (secondary, developer reports). https://developer.apple.com/forums/thread/696310
