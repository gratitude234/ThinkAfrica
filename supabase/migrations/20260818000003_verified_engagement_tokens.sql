-- Prevent a verified page/exposure token from being replayed under rotated
-- anonymous cookies. Both fields below are written only after server-side HMAC
-- verification; unverified client metadata is stripped by the route.

-- Interrupted concurrent builds leave invalid index shells that make
-- IF NOT EXISTS unsafe on retry. Remove only this migration's exact invalid
-- indexes before rebuilding them outside a transaction.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  v_index_name text;
BEGIN
  FOR v_index_name IN
    SELECT index_class.relname
    FROM pg_catalog.pg_index AS index_row
    JOIN pg_catalog.pg_class AS index_class
      ON index_class.oid = index_row.indexrelid
    JOIN pg_catalog.pg_namespace AS index_namespace
      ON index_namespace.oid = index_class.relnamespace
    WHERE index_row.indrelid = 'public.post_engagement_events'::regclass
      AND index_namespace.nspname = 'public'
      AND NOT index_row.indisvalid
      AND index_class.relname = ANY (ARRAY[
        'post_engagement_verified_token_once_idx',
        'post_engagement_verified_exposure_once_idx'
      ]::text[])
  LOOP
    EXECUTE format('DROP INDEX public.%I', v_index_name);
  END LOOP;
END;
$$;

COMMIT;

SET lock_timeout = '5s';

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS post_engagement_verified_token_once_idx
  ON public.post_engagement_events (
    event_type,
    (metadata ->> 'engagementTokenId')
  )
  WHERE event_type IN ('view', 'read')
    AND nullif(metadata ->> 'engagementTokenId', '') IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS post_engagement_verified_exposure_once_idx
  ON public.post_engagement_events (
    (metadata ->> 'exposureId')
  )
  WHERE event_type = 'impression'
    AND nullif(metadata ->> 'exposureId', '') IS NOT NULL;

RESET lock_timeout;
