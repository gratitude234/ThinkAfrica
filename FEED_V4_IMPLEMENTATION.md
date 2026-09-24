# Indegenius Feed v4.2

Implemented 23 September 2026; new-content distribution foundation and live-session freshness updated 24 September 2026.

## Why this exists

The previous For You feed re-ranked the newest candidate window on every page request, then used numeric offsets (`slice(start, end)`). Because publishing, impressions and engagement can change between requests, page boundaries moved underneath the reader. Client-side id de-duplication hid repeated cards but could not recover publications that moved into an already-consumed page.

Feed v4 removes that failure mode and adds a small, explainable hybrid recommender suited to the current Indegenius product.

## For You architecture

### 1. Stable snapshot pagination

Page 1 ranks the candidate set once. The remaining ordered publication ids and their candidate lanes are stored in a signed, deflate-compressed cursor (`fy4...`). Page 2+ resolves those exact ids instead of re-ranking a moving data set.

v4.2 adds a bounded live-fresh layer without changing that rule. Continuation requests may reserve up to two positions for unseen publications created after the snapshot began; the page simply consumes fewer frozen ids. The frozen ids retain their exact relative order and resume on the next request. A resumable scan watermark and pending queue prevent publication bursts from being silently skipped.

- Cursor context is bound to tab, content filter and timeframe.
- Cursor payload is HMAC-signed and rejects tampering.
- Feed sessions expire after one hour; an expired/invalid Home cursor starts a fresh snapshot on the client rather than falling back to unsafe numeric offsets.
- A chronological tail begins after the ranked window so deep scrolling can continue without gaps.
- Following remains reverse-chronological keyset pagination by `(published_at, id)`.

Feed v4 itself introduced no persistence table or Redis dependency. The 23 September production-stability patch adds bounded feed RPCs; see `FEED_V4_STABILITY_FIX.md` and migration `20260923000001_feed_v4_stability.sql`.

### 2. Explainable hybrid scoring

The v4 score is bounded to 0-100 and uses:

- personal relevance: 30%
- content satisfaction: 25%
- freshness: 20%
- learned writer/topic affinity: 10%
- novelty/fatigue: 10%
- exploration: 5%

Satisfaction is exposure-normalized and Bayesian-smoothed. Qualified reads and saves carry more weight than lightweight reactions.

### 3. Protected new-content distribution

New content is now a distribution guarantee, not just a scoring bonus. When enough inventory exists, five of every 12 For You positions (41.7%) are reserved for publications that are both recent and unseen by that reader.

The protection window is 72 hours:

- 0-24h: strongest support;
- 24-48h: still strongly protected;
- 48-72h: support tapers so sustained quality/relevance can take over.

Within the protected fresh lane, circulation comes before popularity. Publications below the initial 30-impression test audience are served before already well-exposed fresh winners. Among comparable candidates, lower exposure is preferred first, then recency/reader fit/early satisfaction.

A recent publication the reader has already seen or qualified-read cannot consume a protected fresh slot while unseen recent inventory exists. It may still rank through the normal personalized/trending/backfill paths.

Exploration no longer falls off at a hard 100-impression cliff. Full test-audience support lasts through the initial 30 impressions, then fades gradually to zero at 250 impressions.

### 4. Reader signals

Existing bounded reader-signal RPCs are reused:

- `get_reader_affinity` supplies recent qualified-read affinity by writer/topic.
- `get_viewer_post_engagement` supplies recent per-post impression/read history for fatigue.

Both are fail-soft: the feed remains available if either signal lookup fails.

### 5. Soft lane composition and diversity

Each 12-card window aims for an interleaved mix of 5 fresh, 3 personalized, 2 discovery, 1 trending and 1 evergreen publication. Unavailable lanes are backfilled by overall score. Fresh candidates are reserved for the fresh lane during lane composition so another lane cannot silently consume the protected allocation.

Diversity preferences:

- maximum two cards from one writer per 12-card window when alternatives exist;
- avoid consecutive cards from the same writer when possible;
- maximum four cards from one primary topic per 12-card window when alternatives exist.

## Exposure analytics

The exposure algorithm version is now `feed-v4.2.0` and the experiment variant remains `ranking_v4`. Hybrid candidate sources are recorded on signed exposure metadata:

- `for_you_personalized`
- `for_you_fresh`
- `for_you_discovery`
- `for_you_trending`
- `for_you_evergreen`
- `for_you_live_fresh`
- `for_you_tail`
- `followed_author`

Old v3/v2 attribution is intentionally rejected so experiments are not mixed across materially different algorithms.

## Configuration

A dedicated `FEED_CURSOR_SIGNING_SECRET` may be supplied. If absent, the server reuses `FEED_EXPOSURE_SIGNING_SECRET`, then `SUPABASE_SERVICE_ROLE_KEY`. Production must have one of those secrets available.

## Main files changed

- `lib/feedRanking.ts`
- `lib/feedData.ts`
- `lib/db/feedList.ts`
- `lib/feedExposure.ts`
- `app/(main)/PostsFeedTabs.tsx`
- `app/(main)/explore/ExploreFeed.tsx`
- `.env.example`
- associated feed/exposure/impression tests

See `FEED_V4_2_LIVE_SESSION_FRESHNESS.md` for the live continuation contract.

## Verification note

The ranking module was syntax/type-checked in isolation with the available TypeScript compiler and executed with runtime assertions covering the new-content guarantee, reader-aware fresh protection and gradual exploration fade. The environment could not complete `npm ci` because the package registry/cache was unavailable, so run the normal repository checks in a fully provisioned environment before deployment:

```bash
npm ci
npm run typecheck
npm test
npm run build
```
