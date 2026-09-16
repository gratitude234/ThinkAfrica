-- Parameterised identity for the three deferred auth.uid() RPCs.
--
-- ===========================================================================
-- DEPLOYMENT STATUS: NOT APPLIED. ADDITIVE. REVERSIBLE.
-- ===========================================================================
-- Source-controlled only. Creating this file does not prove it has run
-- anywhere. Nothing in the application calls the new signatures yet; the
-- rollout is deliberately separate from writing the SQL. See
-- docs/rpc-identity-migration.md.
--
-- ===========================================================================
-- WHY THESE THREE WERE DEFERRED, AND WHAT CHANGED
-- ===========================================================================
-- 20260909000001 parameterised six of the 22 application-called functions and
-- deferred sixteen. Three of those deferrals had specific, answerable reasons,
-- and this file exists because the answers were obtained rather than guessed.
--
--   save_onboarding_identity  Redefined twice, by 20260824000001 and then by
--                             20260824000003. Which one is live cannot be read
--                             off the files.
--   complete_onboarding       Redefined by 20260815000002 and 20260824000001.
--                             Same problem, and it is the most consequential
--                             function in the signup flow.
--   withdraw_post_submission  Interacts with guard_locked_post_write(), which
--                             tells a direct authenticated write apart from a
--                             SECURITY DEFINER one by comparing current_user.
--                             A wrapper adds a call frame, and whether that
--                             changes the comparison is a question about
--                             PostgreSQL, not about this codebase.
--
-- All three were resolved before this file was written:
--
--   1. The live definitions were read out of pg_catalog with
--      scripts/migration/read-function-defs.mjs and compared against every
--      candidate in supabase/ with compare-function-defs.mjs. The bodies below
--      are ports of what is RUNNING, not of what a migration file says.
--
--        save_onboarding_identity  live = 20260824000003
--        complete_onboarding       live = 20260824000001
--        withdraw_post_submission  live = 20260720000001
--
--      Note the third. The LATER file (20260722000001) is the stale one, so
--      "the most recent migration wins" would have ported the wrong body. This
--      is exactly the failure the deferral existed to prevent.
--
--   2. scripts/migration/test-security-definer-frames.mjs answered the
--      current_user question empirically, against a database, with an owner
--      distinct from the caller so the probe can actually discriminate:
--
--        at the top level                    neondb_owner
--        inside a SECURITY DEFINER function  frame_probe_owner
--        through a SECURITY DEFINER wrapper  frame_probe_owner
--        through a plain wrapper             frame_probe_owner
--
--      A wrapper frame does not change what the inner function reads. So
--      withdraw_post_submission() keeps bypassing guard_locked_post_write()
--      exactly as it does today, whether it is called directly or through the
--      parameterised overload.
--
-- ===========================================================================
-- SHAPE
-- ===========================================================================
-- Identical to 20260909000001: an OVERLOAD taking p_user_id first, carrying
-- the body, and the original signature redefined as a one-line wrapper calling
-- it with auth.uid(). Existing callers are untouched, the logic exists once,
-- and the wrappers are dropped at the Better Auth cutover.
--
-- assert_identity_claim() comes from 20260909000001 and is a hard dependency:
-- apply that file first.
--
-- ===========================================================================
-- SOMETHING THIS FILE DOES NOT FIX
-- ===========================================================================
-- While reading the catalogue for withdraw_post_submission, the live
-- guard_locked_post_write() turned out to match NEITHER version in supabase/.
-- It is missing three checks that 20260720000001 defines, and they exist
-- nowhere else in the database:
--
--   'A submission awaiting review or in revision cannot change its classification.'
--   'A submission awaiting review can only be changed by the editorial decision workflow.'
--   'A submission in revision can only stay in revision or be resubmitted for review.'
--
-- That is a production/repository divergence, not a migration problem, and
-- restoring it is a separate decision with its own migration. It is recorded
-- in docs/rpc-identity-migration.md so that it is not discovered a third time.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ===========================================================================
-- Onboarding
-- ===========================================================================

-- --- save_onboarding_identity ----------------------------------------------
-- Body ported verbatim from the live definition (= 20260824000003), with
-- auth.uid() replaced by the guarded parameter and nothing else changed.

