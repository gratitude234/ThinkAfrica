BEGIN;

-- The profile's Article / Post split.
--
-- The product publishes two formats. The profile could not tell them apart:
-- `profile_record_entries` classifies an entry as publication, response or
-- research, which answers "what relationship does this work have to the
-- conversation" and never answers "is this a long-form Article or a short
-- Post". Both questions are real and they are orthogonal, so this adds the
-- second one alongside the first rather than replacing it.
--
-- The resolved kind comes from public.effective_content_kind(type,
-- content_kind), the same resolver the posts CHECK constraint and the feed
-- already use. Nothing here branches on legacy posts.type directly: a second
-- copy of that mapping is how the two would drift.
--
-- No table is created, no column is added to posts, and no backfill is
-- required. Legacy rows classify through the resolver exactly as they always
-- have: blog to post, essay and policy_brief to article, research to research.
--
-- DEPLOYMENT STATUS
-- -----------------
-- Source-controlled only. Creating this file does not prove it has run.
--
-- Ordering, and why the app does not need a release flag for it:
--   1. This migration is additive in both objects it touches. The view gains
--      a trailing column and keeps every existing one; the summary gains a
--      second function and leaves the first one standing. A deployed client
--      that knows nothing about either keeps working unchanged.
--   2. The application ships after it and asks for
--      get_public_profile_record_summary_v2 first, falling back to
--      get_public_profile_record_summary when PostgREST answers that the
--      function does not exist. See loadProfileRecordSummary. That fallback
--      is what holds the OLD DB + NEW APP case up, and it deletes itself
--      cleanly once this is applied everywhere, which a permanent env flag
--      would not.
--   3. Phase 2 application code does not select the view's new column. Phase
--      3 will, and by then this is deployed.
--
-- Preflight:
--   1. Confirm public.effective_content_kind(text, text) exists
--      (20260823000001_universal_publishing.sql).
--   2. Confirm public.profile_record_entries exists
--      (20260824000002_intellectual_profile_v2.sql).
--   3. In staging, check a legacy essay, a legacy policy brief, a legacy
--      blog, a modern article, a modern post and a response, then check that
--      article_count + post_count equals publication_count with
--      p_include_research false.
--
-- Rollback policy matches the other profile migrations: ship a forward
-- migration rather than editing this one.

-- ==========================================================================
-- 1. The record index gains the resolved content kind
-- ==========================================================================
--
-- CREATE OR REPLACE rather than DROP and CREATE. Postgres permits appending
-- columns to the end of a view's select list, and only appending, so
-- content_kind goes last. That keeps the view's grants, keeps every existing
-- consumer's column positions, and leaves no window in which the view does
-- not exist.
--
-- security_barrier travels with security_invoker deliberately. Without it a
-- cheap leakproof-looking predicate could be pushed below the RLS checks on
-- posts, which is the thing this view exists to prevent.
--
-- The Debate branch is deliberately absent. Debate is being removed from the
-- product by 20260906000003 and 20260906000004, which apply before this file;
-- referencing debate_arguments here would make this migration fail wherever
-- that work has already landed. Where it has not, this drops a branch that no
-- application code reads: ProfileRecordEntryKind is publication, response and
-- research, so a 'debate' row was already discarded on arrival.
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
  authorship.citation_id IS NOT NULL AS citable,
  -- Appended, so CREATE OR REPLACE accepts it. Orthogonal to entry_kind: a
  -- response is usually a post and occasionally an article, and the profile
  -- needs to be able to say so.
  public.effective_content_kind(
    authorship.type,
    authorship.content_kind
  )::text AS content_kind
FROM published_authorship AS authorship
LEFT JOIN public.post_reference_counts AS reference_count
  ON reference_count.post_id = authorship.entry_id;

REVOKE ALL ON TABLE public.profile_record_entries
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profile_record_entries
  TO anon, authenticated, service_role;

COMMENT ON VIEW public.profile_record_entries IS
  'RLS-aware index of public intellectual work. entry_kind is the relationship to the conversation (publication, response, research); content_kind is the published format (article, post, research), resolved through effective_content_kind. Carries identifiers and flags only; content is loaded from its protected source table.';

-- ==========================================================================
-- 2. The record summary gains article_count and post_count
-- ==========================================================================
--
-- A second function rather than a signature change to the first, following
-- replace_my_featured_posts_v2. CREATE OR REPLACE cannot widen a set
-- returning function's returned table, and dropping the deployed one would
-- break every client between this migration and the deploy that follows it.
-- Both read the same view, so they cannot disagree, and v1 is retired in a
-- later migration once no client asks for it.
--
-- The split counts publications only. A response is counted by
-- response_count and is not double counted here, and research keeps its own
-- bucket, so with p_include_research false the invariant is exact:
--
--   article_count + post_count = publication_count
--
-- With p_include_research true, publication_count also carries research, and
-- the difference is research_count.
DROP FUNCTION IF EXISTS public.get_public_profile_record_summary_v2(uuid, boolean);

CREATE FUNCTION public.get_public_profile_record_summary_v2(
  p_profile_id uuid,
  p_include_research boolean DEFAULT false
)
RETURNS TABLE (
  publication_count bigint,
  source_backed_count bigint,
  citable_count bigint,
  response_count bigint,
  research_count bigint,
  article_count bigint,
  post_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH visible_entry AS (
    SELECT
      entry.entry_kind,
      entry.content_kind,
      entry.source_backed,
      entry.citable
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
    count(*) FILTER (WHERE entry_kind = 'research') AS research_count,
    count(*) FILTER (
      WHERE entry_kind = 'publication' AND content_kind = 'article'
    ) AS article_count,
    count(*) FILTER (
      WHERE entry_kind = 'publication' AND content_kind = 'post'
    ) AS post_count
  FROM visible_entry;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile_record_summary_v2(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile_record_summary_v2(uuid, boolean)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_profile_record_summary_v2(uuid, boolean) IS
  'Public record counts for one profile, including the Article / Post split resolved through effective_content_kind. Supersedes get_public_profile_record_summary, which is kept until no deployed client calls it.';

COMMIT;

-- ==========================================================================
-- VERIFICATION
-- ==========================================================================
--
-- The view carries both classifications:
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'profile_record_entries'
--    order by ordinal_position;
--   -- content_kind must be last
--
-- The resolver is what classifies, including for legacy rows:
--   select p.type, p.content_kind, e.entry_kind, e.content_kind as resolved
--     from public.profile_record_entries e
--     join public.posts p on p.id = e.entry_id
--    limit 20;
--   -- blog -> post, essay -> article, policy_brief -> article
--
-- The split adds up:
--   select publication_count, article_count, post_count
--     from public.get_public_profile_record_summary_v2('<a real uuid>', false);
--   -- article_count + post_count = publication_count
--
-- The old function still answers, for clients deployed before this:
--   select * from public.get_public_profile_record_summary('<a real uuid>', false);
