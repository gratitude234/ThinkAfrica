# Feed v4.2 — Live-session freshness

Implemented 24 September 2026.

> **v4.3 note:** the live-session transport remains current, but the reader-consumption rule was tightened in v4.3. Lightweight impressions no longer disqualify a recent publication; a qualified read is the hard exclusion signal. See `FEED_V4_3_FRESH_FIRST_RESERVATION.md`.

## Product rule

A reader should not have to restart Home before a publication created during the current session has any chance to appear.

Feed v4.2 preserves the v4 frozen ranking snapshot and layers a small, bounded live-fresh queue on top of continuation pages.

## How it works

1. Page 1 still creates one ranked snapshot and freezes the remaining ordered ids.
2. The cursor also records a `liveCheckedAt` watermark, an optional resumable live scan cursor, and a bounded queue of post-snapshot ids waiting to be shown.
3. On each For You continuation request, the server scans for publications newer than the fully processed live watermark.
4. Eligible unseen publications are queued for live distribution. Lower global exposure is preferred so the layer supports first circulation rather than reinforcing fresh winners.
5. Up to two live publications are injected into a 12-card continuation page. The page consumes correspondingly fewer frozen snapshot ids.
6. The next continuation resumes the original frozen sequence exactly where it stopped.

This means live content can enter the active session without re-ranking the old snapshot, moving page boundaries, duplicating frozen cards, or skipping frozen cards.

## Burst safety

The live discovery query is intentionally bounded. If more publications arrive than can fit in one scan, the cursor stores the scan position and keeps `liveCheckedAt` unchanged until that burst has been fully traversed. A bounded pending queue is drained across later continuation pages.

This avoids the failure mode where only the newest few publications from a burst are shown and the rest disappear when the watermark advances.

## Reader-awareness

For signed-in readers, `get_viewer_post_engagement` is checked for the small live candidate batch. A post already read or already exposed to that reader does not consume a live-fresh slot when that signal is available.

Signal lookup is fail-soft. If it is unavailable, the feed favors availability and treats the new publication as unseen rather than failing the page.

## Stability and safety

- Snapshot ranking is not recomputed.
- Snapshot relative ordering is unchanged.
- Existing block/co-author exclusions and content filters still apply.
- Live scan failures do not fail the continuation page.
- Deleted/unpublished/newly blocked pending ids are consumed as holes and never shown.
- v4.1 cursors are accepted during their existing one-hour session lifetime and upgraded to the v4.2 cursor state.

## Current bounds

- Live-fresh injection: up to 2 cards per continuation page.
- Live scan batch: 24 rows.
- Live pending queue: 48 ids.
- Home snapshot lifetime: 1 hour.
- Exposure source: `for_you_live_fresh`.
- Algorithm version: `feed-v4.2.0`.

## Deliberately not changed

- Page-1 v4.1 protection remains 5 of 12 unseen publications under 72 hours when inventory exists.
- Following remains reverse chronological.
- Qualified-read scoring and reader affinity remain unchanged.
- The 192-candidate page-1 universe remains unchanged; candidate-generation expansion is a separate follow-up.
