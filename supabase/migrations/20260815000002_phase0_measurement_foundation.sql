BEGIN;

-- Phase 0 measurement foundation
--
-- This migration deliberately keeps the baseline on durable product facts:
-- profiles for account creation/onboarding, posts for publications and
-- completed response posts, and one authenticated activity row per UTC day.
-- activation_events remains useful for diagnostics, but is not authoritative
-- enough to define the ordered funnel.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Preserve the only trustworthy historical timestamp available. Profiles that
-- were marked complete without an attributable event remain NULL instead of
-- receiving an invented completion time; the baseline reports that gap.
WITH first_completion AS (
  SELECT user_id, min(created_at) AS completed_at
  FROM public.activation_events
  WHERE event_name = 'onboarding_completed'
    AND user_id IS NOT NULL
  GROUP BY user_id
)
UPDATE public.profiles AS profile
SET onboarding_completed_at = greatest(profile.created_at, first_completion.completed_at)
FROM first_completion
WHERE profile.id = first_completion.user_id
  AND profile.onboarding_completed = true
  AND profile.onboarding_completed_at IS NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_onboarding_completion_consistency;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_onboarding_completion_consistency
  CHECK (onboarding_completed_at IS NULL OR onboarding_completed = true);

CREATE OR REPLACE FUNCTION public.guard_onboarding_measurement_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- SECURITY DEFINER changes current_user to the function owner without
  -- changing auth.role(). Requiring both values therefore rejects direct
  -- PostgREST writes while allowing complete_onboarding() below.
  IF auth.role() = 'authenticated' AND current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      IF coalesce(NEW.onboarding_completed, false)
        OR NEW.onboarding_completed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Onboarding completion must use complete_onboarding().'
          USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.onboarding_completed IS DISTINCT FROM OLD.onboarding_completed
      OR NEW.onboarding_completed_at IS DISTINCT FROM OLD.onboarding_completed_at THEN
      RAISE EXCEPTION 'Onboarding completion must use complete_onboarding().'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_onboarding_measurement_fields() FROM PUBLIC;

DROP TRIGGER IF EXISTS profiles_guard_onboarding_measurement_fields
  ON public.profiles;
CREATE TRIGGER profiles_guard_onboarding_measurement_fields
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_onboarding_measurement_fields();

CREATE OR REPLACE FUNCTION public.complete_onboarding()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_completed_at timestamptz;
  v_was_timestamped boolean;
  v_profile_type text;
  v_country text;
  v_university text;
  v_field_of_study text;
  v_interests text[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT
    onboarding_completed_at IS NOT NULL,
    onboarding_completed_at,
    profile_type,
    country,
    university,
    field_of_study,
    interests
    INTO
      v_was_timestamped,
      v_completed_at,
      v_profile_type,
      v_country,
      v_university,
      v_field_of_study,
      v_interests
  FROM public.profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_profile_type IS NULL
    OR nullif(btrim(v_country), '') IS NULL
    OR coalesce(cardinality(v_interests), 0) < 1
    OR (
      v_profile_type IN ('student', 'researcher', 'educator')
      AND (
        nullif(btrim(v_university), '') IS NULL
        OR nullif(btrim(v_field_of_study), '') IS NULL
      )
    ) THEN
    RAISE EXCEPTION 'Complete the required onboarding fields first.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT v_was_timestamped THEN
    v_completed_at := statement_timestamp();

    UPDATE public.profiles
    SET onboarding_completed = true,
        onboarding_completed_at = v_completed_at
    WHERE id = v_user_id;

    -- This event is now transactionally tied to the durable profile milestone.
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
      jsonb_build_object('measurement_version', 1),
      'complete_onboarding_rpc',
      '/onboarding',
      v_completed_at
    );
  END IF;

  RETURN v_completed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_onboarding() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_onboarding() FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_onboarding() TO authenticated;

COMMENT ON FUNCTION public.complete_onboarding() IS
  'Atomically marks the authenticated caller onboarding-complete, preserves the first completion timestamp, and emits one matching activation event.';

CREATE TABLE IF NOT EXISTS public.user_activity_days (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, activity_date),
  CONSTRAINT user_activity_days_timestamp_matches_date
    CHECK ((first_seen_at AT TIME ZONE 'UTC')::date = activity_date)
);

COMMENT ON TABLE public.user_activity_days IS
  'One idempotent authenticated activity fact per user and UTC calendar day. Used for cohort retention; never accepts client-supplied identities or dates.';

