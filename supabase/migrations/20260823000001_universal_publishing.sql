-- Universal publishing: title controls presentation only. Research remains
-- on the existing reviewed workflow.

-- Make this migration self-contained when the earlier content-model helper
-- has not been installed in the target database.
CREATE OR REPLACE FUNCTION public.effective_content_kind(
  p_type text,
  p_content_kind text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_content_kind IN ('post', 'article', 'research') THEN p_content_kind
    WHEN p_type = 'blog' THEN 'post'
    WHEN p_type IN ('essay', 'policy_brief') THEN 'article'
    WHEN p_type = 'research' THEN 'research'
    ELSE NULL
  END;
$$;

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_title_required_unless_post_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_title_required_unless_post_check
  CHECK (
    public.effective_content_kind(type, content_kind) IN ('post', 'article')
    OR (title IS NOT NULL AND trim(both from title) <> '')
  );

COMMENT ON COLUMN public.posts.title IS
  'Optional for direct publications. Presence selects editorial presentation; absence selects compact presentation. Required for Research.';

CREATE TABLE IF NOT EXISTS public.post_edit_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL UNIQUE REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text,
  excerpt text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  cover_image_url text,
  reference_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.post_edit_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authors manage their private edit drafts" ON public.post_edit_drafts;
CREATE POLICY "Authors manage their private edit drafts"
ON public.post_edit_drafts
FOR ALL
TO authenticated
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_edit_drafts TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_post_edit_draft(target_draft_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  draft_row public.post_edit_drafts%ROWTYPE;
  post_row public.posts%ROWTYPE;
  normalized_title text;
  reference_row jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  SELECT * INTO draft_row
  FROM public.post_edit_drafts
  WHERE id = target_draft_id AND author_id = auth.uid()
  FOR UPDATE;

  IF draft_row.id IS NULL THEN
    RAISE EXCEPTION 'This edit draft is unavailable.';
  END IF;

  SELECT * INTO post_row
  FROM public.posts
  WHERE id = draft_row.post_id AND author_id = auth.uid()
  FOR UPDATE;

  IF post_row.id IS NULL OR post_row.status <> 'published' THEN
    RAISE EXCEPTION 'Only your published work can be updated here.';
  END IF;

  IF public.effective_content_kind(post_row.type, post_row.content_kind) = 'research'
    OR post_row.type = 'policy_brief'
    OR post_row.citation_id IS NOT NULL
    OR post_row.published_version_id IS NOT NULL
  THEN
    RAISE EXCEPTION 'Reviewed publications are locked after acceptance.';
  END IF;

  normalized_title := NULLIF(trim(both from draft_row.title), '');

  UPDATE public.posts
  SET
    title = normalized_title,
    excerpt = draft_row.excerpt,
    content = draft_row.content,
    tags = draft_row.tags,
    cover_image_url = NULLIF(draft_row.cover_image_url, ''),
    type = CASE WHEN normalized_title IS NULL THEN 'blog' ELSE 'essay' END,
    content_kind = CASE WHEN normalized_title IS NULL THEN 'post' ELSE 'article' END,
    article_format = NULL,
    updated_at = now(),
    editorial_updated_at = now()
  WHERE id = post_row.id;

  DELETE FROM public.post_references WHERE post_id = post_row.id;

  FOR reference_row IN SELECT * FROM jsonb_array_elements(draft_row.reference_snapshot)
  LOOP
    INSERT INTO public.post_references (
      post_id, display_order, ref_type, authors, title, year, source, url, doi, raw
    ) VALUES (
      post_row.id,
      COALESCE((reference_row->>'display_order')::int, 0),
      COALESCE(NULLIF(reference_row->>'ref_type', ''), 'other'),
      NULLIF(reference_row->>'authors', ''),
      COALESCE(reference_row->>'title', ''),
      NULLIF(reference_row->>'year', '')::int,
      NULLIF(reference_row->>'source', ''),
      NULLIF(reference_row->>'url', ''),
      NULLIF(reference_row->>'doi', ''),
      NULLIF(reference_row->>'raw', '')
    );
  END LOOP;

  DELETE FROM public.post_edit_drafts WHERE id = draft_row.id;
  RETURN post_row.slug;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_post_edit_draft(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_post_edit_draft(uuid) TO authenticated;

-- A title never changes the value of originating a direct publication.
CREATE OR REPLACE FUNCTION public.award_points_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_points int;
BEGIN
  IF old.status <> 'published' AND new.status = 'published' THEN
    IF new.in_response_to IS NOT NULL THEN
      v_points := 3;
    ELSIF public.effective_content_kind(new.type, new.content_kind) = 'research' THEN
      v_points := 50;
    ELSIF new.type = 'policy_brief' THEN
      v_points := 30;
    ELSE
      v_points := 10;
    END IF;

    UPDATE public.profiles
    SET points = points + v_points
    WHERE id = new.author_id;
  END IF;
  RETURN new;
END;
$$;
