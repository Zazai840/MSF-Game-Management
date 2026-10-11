# SprintTimer - Photo Finish: how times are read and exported

Research for issue #3 (child of #2, Running Zone app v1 spec). Researched 2026-10-11.

Question: how does the finish-line volunteer read each finishing position's time in SprintTimer - Photo Finish (iOS), can the results be exported, and can another app or web page receive the times automatically?

## Short answer

- Times are read by hand: after the race the timer scrolls the photo-finish image and taps **Mark** each time a runner's torso is on the line. Each mark stores a time. [Photo Finish guide]
- Without a start list, the marks are just a sequence of times (in finishing order). Attaching names/numbers/lanes needs a start list, and the start list / results features (the "Results Manager") need **SprintTimer Pro**. [Results guide], [App Store]
- Export exists: **CSV, LIF (Lynx result file) or PDF**, per race from the finish view, or several races as one CSV (Pro). The file goes through the iOS share sheet (email, save to Files, copy, AirDrop, open in other apps, iCloud/Dropbox/Google Drive/OneDrive). [Results guide], [Q&A], [App Store release notes]
- There is **no documented API, webhook or live-results push**. The only network feature is the Start Sender's cloud mode, which carries the start signal, not results. A web app can only get times via a human step: share/paste a CSV, or type them. [Start Sender guide]
- Precision: times are shown to **0.01 s** (optional 1/1000 s display exists; the developer says only hundredths should be published). [Photo Finish guide], [Q&A], [Accuracy]

## 1. Reading times after a race

From the developer's Photo Finish guide:

- Before the race, set race direction and the "slice" width in finish setup. Optionally enable 1/1000 s display.
- After the race, scroll the rendered image and "read the time when the front of the body is at the white line". Rotate the phone for faster scrolling (landscape) or a closer view (portrait). The current time is shown in the top right corner while swiping. [Tutorial]
- Tap **Mark** to "insert a vertical line with the time for that particular competitor". Marks appear as vertical timelines on the image. A long press on Mark resets all marks. [Photo Finish guide], [Results guide]
- "The result will be saved directly each time you mark a position or frame." [Results guide]
- With a start list loaded (Pro), the image can be marked with names and numbers; start lists can be sorted by lane when marking (release 17.4). Start list CSV columns: `Start-number, Lane, First name, Last name, Team`. Start lists can be imported from a file, AirDropped, or pasted from a spreadsheet (paste is Pro). [Results guide], [App Store release notes]
- Marked start lists appear under Results: Result Lists, sortable by start number, name or time. [Results guide]
- **Save** stores the image (to the SprintTimer album in Photos) and the base video. [Photo Finish guide]

Video Finish (frame-by-frame) works similarly: browse frames, mark each competitor crossing. [Developer site]

Implication: per race the timer taps Mark once per finisher, so the app already holds an ordered list of times per race. The labour is reading the image, not a separate data entry step.

## 2. Export and sharing

- **Formats:** Export CSV (configurable in Setup, including separator and, since 17.9, a time format setting), Export LIF (Lynx result file, accepted by meet managers), Export PDF (for printing). [Results guide], [App Store release notes 17.9]
- **Where:** from the Results list via the Export button, or directly after marking by choosing CSV or LIF in the Save dialog. "Results lets you export the markings from the current race as a CSV, LIF, or PDF file" from the finish view. [Results guide], [Photo Finish guide]
- **How:** "After choosing format you will given a choice how to share the file: Email, save, copy, upload, open in other apps etc." i.e. the iOS share sheet. Files app gives local, iCloud, Dropbox, Google Drive, OneDrive. [Results guide], [Q&A]
- **Per race / per session:** per race by default; "Multiple races can be exported as one CSV-file" (release 15.3, Pro per Q&A). Emailing from Results bundles "all the results from the same day". Results are grouped by race day (15.6). [App Store release notes], [Q&A]
- **Images:** the photo-finish image is saved to Photos and can be shared like any photo; Pro can share images "with the on-line SprintTimer viewer". [Photo Finish guide], [Q&A]

### Tiers

App Store in-app purchases: SprintTimer Pro subscription $4.99/year (2-week free trial), SprintTimer Pro (unlimited) $19.99 one-off, Pro upgrade $4.99. "The Results Manager is a part of SprintTimer Pro, but you can still mark a finish with times without it." [App Store], [Results guide]

## 3. Automatic hand-off to another app or web page

Nothing found. The Start Sender "cloud" mode (private iCloud or public cloud with a Start Sender ID) sends the start signal and syncs time via online time servers; its guide says nothing about results. No API, webhook, URL scheme or live results feed is documented. [Start Sender guide]

Realistic paths into our PWA:

1. Type times by position (no Pro needed).
2. Export CSV for the race and paste/import it into the PWA (Pro needed for start lists / multi-race export; single-race CSV export appears available from the finish view, see Unverified).
3. LIF import (structured, per race, used by meet software) as an alternative to CSV.

## 4. Precision and display

- Claimed accuracy 0.01 s; the developer's pendulum tests put newer devices "well within the 0.01 s accuracy". Clock drift appears in 1-hour tests; irrelevant for sprints. [Accuracy]
- Optional 1/1000 s display; developer notes T&F rules say to present 1/100 s. [Q&A]
- Exact rounding rule (World Athletics rounds up to the next hundredth) is not documented.

## Unverified / gaps

- Exact CSV column layout and the time format options (e.g. `12.34` vs `0:12.34`) are not documented; would need a sample export from the app.
- Whether single-race CSV/LIF/PDF export from the finish view works on the free tier, or only with Pro. The guides say Results Manager is Pro and marking is free, but do not state this for finish-view export.
- What marks look like without a start list (position numbers or only times) is not explicitly described.
- Rounding direction (truncate/round/round up) when displaying hundredths.
- Whether the "on-line SprintTimer viewer" exposes results data or only images.
- The App Store page fetched shows version 18.0; release dates in the fetched summary looked inconsistent, so treat version dates as approximate.

Recommendation: before the event, run one test race on the volunteer's phone and export a CSV to confirm columns, time format and tier requirements.

## Sources

- [App Store] App Store listing, description, in-app purchases, version history: https://apps.apple.com/us/app/sprinttimer-photo-finish/id430807521
- [Developer site] https://appmaker.se/home/sprinttimer/ (sprinttimer.app redirects here)
- [Tutorial] https://appmaker.se/guide/sprinttimer/web.php?fil=tutorial
- [Photo Finish guide] https://appmaker.se/guide/sprinttimer/web.php?fil=guide_photo
- [Results guide] https://appmaker.se/guide/sprinttimer/web.php?fil=guide_results
- [Start Sender guide] https://appmaker.se/guide/sprinttimer/web.php?fil=guide_startsend
- [Q&A] https://appmaker.se/guide/sprinttimer/web.php?fil=QA
- [Accuracy] https://appmaker.se/sprinttimer-accuracy/
