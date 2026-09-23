# Indegenius Feed v4

Implemented 23 September 2026.

## Why this exists

The previous For You feed re-ranked the newest candidate window on every page request, then used numeric offsets (`slice(start, end)`). Because publishing, impressions and engagement can change between requests, page boundaries moved underneath the reader. Client-side id de-duplication hid repeated cards but could not recover publications that moved into an already-consumed page.

Feed v4 removes that failure mode and adds a small, explainable hybrid recommender suited to the current Indegenius product.

## For You architecture

### 1. Stable snapshot pagination

Page 1 ranks the candidate set once. The remaining ordered publication ids and their candidate lanes are stored in a signed, deflate-compressed cursor (`fy4...`). Page 2+ resolves those exact ids instead of re-ranking a moving data set.

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

### 3. Fresh-content cold start

A publication under 48 hours old and below 100 impressions remains eligible for the fresh/exploration lane. This gives new work a chance to collect evidence instead of requiring engagement before it can receive exposure.

### 4. Reader signals

Existing bounded reader-signal RPCs are reused:

- `get_reader_affinity` supplies recent qualified-read affinity by writer/topic.
- `get_viewer_post_engagement` supplies recent per-post impression/read history for fatigue.

Both are fail-soft: the feed remains available if either signal lookup fails.

### 5. Soft lane composition and diversity

Each 12-card window aims for an interleaved mix of personalized, fresh, discovery, trending and evergreen publications, then fills unavailable slots by overall score.

Diversity preferences:

- maximum two cards from one writer per 12-card window when alternatives exist;
- avoid consecutive cards from the same writer when possible;
- maximum four cards from one primary topic per 12-card window when alternatives exist.

## Exposure analytics

The exposure algorithm version is now `feed-v4.0.0` and the experiment variant is `ranking_v4`. Hybrid candidate sources are recorded on signed exposure metadata:

- `for_you_personalized`
- `for_you_fresh`
- `for_you_discovery`
- `for_you_trending`
- `for_you_evergreen`
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

## Verification note

The archive did not include installed dependencies and the package registry/cache available in the execution environment could not complete `npm ci`. The changed TypeScript was parsed with the available compiler and produced no feed-specific code/type errors after filtering out missing dependency/type declarations. The pure ranking module was also executed directly with `ts-node` to verify fresh cold-start inclusion, writer diversity, topic diversity and fatigue ordering. Run the normal project checks after installing dependencies:

```bash
npm ci
npm run typecheck
npm test
npm run build
```
