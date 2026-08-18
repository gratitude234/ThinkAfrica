BEGIN;

-- Feed schema foundation (EXPAND, forward-only).
--
-- Phase 1 prepares every function before acquiring the table lock, then does
-- only the column/trigger cutover and commits before touching existing rows.
-- A short lock timeout makes a busy production database fail safely instead
-- of queueing an ACCESS EXCLUSIVE lock behind long readers.
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.normalize_topic_key(p_topic text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT lower(regexp_replace(btrim(coalesce(p_topic, '')), '\s+', ' ', 'g'));
$$;

REVOKE ALL ON FUNCTION public.normalize_topic_key(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_topic_key(text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.derive_post_topic_keys(p_tags text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT ARRAY(
    SELECT DISTINCT public.normalize_topic_key(input_tag.tag)
    FROM unnest(coalesce(p_tags, '{}'::text[])) AS input_tag(tag)
    WHERE char_length(public.normalize_topic_key(input_tag.tag))
      BETWEEN 1 AND 80
    ORDER BY public.normalize_topic_key(input_tag.tag)
  )::text[];
$$;

REVOKE ALL ON FUNCTION public.derive_post_topic_keys(text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.derive_post_topic_keys(text[])
  TO service_role;

CREATE OR REPLACE FUNCTION public.sync_post_topic_keys()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_derived_topic_keys text[];
BEGIN
  v_derived_topic_keys := public.derive_post_topic_keys(NEW.tags);

  IF TG_OP = 'UPDATE'
     AND NEW.tags IS NOT DISTINCT FROM OLD.tags THEN
    -- Ordinary clients cannot author arbitrary derived state. A write that is
    -- exactly the canonical projection is safe to accept, however, and lets
    -- the staged migration backfill while this trigger protects concurrent
    -- inserts/updates. This also keeps the later Topic Subscriptions candidate
    -- backfill compatible with the already-installed trigger.
    IF NEW.topic_keys @> v_derived_topic_keys
       AND NEW.topic_keys <@ v_derived_topic_keys THEN
      NEW.topic_keys := v_derived_topic_keys;
      RETURN NEW;
    END IF;

    NEW.topic_keys := OLD.topic_keys;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(coalesce(NEW.tags, '{}'::text[])) AS input_tag(tag)
    WHERE char_length(public.normalize_topic_key(input_tag.tag)) < 1
       OR char_length(public.normalize_topic_key(input_tag.tag)) > 80
  ) THEN
    RAISE EXCEPTION 'Topics must contain between 1 and 80 characters'
      USING ERRCODE = '23514';
  END IF;

  NEW.topic_keys := v_derived_topic_keys;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_post_topic_keys()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_post_topic_keys()
  TO service_role;

-- Temporary expansion of the existing edit-timestamp function for the staged
-- backfill below. It preserves updated_at for counter-only and derived-topic-
-- only maintenance without converting a potentially large posts row to JSON.
-- The immediately following 00002 migration removes the topic_keys exemption
-- after the backfill while retaining the counter-only fast path.
CREATE OR REPLACE FUNCTION public.touch_posts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_view_count integer := NEW.view_count;
  v_impression_count integer := NEW.impression_count;
  v_read_count integer := NEW.read_count;
  v_topic_keys text[] := NEW.topic_keys;
BEGIN
  NEW.view_count := OLD.view_count;
  NEW.impression_count := OLD.impression_count;
  NEW.read_count := OLD.read_count;
  NEW.topic_keys := OLD.topic_keys;
  NEW.updated_at := OLD.updated_at;

  IF NEW IS DISTINCT FROM OLD THEN
    NEW.updated_at := now();
  END IF;

  NEW.view_count := v_view_count;
  NEW.impression_count := v_impression_count;
  NEW.read_count := v_read_count;
  NEW.topic_keys := v_topic_keys;
  RETURN NEW;
END;
$$;

-- Keep the strongest table lock at the tail of this transaction. The column,
-- its write-time projection, and timestamp semantics become visible together
-- at commit; no application write can observe a half-installed contract.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS topic_keys text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.posts.topic_keys IS
  'Canonical, normalized keys derived from tags for feed matching. Managed by posts_sync_topic_keys; not client-authored.';

DROP TRIGGER IF EXISTS posts_sync_topic_keys ON public.posts;
CREATE TRIGGER posts_sync_topic_keys
BEFORE INSERT OR UPDATE OF tags, topic_keys ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.sync_post_topic_keys();

COMMIT;

-- Phase 2 performs only row-level data work. The sync trigger is already live,
-- so posts inserted or edited while this statement scans are projected too.
-- Readers remain available; a row that stays write-locked for five seconds
-- causes the migration to abort cleanly and be retried.
BEGIN;
SET LOCAL lock_timeout = '5s';

WITH normalized AS MATERIALIZED (
  SELECT
    post.id,
    public.derive_post_topic_keys(post.tags) AS topic_keys
  FROM public.posts AS post
)
UPDATE public.posts AS post
SET topic_keys = normalized.topic_keys
FROM normalized
WHERE post.id = normalized.id
  AND post.topic_keys IS DISTINCT FROM normalized.topic_keys;

COMMIT;

-- Phase 3 makes CONCURRENTLY retries safe. PostgreSQL can leave an invalid
-- index shell when a concurrent build is interrupted; IF NOT EXISTS would
-- otherwise skip that shell forever. Drop only invalid indexes from this
-- migration's exact allowlist, leaving every valid deployed index untouched.
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
    WHERE index_row.indrelid = 'public.posts'::regclass
      AND index_namespace.nspname = 'public'
      AND NOT index_row.indisvalid
      AND index_class.relname = ANY (ARRAY[
        'posts_published_topic_keys_idx',
        'posts_published_recency_id_idx',
        'posts_published_kind_recency_id_idx',
        'posts_published_author_recency_id_idx',
        'posts_published_response_parent_recency_id_idx'
      ]::text[])
  LOOP
    EXECUTE format('DROP INDEX public.%I', v_index_name);
  END LOOP;
END;
$$;

COMMIT;

-- Phase 4 builds indexes without blocking concurrent writes. Current Supabase
-- migration runners execute pipeline-incompatible CONCURRENTLY statements
-- standalone. Pin/verify that runner capability before deployment; these
-- statements must never be wrapped in a transaction.
SET lock_timeout = '5s';

CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_published_topic_keys_idx
  ON public.posts USING gin (topic_keys)
  WHERE status = 'published';

CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_published_recency_id_idx
  ON public.posts (published_at DESC, id DESC)
  WHERE status = 'published';

CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_published_kind_recency_id_idx
  ON public.posts (content_kind, published_at DESC, id DESC)
  WHERE status = 'published';

CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_published_author_recency_id_idx
  ON public.posts (author_id, published_at DESC, id DESC)
  WHERE status = 'published';

-- Older ledgers can contain either a published-only or an unqualified index
-- under the ambiguous posts_in_response_to_idx name, so use a new name rather
-- than assuming or destructively replacing the deployed definition.
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_published_response_parent_recency_id_idx
  ON public.posts (in_response_to, published_at DESC, id DESC)
  WHERE status = 'published'
    AND in_response_to IS NOT NULL;

RESET lock_timeout;
NOTIFY pgrst, 'reload schema';
