-- ThinkAfrica phase 3 baseline: webinars, ambassadors, featured policy briefs.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.webinars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  host_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended')),
  scheduled_at timestamptz NOT NULL,
  ended_at timestamptz,
  tags text[] DEFAULT '{}',
  attendee_count int NOT NULL DEFAULT 0,
  recording_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webinar_attendees (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  webinar_id uuid NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  registered_at timestamptz NOT NULL DEFAULT now(),
  attended boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, webinar_id)
);

CREATE TABLE IF NOT EXISTS public.webinar_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id uuid NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  upvotes int NOT NULL DEFAULT 0,
  answered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campus_ambassadors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  university text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive')),
  referral_count int NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.policy_briefs_featured (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  featured_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  institution_target text,
  featured_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS interests text[] DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS webinars_status_idx ON public.webinars(status);
CREATE INDEX IF NOT EXISTS webinars_scheduled_at_idx ON public.webinars(scheduled_at DESC);
CREATE INDEX IF NOT EXISTS webinar_attendees_webinar_id_idx ON public.webinar_attendees(webinar_id);
CREATE INDEX IF NOT EXISTS webinar_questions_webinar_id_idx ON public.webinar_questions(webinar_id);
CREATE INDEX IF NOT EXISTS webinar_questions_upvotes_idx ON public.webinar_questions(upvotes DESC);
CREATE INDEX IF NOT EXISTS campus_ambassadors_status_idx ON public.campus_ambassadors(status);
CREATE INDEX IF NOT EXISTS policy_briefs_featured_post_id_idx ON public.policy_briefs_featured(post_id);

ALTER TABLE public.webinars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webinar_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webinar_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_ambassadors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_briefs_featured ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION pg_temp.create_policy_if_missing(
  target_schema text,
  target_table text,
  target_policy text,
  statement text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = target_schema
      AND tablename = target_table
      AND policyname = target_policy
  ) THEN
    EXECUTE statement;
  END IF;
END;
$$;

SELECT pg_temp.create_policy_if_missing('public', 'webinars', 'Webinars are viewable by everyone',
  $$CREATE POLICY "Webinars are viewable by everyone" ON public.webinars FOR SELECT USING (true)$$);
SELECT pg_temp.create_policy_if_missing('public', 'webinars', 'Authenticated users can create webinars',
  $$CREATE POLICY "Authenticated users can create webinars" ON public.webinars FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = host_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'webinars', 'Hosts can update their webinars',
  $$CREATE POLICY "Hosts can update their webinars" ON public.webinars FOR UPDATE USING (auth.uid() = host_id)$$);

SELECT pg_temp.create_policy_if_missing('public', 'webinar_attendees', 'Webinar attendees are viewable by everyone',
  $$CREATE POLICY "Webinar attendees are viewable by everyone" ON public.webinar_attendees FOR SELECT USING (true)$$);
SELECT pg_temp.create_policy_if_missing('public', 'webinar_attendees', 'Authenticated users can register for webinars',
  $$CREATE POLICY "Authenticated users can register for webinars" ON public.webinar_attendees FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'webinar_attendees', 'Users can unregister themselves',
  $$CREATE POLICY "Users can unregister themselves" ON public.webinar_attendees FOR DELETE USING (auth.uid() = user_id)$$);

SELECT pg_temp.create_policy_if_missing('public', 'webinar_questions', 'Webinar questions are viewable by everyone',
  $$CREATE POLICY "Webinar questions are viewable by everyone" ON public.webinar_questions FOR SELECT USING (true)$$);
SELECT pg_temp.create_policy_if_missing('public', 'webinar_questions', 'Authenticated users can submit questions',
  $$CREATE POLICY "Authenticated users can submit questions" ON public.webinar_questions FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = author_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'webinar_questions', 'Webinar hosts can update questions (mark answered)',
  $$CREATE POLICY "Webinar hosts can update questions (mark answered)" ON public.webinar_questions FOR UPDATE USING (EXISTS (SELECT 1 FROM public.webinars WHERE id = webinar_id AND host_id = auth.uid()))$$);

SELECT pg_temp.create_policy_if_missing('public', 'campus_ambassadors', 'Active ambassadors are viewable by everyone',
  $$CREATE POLICY "Active ambassadors are viewable by everyone" ON public.campus_ambassadors FOR SELECT USING (status = 'active' OR auth.uid() = user_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'campus_ambassadors', 'Authenticated users can apply to become ambassador',
  $$CREATE POLICY "Authenticated users can apply to become ambassador" ON public.campus_ambassadors FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'campus_ambassadors', 'Admins can update ambassador status',
  $$CREATE POLICY "Admins can update ambassador status" ON public.campus_ambassadors FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin())$$);

SELECT pg_temp.create_policy_if_missing('public', 'policy_briefs_featured', 'Featured policy briefs are viewable by everyone',
  $$CREATE POLICY "Featured policy briefs are viewable by everyone" ON public.policy_briefs_featured FOR SELECT USING (true)$$);
SELECT pg_temp.create_policy_if_missing('public', 'policy_briefs_featured', 'Admins can feature policy briefs',
  $$CREATE POLICY "Admins can feature policy briefs" ON public.policy_briefs_featured FOR INSERT WITH CHECK (public.is_admin())$$);

DO $$
BEGIN
  IF to_regprocedure('public.toggle_question_upvote(uuid)') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.toggle_question_upvote(p_question_id uuid)
      RETURNS json
      LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public
      AS $body$
      DECLARE
        v_user_id uuid := auth.uid();
      BEGIN
        IF v_user_id IS NULL THEN
          RETURN json_build_object('error', 'Not authenticated');
        END IF;

        UPDATE public.webinar_questions
        SET upvotes = upvotes + 1
        WHERE id = p_question_id;

        RETURN json_build_object('success', true);
      END;
      $body$;
    $function$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'webinar_questions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.webinar_questions;
    END IF;
  END IF;
END $$;
