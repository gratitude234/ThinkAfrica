BEGIN;

-- Intellectual focus: an author's own answer to "what subjects, problems or
-- questions are you trying to understand?".
--
-- Public and optional. It is a positioning statement rather than a job title:
-- professional_title already carries the role, and the two are deliberately
-- separate fields so a policy analyst can say what they are analysing without
-- overwriting what they are.
--
-- DEPLOYMENT STATUS
-- -----------------
-- Source-controlled only. Creating this file does not prove it has run.
-- Preflight, in this order:
--   1. Confirm 20260815000001_profile_security_hardening.sql is applied, and
--      capture the current definition of
--      protect_profile_privileged_columns() before replacing it below.
--   2. Confirm public.profiles has no existing positioning_statement column
--      with a conflicting type.
--   3. In staging, exercise: saving the field from settings, saving it empty,
--      saving 180 characters, rejecting 181, an anonymous read of a public
--      profile, and a direct authenticated attempt to write a system column
--      (which must still be rejected).
--
-- Rollback policy matches the hardening migration: ship a forward migration
-- rather than editing this one. Restoring broad authenticated UPDATE is not
-- an acceptable rollback.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS positioning_statement text;

-- 180 characters, mirrored by POSITIONING_STATEMENT_MAX_LENGTH in
-- lib/profileIdentity.ts. The UI counter is a courtesy; this is the boundary.
-- An all-whitespace value is rejected too, so "present" and "meaningful" are
-- the same question for every reader of this column.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_positioning_statement_length;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_positioning_statement_length
  CHECK (
    positioning_statement IS NULL
    OR (
      char_length(positioning_statement) <= 180
      AND btrim(positioning_statement) <> ''
    )
  );

COMMENT ON COLUMN public.profiles.positioning_statement IS
  'Public, optional. One sentence on the subjects, problems, or questions this author is trying to understand. Not a professional title and not a platform-assigned label.';

-- ==========================================================================
-- Direct-edit contract
-- ==========================================================================

-- The author owns this field, so it joins the reviewed edit allowlist. RLS
-- from the hardening migration still restricts the row to its owner; this
-- grant only opens the column.
GRANT UPDATE (positioning_statement) ON TABLE public.profiles TO authenticated;

-- The default-deny trigger protects every column not named here, so the new
-- column has to be added to the array as well as granted. Both layers, not
-- one: the grant is the enforcement and the trigger is the backstop if a
-- later migration accidentally restores broad UPDATE.
--
-- This is a full replacement of the function as of 20260815000001 with one
-- entry added. Verify the captured definition from preflight step 1 matches
-- before applying.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_directly_editable_columns CONSTANT text[] := ARRAY[
    'username',
    'full_name',
    'country',
    'university',
    'field_of_study',
    'profile_type',
    'secondary_profile_types',
    'organization_name',
    'professional_title',
    'organization_website',
    'bio',
    'positioning_statement',
    'avatar_url',
    'cover_image_url',
    'interests',
    'graduation_year',
    'open_to_mentoring',
    'onboarding_completed',
    'notification_prefs',
    'privacy_settings'
  ]::text[];
BEGIN
  IF auth.role() = 'authenticated' AND current_user = 'authenticated' THEN
    IF (to_jsonb(NEW) - v_directly_editable_columns)
       IS DISTINCT FROM
       (to_jsonb(OLD) - v_directly_editable_columns)
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'System-managed profile fields cannot be changed directly.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_profile_privileged_columns() IS
  'Default-deny guard: direct authenticated table updates may change only the audited profile-edit allowlist, which now includes positioning_statement. SECURITY DEFINER and service-role writes remain available for points, alumni, verification, and moderation.';

-- ==========================================================================
-- Public projection
-- ==========================================================================

-- The directory view lists reviewed public fields one at a time, so a new
-- public field is invisible to it until named. Private onboarding path and
-- work category stay out, as does every private preference column.
--
-- positioning_statement is appended rather than placed next to bio where it
-- belongs by meaning. CREATE OR REPLACE VIEW can only add columns at the end:
-- inserting one mid-list makes PostgreSQL read every following column as a
-- rename and fail with 42P16 ("cannot change name of view column"). Dropping
-- the view instead would take its grants with it. Consumers select by name,
-- so position carries nothing.
CREATE OR REPLACE VIEW public.profile_directory
WITH (security_barrier = true)
AS
SELECT
  p.id,
  p.username,
  p.full_name,
  p.country,
  p.university,
  p.field_of_study,
  p.profile_type,
  p.secondary_profile_types,
  p.organization_name,
  p.professional_title,
  p.organization_website,
  p.bio,
  p.avatar_url,
  p.cover_image_url,
  p.interests,
  p.graduation_year,
  p.open_to_mentoring,
  p.is_alumni,
  p.verified,
  p.verified_type,
  p.role,
  p.points,
  p.created_at,
  p.positioning_statement
FROM public.profiles AS p
WHERE p.username IS NOT NULL
  AND p.suspended_at IS NULL
  AND public.is_profile_listed_in_directory(p.id, p.privacy_settings);

REVOKE ALL ON TABLE public.profile_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profile_directory
  TO anon, authenticated, service_role;

COMMIT;

-- Post-apply verification (staging first): confirm the CHECK constraint in
-- pg_constraint, positioning_statement in role_column_grants for
-- authenticated UPDATE, the column present in the profile_directory
-- definition, and pg_get_functiondef for
-- protect_profile_privileged_columns() carrying exactly one new array entry.
-- supabase/pending/profile_private_projection_contract.sql has been updated
-- to keep this column selectable when that CONTRACT candidate is promoted.
