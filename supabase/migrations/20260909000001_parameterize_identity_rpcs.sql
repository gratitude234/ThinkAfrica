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
-- For each function this file creates an OVERLOAD taking p_user_id as its
-- first argument and moves the body there. The original signature is then
-- redefined as a one-line wrapper that calls the new one with auth.uid().
--
--   * Every existing caller keeps working, unchanged, against the same name
--     and the same argument names. PostgREST resolves an overload by the set
--     of argument names in the request body, so `{p_key, p_enabled}` still
--     reaches the old signature and `{p_user_id, p_key, p_enabled}` reaches
--     the new one.
--   * The logic exists once. A wrapper cannot drift from the body it calls.
--   * At the Better Auth cutover the wrappers are dropped in a later
--     migration and only the parameterised functions remain.
--
-- ===========================================================================
-- THE TRANSITIONAL GUARD
-- ===========================================================================
-- The parameterised functions are SECURITY DEFINER and are granted to
-- `authenticated`, because that is the role the application's server actions
-- run as today. That means a caller could in principle pass someone else's id.
--
-- So while Supabase Auth is live, each one refuses a p_user_id that disagrees
-- with auth.uid(). service_role and other callers with no JWT (auth.uid() IS
-- NULL) are exempt: a trusted server is the caller the parameter exists for.
--
-- assert_identity_claim() is that check, in one place. It is removed by the
-- cutover migration, at which point the grant narrows to the application role
-- and the server is the only thing that can reach these at all.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- The shared guard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_identity_claim(p_user_id uuid)
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

COMMENT ON FUNCTION public.assert_identity_claim(uuid) IS
  'Transitional. While Supabase Auth is live, refuses a p_user_id that '
  'disagrees with auth.uid(); a caller with no JWT (service_role, or a direct '
  'connection) is trusted and the parameter wins. Removed at the Better Auth '
  'cutover, when the grant narrows to the application role.';

-- ===========================================================================
-- Onboarding
-- ===========================================================================

-- --- get_my_onboarding_state -----------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_onboarding_state(p_user_id uuid)
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
  WHERE preference.user_id = public.assert_identity_claim(p_user_id);
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
  SELECT * FROM public.get_my_onboarding_state((SELECT auth.uid()));
$$;

-- --- save_onboarding_path --------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_onboarding_path(
  p_user_id uuid,
  p_current_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := public.assert_identity_claim(p_user_id);
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
  SELECT public.save_onboarding_path((SELECT auth.uid()), p_current_path);
$$;

-- --- save_onboarding_preferences -------------------------------------------

CREATE OR REPLACE FUNCTION public.save_onboarding_preferences(
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
  v_user_id uuid := public.assert_identity_claim(p_user_id);
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
  SELECT public.save_onboarding_preferences(
    (SELECT auth.uid()), p_current_path, p_work_category
  );
$$;

-- --- save_onboarding_topics ------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_onboarding_topics(
  p_user_id uuid,
  p_interests text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := public.assert_identity_claim(p_user_id);
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
  SELECT public.save_onboarding_topics((SELECT auth.uid()), p_interests);
$$;

-- ===========================================================================
-- Notifications
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.set_notification_preference(
  p_user_id uuid,
  p_key text,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := public.assert_identity_claim(p_user_id);
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
SET search_path = public
AS $$
  SELECT public.set_notification_preference(
    (SELECT auth.uid()), p_key, p_enabled
  );
$$;

-- ===========================================================================
-- Engagement
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.toggle_comment_vote(
  p_user_id uuid,
  p_comment_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := public.assert_identity_claim(p_user_id);
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
SET search_path = public
AS $$
  SELECT public.toggle_comment_vote((SELECT auth.uid()), p_comment_id);
$$;

-- ===========================================================================
-- Grants
-- ===========================================================================
-- Same posture as the originals: never anon, never PUBLIC. `authenticated` is
-- the role the application's server actions run as today, and
-- assert_identity_claim() is what stops that role naming someone else.
--
-- At the Better Auth cutover these grants narrow to the application role, the
-- wrappers are dropped, and assert_identity_claim() goes with them.

REVOKE ALL ON FUNCTION public.assert_identity_claim(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assert_identity_claim(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_my_onboarding_state(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_onboarding_state(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.save_onboarding_path(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_onboarding_path(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.save_onboarding_preferences(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_onboarding_preferences(uuid, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.save_onboarding_topics(uuid, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_onboarding_topics(uuid, text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_notification_preference(uuid, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_notification_preference(uuid, text, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.toggle_comment_vote(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.toggle_comment_vote(uuid, uuid) TO authenticated, service_role;

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
--   DROP FUNCTION IF EXISTS public.toggle_comment_vote(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.set_notification_preference(uuid, text, boolean);
--   DROP FUNCTION IF EXISTS public.save_onboarding_topics(uuid, text[]);
--   DROP FUNCTION IF EXISTS public.save_onboarding_preferences(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.save_onboarding_path(uuid, text);
--   DROP FUNCTION IF EXISTS public.get_my_onboarding_state(uuid);
--   DROP FUNCTION IF EXISTS public.assert_identity_claim(uuid);
