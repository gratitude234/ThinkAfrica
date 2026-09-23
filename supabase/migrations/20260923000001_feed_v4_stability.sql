BEGIN;

-- Feed v4 stability: collapse the broad ranking counters, the small rendered-card
-- hydration, and the viewer context into bounded RPCs. All three are designed to
-- be safe to deploy before the application: the TypeScript side retains a
-- compatibility path when these functions are not present yet.

-- ---------------------------------------------------------------------------
-- Ranking-only counters for the broad For You candidate window
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER is deliberate. Comment visibility remains the caller's RLS
-- truth, exactly as count_visible_comments_by_post does today. The maintained
-- like/bookmark aggregates are still the authoritative global counts.
CREATE OR REPLACE FUNCTION public.get_feed_ranking_metrics(p_post_ids uuid[])
RETURNS TABLE (
  post_id uuid,
  like_count bigint,
  bookmark_count bigint,
  comment_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH ids AS (
    SELECT value AS post_id, ord
    FROM unnest(COALESCE(p_post_ids, '{}'::uuid[])) WITH ORDINALITY AS t(value, ord)
  ),
  bookmark_fallback AS (
    SELECT b.post_id, count(*)::bigint AS bookmark_count
    FROM public.bookmarks b
    JOIN ids i ON i.post_id = b.post_id
    GROUP BY b.post_id
  ),
  visible_comments AS (
    -- SECURITY INVOKER means the caller's comments RLS still decides which
    -- rows participate in this grouped count.
    SELECT c.post_id, count(*)::bigint AS comment_count
    FROM public.comments c
    JOIN ids i ON i.post_id = c.post_id
    GROUP BY c.post_id
  )
  SELECT
    i.post_id,
    COALESCE(lc.like_count, 0)::bigint AS like_count,
    COALESCE(bc.bookmark_count, bf.bookmark_count, 0)::bigint AS bookmark_count,
    COALESCE(vc.comment_count, 0)::bigint AS comment_count
  FROM ids i
  LEFT JOIN public.post_like_counts lc ON lc.post_id = i.post_id
  LEFT JOIN public.post_bookmark_counts bc ON bc.post_id = i.post_id
  LEFT JOIN bookmark_fallback bf ON bf.post_id = i.post_id
  LEFT JOIN visible_comments vc ON vc.post_id = i.post_id
  ORDER BY i.ord;
$$;

REVOKE ALL ON FUNCTION public.get_feed_ranking_metrics(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_feed_ranking_metrics(uuid[])
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Full hydration only for the cards that will actually render
-- ---------------------------------------------------------------------------
-- This replaces six PostgREST requests with one RPC. It remains SECURITY
-- INVOKER so profile/comment/like/bookmark RLS is identical to the old viewer
-- client path. auth.uid() supplies viewer-specific button state.
CREATE OR REPLACE FUNCTION public.hydrate_feed_cards(p_post_ids uuid[])
RETURNS TABLE (
  post_id uuid,
  author_id uuid,
  username text,
  full_name text,
  avatar_url text,
  like_count bigint,
  bookmark_count bigint,
  comment_count bigint,
  viewer_liked boolean,
  viewer_bookmarked boolean
)
LANGUAGE sql
STABLE
SET search_path = public, auth, pg_temp
AS $$
  WITH ids AS (
    SELECT value AS post_id, ord
    FROM unnest(COALESCE(p_post_ids, '{}'::uuid[])) WITH ORDINALITY AS t(value, ord)
  )
  SELECT
    i.post_id,
    p.author_id,
    pr.username::text,
    pr.full_name::text,
    pr.avatar_url::text,
    COALESCE(lc.like_count, 0)::bigint AS like_count,
    COALESCE(
      bc.bookmark_count,
      (SELECT count(*) FROM public.bookmarks b WHERE b.post_id = i.post_id),
      0
    )::bigint AS bookmark_count,
    (
      SELECT count(*)
      FROM public.comments c
      WHERE c.post_id = i.post_id
    )::bigint AS comment_count,
    (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.likes l
        WHERE l.post_id = i.post_id
          AND l.user_id = auth.uid()
      )
    ) AS viewer_liked,
    (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.bookmarks b
        WHERE b.post_id = i.post_id
          AND b.user_id = auth.uid()
      )
    ) AS viewer_bookmarked
  FROM ids i
  LEFT JOIN public.posts p ON p.id = i.post_id
  LEFT JOIN public.profiles pr ON pr.id = p.author_id
  LEFT JOIN public.post_like_counts lc ON lc.post_id = i.post_id
  LEFT JOIN public.post_bookmark_counts bc ON bc.post_id = i.post_id
  ORDER BY i.ord;
$$;

REVOKE ALL ON FUNCTION public.hydrate_feed_cards(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hydrate_feed_cards(uuid[])
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Viewer context in one request
-- ---------------------------------------------------------------------------
-- This one must see both directions of user_blocks, which ordinary RLS does not
-- expose to the blocked person. SECURITY DEFINER reproduces the existing
-- service-role block lookup, but the function refuses callers asking about any
-- user other than themselves (service_role remains allowed for server jobs).
CREATE OR REPLACE FUNCTION public.get_feed_viewer_context(
  p_user_id uuid,
  p_personalized boolean DEFAULT true
)
RETURNS TABLE (
  user_interests text[],
  followed_ids uuid[],
  excluded_author_ids uuid[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT '{}'::text[], '{}'::uuid[], '{}'::uuid[];
    RETURN;
  END IF;

  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'feed viewer context may only be requested for the current user'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    CASE
      WHEN p_personalized THEN COALESCE(
        (SELECT p.interests FROM public.profiles p WHERE p.id = p_user_id),
        '{}'::text[]
      )
      ELSE '{}'::text[]
    END AS user_interests,
    CASE
      WHEN p_personalized THEN COALESCE(
        ARRAY(
          SELECT f.following_id
          FROM public.follows f
          WHERE f.follower_id = p_user_id
          ORDER BY f.following_id
        ),
        '{}'::uuid[]
      )
      ELSE '{}'::uuid[]
    END AS followed_ids,
    COALESCE(
      ARRAY(
        SELECT DISTINCT
          CASE
            WHEN b.blocker_id = p_user_id THEN b.blocked_id
            ELSE b.blocker_id
          END
        FROM public.user_blocks b
        WHERE (b.blocker_id = p_user_id OR b.blocked_id = p_user_id)
          AND CASE
                WHEN b.blocker_id = p_user_id THEN b.blocked_id
                ELSE b.blocker_id
              END IS DISTINCT FROM p_user_id
        ORDER BY 1
      ),
      '{}'::uuid[]
    ) AS excluded_author_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.get_feed_viewer_context(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_feed_viewer_context(uuid, boolean)
  TO authenticated, service_role;

COMMIT;
