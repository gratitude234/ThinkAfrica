BEGIN;

-- Phase 3 deliberately concentrates programming on named campus cohorts.
-- Targets are nullable and admin-configured: product code must never invent a
-- success threshold when the operating team has not approved one.
CREATE TABLE IF NOT EXISTS public.campus_cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university text NOT NULL CHECK (char_length(btrim(university)) BETWEEN 2 AND 160),
  country text,
  status text NOT NULL DEFAULT 'selected'
    CHECK (status IN ('selected', 'active', 'paused', 'completed')),
  cohort_start date NOT NULL DEFAULT current_date,
  cohort_end date,
  d7_retention_target numeric(5,2)
    CHECK (d7_retention_target BETWEEN 0 AND 100),
  d30_retention_target numeric(5,2)
    CHECK (d30_retention_target BETWEEN 0 AND 100),
  second_publication_30d_target numeric(5,2)
    CHECK (second_publication_30d_target BETWEEN 0 AND 100),
  response_received_30d_target numeric(5,2)
    CHECK (response_received_30d_target BETWEEN 0 AND 100),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cohort_end IS NULL OR cohort_end >= cohort_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS campus_cohorts_live_university_idx
  ON public.campus_cohorts (lower(btrim(university)))
  WHERE status IN ('selected', 'active');

CREATE INDEX IF NOT EXISTS campus_cohorts_status_idx
  ON public.campus_cohorts (status, cohort_start DESC);

-- Membership is snapshotted once so cohort denominators cannot drift when a
-- profile later changes its university label.
CREATE TABLE IF NOT EXISTS public.campus_cohort_memberships (
  cohort_id uuid NOT NULL REFERENCES public.campus_cohorts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  signup_at timestamptz NOT NULL,
  university_at_join text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cohort_id, user_id)
);

CREATE INDEX IF NOT EXISTS campus_cohort_memberships_cohort_idx
  ON public.campus_cohort_memberships (cohort_id, signup_at);

CREATE OR REPLACE FUNCTION public.assign_profile_to_selected_campus_cohort()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF nullif(btrim(NEW.university), '') IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.campus_cohort_memberships (
    cohort_id,
    user_id,
    signup_at,
    university_at_join
  )
  SELECT
    cohort.id,
    NEW.id,
    NEW.created_at,
    btrim(NEW.university)
  FROM public.campus_cohorts AS cohort
  WHERE cohort.status IN ('selected', 'active')
    AND lower(btrim(cohort.university)) = lower(btrim(NEW.university))
    AND (NEW.created_at AT TIME ZONE 'UTC')::date >= cohort.cohort_start
    AND (
      cohort.cohort_end IS NULL
      OR (NEW.created_at AT TIME ZONE 'UTC')::date <= cohort.cohort_end
    )
  ORDER BY
    CASE cohort.status WHEN 'active' THEN 1 ELSE 2 END,
    cohort.cohort_start DESC
  LIMIT 1
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_profile_to_selected_campus_cohort() FROM PUBLIC;

DROP TRIGGER IF EXISTS profiles_assign_selected_campus_cohort ON public.profiles;
CREATE TRIGGER profiles_assign_selected_campus_cohort
AFTER INSERT OR UPDATE OF university ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.assign_profile_to_selected_campus_cohort();

CREATE OR REPLACE FUNCTION public.backfill_selected_campus_cohort_memberships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status NOT IN ('selected', 'active') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.campus_cohort_memberships (
    cohort_id,
    user_id,
    signup_at,
    university_at_join
  )
  SELECT
    NEW.id,
    profile.id,
    profile.created_at,
    btrim(profile.university)
  FROM public.profiles AS profile
  WHERE lower(btrim(profile.university)) = lower(btrim(NEW.university))
    AND (profile.created_at AT TIME ZONE 'UTC')::date >= NEW.cohort_start
    AND (
      NEW.cohort_end IS NULL
      OR (profile.created_at AT TIME ZONE 'UTC')::date <= NEW.cohort_end
    )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_selected_campus_cohort_memberships() FROM PUBLIC;

DROP TRIGGER IF EXISTS campus_cohort_backfill_memberships ON public.campus_cohorts;
CREATE TRIGGER campus_cohort_backfill_memberships
AFTER INSERT OR UPDATE OF status, university, cohort_start, cohort_end
ON public.campus_cohorts
FOR EACH ROW
EXECUTE FUNCTION public.backfill_selected_campus_cohort_memberships();

