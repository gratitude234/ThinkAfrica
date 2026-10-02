BEGIN;

-- Profile V3 Selected Work
-- ------------------------
-- Reuses the existing profile_featured_posts table, but intentionally exposes
-- one selected publication instead of restoring the retired three-item
-- Featured Work manager. The older replacement RPCs remain for rollback and
-- deployed-client compatibility; new clients use this narrow one-item RPC.

-- Explicit Data API privileges. RLS remains the row boundary; mutation is
-- normally performed through the RPC below, but SECURITY INVOKER needs the
-- caller to have the underlying INSERT/DELETE privileges.
GRANT SELECT ON TABLE public.profile_featured_posts TO anon, authenticated;
GRANT INSERT, DELETE ON TABLE public.profile_featured_posts TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_selected_work(
  p_post_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to select profile work.';
  END IF;

  IF p_post_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.posts AS post
    WHERE post.id = p_post_id
      AND post.author_id = v_user_id
      AND post.status = 'published'
      AND post.content_kind IN ('post', 'article')
  ) THEN
    RAISE EXCEPTION 'Selected work must be one of your published Posts or Articles.';
  END IF;

  DELETE FROM public.profile_featured_posts
  WHERE user_id = v_user_id;

  IF p_post_id IS NOT NULL THEN
    INSERT INTO public.profile_featured_posts (user_id, post_id, position)
    VALUES (v_user_id, p_post_id, 1);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_selected_work(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_selected_work(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.set_my_selected_work(uuid) IS
  'Profile V3: atomically selects one of the caller''s published Posts or Articles for the public profile, or clears it when NULL.';

COMMIT;
