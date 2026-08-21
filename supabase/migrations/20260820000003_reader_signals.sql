-- Close the loop: let the ranker read the diary it has been keeping.
--
-- post_engagement_events has recorded, per person, every card that scrolled
-- past them, every post they opened, and every post they actually finished
-- (a "read" is a qualified read: enough seconds and enough scroll depth, see
-- lib/publicationDelivery.ts). Until now nothing in the application ever read
-- that table back. Personalization came entirely from the interest checkboxes
-- someone ticked once during onboarding and never revisited, and the feed had
-- no way of knowing it had already shown you something five times.
--
-- Two functions, because two different questions:
--
--   get_reader_affinity          what does this person actually finish reading?
--   get_viewer_post_engagement   have they already seen or read these posts?
--
-- Both aggregate inside Postgres. The alternative was shipping a few hundred
-- raw event rows into Node on every feed request to be counted there, which is
-- the same mistake 20260820000001 just removed from the count queries.
--
-- RLS on post_engagement_events has no SELECT policy at all, so these are
-- SECURITY DEFINER. The guard below is what keeps that safe: a signed-in caller
-- may only ever ask about themselves. A null auth.uid() means the caller is the
-- service role on the server, which is trusted to name the user it is serving.

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS post_engagement_events_actor_type_created_idx
  ON public.post_engagement_events(user_id, event_type, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS post_engagement_events_actor_post_idx
  ON public.post_engagement_events(user_id, post_id, event_type)
  WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- What this reader actually finishes
-- ---------------------------------------------------------------------------
--
-- Reads, not clicks. A click measures how good a headline was; a qualified read
-- measures whether the piece was worth the time. On a network whose whole claim
-- is rigor, ranking on the second one is the entire point.
--
-- Returns raw counts. Normalizing them into 0..1 weights is a ranking decision
-- and belongs with the rest of the ranking model in lib/feedRanking.ts, not
-- baked into a database function that would then be awkward to retune.
CREATE OR REPLACE FUNCTION public.get_reader_affinity(
  p_user_id uuid,
  p_since timestamptz,
  p_limit integer DEFAULT 24
)
RETURNS TABLE (kind text, key text, weight bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 24), 1), 100);
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH reads AS (
    SELECT DISTINCT
      events.post_id
    FROM public.post_engagement_events AS events
    WHERE events.user_id = p_user_id
      AND events.event_type = 'read'
      AND events.created_at >= COALESCE(p_since, now() - interval '90 days')
  ),
  read_posts AS (
    SELECT
      posts.author_id,
      posts.topic_keys
    FROM public.posts AS posts
    JOIN reads ON reads.post_id = posts.id
  ),
  authors AS (
    SELECT
      'author'::text AS kind,
      read_posts.author_id::text AS key,
      count(*) AS weight
    FROM read_posts
    WHERE read_posts.author_id IS NOT NULL
    GROUP BY read_posts.author_id
    ORDER BY count(*) DESC
    LIMIT v_limit
  ),
  topics AS (
    SELECT
      'topic'::text AS kind,
      topic_key AS key,
      count(*) AS weight
    FROM read_posts,
      LATERAL unnest(COALESCE(read_posts.topic_keys, '{}'::text[])) AS topic_key
    GROUP BY topic_key
    ORDER BY count(*) DESC
    LIMIT v_limit
  )
  SELECT * FROM authors
  UNION ALL
  SELECT * FROM topics;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reader_affinity(uuid, timestamptz, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_reader_affinity(uuid, timestamptz, integer)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- What this reader has already been shown
-- ---------------------------------------------------------------------------
--
-- Scoped to the candidate posts the feed is about to rank, so the result set is
-- bounded by the size of the candidate window rather than by how long the
-- person has been using the site.
CREATE OR REPLACE FUNCTION public.get_viewer_post_engagement(
  p_user_id uuid,
  p_post_ids uuid[],
  p_since timestamptz
)
RETURNS TABLE (post_id uuid, impressions bigint, has_read boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL OR p_post_ids IS NULL OR array_length(p_post_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    events.post_id,
    count(*) FILTER (WHERE events.event_type = 'impression') AS impressions,
    bool_or(events.event_type = 'read') AS has_read
  FROM public.post_engagement_events AS events
  WHERE events.user_id = p_user_id
    AND events.post_id = ANY (p_post_ids)
    AND events.event_type IN ('impression', 'read')
    AND events.created_at >= COALESCE(p_since, now() - interval '30 days')
  GROUP BY events.post_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_viewer_post_engagement(uuid, uuid[], timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_viewer_post_engagement(uuid, uuid[], timestamptz)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Evergreen candidate support
-- ---------------------------------------------------------------------------
--
-- The For You feed used to rank only the newest 120 posts. Widening it to
-- include the best work of the last 90 days (see lib/feedData.ts) needs two
-- cheap ordered lookups over published posts. read_count already has one from
-- 20260521000002; formally reviewed work does not.
CREATE INDEX IF NOT EXISTS posts_published_citable_recency_idx
  ON public.posts(published_at DESC, id DESC)
  WHERE status = 'published' AND citation_id IS NOT NULL;

COMMIT;