INSERT INTO public.campus_cohort_memberships (
  cohort_id,
  user_id,
  signup_at,
  university_at_join
)
SELECT
  cohort.id,
  profile.id,
  profile.created_at,
  btrim(profile.university)
FROM public.campus_cohorts AS cohort
JOIN public.profiles AS profile
  ON lower(btrim(profile.university)) = lower(btrim(cohort.university))
 AND (profile.created_at AT TIME ZONE 'UTC')::date >= cohort.cohort_start
 AND (
   cohort.cohort_end IS NULL
   OR (profile.created_at AT TIME ZONE 'UTC')::date <= cohort.cohort_end
 )
WHERE cohort.status IN ('selected', 'active')
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.campus_editorial_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL REFERENCES public.campus_cohorts(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
  prompt_text text NOT NULL CHECK (char_length(btrim(prompt_text)) BETWEEN 10 AND 1000),
  response_question text CHECK (char_length(btrim(response_question)) <= 500),
  topic text CHECK (char_length(btrim(topic)) <= 80),
  cadence text NOT NULL DEFAULT 'weekly'
    CHECK (cadence IN ('one_off', 'weekly', 'monthly')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS campus_editorial_prompts_live_idx
  ON public.campus_editorial_prompts (cohort_id, active, starts_at DESC, ends_at);

CREATE TABLE IF NOT EXISTS public.campus_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL REFERENCES public.campus_cohorts(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 10 AND 1000),
  format text NOT NULL DEFAULT 'writing_circle'
    CHECK (format IN ('writing_circle', 'response_circle', 'publication_clinic', 'debate_night')),
  recurrence text NOT NULL DEFAULT 'weekly'
    CHECK (recurrence IN ('weekly', 'fortnightly', 'monthly', 'one_off')),
  next_session_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campus_programs_live_idx
  ON public.campus_programs (cohort_id, active, next_session_at);

ALTER TABLE public.campus_ambassadors
  ADD COLUMN IF NOT EXISTS campus_cohort_id uuid
    REFERENCES public.campus_cohorts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivation text,
  ADD COLUMN IF NOT EXISTS outreach_plan text;

UPDATE public.campus_ambassadors AS ambassador
SET campus_cohort_id = cohort.id
FROM public.campus_cohorts AS cohort
WHERE ambassador.campus_cohort_id IS NULL
  AND lower(btrim(ambassador.university)) = lower(btrim(cohort.university))
  AND cohort.status IN ('selected', 'active');

CREATE INDEX IF NOT EXISTS campus_ambassadors_cohort_status_idx
  ON public.campus_ambassadors (campus_cohort_id, status);

CREATE TABLE IF NOT EXISTS public.campus_prompt_submissions (
  prompt_id uuid NOT NULL REFERENCES public.campus_editorial_prompts(id) ON DELETE CASCADE,
  post_id uuid NOT NULL UNIQUE REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (prompt_id, post_id)
);

CREATE INDEX IF NOT EXISTS campus_prompt_submissions_author_idx
  ON public.campus_prompt_submissions (author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.campus_ambassador_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id uuid NOT NULL REFERENCES public.campus_ambassadors(id) ON DELETE CASCADE,
  cohort_id uuid NOT NULL REFERENCES public.campus_cohorts(id) ON DELETE CASCADE,
  activity_type text NOT NULL
    CHECK (activity_type IN ('prompt_shared', 'writing_circle', 'response_circle', 'publication_clinic', 'debate_night', 'contributor_support')),
  happened_on date NOT NULL DEFAULT current_date,
  participant_count integer NOT NULL DEFAULT 0
    CHECK (participant_count BETWEEN 0 AND 10000),
  notes text CHECK (char_length(btrim(notes)) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campus_ambassador_activity_cohort_date_idx
  ON public.campus_ambassador_activity (cohort_id, happened_on DESC);

ALTER TABLE public.campus_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_cohort_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_editorial_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_prompt_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_ambassador_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Selected campus cohorts are public" ON public.campus_cohorts;
CREATE POLICY "Selected campus cohorts are public"
  ON public.campus_cohorts FOR SELECT
  USING (status IN ('selected', 'active'));

DROP POLICY IF EXISTS "Users can read own campus cohort membership" ON public.campus_cohort_memberships;
CREATE POLICY "Users can read own campus cohort membership"
  ON public.campus_cohort_memberships FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Active campus prompts are public" ON public.campus_editorial_prompts;
CREATE POLICY "Active campus prompts are public"
  ON public.campus_editorial_prompts FOR SELECT
  USING (
    active = true
    AND EXISTS (
      SELECT 1 FROM public.campus_cohorts AS cohort
      WHERE cohort.id = cohort_id
        AND cohort.status IN ('selected', 'active')
    )
  );

DROP POLICY IF EXISTS "Active campus programs are public" ON public.campus_programs;
CREATE POLICY "Active campus programs are public"
  ON public.campus_programs FOR SELECT
  USING (
    active = true
    AND EXISTS (
      SELECT 1 FROM public.campus_cohorts AS cohort
      WHERE cohort.id = cohort_id
        AND cohort.status IN ('selected', 'active')
    )
  );

DROP POLICY IF EXISTS "Authors can read own campus prompt submissions" ON public.campus_prompt_submissions;
CREATE POLICY "Authors can read own campus prompt submissions"
  ON public.campus_prompt_submissions FOR SELECT
  TO authenticated
  USING (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors can attach own posts to campus prompts" ON public.campus_prompt_submissions;
CREATE POLICY "Authors can attach own posts to campus prompts"
  ON public.campus_prompt_submissions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1
      FROM public.posts AS post
      WHERE post.id = post_id AND post.author_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.campus_editorial_prompts AS prompt
      JOIN public.campus_cohorts AS cohort ON cohort.id = prompt.cohort_id
      WHERE prompt.id = prompt_id
        AND prompt.active = true
        AND prompt.starts_at <= statement_timestamp()
        AND (prompt.ends_at IS NULL OR prompt.ends_at > statement_timestamp())
        AND cohort.status IN ('selected', 'active')
        AND (
          EXISTS (
            SELECT 1
            FROM public.campus_cohort_memberships AS membership
            WHERE membership.cohort_id = prompt.cohort_id
              AND membership.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM public.campus_ambassadors AS ambassador
            WHERE ambassador.campus_cohort_id = prompt.cohort_id
              AND ambassador.user_id = auth.uid()
              AND ambassador.status = 'active'
          )
        )
    )
  );

DROP POLICY IF EXISTS "Ambassadors can read own activity" ON public.campus_ambassador_activity;
CREATE POLICY "Ambassadors can read own activity"
  ON public.campus_ambassador_activity FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campus_ambassadors AS ambassador
      WHERE ambassador.id = ambassador_id
        AND ambassador.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Active ambassadors can log cohort activity" ON public.campus_ambassador_activity;
CREATE POLICY "Active ambassadors can log cohort activity"
  ON public.campus_ambassador_activity FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campus_ambassadors AS ambassador
      WHERE ambassador.id = ambassador_id
        AND ambassador.user_id = auth.uid()
        AND ambassador.status = 'active'
        AND ambassador.campus_cohort_id = cohort_id
    )
  );

-- Replace the broad application policy so new Ambassador activity stays
-- concentrated on an explicitly selected campus.
DROP POLICY IF EXISTS "Authenticated users can apply to become ambassador" ON public.campus_ambassadors;
CREATE POLICY "Authenticated users can apply at selected campuses"
  ON public.campus_ambassadors FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND campus_cohort_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.campus_cohorts AS cohort
      WHERE cohort.id = campus_cohort_id
        AND cohort.status IN ('selected', 'active')
        AND lower(btrim(cohort.university)) = lower(btrim(university))
    )
  );