CREATE INDEX IF NOT EXISTS user_activity_days_date_user_idx
  ON public.user_activity_days (activity_date, user_id);

ALTER TABLE public.user_activity_days ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_activity_days FROM PUBLIC;
REVOKE ALL ON TABLE public.user_activity_days FROM anon;
REVOKE ALL ON TABLE public.user_activity_days FROM authenticated;
GRANT SELECT ON TABLE public.user_activity_days TO authenticated;
GRANT ALL ON TABLE public.user_activity_days TO service_role;

DROP POLICY IF EXISTS "Users can read own activity days" ON public.user_activity_days;
CREATE POLICY "Users can read own activity days"
  ON public.user_activity_days
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.record_user_activity_day()
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_seen_at timestamptz := statement_timestamp();
  v_activity_date date := (v_seen_at AT TIME ZONE 'UTC')::date;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_activity_days (user_id, activity_date, first_seen_at)
  VALUES (v_user_id, v_activity_date, v_seen_at)
  ON CONFLICT (user_id, activity_date) DO NOTHING;

  RETURN v_activity_date;
END;
$$;

REVOKE ALL ON FUNCTION public.record_user_activity_day() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_user_activity_day() FROM anon;
GRANT EXECUTE ON FUNCTION public.record_user_activity_day() TO authenticated;

COMMENT ON FUNCTION public.record_user_activity_day() IS
  'Records at most one UTC activity day for the authenticated caller. Identity and date are derived inside the function.';

