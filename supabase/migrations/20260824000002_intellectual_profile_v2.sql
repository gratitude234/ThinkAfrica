-- Intellectual Profile V2: a neutral, paged public record and atomic
-- author-curated Featured work. No private onboarding preference is exposed.

BEGIN;

CREATE OR REPLACE VIEW public.profile_record_entries
WITH (security_invoker = true, security_barrier = true)
AS
WITH published_authorship AS (
  SELECT
    post.author_id AS profile_id,
    post.id AS entry_id,
    post.in_response_to,
    post.type,
    post.content_kind,
    COALESCE(post.published_at, post.created_at) AS occurred_at,
    false AS is_coauthor,
    post.citation_id
  FROM public.posts AS post
  WHERE post.status = 'published'

  UNION ALL

  SELECT
    author.user_id AS profile_id,
    post.id AS entry_id,
    post.in_response_to,
    post.type,
    post.content_kind,
    COALESCE(post.published_at, post.created_at) AS occurred_at,
    true AS is_coauthor,
    post.citation_id
  FROM public.post_authors AS author
  JOIN public.posts AS post ON post.id = author.post_id
  WHERE author.accepted_at IS NOT NULL
    AND author.user_id <> post.author_id
    AND post.status = 'published'
)
SELECT
  authorship.profile_id,
  authorship.entry_id,
  CASE
    WHEN authorship.in_response_to IS NOT NULL THEN 'response'
    WHEN public.effective_content_kind(
      authorship.type,
      authorship.content_kind
    ) = 'research' THEN 'research'
    ELSE 'publication'
  END::text AS entry_kind,
  authorship.occurred_at,
  authorship.is_coauthor,
  COALESCE(reference_count.reference_count, 0) > 0 AS source_backed,
  authorship.citation_id IS NOT NULL AS citable
FROM published_authorship AS authorship
LEFT JOIN public.post_reference_counts AS reference_count
  ON reference_count.post_id = authorship.entry_id

UNION ALL

SELECT
  argument.author_id AS profile_id,
  argument.id AS entry_id,
  'debate'::text AS entry_kind,
  argument.created_at AS occurred_at,
  false AS is_coauthor,
  false AS source_backed,
  false AS citable
FROM public.debate_arguments AS argument;

REVOKE ALL ON TABLE public.profile_record_entries
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profile_record_entries
  TO anon, authenticated, service_role;

COMMENT ON VIEW public.profile_record_entries IS
  'RLS-aware index of public intellectual work. Carries identifiers and evidence flags only; content is loaded from its protected source table.';

CREATE OR REPLACE FUNCTION public.get_public_profile_record_summary(
  p_profile_id uuid,
  p_include_research boolean DEFAULT false
)
RETURNS TABLE (
  publication_count bigint,
  source_backed_count bigint,
  citable_count bigint,
  response_count bigint,
  debate_count bigint,
  research_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH visible_entry AS (
    SELECT entry.entry_kind, entry.source_backed, entry.citable
    FROM public.profile_record_entries AS entry
    WHERE entry.profile_id = p_profile_id
      AND (p_include_research OR entry.entry_kind <> 'research')
  )
  SELECT
    count(*) FILTER (
      WHERE entry_kind IN ('publication', 'research')
    ) AS publication_count,
    count(*) FILTER (
      WHERE entry_kind IN ('publication', 'research') AND source_backed
    ) AS source_backed_count,
    count(*) FILTER (
      WHERE entry_kind IN ('publication', 'research') AND citable
    ) AS citable_count,
    count(*) FILTER (WHERE entry_kind = 'response') AS response_count,
    count(*) FILTER (WHERE entry_kind = 'debate') AS debate_count,
    count(*) FILTER (WHERE entry_kind = 'research') AS research_count
  FROM visible_entry;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile_record_summary(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile_record_summary(uuid, boolean)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.replace_my_featured_posts(
  p_post_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_post_ids uuid[] := COALESCE(p_post_ids, ARRAY[]::uuid[]);
  v_selected_count integer := cardinality(COALESCE(p_post_ids, ARRAY[]::uuid[]));
  v_distinct_count integer;
  v_eligible_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to manage featured work.';
  END IF;

  IF v_selected_count > 3 THEN
    RAISE EXCEPTION 'You can feature up to three publications.';
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(v_post_ids) AS selected(id) WHERE id IS NULL) THEN
    RAISE EXCEPTION 'Featured work contains an invalid publication.';
  END IF;

  SELECT count(DISTINCT selected.id)
  INTO v_distinct_count
  FROM unnest(v_post_ids) AS selected(id);

  IF v_distinct_count <> v_selected_count THEN
    RAISE EXCEPTION 'Choose each featured publication only once.';
  END IF;

  SELECT count(*)
  INTO v_eligible_count
  FROM public.posts AS post
  WHERE post.id = ANY(v_post_ids)
    AND post.status = 'published'
    AND (
      post.author_id = v_user_id
      OR EXISTS (
        SELECT 1
        FROM public.post_authors AS author
        WHERE author.post_id = post.id
          AND author.user_id = v_user_id
          AND author.accepted_at IS NOT NULL
      )
    );

  IF v_eligible_count <> v_selected_count THEN
    RAISE EXCEPTION 'Featured work must be published and belong to you as an author or accepted co-author.';
  END IF;

  DELETE FROM public.profile_featured_posts
  WHERE user_id = v_user_id;

  INSERT INTO public.profile_featured_posts (user_id, post_id, position)
  SELECT v_user_id, selected.post_id, selected.position::integer
  FROM unnest(v_post_ids) WITH ORDINALITY AS selected(post_id, position);
END;
$$;

REVOKE ALL ON FUNCTION public.replace_my_featured_posts(uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_my_featured_posts(uuid[])
  TO authenticated;

COMMIT;