GRANT SELECT ON public.campus_cohorts, public.campus_editorial_prompts, public.campus_programs
  TO anon, authenticated;
GRANT SELECT ON public.campus_cohort_memberships TO authenticated;
GRANT SELECT, INSERT ON public.campus_prompt_submissions, public.campus_ambassador_activity
  TO authenticated;
GRANT ALL ON public.campus_cohorts, public.campus_editorial_prompts,
  public.campus_programs, public.campus_prompt_submissions,
  public.campus_ambassador_activity, public.campus_cohort_memberships
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_campus_candidates()
RETURNS TABLE (
  university text,
  country text,
  member_count bigint,
  published_contributor_count bigint,
  active_ambassador_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    min(btrim(profile.university)) AS university,
    min(nullif(btrim(profile.country), '')) AS country,
    count(DISTINCT profile.id) AS member_count,
    count(DISTINCT post.author_id) AS published_contributor_count,
    count(DISTINCT ambassador.user_id)
      FILTER (WHERE ambassador.status = 'active') AS active_ambassador_count
  FROM public.profiles AS profile
  LEFT JOIN public.posts AS post
    ON post.author_id = profile.id
   AND post.published_at IS NOT NULL
  LEFT JOIN public.campus_ambassadors AS ambassador
    ON ambassador.user_id = profile.id
  WHERE nullif(btrim(profile.university), '') IS NOT NULL
  GROUP BY lower(btrim(profile.university))
  ORDER BY
    count(DISTINCT profile.id) DESC,
    count(DISTINCT post.author_id) DESC,
    min(btrim(profile.university));
$$;

REVOKE ALL ON FUNCTION public.get_campus_candidates() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campus_candidates() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_campus_candidates() TO service_role;

COMMENT ON FUNCTION public.get_campus_candidates() IS
  'Service-role-only existing-campus density inventory used to select Phase 3 cohorts without dispersing Ambassador activity.';

CREATE OR REPLACE FUNCTION public.get_campus_cohort_metrics()
RETURNS TABLE (
  cohort_id uuid,
  university text,
  country text,
  status text,
  member_count bigint,
  onboarding_completed_count bigint,
  d7_eligible_count bigint,
  d7_retained_count bigint,
  d7_retention_rate numeric,
  d7_retention_target numeric,
  d30_eligible_count bigint,
  d30_retained_count bigint,
  d30_retention_rate numeric,
  d30_retention_target numeric,
  first_publication_count bigint,
  second_publication_eligible_count bigint,
  second_publication_30d_count bigint,
  second_publication_30d_rate numeric,
  second_publication_30d_target numeric,
  response_received_eligible_count bigint,
  response_received_30d_count bigint,
  response_received_30d_rate numeric,
  response_received_30d_target numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH activity_floor AS (
    SELECT min(activity_date) AS collection_started_on
    FROM public.user_activity_days
  ),
  members AS (
    SELECT
      membership.cohort_id,
      profile.id AS user_id,
      membership.signup_at,
      (membership.signup_at AT TIME ZONE 'UTC')::date AS signup_date,
      profile.onboarding_completed
    FROM public.campus_cohort_memberships AS membership
    JOIN public.profiles AS profile ON profile.id = membership.user_id
  ),
  ranked_publications AS (
    SELECT
      member.cohort_id,
      member.user_id,
      post.id AS post_id,
      post.published_at,
      row_number() OVER (
        PARTITION BY member.cohort_id, member.user_id
        ORDER BY post.published_at, post.id
      ) AS publication_number
    FROM members AS member
    JOIN public.posts AS post
      ON post.author_id = member.user_id
     AND post.published_at IS NOT NULL
     AND post.published_at >= member.signup_at
  ),
  publication_milestones AS (
    SELECT
      member.cohort_id,
      member.user_id,
      min(publication.published_at)
        FILTER (WHERE publication.publication_number = 1) AS first_publish_at,
      min(publication.published_at)
        FILTER (WHERE publication.publication_number = 2) AS second_publish_at
    FROM members AS member
    LEFT JOIN ranked_publications AS publication
      ON publication.cohort_id = member.cohort_id
     AND publication.user_id = member.user_id
    GROUP BY member.cohort_id, member.user_id
  ),
  response_milestones AS (
    SELECT
      milestone.cohort_id,
      milestone.user_id,
      min(response_post.published_at) AS response_received_at
    FROM publication_milestones AS milestone
    JOIN public.posts AS parent_post
      ON parent_post.author_id = milestone.user_id
     AND parent_post.published_at IS NOT NULL
    JOIN public.posts AS response_post
      ON response_post.in_response_to = parent_post.id
     AND response_post.author_id <> milestone.user_id
     AND response_post.published_at >= milestone.first_publish_at
     AND response_post.published_at <= milestone.first_publish_at + interval '30 days'
    WHERE milestone.first_publish_at IS NOT NULL
    GROUP BY milestone.cohort_id, milestone.user_id
  ),
  facts AS (
    SELECT
      member.*,
      milestone.first_publish_at,
      CASE
        WHEN milestone.second_publish_at <= milestone.first_publish_at + interval '30 days'
          THEN milestone.second_publish_at
        ELSE NULL
      END AS second_publish_30d_at,
      response.response_received_at,
      floor.collection_started_on,
      floor.collection_started_on IS NOT NULL
        AND member.signup_date + 7 > floor.collection_started_on
        AND (statement_timestamp() AT TIME ZONE 'UTC')::date > member.signup_date + 7
        AS d7_eligible,
      floor.collection_started_on IS NOT NULL
        AND member.signup_date + 30 > floor.collection_started_on
        AND (statement_timestamp() AT TIME ZONE 'UTC')::date > member.signup_date + 30
        AS d30_eligible,
      EXISTS (
        SELECT 1 FROM public.user_activity_days AS activity
        WHERE activity.user_id = member.user_id
          AND activity.activity_date = member.signup_date + 7
      ) AS retained_d7,
      EXISTS (
        SELECT 1 FROM public.user_activity_days AS activity
        WHERE activity.user_id = member.user_id
          AND activity.activity_date = member.signup_date + 30
      ) AS retained_d30
    FROM members AS member
    LEFT JOIN publication_milestones AS milestone
      ON milestone.cohort_id = member.cohort_id
     AND milestone.user_id = member.user_id
    LEFT JOIN response_milestones AS response
      ON response.cohort_id = member.cohort_id
     AND response.user_id = member.user_id
    CROSS JOIN activity_floor AS floor
  )
  SELECT
    cohort.id,
    cohort.university,
    cohort.country,
    cohort.status,
    count(fact.user_id),
    count(fact.user_id) FILTER (WHERE fact.onboarding_completed),
    count(fact.user_id) FILTER (WHERE fact.d7_eligible),
    count(fact.user_id) FILTER (WHERE fact.d7_eligible AND fact.retained_d7),
    round(
      100.0 * count(fact.user_id) FILTER (WHERE fact.d7_eligible AND fact.retained_d7)
      / nullif(count(fact.user_id) FILTER (WHERE fact.d7_eligible), 0),
      1
    ),
    cohort.d7_retention_target,
    count(fact.user_id) FILTER (WHERE fact.d30_eligible),
    count(fact.user_id) FILTER (WHERE fact.d30_eligible AND fact.retained_d30),
    round(
      100.0 * count(fact.user_id) FILTER (WHERE fact.d30_eligible AND fact.retained_d30)
      / nullif(count(fact.user_id) FILTER (WHERE fact.d30_eligible), 0),
      1
    ),
    cohort.d30_retention_target,
    count(fact.user_id) FILTER (WHERE fact.first_publish_at IS NOT NULL),
    count(fact.user_id) FILTER (
      WHERE fact.first_publish_at IS NOT NULL
        AND (
          fact.second_publish_30d_at IS NOT NULL
          OR statement_timestamp() >= fact.first_publish_at + interval '30 days'
        )
    ),
    count(fact.user_id) FILTER (WHERE fact.second_publish_30d_at IS NOT NULL),
    round(
      100.0 * count(fact.user_id) FILTER (WHERE fact.second_publish_30d_at IS NOT NULL)
      / nullif(
          count(fact.user_id) FILTER (
            WHERE fact.first_publish_at IS NOT NULL
              AND (
                fact.second_publish_30d_at IS NOT NULL
                OR statement_timestamp() >= fact.first_publish_at + interval '30 days'
              )
          ),
          0
        ),
      1
    ),
    cohort.second_publication_30d_target,
    count(fact.user_id) FILTER (
      WHERE fact.first_publish_at IS NOT NULL
        AND (
          fact.response_received_at IS NOT NULL
          OR statement_timestamp() >= fact.first_publish_at + interval '30 days'
        )
    ),
    count(fact.user_id) FILTER (WHERE fact.response_received_at IS NOT NULL),
    round(
      100.0 * count(fact.user_id) FILTER (WHERE fact.response_received_at IS NOT NULL)
      / nullif(
          count(fact.user_id) FILTER (
            WHERE fact.first_publish_at IS NOT NULL
              AND (
                fact.response_received_at IS NOT NULL
                OR statement_timestamp() >= fact.first_publish_at + interval '30 days'
              )
          ),
          0
        ),
      1
    ),
    cohort.response_received_30d_target
  FROM public.campus_cohorts AS cohort
  LEFT JOIN facts AS fact ON fact.cohort_id = cohort.id
  GROUP BY cohort.id
  ORDER BY
    CASE cohort.status
      WHEN 'active' THEN 1
      WHEN 'selected' THEN 2
      WHEN 'paused' THEN 3
      ELSE 4
    END,
    cohort.university;
$$;

REVOKE ALL ON FUNCTION public.get_campus_cohort_metrics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campus_cohort_metrics() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_campus_cohort_metrics() TO service_role;

COMMENT ON FUNCTION public.get_campus_cohort_metrics() IS
  'Service-role-only Phase 3 campus cohort retention and contribution-loop metrics. Targets come from campus_cohorts and remain null until explicitly configured.';

COMMIT;
