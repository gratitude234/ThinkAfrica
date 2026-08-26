BEGIN;

-- Phase 3: the credibility graph.
--
-- Person -> work -> topic -> evidence -> citation -> review -> collaboration
-- -> debate -> recognition -> verified outcome.
--
-- Almost all of this is derived rather than stored. Citations, reviews,
-- collaborations and debate participation are already facts in canonical
-- tables; copying them into mutable "badge" rows would create a second source
-- of truth that drifts the first time a post is unpublished. The views below
-- read the canonical tables directly, so unpublishing a work removes its
-- signals in the same statement.
--
-- Two things genuinely have no canonical source and are therefore stored:
-- the relation from a reference to the work it cites, and verified
-- opportunity outcomes.
--
-- NOT STORED, DELIBERATELY: any debate winner or judged result. Ballots exist
-- (20260718000002) but are private, and that migration states a public
-- aggregate-results function is deferred. Until one exists, a winner could
-- only be inferred from votes or engagement, so this migration exposes
-- participation and completion only.
--
-- DEPLOYMENT STATUS
-- -----------------
-- Source-controlled only. Preflight:
--   1. Confirm 20260824000002_intellectual_profile_v2.sql is applied.
--   2. Confirm post_references, post_reviews, post_editor_decisions,
--      debates, debate_arguments and talent_inquiries exist as audited.
--   3. Confirm admin_audit_events exists.
--   4. In staging: publish a work citing another by /post/<slug> and by
--      /publication/<citation id>, unpublish the citing work, submit and
--      verify an opportunity outcome, dispute one, revoke one.

-- ==========================================================================
-- A. Citation edges
-- ==========================================================================

-- The durable form of "this reference points at that work". The original URL
-- and every other bibliographic field stay exactly as the author entered
-- them; this is an additional resolved relation, not a replacement.
--
-- ON DELETE SET NULL rather than CASCADE: deleting a cited work must not
-- delete the citing work's bibliography entry. The reference remains, and the
-- edge disappears.
ALTER TABLE public.post_references
  ADD COLUMN IF NOT EXISTS referenced_post_id uuid
    REFERENCES public.posts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.post_references.referenced_post_id IS
  'The Indegenius work this reference points at, resolved from an internal URL at save time. NULL for external sources. The original url column is preserved regardless.';

-- One edge per (citing work, cited work). An author who lists the same piece
-- three times in one bibliography has made one citation.
CREATE UNIQUE INDEX IF NOT EXISTS post_references_unique_internal_edge_idx
  ON public.post_references(post_id, referenced_post_id)
  WHERE referenced_post_id IS NOT NULL;

-- Inbound lookups: "who cites this work" is the query the profile runs.
CREATE INDEX IF NOT EXISTS post_references_referenced_post_idx
  ON public.post_references(referenced_post_id)
  WHERE referenced_post_id IS NOT NULL;

-- Backfill from URLs already stored. Idempotent: it only fills NULLs, and
-- re-running it changes nothing.
--
-- Only two shapes are matched, both of which identify a work unambiguously:
-- /post/<slug> and /publication/<citation_id>. Arbitrary external URLs are
-- never matched, and no fuzzy or host-less matching is attempted, because a
-- wrong match invents a citation nobody made.
WITH resolved AS (
  SELECT
    reference.id AS reference_id,
    cited.id AS cited_post_id,
    row_number() OVER (
      PARTITION BY reference.post_id, cited.id
      ORDER BY reference.display_order, reference.id
    ) AS occurrence
  FROM public.post_references AS reference
  JOIN public.posts AS cited
    ON (
      cited.slug = substring(reference.url FROM '/post/([A-Za-z0-9_-]+)')
      OR (
        cited.citation_id IS NOT NULL
        AND upper(cited.citation_id) =
            upper(substring(reference.url FROM '/publication/([A-Za-z0-9._-]+)'))
      )
    )
  WHERE reference.referenced_post_id IS NULL
    AND reference.url IS NOT NULL
    AND reference.url ~ '^(https?://[^/]*indegenius[^/]*)?/(post|publication)/'
)
UPDATE public.post_references AS reference
SET referenced_post_id = resolved.cited_post_id
FROM resolved
WHERE reference.id = resolved.reference_id
  -- Only the first occurrence, so the partial unique index above cannot be
  -- violated by a bibliography that repeats a source.
  AND resolved.occurrence = 1;