-- The historical policy allowed anonymous inserts and arbitrary user_id values.
-- Server/service-role writes continue to bypass RLS; authenticated fallback
-- writers may insert only rows attributed to their own auth.uid().
DROP POLICY IF EXISTS "Anyone can insert activation events" ON public.activation_events;
DROP POLICY IF EXISTS "Authenticated users can insert own activation events" ON public.activation_events;
CREATE POLICY "Authenticated users can insert own activation events"
  ON public.activation_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS posts_author_ever_published_idx
  ON public.posts (author_id, published_at, id)
  WHERE published_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_phase0_measurement_baseline(
  p_cohort_start timestamptz DEFAULT NULL,
  p_cohort_end timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_as_of timestamptz := statement_timestamp();
  v_cohort_start timestamptz := coalesce(p_cohort_start, '-infinity'::timestamptz);
  v_cohort_end timestamptz := least(coalesce(p_cohort_end, v_as_of), v_as_of);
  v_result jsonb;
BEGIN
  IF v_cohort_start >= v_cohort_end THEN
    RAISE EXCEPTION 'cohort_start must be earlier than cohort_end.'
      USING ERRCODE = '22023';
  END IF;

  WITH cohort AS (
    SELECT
      profile.id AS user_id,
      profile.created_at AS signup_at,
      profile.onboarding_completed,
      CASE
        WHEN profile.onboarding_completed_at >= profile.created_at
          THEN profile.onboarding_completed_at
        ELSE NULL
      END AS onboarding_at
    FROM public.profiles AS profile
    WHERE profile.created_at >= v_cohort_start
      AND profile.created_at < v_cohort_end
  ),
  ranked_publications AS (
    SELECT
      cohort.user_id,
      post.id AS post_id,
      post.published_at,
      row_number() OVER (
        PARTITION BY cohort.user_id
        ORDER BY post.published_at, post.id
      ) AS publication_number
    FROM cohort
    JOIN public.posts AS post
      ON post.author_id = cohort.user_id
     AND post.published_at IS NOT NULL
     AND post.published_at >= cohort.onboarding_at
    WHERE cohort.onboarding_at IS NOT NULL
  ),
  publication_milestones AS (
    SELECT
      cohort.user_id,
      cohort.signup_at,
      cohort.onboarding_completed,
      cohort.onboarding_at,
      min(ranked_publications.published_at)
        FILTER (WHERE ranked_publications.publication_number = 1) AS first_publish_at,
      min(ranked_publications.published_at)
        FILTER (WHERE ranked_publications.publication_number = 2) AS second_publish_at
    FROM cohort
    LEFT JOIN ranked_publications
      ON ranked_publications.user_id = cohort.user_id
    GROUP BY
      cohort.user_id,
      cohort.signup_at,
      cohort.onboarding_completed,
      cohort.onboarding_at
  ),
  ordered_publications AS (
    SELECT
      publication_milestones.*,
      CASE
        WHEN second_publish_at <= first_publish_at + interval '30 days'
          THEN second_publish_at
        ELSE NULL
      END AS second_publish_30d_at
    FROM publication_milestones
  ),
  responses_received AS (
    SELECT
      ordered_publications.user_id,
      min(response_post.published_at) AS meaningful_response_at
    FROM ordered_publications
    JOIN public.posts AS parent_post
      ON parent_post.author_id = ordered_publications.user_id
     AND parent_post.published_at IS NOT NULL
    JOIN public.posts AS response_post
      ON response_post.in_response_to = parent_post.id
     AND response_post.published_at IS NOT NULL
     AND response_post.published_at >= ordered_publications.second_publish_30d_at
     AND response_post.author_id <> ordered_publications.user_id
    WHERE ordered_publications.second_publish_30d_at IS NOT NULL
    GROUP BY ordered_publications.user_id
  ),
  journey AS (
    SELECT
      ordered_publications.*,
      responses_received.meaningful_response_at,
      (ordered_publications.signup_at AT TIME ZONE 'UTC')::date AS signup_date_utc
    FROM ordered_publications
    LEFT JOIN responses_received
      ON responses_received.user_id = ordered_publications.user_id
  ),
  activity_window AS (
    SELECT min(activity_date) AS collection_started_on
    FROM public.user_activity_days
  ),
  measured AS (
    SELECT
      journey.*,
      activity_window.collection_started_on IS NOT NULL
        AND signup_date_utc + 30 > activity_window.collection_started_on
        AND (v_as_of AT TIME ZONE 'UTC')::date > signup_date_utc + 30
        AS d30_eligible,
      EXISTS (
        SELECT 1
        FROM public.user_activity_days AS activity
        WHERE activity.user_id = journey.user_id
          AND activity.activity_date = journey.signup_date_utc + 30
      ) AS retained_d30,
      meaningful_response_at IS NOT NULL
        AND meaningful_response_at <
          ((signup_date_utc + 30)::timestamp AT TIME ZONE 'UTC')
        AS full_funnel_reached_before_d30
    FROM journey
    CROSS JOIN activity_window
  )
  SELECT jsonb_build_object(
    'definition_version', 1,
    'as_of', v_as_of,
    'cohort_start', p_cohort_start,
    'cohort_end', v_cohort_end,
    'timezone', 'UTC',
    'activity_collection_started_on',
      (SELECT min(activity_date) FROM public.user_activity_days),
    'account_created_count', count(*),
    'onboarding_completed_count',
      count(*) FILTER (WHERE onboarding_at IS NOT NULL),
    'onboarding_timestamp_missing_count',
      count(*) FILTER (
        WHERE onboarding_completed = true AND onboarding_at IS NULL
      ),
    'first_publish_count',
      count(*) FILTER (WHERE first_publish_at IS NOT NULL),
    'second_publish_30d_count',
      count(*) FILTER (WHERE second_publish_30d_at IS NOT NULL),
    'meaningful_response_received_count',
      count(*) FILTER (WHERE meaningful_response_at IS NOT NULL),
    'd30_eligible_count',
      count(*) FILTER (WHERE d30_eligible),
    'd30_retained_count',
      count(*) FILTER (WHERE d30_eligible AND retained_d30),
    'full_funnel_d30_eligible_count',
      count(*) FILTER (WHERE d30_eligible AND full_funnel_reached_before_d30),
    'full_funnel_d30_retained_count',
      count(*) FILTER (
        WHERE d30_eligible AND full_funnel_reached_before_d30 AND retained_d30
      ),
    'definitions', jsonb_build_object(
      'signup', 'profiles.created_at (account created; not email verification)',
      'onboarding', 'first trusted onboarding_completed_at at or after signup',
      'publication', 'primary-authored post with a non-null published_at',
      'second_publish_30d', 'second qualifying post no later than 30 days after the first',
      'meaningful_response', 'published non-self response post received after the second qualifying publication',
      'd30_retention', 'an authenticated activity fact on the signup cohort UTC calendar day + 30; the full-funnel denominator must complete all prior stages before that day begins'
    )
  )
  INTO v_result
  FROM measured;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_phase0_measurement_baseline(timestamptz, timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_phase0_measurement_baseline(timestamptz, timestamptz)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_phase0_measurement_baseline(timestamptz, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.get_phase0_measurement_baseline(timestamptz, timestamptz) IS
  'Service-role-only Phase 0 ordered funnel and exact UTC D30 baseline. Cohort end is exclusive. Uses durable product facts, never capped raw activation-event downloads.';

COMMIT;
