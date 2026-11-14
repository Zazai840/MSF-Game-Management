# Performance ledger

Every speed experiment on this app, kept or reverted, with the numbers that decided it. Read it before proposing a new
one. The rule (`.claude/skills/performance-optimization`): measure, fix one thing, measure the same way, keep only what
beats run-to-run noise, guard what is kept.

## How it is measured

A local load harness (not in the repo) seeds a full event day through the HTTP API of a production build (798 children,
28 events, 326 heats, 12 finals, 198 relay teams), holds 40 phones on live streams (10 on the Races list, 30 on race
pages) and 8 leads polling, then runs a burst of 176 tap-by-tap changes as fast as the server answers. Node 22, local
Postgres. The burst runs far above the real peak (about 3 changes a second), so its times show headroom, not what a
volunteer feels.

## Baseline - 14 Nov 2026, `integration/perf-after-event` at 0551eac (4 runs)

| Measure | Value | Run-to-run range |
|---|---|---|
| Live stream bytes pushed per change, all 40 phones | 683 KB | 560-685 KB (reconnect timing) |
| Races-list frame (each list phone, each change) | 218 KB raw, 20 KB if gzipped | fixed |
| Race-page frame | 16 KB raw (relay heat 101 KB) | fixed |
| Live stream encoding | none | - |
| Server CPU per change | 70 ms | 62-76 ms |
| Postgres CPU per change | 61 ms | 56-64 ms |
| Changes a second the server keeps up with | 13 | 10.9-16.7 |
| Tap to saved in the burst, p50 / p95 | 300 / 990 ms | p50 224-418, p95 682-1034 |
| Lead's one-event results read (end of day) | 799 KB raw, 27 KB gzip | fixed |
| Lead's Results list read | 11 KB, 41-62 ms server CPU | - |
| Phone's `/api/home` poll | 222 bytes, 1.5-2.8 ms CPU | - |
| Volunteer first load | 407 KB gzip (fonts 268 KB, script 126 KB, styles 12 KB), budget 1.5 MB | fixed |

Railway's edge gzips ordinary reads and files but not the live stream (measured on production, 13 Nov).

## Attempts

| Idea | Baseline -> result | Verdict | Why |
|---|---|---|---|

## Measured and left alone

| Idea | Numbers | Why not |
|---|---|---|
| Share each race page's read between its phones | 30 reads per change, Postgres 61 ms per change | The server keeps up with 4 times the real peak; nobody feels it. |
| Keep the Results list read per revision | 41-62 ms CPU per poll | 8 leads polling cost under a tenth of one core. |
