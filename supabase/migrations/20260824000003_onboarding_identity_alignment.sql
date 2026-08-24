-- Aligns the identity step with the recommendation signals that read it.
--
-- The first cut wrote profile_type = 'professional' for every non-student, which
-- broke two things. Settings re-derives the private work category from
-- profile_type on save, so a policy or media user was silently rewritten to
-- business_technology. And suggestedPeople matches candidates by profile_type,
-- so three of the five categories matched nobody while business_technology
-- matched every non-student. Writing the category's own profile type fixes both:
-- the mapping now round-trips, and each category has real candidates to match.
--
-- It also stops the identity step clearing fields it never collects. Onboarding
-- owns the two identity branches, not the whole profile.

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_country text := NULLIF(regexp_replace(btrim(p_country), '\s+', ' ', 'g'), '');
  v_university text := NULLIF(regexp_replace(btrim(p_university), '\s+', ' ', 'g'), '');
  v_field text := NULLIF(regexp_replace(btrim(p_field_of_study), '\s+', ' ', 'g'), '');
  v_headline text := NULLIF(regexp_replace(btrim(p_professional_title), '\s+', ' ', 'g'), '');
  v_organization text := NULLIF(regexp_replace(btrim(p_organization_name), '\s+', ' ', 'g'), '');
  v_profile_type text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

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

-- Repairs the cohort the first cut flattened. A row that still holds a
-- non-business category alongside profile_type = 'professional' has not been
-- through a settings save, because that save rewrote the category to
-- business_technology. So every row matched here was written by onboarding.
UPDATE public.profiles AS profile
SET profile_type = CASE preference.work_category
  WHEN 'research_education' THEN 'researcher'
  WHEN 'policy_community' THEN 'policy_government'
  WHEN 'media_creative' THEN 'journalist_media'
  WHEN 'independent' THEN 'other'
END
FROM public.user_onboarding_preferences AS preference
WHERE preference.user_id = profile.id
  AND preference.current_path = 'non_student'
  AND profile.profile_type = 'professional'
  AND preference.work_category IN (
    'research_education',
    'policy_community',
    'media_creative',
    'independent'
  );

REVOKE ALL ON FUNCTION public.save_onboarding_identity(
  text, text, text, text, text, integer, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_onboarding_identity(
  text, text, text, text, text, integer, text, text
) TO authenticated;
