ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS impression_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS read_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.post_engagement_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'view', 'read')),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  anonymous_id text,
  surface text,
  route text,
  read_seconds integer CHECK (read_seconds IS NULL OR read_seconds >= 0),
  scroll_depth integer CHECK (scroll_depth IS NULL OR scroll_depth BETWEEN 0 AND 100),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR nullif(anonymous_id, '') IS NOT NULL)
);

ALTER TABLE public.post_engagement_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS post_engagement_events_post_created_idx
  ON public.post_engagement_events(post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS post_engagement_events_type_created_idx
  ON public.post_engagement_events(event_type, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS post_engagement_impression_daily_actor_surface_idx
  ON public.post_engagement_events(
    post_id,
    COALESCE('user:' || user_id::text, 'anon:' || anonymous_id),
    COALESCE(surface, 'unknown'),
    event_date
  )
  WHERE event_type = 'impression';

CREATE UNIQUE INDEX IF NOT EXISTS post_engagement_view_daily_actor_idx
  ON public.post_engagement_events(
    post_id,
    COALESCE('user:' || user_id::text, 'anon:' || anonymous_id),
    event_date
  )
  WHERE event_type = 'view';

CREATE UNIQUE INDEX IF NOT EXISTS post_engagement_read_daily_actor_idx
  ON public.post_engagement_events(
    post_id,
    COALESCE('user:' || user_id::text, 'anon:' || anonymous_id),
    event_date
  )
  WHERE event_type = 'read';

CREATE OR REPLACE FUNCTION public.record_post_engagement(
  post_slug text,
  engagement_type text,
  actor_user_id uuid DEFAULT NULL,
  actor_anonymous_id text DEFAULT NULL,
  engagement_surface text DEFAULT NULL,
  engagement_route text DEFAULT NULL,
  engagement_read_seconds integer DEFAULT NULL,
  engagement_scroll_depth integer DEFAULT NULL,
  engagement_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_post_id uuid;
  target_author_id uuid;
  inserted_event_id uuid;
  normalized_anonymous_id text;
BEGIN
  IF engagement_type NOT IN ('impression', 'view', 'read') THEN
    RETURN false;
  END IF;

  normalized_anonymous_id :=
    CASE
      WHEN actor_user_id IS NULL THEN nullif(actor_anonymous_id, '')
      ELSE NULL
    END;

  IF actor_user_id IS NULL AND normalized_anonymous_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT id, author_id
  INTO target_post_id, target_author_id
  FROM public.posts
  WHERE slug = post_slug
    AND status = 'published'
  LIMIT 1;

  IF target_post_id IS NULL THEN
    RETURN false;
  END IF;

  IF actor_user_id IS NOT NULL AND actor_user_id = target_author_id THEN
    RETURN false;
  END IF;

  INSERT INTO public.post_engagement_events (
    post_id,
    event_type,
    user_id,
    anonymous_id,
    surface,
    route,
    read_seconds,
    scroll_depth,
    metadata
  )
  VALUES (
    target_post_id,
    engagement_type,
    actor_user_id,
    normalized_anonymous_id,
    nullif(engagement_surface, ''),
    nullif(engagement_route, ''),
    CASE
      WHEN engagement_read_seconds IS NULL THEN NULL
      ELSE GREATEST(0, engagement_read_seconds)
    END,
    CASE
      WHEN engagement_scroll_depth IS NULL THEN NULL
      ELSE LEAST(100, GREATEST(0, engagement_scroll_depth))
    END,
    COALESCE(engagement_metadata, '{}'::jsonb)
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO inserted_event_id;

  IF inserted_event_id IS NULL THEN
    RETURN false;
  END IF;

  IF engagement_type = 'impression' THEN
    UPDATE public.posts
    SET impression_count = impression_count + 1
    WHERE id = target_post_id;
  ELSIF engagement_type = 'view' THEN
    UPDATE public.posts
    SET view_count = view_count + 1
    WHERE id = target_post_id;
  ELSIF engagement_type = 'read' THEN
    UPDATE public.posts
    SET read_count = read_count + 1
    WHERE id = target_post_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_post_engagement(
  text,
  text,
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_post_engagement(
  text,
  text,
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  jsonb
) TO service_role;

CREATE INDEX IF NOT EXISTS posts_published_reads_recency_idx
  ON public.posts(read_count DESC, published_at DESC)
  WHERE status = 'published';
