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

COMMENT ON COLUMN public.post_edit_drafts.reference_snapshot IS
  'Ordered source list. Each element keeps its post_references.id where one exists, because inline citations anchor to that id.';

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
  existing_reference_id uuid;
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
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

  -- Inline citations in the body are anchors to #ref-id-<post_references.id>,
  -- and the rendered bibliography emits matching id attributes, so these row
  -- ids are part of the published document. Delete only what the edit dropped,
  -- update what it kept, and insert only what is new. A blanket delete and
  -- re-insert would hand every source a fresh id and break every citation in
  -- the post.
  DELETE FROM public.post_references ref
  WHERE ref.post_id = post_row.id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(draft_row.reference_snapshot) AS kept(entry)
      WHERE kept.entry->>'id' ~* uuid_pattern
        AND (kept.entry->>'id')::uuid = ref.id
    );

  FOR reference_row IN SELECT * FROM jsonb_array_elements(draft_row.reference_snapshot)
  LOOP
    IF reference_row->>'id' ~* uuid_pattern THEN
      existing_reference_id := (reference_row->>'id')::uuid;
    ELSE
      existing_reference_id := NULL;
    END IF;

    IF existing_reference_id IS NOT NULL THEN
      UPDATE public.post_references
      SET
        display_order = COALESCE((reference_row->>'display_order')::int, 0),
        ref_type = COALESCE(NULLIF(reference_row->>'ref_type', ''), 'other'),
        authors = NULLIF(reference_row->>'authors', ''),
        title = COALESCE(reference_row->>'title', ''),
        year = NULLIF(reference_row->>'year', '')::int,
        source = NULLIF(reference_row->>'source', ''),
        url = NULLIF(reference_row->>'url', ''),
        doi = NULLIF(reference_row->>'doi', ''),
        raw = NULLIF(reference_row->>'raw', '')
      WHERE id = existing_reference_id AND post_id = post_row.id;

      -- A snapshot id that belongs to some other post matches nothing here, so
      -- it falls through and is stored as a genuinely new source instead.
      IF FOUND THEN
        CONTINUE;
      END IF;
    END IF;

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
