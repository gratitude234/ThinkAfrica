-- Identity-first onboarding. Student status and broad work categories shape
-- the starting experience only; publishing permissions remain identical.

CREATE TABLE IF NOT EXISTS public.user_onboarding_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_path text NOT NULL CHECK (current_path IN ('student', 'non_student')),
  work_category text CHECK (
    work_category IS NULL OR work_category IN (
      'research_education',
      'business_technology',
      'policy_community',
      'media_creative',
      'independent'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (current_path <> 'student' OR work_category IS NULL)
);

ALTER TABLE public.user_onboarding_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_onboarding_preferences
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_onboarding_preferences
  TO authenticated;
GRANT ALL ON TABLE public.user_onboarding_preferences TO service_role;

DROP POLICY IF EXISTS "Users read their onboarding preferences"
  ON public.user_onboarding_preferences;
CREATE POLICY "Users read their onboarding preferences"
ON public.user_onboarding_preferences
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users create their onboarding preferences"
  ON public.user_onboarding_preferences;
CREATE POLICY "Users create their onboarding preferences"
ON public.user_onboarding_preferences
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users update their onboarding preferences"
  ON public.user_onboarding_preferences;
CREATE POLICY "Users update their onboarding preferences"
ON public.user_onboarding_preferences
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Resume incomplete legacy accounts without backfilling completed profiles.
INSERT INTO public.user_onboarding_preferences (
  user_id,
  current_path,
  work_category
)
SELECT
  profile.id,
  CASE WHEN profile.profile_type = 'student' THEN 'student' ELSE 'non_student' END,
  CASE profile.profile_type
    WHEN 'student' THEN NULL
    WHEN 'researcher' THEN 'research_education'
    WHEN 'educator' THEN 'research_education'
    WHEN 'ngo_nonprofit' THEN 'policy_community'
    WHEN 'founder' THEN 'business_technology'
    WHEN 'policy_government' THEN 'policy_community'
    WHEN 'journalist_media' THEN 'media_creative'
    WHEN 'professional' THEN 'business_technology'
    WHEN 'other' THEN 'independent'
    ELSE NULL
  END
FROM public.profiles AS profile
WHERE COALESCE(profile.onboarding_completed, false) = false
  AND profile.profile_type IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

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
  SELECT
    preference.current_path,
    preference.work_category,
    preference.updated_at
  FROM public.user_onboarding_preferences AS preference
  WHERE preference.user_id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.save_onboarding_path(p_current_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

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

CREATE OR REPLACE FUNCTION public.save_onboarding_preferences(
  p_current_path text,
  p_work_category text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

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

    UPDATE public.profiles
    SET profile_type = 'student',
        secondary_profile_types = '{}'::text[],
        country = v_country,
        university = v_university,
        field_of_study = v_field,
        graduation_year = p_graduation_year,
        professional_title = NULL,
        organization_name = NULL,
        organization_website = NULL
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

    UPDATE public.profiles
    SET profile_type = 'professional',
        secondary_profile_types = '{}'::text[],
        country = v_country,
        university = NULL,
        field_of_study = NULL,
        graduation_year = NULL,
        professional_title = v_headline,
        organization_name = v_organization,
        organization_website = NULL
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

CREATE OR REPLACE FUNCTION public.save_onboarding_topics(p_interests text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_onboarding()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

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

REVOKE ALL ON FUNCTION public.get_my_onboarding_state() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_onboarding_path(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_onboarding_preferences(text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_onboarding_identity(
  text, text, text, text, text, integer, text, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_onboarding_topics(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_onboarding() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_onboarding_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_onboarding_path(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_onboarding_preferences(text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_onboarding_identity(
  text, text, text, text, text, integer, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_onboarding_topics(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_onboarding() TO authenticated;

COMMENT ON TABLE public.user_onboarding_preferences IS
  'Owner-only onboarding context used for starting recommendations. It is not a public identity or authorization source.';
