# Feed Viewer-Context Resilience Fix

## What changed

Home no longer has to keep `get_feed_viewer_context` as a hidden PostgREST-only dependency.

- The viewer context (interests, followed writers, and both directions of user blocks) now has a repository abstraction with Supabase RPC and direct PostgreSQL implementations.
- The viewer-context repository follows the existing `feed` read-migration domain.
- While `feed` is still on Supabase, transient Supabase/PostgREST availability failures can fail over to direct PostgreSQL when `FEED_VIEWER_POSTGRES_FAILOVER=1`.
- Permission, validation, and data-contract errors do **not** fail over; they remain visible as real defects.
- Block exclusions remain fail-closed. If neither transport can resolve them, the feed returns an error instead of risking blocked content exposure.
- Missing-RPC migration lag keeps the existing compatibility reads.
- The Home error copy no longer tells the reader to check their internet connection when the backend is the failing component.

## Production activation

Do not enable the failover until `DATABASE_URL` is confirmed to point at the production-safe PostgreSQL target containing the same live reader state.

1. Deploy the code with `FEED_VIEWER_POSTGRES_FAILOVER` unset or `0`.
2. Call the protected `/api/migration-status` endpoint and verify the database probe against the intended target.
3. Set `FEED_VIEWER_POSTGRES_FAILOVER=1` and redeploy.
4. During a Supabase/PostgREST timeout, look for:
   `"[feed-viewer] Supabase viewer context unavailable; served via PostgreSQL failover"`.
5. When the whole `feed` read domain is later moved to PostgreSQL via `READ_MIGRATED_DOMAINS`, the viewer context follows that domain automatically and the emergency flag is no longer needed.

## Validation added

- Unit coverage for Supabase viewer-context mapping.
- Unit coverage for the direct PostgreSQL viewer-context query.
- Transport-failover tests for timeouts, permission errors, and dual-transport failure.
- Live same-database feed parity now checks viewer context and depersonalized block exclusions across Supabase RPC and direct PostgreSQL.
