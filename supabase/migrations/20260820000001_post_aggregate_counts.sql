-- Feed scaling: stop counting bookmarks, references and comments row by row.
--
-- getCountsByPostId() in lib/feedData.ts answered "how many bookmarks does this
-- post have" by selecting every bookmark row for 120 posts and tallying them in
-- JavaScript. That is a counting method whose cost grows with success: a post
-- with 5,000 bookmarks ships 5,000 rows across the wire on every feed request
-- so the server can print the number 5,000. Likes were already fixed this way
-- (see 20260715000004); bookmarks, references and comments never were.
--
-- There is also a quieter failure in the old shape. PostgREST can be configured
-- with a `db-max-rows` ceiling, and when it is, an over-limit count is silently
-- truncated rather than erroring. The feed would then rank on numbers that are
-- simply wrong, with nothing in the logs to say so.
--
-- Bookmarks and references become counter tables maintained by triggers, on the
-- post_like_counts pattern: no client role can write them, and reading one is a
-- single indexed lookup whatever the count.
--
-- Comments deliberately do NOT become a counter table. The feed's comment count
-- is per-viewer by design: the RLS SELECT policy on comments is what hides
-- moderated rows, and an author legitimately still sees their own hidden
-- comment. A shared counter column would either leak moderated rows to everyone
-- or hide them from the author. Comments instead get a SECURITY INVOKER
-- aggregate function, which keeps the caller's RLS in force while letting
-- Postgres do the counting.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Bookmarks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.post_bookmark_counts (
  post_id uuid PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  bookmark_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.post_bookmark_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bookmark counts are viewable by everyone"
  ON public.post_bookmark_counts;
CREATE POLICY "Bookmark counts are viewable by everyone"
  ON public.post_bookmark_counts FOR SELECT USING (true);

REVOKE ALL ON public.post_bookmark_counts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.post_bookmark_counts TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_post_bookmark_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.post_bookmark_counts (post_id, bookmark_count)
  VALUES (NEW.post_id, 1)
  ON CONFLICT (post_id) DO UPDATE
    SET bookmark_count = public.post_bookmark_counts.bookmark_count + 1;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_post_bookmark_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.post_bookmark_counts
  SET bookmark_count = GREATEST(bookmark_count - 1, 0)
  WHERE post_id = OLD.post_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS bookmarks_increment_count ON public.bookmarks;
CREATE TRIGGER bookmarks_increment_count
  AFTER INSERT ON public.bookmarks
  FOR EACH ROW EXECUTE FUNCTION public.increment_post_bookmark_count();

DROP TRIGGER IF EXISTS bookmarks_decrement_count ON public.bookmarks;
CREATE TRIGGER bookmarks_decrement_count
  AFTER DELETE ON public.bookmarks
  FOR EACH ROW EXECUTE FUNCTION public.decrement_post_bookmark_count();

-- ---------------------------------------------------------------------------
-- References
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.post_reference_counts (
  post_id uuid PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  reference_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.post_reference_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reference counts are viewable by everyone"
  ON public.post_reference_counts;
CREATE POLICY "Reference counts are viewable by everyone"
  ON public.post_reference_counts FOR SELECT USING (true);

REVOKE ALL ON public.post_reference_counts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.post_reference_counts TO anon, authenticated;

-- References are edited in bulk (the editor replaces a post's whole
-- bibliography), so a delta trigger has more ways to drift than a recount of
-- the one post that changed. The recount is bounded by a single post's
-- reference list, which is small by nature.
--
-- NEW and OLD are read only under the operation that actually assigns them.
-- PL/pgSQL leaves NEW unassigned on DELETE and OLD unassigned on INSERT, and
-- reading the unassigned one raises "record is not assigned yet" rather than
-- evaluating to NULL, so COALESCE(NEW.post_id, OLD.post_id) would fail on
-- every reference deletion.
CREATE OR REPLACE FUNCTION public.sync_post_reference_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_post_ids uuid[];
  v_post_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_post_ids := ARRAY[NEW.post_id];
  ELSIF TG_OP = 'DELETE' THEN
    v_post_ids := ARRAY[OLD.post_id];
  ELSE
    -- An UPDATE that moves a reference between posts leaves two counts wrong,
    -- so both ends are recounted. ARRAY[...] would produce a duplicate when
    -- the post did not change, which the recount tolerates but need not do.
    v_post_ids := ARRAY(
      SELECT DISTINCT unnest(ARRAY[OLD.post_id, NEW.post_id])
    );
  END IF;

  FOREACH v_post_id IN ARRAY v_post_ids LOOP
    CONTINUE WHEN v_post_id IS NULL;

    INSERT INTO public.post_reference_counts (post_id, reference_count)
    SELECT
      v_post_id,
      count(*)
    FROM public.post_references
    WHERE post_id = v_post_id
    ON CONFLICT (post_id) DO UPDATE
      SET reference_count = EXCLUDED.reference_count;
  END LOOP;

  -- AFTER triggers ignore the return value; returning NULL avoids reading
  -- whichever of NEW/OLD this operation left unassigned.
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS post_references_sync_count ON public.post_references;
CREATE TRIGGER post_references_sync_count
  AFTER INSERT OR UPDATE OR DELETE ON public.post_references
  FOR EACH ROW EXECUTE FUNCTION public.sync_post_reference_count();

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
--
-- Every post gets a row, including the zero counts. A missing row and a zero
-- row would otherwise be indistinguishable to the reader, which turns "this
-- post has no bookmarks" and "the backfill did not reach this post" into the
-- same answer.

INSERT INTO public.post_bookmark_counts (post_id, bookmark_count)
SELECT
  p.id,
  count(b.post_id)
FROM public.posts AS p
LEFT JOIN public.bookmarks AS b ON b.post_id = p.id
GROUP BY p.id
ON CONFLICT (post_id) DO UPDATE
  SET bookmark_count = EXCLUDED.bookmark_count;

INSERT INTO public.post_reference_counts (post_id, reference_count)
SELECT
  p.id,
  count(r.post_id)
FROM public.posts AS p
LEFT JOIN public.post_references AS r ON r.post_id = p.id
GROUP BY p.id
ON CONFLICT (post_id) DO UPDATE
  SET reference_count = EXCLUDED.reference_count;

-- A post created after this migration needs its counter rows to exist before
-- anything is bookmarked or cited, so the feed reads 0 rather than nothing.
CREATE OR REPLACE FUNCTION public.seed_post_aggregate_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.post_bookmark_counts (post_id, bookmark_count)
  VALUES (NEW.id, 0)
  ON CONFLICT (post_id) DO NOTHING;

  INSERT INTO public.post_reference_counts (post_id, reference_count)
  VALUES (NEW.id, 0)
  ON CONFLICT (post_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_seed_aggregate_counts ON public.posts;
CREATE TRIGGER posts_seed_aggregate_counts
  AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.seed_post_aggregate_counts();

-- ---------------------------------------------------------------------------
-- Comments: aggregate under the caller's own RLS
-- ---------------------------------------------------------------------------
--
-- SECURITY INVOKER (the default) is the whole point here. The function runs as
-- whoever called it, so the comments RLS policy still decides which rows are
-- visible, and the per-viewer count the feed has always produced is unchanged.
-- What changes is that the counting happens next to the data instead of after
-- a few thousand rows have crossed the network.
CREATE OR REPLACE FUNCTION public.count_visible_comments_by_post(p_post_ids uuid[])
RETURNS TABLE (post_id uuid, comment_count bigint)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    c.post_id,
    count(*) AS comment_count
  FROM public.comments AS c
  WHERE c.post_id = ANY (COALESCE(p_post_ids, '{}'::uuid[]))
  GROUP BY c.post_id;
$$;

GRANT EXECUTE ON FUNCTION public.count_visible_comments_by_post(uuid[])
  TO anon, authenticated, service_role;

COMMIT;
