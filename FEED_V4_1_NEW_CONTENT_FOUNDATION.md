# Feed v4.1 — New-content distribution foundation

## Product rule

**New publications must receive a fair first audience before older winners are allowed to dominate their opportunity.**

This release turns that rule into feed mechanics while keeping Feed v4 snapshot stability intact.

## First-screen contract

When sufficient unseen recent inventory exists, a 12-card For You window protects **5 positions (41.7%)** for publications under 72 hours old that the current reader has not previously seen/read.

The remaining positions continue to mix personalization, discovery, trending and evergreen content. If recent inventory is thin, unused protected positions are backfilled normally; the feed is never padded with weak placeholders.

## Initial audience

A publication below **30 global impressions** is still building its initial test audience. Inside the protected fresh lane, these underexposed publications are chosen before fresh publications that already received substantial distribution.

This creates a self-balancing circulation mechanism using the exposure system Indegenius already records: as a publication receives impressions, other underexposed publications naturally move ahead of it for protected opportunities.

## Age protection

- **0-24 hours:** maximum new-content support.
- **24-48 hours:** strong support.
- **48-72 hours:** tapering support.
- **After 72 hours:** no protected-new-content treatment; relevance, satisfaction, affinity, novelty and normal freshness determine ranking.

## Reader-aware protection

"Fresh" now means fresh **to the reader**, not only fresh globally. A recent publication already impression-served/read by that reader does not consume a protected slot while unseen recent publications are available. It remains eligible for ordinary ranking.

## No 100-impression cliff

The old exploration rule ended abruptly at 100 impressions. v4.1 keeps full initial-audience support through 30 impressions and then fades exploration gradually until 250 impressions.

## Guest freshness

The anonymous public-feed cache now revalidates every **30 seconds** instead of 120 seconds, reducing the time a newly published item can be hidden from a guest starting a fresh Home request. Signed-in personalized Home requests remain uncached.

## What this deliberately does not change

- Following remains reverse chronological.
- The qualified-read/satisfaction model is unchanged.
- Writer/topic diversity caps are unchanged.
- Signed snapshot pagination is unchanged.
- A publication created after a user's current snapshot began is not injected into that frozen snapshot; it becomes eligible when the user starts a fresh page-1 session. This preserves the duplicate/gap fix from v4 and should be handled separately if live-session insertion is later required.

## Files

- `lib/feedRanking.ts`
- `lib/feedRanking.test.ts`
- `lib/feedExposure.ts`
- `lib/feedData.ts`
- `CHANGES.md`
- `FEED_V4_IMPLEMENTATION.md`
