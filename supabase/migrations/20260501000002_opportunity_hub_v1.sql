-- Opportunity Hub Hybrid V1

ALTER TABLE public.fellowships
  ADD COLUMN IF NOT EXISTS opportunity_type text NOT NULL DEFAULT 'fellowship',
  ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.fellowships
  DROP CONSTRAINT IF EXISTS fellowships_opportunity_type_check;

ALTER TABLE public.fellowships
  ADD CONSTRAINT fellowships_opportunity_type_check
  CHECK (opportunity_type = ANY (ARRAY['internship', 'research', 'fellowship', 'job']));

CREATE INDEX IF NOT EXISTS fellowships_status_type_deadline_idx
  ON public.fellowships(status, opportunity_type, deadline ASC);

CREATE INDEX IF NOT EXISTS fellowships_featured_idx
  ON public.fellowships(featured, status)
  WHERE featured = true;

CREATE INDEX IF NOT EXISTS fellowships_skills_gin_idx
  ON public.fellowships USING gin(skills);

CREATE OR REPLACE FUNCTION public.touch_fellowships_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fellowships_touch_updated_at ON public.fellowships;
CREATE TRIGGER fellowships_touch_updated_at
BEFORE UPDATE ON public.fellowships
FOR EACH ROW
EXECUTE FUNCTION public.touch_fellowships_updated_at();

ALTER TABLE public.talent_inquiries
  ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opportunity_type text,
  ADD COLUMN IF NOT EXISTS role_title text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.talent_inquiries
  DROP CONSTRAINT IF EXISTS talent_inquiries_opportunity_type_check;

ALTER TABLE public.talent_inquiries
  ADD CONSTRAINT talent_inquiries_opportunity_type_check
  CHECK (
    opportunity_type IS NULL
    OR opportunity_type = ANY (ARRAY['internship', 'research', 'fellowship', 'job'])
  );

ALTER TABLE public.talent_inquiries
  DROP CONSTRAINT IF EXISTS talent_inquiries_status_check;

ALTER TABLE public.talent_inquiries
  ADD CONSTRAINT talent_inquiries_status_check
  CHECK (status = ANY (ARRAY['new', 'read', 'archived']));

CREATE INDEX IF NOT EXISTS talent_inquiries_talent_status_created_idx
  ON public.talent_inquiries(talent_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS talent_inquiries_sender_idx
  ON public.talent_inquiries(sender_id, created_at DESC)
  WHERE sender_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_talent_inquiries_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS talent_inquiries_touch_updated_at ON public.talent_inquiries;
CREATE TRIGGER talent_inquiries_touch_updated_at
BEFORE UPDATE ON public.talent_inquiries
FOR EACH ROW
EXECUTE FUNCTION public.touch_talent_inquiries_updated_at();

DROP POLICY IF EXISTS "Anyone authenticated can send inquiries" ON public.talent_inquiries;
DROP POLICY IF EXISTS "Talent can update their own inquiries" ON public.talent_inquiries;

CREATE POLICY "Anyone authenticated can send inquiries"
  ON public.talent_inquiries FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND (sender_id IS NULL OR sender_id = auth.uid())
  );

CREATE POLICY "Talent can update their own inquiries"
  ON public.talent_inquiries FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles
      WHERE talent_profiles.id = talent_inquiries.talent_id
        AND talent_profiles.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles
      WHERE talent_profiles.id = talent_inquiries.talent_id
        AND talent_profiles.user_id = auth.uid()
    )
  );

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
    'like', 'comment', 'follow', 'debate_reply', 'debate_argument',
    'fellowship', 'badge', 'post_approved', 'post_rejected',
    'post_published', 'review_assigned', 'revision_requested',
    'co_author_invite', 'co_author_accepted', 'co_author_declined',
    'response_post', 'opportunity_inquiry'
  ]));
