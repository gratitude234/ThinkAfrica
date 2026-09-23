# Feed v4 production stability fix

Implemented 23 September 2026 against `indegenuis_feed_v4_implemented(2).zip`.

## Incident addressed

Production was intermittently returning `SupabaseTimeoutError` after 8 seconds and Home rendered **Couldn't load your feed**. Supabase also recorded cancelled PostgreSQL statements and concurrent refresh-token `409` responses.

The v4 pagination/ranking model is retained. The stability problem was in the data-loading path around it:

- the first For You page ranked 192 candidates but fully hydrated all 192 before rendering only 12;
- reader context required separate interests, follows and block requests;
- several dynamic request paths could independently validate/refresh the same Supabase session;
- a ranked-candidate timeout had no cheap first-page fallback.

## What changed

### Broad rank, narrow hydrate

The first For You page still considers the 192-post v4 candidate window, but it now loads only ranking counters for that broad set. After ranking, full card hydration runs only for the posts selected for the visible page (normally 12).

Two bounded RPCs support this path:

- `get_feed_ranking_metrics(uuid[])` — ranking counters only;
- `hydrate_feed_cards(uuid[])` — author/count/viewer decoration only for rendered cards.

If the new RPC migration has not reached a database yet, the application has a compatibility path. Operational RPC failures do **not** fan out into a burst of replacement reads during an outage.

### One reader-context request

`get_feed_viewer_context(uuid, boolean)` returns interests, follows and both directions of block exclusions in one call. It is identity-guarded and keeps block handling strict. A missing RPC may use the legacy reads; an operational failure remains fatal rather than weakening block semantics.

### Safe first-page fallback

If the broad ranked post-list query itself fails, Home retries once with a small newest-first page (`pageSize + 1`) using the exact same author/post exclusions. It never falls back around a block-resolution failure.

### Auth refresh boundary

`proxy.ts` now handles authenticated dynamic application requests as the session-refresh boundary and uses the same bounded Supabase fetch wrapper as the rest of the server. Critical Home/feed/activation paths use claims for identity instead of adding `getUser()` Auth round trips.

Transient Auth network failures are not treated as a confirmed logout.

## Database migration

Apply:

`supabase/migrations/20260923000001_feed_v4_stability.sql`

The application contains migration-lag compatibility code, but the intended production load reduction depends on these RPCs being present. Apply the migration before or together with the application deployment.

The migration does not change feed scoring, feed exposure attribution, cursor semantics, blocking policy or the 8-second global Supabase timeout.

## Deployment verification

After dependencies are available, run:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Then verify in production that:

1. a first For You request calls `get_feed_ranking_metrics` for the broad window but `hydrate_feed_cards` for only the visible page;
2. the feed no longer emits large profile/likes/bookmarks `in.(...)` hydration requests for the full ranking window;
3. refresh-token `409` clusters no longer occur during normal navigation;
4. a forced/temporary broad candidate failure returns a chronological page rather than the Home error state;
5. block exclusions still apply in both directions.

## Environment limitation during this implementation

The supplied archive did not contain `node_modules`. The execution environment could not complete `npm ci` because one registry package was not present in the offline cache. The modified TypeScript was nevertheless parsed with the available TypeScript compiler with no parser diagnostics. The included unit/migration tests document the expected contracts and should be run in the normal project environment before deployment.
