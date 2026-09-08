-- Parameterised identity for the first six auth.uid() RPCs.
--
-- ===========================================================================
-- DEPLOYMENT STATUS: NOT APPLIED. ADDITIVE. REVERSIBLE.
-- ===========================================================================
-- This file is source-controlled only. Creating it does not prove it has run
-- anywhere. Nothing in the application calls the new signatures yet; see
-- docs/rpc-identity-migration.md for the rollout, which is deliberately
-- separate from writing the SQL.
--
-- ===========================================================================
-- WHY
-- ===========================================================================
-- 105 database functions call auth.uid(), and 22 of them are called directly
-- by application code. auth.uid() is defined as reading a claim PostgREST puts
-- on the connection:
--
--     select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
--
-- Off Supabase that setting is never present, so auth.uid() returns NULL. It
-- does not error and it does not warn. Every one of these functions guards on
-- it, so on Neon they would all raise 'Authentication required' for everyone,
-- forever. That is the good case. The bad case is a function that filters
-- rather than guards -- `where user_id = auth.uid()` -- which quietly affects
-- zero rows and reports success.
--
-- Parameterising them while Supabase Auth is still live is safe and is not
-- safe to leave until afterwards, which is why it happens now.
--
-- ===========================================================================
-- SHAPE
-- ===========================================================================
-- For each function the body moves into a PRIVATE implementation taking
-- p_user_id as its first argument. The existing public signature keeps its
-- name, its arguments and its behaviour, and becomes a SECURITY DEFINER
-- wrapper that derives the actor from auth.uid() and calls the private one.
--
--   * Every existing caller keeps working, unchanged.
--   * The logic exists once. A wrapper cannot drift from the body it calls.
--   * The direct-PostgreSQL repositories call the private implementation over
--     a trusted connection, passing the viewer the server resolved.
--
-- ===========================================================================
-- WHY THE IMPLEMENTATION IS PRIVATE, AND NOT A PUBLIC OVERLOAD
-- ===========================================================================
-- An earlier draft of this file created the parameterised functions in
-- `public` and granted them to `authenticated`, relying on a runtime guard to
-- refuse a p_user_id that disagreed with auth.uid(). That guard had to exempt
-- callers with no JWT, because a trusted server is the caller the parameter
-- exists for -- and "no JWT" is not a property only a trusted server can have.
-- It made impersonation a question about who can mint a token rather than a
-- question about who is granted what.
--
-- So the explicit-id form is not reachable from a browser at all, by two
-- independent mechanisms:
--
--   1. It lives in `private`, and PostgREST exposes only `public`. There is
--      no request that names it.
--   2. `private` grants USAGE to `postgres` alone. `anon` and
--      `authenticated` cannot resolve the schema, let alone execute in it.
--
-- The public wrapper is SECURITY DEFINER, so it reaches the private
-- implementation as its owner. A caller needs no privilege in `private` for
-- the wrapper to work, and gains none from it: the wrapper takes no user id,
-- so there is nothing to forge.
--
-- `private.assert_identity_claim()` remains as defence in depth. It is no
-- longer the thing standing between a browser and someone else's data; it is
-- what makes a future grant mistake fail loudly instead of silently.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- The shared guard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.assert_identity_claim(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_claimed uuid := auth.uid();
BEGIN
  IF p_user_id IS NULL THEN
    -- The whole point. A null identity is never "act as nobody and succeed".
    RAISE EXCEPTION 'A user id is required.' USING ERRCODE = '42501';
  END IF;

  -- No JWT on the connection means a trusted server-side caller: service_role,
  -- or a direct connection after the migration. The parameter is authoritative.
  IF v_claimed IS NULL THEN
    RETURN p_user_id;
  END IF;

  IF v_claimed <> p_user_id THEN
    RAISE EXCEPTION 'A signed-in caller may only act as itself.'
      USING ERRCODE = '42501';
  END IF;

  RETURN p_user_id;
END;
$$;

COMMENT ON FUNCTION private.assert_identity_claim(uuid) IS
  'Defence in depth, not the primary control. The primary control is that '
  'private is unreachable from PostgREST and ungranted to anon and '
  'authenticated. This refuses a p_user_id that disagrees with auth.uid(); a '
  'caller with no JWT (a direct connection) is trusted and the parameter '
  'wins. Removed at the Better Auth cutover.';

-- ===========================================================================
-- Onboarding
-- ===========================================================================

-- --- get_my_onboarding_state -----------------------------------------------

CREATE OR REPLACE FUNCTION private.get_my_onboarding_state_impl(p_user_id uuid)
RETURNS TABLE (
  current_path text,
  work_category text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
ROWS 1
AS $$
  SELECT
    preference.current_path,
    preference.work_category,
    preference.updated_at
  FROM public.user_onboarding_preferences AS preference
  WHERE preference.user_id = private.assert_identity_claim(p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.get_my_onboarding_state()
RETURNS TABLE (
  current_path text,
  work_category text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
ROWS 1
AS $$
  SELECT * FROM private.get_my_onboarding_state_impl((SELECT auth.uid()));
$$;

-- --- save_onboarding_path --------------------------------------------------

CREATE OR REPLACE FUNCTION private.save_onboarding_path_impl(
  p_user_id uuid,
  p_current_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := private.assert_identity_claim(p_user_id);
BEGIN
  IF p_current_path NOT IN ('student', 'non_student') THEN
    RAISE EXCEPTION 'Choose a valid current path.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.user_onboarding_preferences (
    user_id,
    current_path,
    work_category,
    updated_at
  ) VALUES (
    v_user_id,
    p_current_path,
    NULL,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET current_path = EXCLUDED.current_path,
      work_category = CASE
        WHEN public.user_onboarding_preferences.current_path = EXCLUDED.current_path
          THEN public.user_onboarding_preferences.work_category
        ELSE NULL
      END,
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.save_onboarding_path(p_current_path text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.save_onboarding_path_impl((SELECT auth.uid()), p_current_path);
$$;

-- --- save_onboarding_preferences -------------------------------------------

CREATE OR REPLACE FUNCTION private.save_onboarding_preferences_impl(
  p_user_id uuid,
  p_current_path text,
  p_work_category text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := private.assert_identity_claim(p_user_id);
BEGIN
  IF p_current_path NOT IN ('student', 'non_student')
    OR (p_current_path = 'student' AND p_work_category IS NOT NULL)
    OR (
      p_current_path = 'non_student'
      AND (
        p_work_category IS NULL
        OR p_work_category NOT IN (
          'research_education',
          'business_technology',
          'policy_community',
          'media_creative',
          'independent'
        )
      )
    ) THEN
    RAISE EXCEPTION 'Choose valid recommendation preferences.'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.user_onboarding_preferences (
    user_id, current_path, work_category, updated_at
  ) VALUES (
    v_user_id, p_current_path, p_work_category, now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET current_path = EXCLUDED.current_path,
      work_category = EXCLUDED.work_category,
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.save_onboarding_preferences(
  p_current_path text,
  p_work_category text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.save_onboarding_preferences_impl(
    (SELECT auth.uid()), p_current_path, p_work_category
  );
$$;

-- --- save_onboarding_topics ------------------------------------------------

CREATE OR REPLACE FUNCTION private.save_onboarding_topics_impl(
  p_user_id uuid,
  p_interests text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := private.assert_identity_claim(p_user_id);
  v_allowed CONSTANT text[] := ARRAY[
    'Public Health',
    'Economics & Development',
    'Climate & Environment',
    'Governance & Policy',
    'Education',
    'Technology & AI',
    'Agriculture & Food Systems',
    'Gender & Society',
    'History & Culture',
    'International Relations',
    'Business & Entrepreneurship',
    'Law & Human Rights',
    'Data Science',
    'Arts & Literature'
  ]::text[];
BEGIN
  IF COALESCE(cardinality(p_interests), 0) NOT BETWEEN 3 AND 5
    OR (SELECT count(DISTINCT interest) FROM unnest(p_interests) AS interest)
      <> cardinality(p_interests)
    OR EXISTS (
      SELECT 1
      FROM unnest(p_interests) AS interest
      WHERE NOT (interest = ANY(v_allowed))
    ) THEN
    RAISE EXCEPTION 'Choose 3 to 5 valid topics.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.profiles
  SET interests = p_interests
  WHERE id = v_user_id;

  -- NOT FOUND after an UPDATE is the row-count check. Without it a write that
  -- matched nothing would return successfully, which is the exact failure this
  -- whole migration exists to prevent.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_onboarding_topics(p_interests text[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.save_onboarding_topics_impl((SELECT auth.uid()), p_interests);
$$;

-- ===========================================================================
-- Notifications
-- ===========================================================================

CREATE OR REPLACE FUNCTION private.set_notification_preference_impl(
  p_user_id uuid,
  p_key text,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := private.assert_identity_claim(p_user_id);
  v_preferences jsonb;
BEGIN
  IF p_key NOT IN (
    'inapp_likes', 'inapp_comments', 'inapp_follows',
    'inapp_collaboration',
    'email_comments', 'email_follows', 'email_likes', 'email_responses',
    'email_messages', 'email_published', 'email_digest',
    'email_account_security', 'email_profile_reminders',
    'email_announcements',
    'email_review_assigned', 'email_review_started', 'email_review_reminder',
    'email_co_author_invite', 'email_co_author_accepted',
    'email_co_author_declined', 'email_opportunity_inquiry',
    'email_author_publications', 'push_published',
    'push_messages', 'push_comments', 'push_likes', 'push_follows',
    'push_daily_brief', 'push_author_publications'
  ) THEN
    RAISE EXCEPTION 'Unsupported notification preference';
  END IF;

  UPDATE public.profiles
  SET notification_prefs = jsonb_set(
    coalesce(notification_prefs, '{}'::jsonb),
    array[p_key],
    to_jsonb(p_enabled),
    true
  )
  WHERE id = v_user_id
  RETURNING notification_prefs INTO v_preferences;

  -- The original returned NULL here and reported success. A preference switch
  -- that saved nothing and said it did is the silent failure this migration is
  -- about, so it is now an error whichever identity source is in use.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found.' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_preferences;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_notification_preference(
  p_key text,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.set_notification_preference_impl(
    (SELECT auth.uid()), p_key, p_enabled
  );
$$;

-- ===========================================================================
-- Engagement
-- ===========================================================================

CREATE OR REPLACE FUNCTION private.toggle_comment_vote_impl(
  p_user_id uuid,
  p_comment_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := private.assert_identity_claim(p_user_id);
  v_voted boolean;
  v_inserted boolean;
  v_upvotes integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.comments WHERE id = p_comment_id) THEN
    RAISE EXCEPTION 'Comment not found.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.comment_votes
    WHERE user_id = v_user_id
      AND comment_id = p_comment_id
  ) INTO v_voted;

  IF v_voted THEN
    DELETE FROM public.comment_votes
    WHERE user_id = v_user_id
      AND comment_id = p_comment_id;

    UPDATE public.comments
      SET upvotes = greatest(upvotes - 1, 0)
      WHERE id = p_comment_id
      RETURNING upvotes INTO v_upvotes;

    RETURN json_build_object('voted', false, 'upvotes', v_upvotes);
  END IF;

  INSERT INTO public.comment_votes (user_id, comment_id)
  VALUES (v_user_id, p_comment_id)
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_inserted;

  IF NOT coalesce(v_inserted, false) THEN
    SELECT upvotes INTO v_upvotes
    FROM public.comments
    WHERE id = p_comment_id;

    RETURN json_build_object('voted', true, 'upvotes', v_upvotes);
  END IF;

  UPDATE public.comments
    SET upvotes = upvotes + 1
    WHERE id = p_comment_id
    RETURNING upvotes INTO v_upvotes;

  RETURN json_build_object('voted', true, 'upvotes', v_upvotes);
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_comment_vote(p_comment_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.toggle_comment_vote_impl((SELECT auth.uid()), p_comment_id);
$$;

-- ===========================================================================
-- Grants
-- ===========================================================================
-- The public wrappers keep exactly the posture the originals had: never anon,
-- never PUBLIC, executable by authenticated and service_role. They take no
-- user id, so a caller can only ever act as itself.
--
-- The private implementations are granted to nobody. They do not need a grant
-- to be reachable by the wrappers, because a SECURITY DEFINER function runs as
-- its owner. The REVOKEs below are therefore belt and braces, and they are
-- written out so that a later reader can see the intent rather than infer it
-- from a default.

REVOKE ALL ON FUNCTION private.assert_identity_claim(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.get_my_onboarding_state_impl(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.save_onboarding_path_impl(uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.save_onboarding_preferences_impl(uuid, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.save_onboarding_topics_impl(uuid, text[]) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.set_notification_preference_impl(uuid, text, boolean) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.toggle_comment_vote_impl(uuid, uuid) FROM public, anon, authenticated;

-- The public wrappers, unchanged in posture from what they replace.

REVOKE ALL ON FUNCTION public.get_my_onboarding_state() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_onboarding_state() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.save_onboarding_path(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_onboarding_path(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.save_onboarding_preferences(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_onboarding_preferences(text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.save_onboarding_topics(text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_onboarding_topics(text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_notification_preference(text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_notification_preference(text, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.toggle_comment_vote(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.toggle_comment_vote(uuid) TO authenticated, service_role;

COMMIT;

-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
-- Additive. Nothing was dropped and no signature changed, so rolling back is
-- dropping the six overloads and the guard. The original signatures are then
-- wrappers pointing at functions that no longer exist, so restore their bodies
-- from 20260824000001, 20260906000004 and 20260523000004 in the same
-- transaction:
--
--   DROP FUNCTION IF EXISTS private.toggle_comment_vote_impl(uuid, uuid);
--   DROP FUNCTION IF EXISTS private.set_notification_preference_impl(uuid, text, boolean);
--   DROP FUNCTION IF EXISTS private.save_onboarding_topics_impl(uuid, text[]);
--   DROP FUNCTION IF EXISTS private.save_onboarding_preferences_impl(uuid, text, text);
--   DROP FUNCTION IF EXISTS private.save_onboarding_path_impl(uuid, text);
--   DROP FUNCTION IF EXISTS private.get_my_onboarding_state_impl(uuid);
--   DROP FUNCTION IF EXISTS private.assert_identity_claim(uuid);