CREATE OR REPLACE FUNCTION public.save_onboarding_identity(
  p_user_id uuid,
  p_current_path text,
  p_work_category text,
  p_country text,
  p_university text,
  p_field_of_study text,
  p_graduation_year integer,
  p_professional_title text,
  p_organization_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := public.assert_identity_claim(p_user_id);
  v_country text := NULLIF(regexp_replace(btrim(p_country), '\s+', ' ', 'g'), '');
  v_university text := NULLIF(regexp_replace(btrim(p_university), '\s+', ' ', 'g'), '');
  v_field text := NULLIF(regexp_replace(btrim(p_field_of_study), '\s+', ' ', 'g'), '');
  v_headline text := NULLIF(regexp_replace(btrim(p_professional_title), '\s+', ' ', 'g'), '');
  v_organization text := NULLIF(regexp_replace(btrim(p_organization_name), '\s+', ' ', 'g'), '');
  v_profile_type text;
BEGIN
  IF p_current_path NOT IN ('student', 'non_student') OR v_country IS NULL THEN
    RAISE EXCEPTION 'Complete the required identity fields.' USING ERRCODE = '23514';
  END IF;

  IF p_graduation_year IS NOT NULL
    AND (p_graduation_year < 1900 OR p_graduation_year > 2200) THEN
    RAISE EXCEPTION 'Choose a valid graduation year.' USING ERRCODE = '23514';
  END IF;

  IF p_current_path = 'student' THEN
    IF v_university IS NULL OR v_field IS NULL THEN
      RAISE EXCEPTION 'Add your school and field of study.' USING ERRCODE = '23514';
    END IF;

    -- Only the other branch's own fields are cleared, so switching paths cannot
    -- leave a contradictory identity. secondary_profile_types and
    -- organization_website belong to settings and are left untouched.
    UPDATE public.profiles
    SET profile_type = 'student',
        country = v_country,
        university = v_university,
        field_of_study = v_field,
        graduation_year = p_graduation_year,
        professional_title = NULL,
        organization_name = NULL
    WHERE id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profile not found.' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.user_onboarding_preferences (
      user_id, current_path, work_category, updated_at
    ) VALUES (
      v_user_id, 'student', NULL, now()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET current_path = 'student',
        work_category = NULL,
        updated_at = now();
  ELSE
    IF p_work_category IS NULL OR p_work_category NOT IN (
      'research_education',
      'business_technology',
      'policy_community',
      'media_creative',
      'independent'
    ) OR v_headline IS NULL THEN
      RAISE EXCEPTION 'Choose your work area and add a professional headline.'
        USING ERRCODE = '23514';
    END IF;

    -- Mirrors CATEGORY_PRIMARY_PROFILE_TYPE in lib/onboarding.ts. Each value
    -- derives back to the same category in deriveLegacyOnboardingPreference.
    v_profile_type := CASE p_work_category
      WHEN 'research_education' THEN 'researcher'
      WHEN 'business_technology' THEN 'professional'
      WHEN 'policy_community' THEN 'policy_government'
      WHEN 'media_creative' THEN 'journalist_media'
      WHEN 'independent' THEN 'other'
    END;

    UPDATE public.profiles
    SET profile_type = v_profile_type,
        country = v_country,
        university = NULL,
        field_of_study = NULL,
        graduation_year = NULL,
        professional_title = v_headline,
        organization_name = v_organization
    WHERE id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profile not found.' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.user_onboarding_preferences (
      user_id, current_path, work_category, updated_at
    ) VALUES (
      v_user_id, 'non_student', p_work_category, now()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET current_path = 'non_student',
        work_category = EXCLUDED.work_category,
        updated_at = now();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_onboarding_identity(
  p_current_path text,
  p_work_category text,
  p_country text,
  p_university text,
  p_field_of_study text,
  p_graduation_year integer,
  p_professional_title text,
  p_organization_name text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.save_onboarding_identity(
    (SELECT auth.uid()),
    p_current_path,
    p_work_category,
    p_country,
    p_university,
    p_field_of_study,
    p_graduation_year,
    p_professional_title,
    p_organization_name
  );
$$;

-- --- complete_onboarding ---------------------------------------------------
-- Body ported verbatim from the live definition (= 20260824000001).
--
-- The two FOR UPDATE locks are load-bearing and are kept in the same order.
-- They are what stops two concurrent completions from writing two
-- 'onboarding_completed' activation events for one member, which would corrupt
-- the measurement this function exists to produce.

CREATE OR REPLACE FUNCTION public.complete_onboarding(p_user_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := public.assert_identity_claim(p_user_id);
  v_completed_at timestamptz;
  v_created_at timestamptz;
  v_onboarding_completed boolean;
  v_path text;
  v_work_category text;
  v_country text;
  v_university text;
  v_field_of_study text;
  v_professional_title text;
  v_interests text[];
BEGIN
  SELECT
    profile.onboarding_completed,
    profile.onboarding_completed_at,
    profile.created_at,
    profile.country,
    profile.university,
    profile.field_of_study,
    profile.professional_title,
    profile.interests
  INTO
    v_onboarding_completed,
    v_completed_at,
    v_created_at,
    v_country,
    v_university,
    v_field_of_study,
    v_professional_title,
    v_interests
  FROM public.profiles AS profile
  WHERE profile.id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found.' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(v_onboarding_completed, false) THEN
    RETURN COALESCE(v_completed_at, v_created_at);
  END IF;

  SELECT preference.current_path, preference.work_category
  INTO v_path, v_work_category
  FROM public.user_onboarding_preferences AS preference
  WHERE preference.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND
    OR NULLIF(btrim(v_country), '') IS NULL
    OR COALESCE(cardinality(v_interests), 0) NOT BETWEEN 3 AND 5
    OR (SELECT count(DISTINCT interest) FROM unnest(v_interests) AS interest)
      <> cardinality(v_interests)
    OR (
      v_path = 'student'
      AND (
        NULLIF(btrim(v_university), '') IS NULL
        OR NULLIF(btrim(v_field_of_study), '') IS NULL
      )
    )
    OR (
      v_path = 'non_student'
      AND (
        v_work_category IS NULL
        OR NULLIF(btrim(v_professional_title), '') IS NULL
      )
    ) THEN
    RAISE EXCEPTION 'Complete the required onboarding fields first.'
      USING ERRCODE = '23514';
  END IF;

  v_completed_at := statement_timestamp();

  UPDATE public.profiles
  SET onboarding_completed = true,
      onboarding_completed_at = v_completed_at
  WHERE id = v_user_id;

  INSERT INTO public.activation_events (
    user_id,
    event_name,
    metadata,
    source,
    route,
    created_at
  ) VALUES (
    v_user_id,
    'onboarding_completed',
    jsonb_build_object(
      'measurement_version', 2,
      'current_path', v_path,
      'work_category', v_work_category
    ),
    'complete_onboarding_rpc',
    '/onboarding',
    v_completed_at
  );

  RETURN v_completed_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_onboarding()
RETURNS timestamptz
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.complete_onboarding((SELECT auth.uid()));
$$;

-- ===========================================================================
-- Editorial workflow
-- ===========================================================================

-- --- withdraw_post_submission ----------------------------------------------
-- Body ported verbatim from the live definition (= 20260720000001, NOT the
-- later 20260722000001, which is stale; see the header).
--
-- The UPDATE's WHERE clause is the authorization, and that is not an oversight
-- to be corrected here. guard_locked_post_write() bypasses every check inside
-- a SECURITY DEFINER function, deliberately, so this clause is the sole gate
-- on this path. It is left exactly as it is because changing the shape of the
-- only gate and the identity mechanism in one migration is how a regression
-- gets attributed to the wrong change.
--
-- What that clause DOES need, on Neon, is different and is not this file's
-- job: see docs/rpc-identity-migration.md on why an affected-row check has to
-- exist in the application once RLS and the guard are both inert.

CREATE OR REPLACE FUNCTION public.withdraw_post_submission(
  p_user_id uuid,
  target_post_id uuid
)
RETURNS public.posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := public.assert_identity_claim(p_user_id);
  updated_post public.posts;
BEGIN
  UPDATE public.posts
  SET status = 'withdrawn'
  WHERE id = target_post_id
    AND author_id = v_user_id
    AND type IN ('research', 'policy_brief')
    AND status IN ('pending', 'pending_revision')
  RETURNING * INTO updated_post;

  IF updated_post.id IS NULL THEN
    RAISE EXCEPTION 'Only a submission awaiting or in revision can be withdrawn.';
  END IF;

  UPDATE public.post_reviews
  SET removed_at = now()
  WHERE post_id = target_post_id
    AND removed_at IS NULL;

  RETURN updated_post;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_post_submission(target_post_id uuid)
RETURNS public.posts
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.withdraw_post_submission((SELECT auth.uid()), target_post_id);
$$;

-- ===========================================================================
-- Grants
-- ===========================================================================
-- Same posture as the originals and as 20260909000001: never anon, never
-- PUBLIC. assert_identity_claim() is what stops `authenticated` naming
-- somebody else.

REVOKE ALL ON FUNCTION public.save_onboarding_identity(
  uuid, text, text, text, text, text, integer, text, text
) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_onboarding_identity(
  uuid, text, text, text, text, text, integer, text, text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.complete_onboarding(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.withdraw_post_submission(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_post_submission(uuid, uuid) TO authenticated, service_role;

COMMIT;

-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
-- Additive. Nothing was dropped and no signature changed, so rolling back is
-- dropping the three overloads. The original signatures then point at
-- functions that no longer exist, so restore their bodies in the same
-- transaction from the definitions this file was ported from -- which are the
-- CATALOGUE copies, not the migration files:
--
--   node scripts/migration/read-function-defs.mjs \
--     save_onboarding_identity complete_onboarding withdraw_post_submission
--
--   DROP FUNCTION IF EXISTS public.withdraw_post_submission(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.complete_onboarding(uuid);
--   DROP FUNCTION IF EXISTS public.save_onboarding_identity(
--     uuid, text, text, text, text, text, integer, text, text);
