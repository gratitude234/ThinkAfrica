-- The explicit-user implementation behind get_my_profile_private().
--
-- ===========================================================================
-- DEPLOYMENT STATUS: NOT APPLIED. ADDITIVE. REVERSIBLE.
-- ===========================================================================
-- Source-controlled only. Creating this file does not prove it has run
-- anywhere. Apply it after 20260909000001, which establishes the same shape
-- for six other identity functions and is the file to read first.
--
-- ===========================================================================
-- WHY
-- ===========================================================================
-- public.get_my_profile_private() is the owner-only projection of a member's
-- private profile: their signup address, notification preferences, privacy
-- settings, suspension state and push-prompt bookkeeping. It selects
--
--     WHERE auth.uid() IS NOT NULL AND p.id = auth.uid()
--
-- which is correct under PostgREST and silently wrong on a direct connection.
-- auth.uid() returns NULL there rather than raising, so the guard passes
-- vacuously, the filter matches no row, and the caller is told the member has
-- no private profile. Nothing errors. That is the failure mode this whole
-- migration exists to remove, and it is worse here than most: the notification
-- bell reads this to decide which notifications a member has muted, so
-- "no row" reads as "mute nothing".
--
-- Six functions got a parameterised form in 20260909000001. This one was
-- missed, and it is the widest of them: it is reachable from the home feed,
-- settings, subscriptions, onboarding and the notification bell.
--
-- ===========================================================================
-- SECURITY MODEL
-- ===========================================================================
-- Identical to 20260909000001, and for the same reason. The explicit-id form
-- is NOT a public overload granted to `authenticated`; it lives in `private`.
--
--   1. PostgREST exposes only `public`, so no request can name it.
--   2. `private` grants USAGE to `postgres` alone, so `anon` and
--      `authenticated` cannot resolve the schema.
--
-- public.get_my_profile_private() keeps its exact signature, its exact
-- projection and its exact behaviour, and becomes a SECURITY DEFINER wrapper
-- that derives the actor from auth.uid(). It takes no user id, so a caller has
-- nothing to forge. Because it is SECURITY DEFINER it reaches the private
-- implementation as its owner, and a caller needs no privilege in `private`.
--
-- The direct-PostgreSQL repositories call the private implementation over a
-- trusted connection, passing the viewer the server resolved.
--
-- ===========================================================================
-- WHAT IS DELIBERATELY UNCHANGED
-- ===========================================================================
-- The projection. All twelve columns, in the same order, with the same types.
-- A parity check compares the two paths column by column, so a change here
-- would show up as a difference rather than as an improvement.
--
-- The null behaviour. A NULL actor returns no row; it does not widen to every
-- profile, and it does not raise. That is what the current function does when
-- auth.uid() is NULL, and the wrapper must keep doing it so an anonymous
-- PostgREST caller sees exactly what it sees today. The private
-- implementation is stricter and raises on NULL, because a trusted server
-- calling with no user id is a bug in the server rather than an anonymous
-- visitor.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- The implementation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.get_my_profile_private_impl(p_user_id uuid)
RETURNS TABLE (
  profile_id uuid,
  signup_email text,
  notification_prefs jsonb,
  privacy_settings jsonb,
  onboarding_completed boolean,
  suspended_at timestamptz,
  suspended_reason text,
  last_engagement_push_notified_at timestamptz,
  last_comment_email_notified_at timestamptz,
  push_prompt_shown_at timestamptz,
  push_prompt_last_shown_at timestamptz,
  push_prompt_attempt_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
ROWS 1
AS $$
  SELECT
    p.id,
    p.signup_email,
    p.notification_prefs,
    p.privacy_settings,
    p.onboarding_completed,
    p.suspended_at,
    p.suspended_reason,
    p.last_engagement_push_notified_at,
    p.last_comment_email_notified_at,
    p.push_prompt_shown_at,
    p.push_prompt_last_shown_at,
    p.push_prompt_attempt_count
  FROM public.profiles AS p
  -- assert_identity_claim raises on a NULL id and, while Supabase Auth is
  -- live, refuses an id that disagrees with auth.uid(). Defence in depth: the
  -- control that actually keeps a browser out is that this schema is
  -- unreachable from PostgREST.
  WHERE p.id = private.assert_identity_claim(p_user_id);
$$;

COMMENT ON FUNCTION private.get_my_profile_private_impl(uuid) IS
  'Owner-only private profile projection, for trusted callers that resolve '
  'the viewer themselves. Not reachable from PostgREST: private is not an '
  'exposed schema and grants USAGE to postgres alone.';

-- ---------------------------------------------------------------------------
-- The public wrapper, unchanged in signature and in behaviour
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_profile_private()
RETURNS TABLE (
  profile_id uuid,
  signup_email text,
  notification_prefs jsonb,
  privacy_settings jsonb,
  onboarding_completed boolean,
  suspended_at timestamptz,
  suspended_reason text,
  last_engagement_push_notified_at timestamptz,
  last_comment_email_notified_at timestamptz,
  push_prompt_shown_at timestamptz,
  push_prompt_last_shown_at timestamptz,
  push_prompt_attempt_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
ROWS 1
AS $$
  -- No row for an anonymous caller, exactly as before: the implementation
  -- would raise on a NULL id, so the guard stays here rather than becoming an
  -- error a signed-out visitor could see.
  SELECT *
  FROM private.get_my_profile_private_impl((SELECT auth.uid()))
  WHERE (SELECT auth.uid()) IS NOT NULL;
$$;

COMMENT ON FUNCTION public.get_my_profile_private() IS
  'Owner-only EXPAND RPC for private profile data. Returns no row without '
  'auth.uid(). The projection now lives in '
  'private.get_my_profile_private_impl(uuid); this signature and its '
  'behaviour are unchanged.';

-- ===========================================================================
-- Grants
-- ===========================================================================
-- The wrapper keeps the posture the original had. The implementation is
-- granted to nobody: a SECURITY DEFINER wrapper reaches it as its owner, so no
-- grant is needed for the application to work, and the REVOKE is written out
-- so the intent is visible rather than inferred from a default.

REVOKE ALL ON FUNCTION private.get_my_profile_private_impl(uuid)
  FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_my_profile_private() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile_private()
  TO authenticated, service_role;

COMMIT;

-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
-- Additive apart from the wrapper body, which is a CREATE OR REPLACE of an
-- existing signature. To roll back, restore the original body and drop the
-- implementation in one transaction:
--
--   CREATE OR REPLACE FUNCTION public.get_my_profile_private()
--   RETURNS TABLE (...)  -- the twelve columns above
--   LANGUAGE sql STABLE SECURITY DEFINER
--   SET search_path TO 'pg_catalog', 'public'
--   ROWS 1
--   AS $$
--     SELECT p.id, p.signup_email, p.notification_prefs, p.privacy_settings,
--            p.onboarding_completed, p.suspended_at, p.suspended_reason,
--            p.last_engagement_push_notified_at,
--            p.last_comment_email_notified_at, p.push_prompt_shown_at,
--            p.push_prompt_last_shown_at, p.push_prompt_attempt_count
--     FROM public.profiles AS p
--     WHERE auth.uid() IS NOT NULL AND p.id = auth.uid();
--   $$;
--
--   DROP FUNCTION IF EXISTS private.get_my_profile_private_impl(uuid);