-- Public inbound-citation edges.
--
-- Both ends must be published, so an unpublished citing work vanishes from
-- every aggregate the moment its status changes. Self-citations are kept but
-- flagged, so a surface can show them separately and exclude them from
-- headline counts without a second query.
CREATE OR REPLACE VIEW public.public_citation_edges
WITH (security_invoker = true, security_barrier = true)
AS
SELECT
  reference.id AS edge_id,
  citing.id AS citing_post_id,
  citing.slug AS citing_slug,
  citing.title AS citing_title,
  citing.author_id AS citing_author_id,
  COALESCE(citing.published_at, citing.created_at) AS occurred_at,
  cited.id AS cited_post_id,
  cited.slug AS cited_slug,
  cited.title AS cited_title,
  cited_credit.profile_id AS cited_profile_id,
  -- A citation is a self-citation when the citing author is also credited on
  -- the cited work, whether as author or accepted co-author.
  (
    citing.author_id = cited_credit.profile_id
    OR EXISTS (
      SELECT 1
      FROM public.post_authors AS citing_author
      WHERE citing_author.post_id = citing.id
        AND citing_author.user_id = cited_credit.profile_id
        AND citing_author.accepted_at IS NOT NULL
    )
  ) AS is_self_citation
FROM public.post_references AS reference
JOIN public.posts AS citing ON citing.id = reference.post_id
JOIN public.posts AS cited ON cited.id = reference.referenced_post_id
-- Credit flows to the cited work's author and to every accepted co-author.
JOIN LATERAL (
  SELECT cited.author_id AS profile_id
  UNION
  SELECT author.user_id
  FROM public.post_authors AS author
  WHERE author.post_id = cited.id
    AND author.accepted_at IS NOT NULL
) AS cited_credit ON true
WHERE citing.status = 'published'
  AND cited.status = 'published'
  AND citing.id <> cited.id;

REVOKE ALL ON TABLE public.public_citation_edges FROM PUBLIC;
GRANT SELECT ON TABLE public.public_citation_edges
  TO anon, authenticated, service_role;

COMMENT ON VIEW public.public_citation_edges IS
  'Inbound citation edges between published Indegenius works. Credit flows to the cited work''s author and accepted co-authors. Self-citations are included but flagged so public counts can exclude them. Both ends must be published; unpublishing either removes the edge.';

-- ==========================================================================
-- B. Public review provenance
-- ==========================================================================

-- The underlying review tables carry private notes and, for peer review,
-- reviewer identity that must not be public. This projection exposes only
-- that a review of a given kind completed, and when. No reviewer id, no
-- notes, no recommendation: an "accept" and a "revise" are both completed
-- reviews, and publishing which one would leak the editorial judgment.
--
-- A review counts only for work that is published. A withdrawn or reset
-- review disappears because the row it derives from does.
CREATE OR REPLACE VIEW public.public_review_signals
WITH (security_invoker = true, security_barrier = true)
AS
SELECT
  'peer_reviewed'::text AS review_kind,
  review.post_id,
  post.slug AS post_slug,
  post.title AS post_title,
  min(review.submitted_at) AS occurred_at
FROM public.post_reviews AS review
JOIN public.posts AS post ON post.id = review.post_id
WHERE review.submitted_at IS NOT NULL
  AND review.recommendation IS NOT NULL
  AND post.status = 'published'
  -- A reviewer may never review their own work. Enforced at write time
  -- elsewhere; restated here so a historical row cannot produce a signal.
  AND review.reviewer_id <> post.author_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.post_authors AS author
    WHERE author.post_id = post.id
      AND author.user_id = review.reviewer_id
      AND author.accepted_at IS NOT NULL
  )
GROUP BY review.post_id, post.slug, post.title

UNION ALL

SELECT
  'editorially_reviewed'::text AS review_kind,
  decision.post_id,
  post.slug AS post_slug,
  post.title AS post_title,
  min(decision.created_at) AS occurred_at
FROM public.post_editor_decisions AS decision
JOIN public.posts AS post ON post.id = decision.post_id
WHERE decision.decision = 'accept'
  AND post.status = 'published'
  AND decision.editor_id <> post.author_id
GROUP BY decision.post_id, post.slug, post.title;

REVOKE ALL ON TABLE public.public_review_signals FROM PUBLIC;
GRANT SELECT ON TABLE public.public_review_signals
  TO anon, authenticated, service_role;

COMMENT ON VIEW public.public_review_signals IS
  'That a published work completed a review workflow, and which kind. Never exposes reviewer identity, review notes, or the recommendation. Editorial acceptance and peer review stay distinct; neither is produced by moderation approval.';

-- ==========================================================================
-- C. Bounded public summary
-- ==========================================================================

-- One call per profile for the aggregates a public profile needs, so a
-- profile render costs a bounded number of round trips rather than one per
-- signal type.
--
-- SECURITY INVOKER: every table it reads is already governed by RLS, and the
-- caller's own visibility is the correct visibility for a public aggregate.
CREATE OR REPLACE FUNCTION public.get_public_credibility_summary(
  p_profile_id uuid
)
RETURNS TABLE (
  inbound_citation_count integer,
  self_citation_count integer,
  citing_work_count integer,
  peer_reviewed_count integer,
  editorially_reviewed_count integer,
  accepted_collaboration_count integer,
  distinct_collaborator_count integer,
  debate_contribution_count integer,
  completed_debate_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
ROWS 1
AS $$
  WITH citations AS (
    SELECT *
    FROM public.public_citation_edges AS edge
    WHERE edge.cited_profile_id = p_profile_id
  ),
  owned_posts AS (
    SELECT post.id
    FROM public.posts AS post
    WHERE post.status = 'published'
      AND (
        post.author_id = p_profile_id
        OR EXISTS (
          SELECT 1
          FROM public.post_authors AS author
          WHERE author.post_id = post.id
            AND author.user_id = p_profile_id
            AND author.accepted_at IS NOT NULL
        )
      )
  ),
  reviews AS (
    SELECT signal.review_kind
    FROM public.public_review_signals AS signal
    JOIN owned_posts ON owned_posts.id = signal.post_id
  ),
  collaborations AS (
    SELECT DISTINCT post.id AS post_id, collaborator.user_id
    FROM public.posts AS post
    JOIN public.post_authors AS collaborator ON collaborator.post_id = post.id
    WHERE post.status = 'published'
      AND collaborator.accepted_at IS NOT NULL
      AND collaborator.user_id <> p_profile_id
      AND (
        post.author_id = p_profile_id
        OR EXISTS (
          SELECT 1
          FROM public.post_authors AS mine
          WHERE mine.post_id = post.id
            AND mine.user_id = p_profile_id
            AND mine.accepted_at IS NOT NULL
        )
      )
      -- A blocked person is not shown as a collaborator in either direction.
      AND NOT public.is_blocked_pair(p_profile_id, collaborator.user_id)
  ),
  debate_activity AS (
    -- author_id, matching profile_record_entries. debate_arguments has never
    -- had a user_id column.
    SELECT argument.debate_id, debate.status
    FROM public.debate_arguments AS argument
    JOIN public.debates AS debate ON debate.id = argument.debate_id
    WHERE argument.author_id = p_profile_id
  )
  SELECT
    (SELECT count(*) FROM citations WHERE NOT is_self_citation)::integer,
    (SELECT count(*) FROM citations WHERE is_self_citation)::integer,
    (SELECT count(DISTINCT citing_post_id) FROM citations WHERE NOT is_self_citation)::integer,
    (SELECT count(*) FROM reviews WHERE review_kind = 'peer_reviewed')::integer,
    (SELECT count(*) FROM reviews WHERE review_kind = 'editorially_reviewed')::integer,
    (SELECT count(DISTINCT post_id) FROM collaborations)::integer,
    (SELECT count(DISTINCT user_id) FROM collaborations)::integer,
    (SELECT count(DISTINCT debate_id) FROM debate_activity)::integer,
    (SELECT count(DISTINCT debate_id) FROM debate_activity WHERE status = 'closed')::integer;
$$;

REVOKE ALL ON FUNCTION public.get_public_credibility_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_credibility_summary(uuid)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_credibility_summary(uuid) IS
  'Bounded public credibility aggregates for one profile. Headline citation count excludes self-citations. Collaborations require accepted authorship and respect blocks. Debate figures cover participation and completion only: no winner is derived, because no canonical public judging result exists.';

COMMIT;

-- Post-apply verification (staging first): confirm referenced_post_id and its
-- two indexes exist, that the backfill left no duplicate (post_id,
-- referenced_post_id) pairs, that public_citation_edges and
-- public_review_signals are security_invoker, and that
-- get_public_credibility_summary returns zeros rather than an error for a
-- profile with no activity.
