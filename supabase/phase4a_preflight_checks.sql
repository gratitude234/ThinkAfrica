-- Phase 4A / pre-4B preflight checks (see docs/content-model.md and
-- docs/content-model-phase4a-audit.md).
--
-- THIS IS NOT A MIGRATION. It lives outside supabase/migrations/ on
-- purpose and is never applied by a migration runner. Every query below is
-- read-only (SELECT only) -- none of them correct, backfill, or delete
-- anything. Run them by hand against a real database (via the Supabase
-- SQL editor or psql) before starting Phase 4B (the "contract" step that
-- drops posts.type, the sync trigger, and the legacy-consistency check) to
-- confirm production-shaped data is actually in the state Phase 4B
-- assumes. A non-zero count anywhere below is not necessarily an
-- emergency -- see the note under each query for what it actually means
-- and what, if anything, to do about it.
--
-- Depends on the helper functions added in
-- supabase/migrations/20260722000001_content_model_phase4a_cutover_prep.sql
-- (effective_content_kind, effective_article_format,
-- is_legacy_policy_brief_in_flight) -- run that migration before these
-- queries, or inline the equivalent CASE expressions if checking a
-- database that hasn't had it applied yet.

-- 1. Rows with null or invalid content_kind.
-- Expected before Phase 4B: zero. Every row should have been backfilled by
-- the Phase 1 migration (20260717000001) and kept in sync by
-- posts_sync_content_classification() since. A non-zero count here means
-- some write path is inserting/updating posts without going through a
-- dual-write-aware action AND without the sync trigger catching it (e.g. a
-- direct SQL script, or a service-role call that explicitly set `type`
-- alongside a null content_kind on the same statement without setting
-- content_kind at all -- the sync trigger only fires when content_kind is
-- NULL on INSERT, so this should be rare, not impossible).
SELECT id, type, content_kind, article_format, status, created_at
FROM public.posts
WHERE content_kind IS NULL
   OR content_kind NOT IN ('post', 'article', 'research')
ORDER BY created_at DESC;

-- 2. Invalid article_format combinations.
-- Expected before Phase 4B: zero -- posts_article_format_check and
-- posts_article_format_requires_article_check (both from
-- 20260717000001_content_model_phase1.sql) already enforce this at write
-- time, so this should only ever return rows if a constraint was bypassed
-- (e.g. a migration run with constraints disabled) or a row predates
-- those constraints and was never touched since.
SELECT id, type, content_kind, article_format, status, created_at
FROM public.posts
WHERE (article_format IS NOT NULL AND article_format NOT IN ('essay', 'policy_brief'))
   OR (article_format IS NOT NULL AND content_kind IS DISTINCT FROM 'article')
ORDER BY created_at DESC;

-- 3. New-model vs. legacy classification disagreements.
-- Expected before Phase 4B: zero -- posts_legacy_type_content_kind_check
-- (20260717000001) already rejects any row whose content_kind disagrees
-- with what `type` maps to. This query re-derives the same comparison
-- independently, as a second, non-constraint-dependent confirmation.
SELECT id, type, content_kind, article_format, status, created_at
FROM public.posts
WHERE content_kind IS NOT NULL
  AND content_kind <> CASE type
    WHEN 'blog' THEN 'post'
    WHEN 'essay' THEN 'article'
    WHEN 'policy_brief' THEN 'article'
    WHEN 'research' THEN 'research'
    ELSE NULL
  END
ORDER BY created_at DESC;

-- 4. Non-Post rows with a blank title.
-- Expected before Phase 4B: zero -- posts_title_required_unless_post_check
-- (20260718000001_content_model_phase2_titleless_posts.sql) already
-- enforces this. A non-zero result here would mean a row predates that
-- constraint and was never re-saved since, or the resolved kind and the
-- constraint's own (separately hand-coded, but equivalent) CASE
-- expression have drifted apart -- worth investigating either way.
SELECT id, type, content_kind, article_format, status, title, created_at
FROM public.posts
WHERE public.effective_content_kind(type, content_kind) <> 'post'
  AND (title IS NULL OR trim(both from title) = '')
ORDER BY created_at DESC;

-- 5. Published Research without expected workflow evidence.
-- Expected before Phase 4B: zero -- guard_locked_post_write blocks any
-- authenticated write from setting status='published' on research/
-- (legacy) policy_brief content, and publishReviewedPost()
-- (lib/reviewWorkflow.ts) always sets citation_id in the same call that
-- sets status='published'. A non-zero result means either that invariant
-- was bypassed (a direct service-role/SQL write outside
-- publishReviewedPost()) or citation_id was later cleared by something
-- other than the guarded paths -- treat as a data-integrity incident to
-- investigate, not a routine finding.
SELECT id, type, content_kind, article_format, status, citation_id, published_version_id, created_at
FROM public.posts
WHERE public.effective_content_kind(type, content_kind) = 'research'
  AND status = 'published'
  AND citation_id IS NULL
  AND published_version_id IS NULL
ORDER BY created_at DESC;

-- 6. Evidence-bearing records that must remain locked.
-- Informational, not a problem list: every row here is a formally-
-- reviewed publication (citation_id or published_version_id set) that
-- guard_locked_post_write/is_post_editable must keep locking after this
-- migration. Cross-check a sample of these against the application (their
-- /edit or /submit/research pages should refuse further changes) after
-- applying the Phase 4A migration, as a smoke test that the
-- effective_content_kind()-based lock still holds for both new-model
-- Research and legacy accepted Policy Briefs.
SELECT id, type, content_kind, article_format, status, citation_id, published_version_id
FROM public.posts
WHERE citation_id IS NOT NULL OR published_version_id IS NOT NULL
ORDER BY published_at DESC NULLS LAST;

-- 7. Pending/pending_revision legacy Policy Briefs still using the
-- temporary workflow-compatibility path.
-- Informational, not a problem list on its own -- this is exactly the set
-- isLegacyPolicyBriefInFlight() (lib/contentModel.ts) /
-- is_legacy_policy_brief_in_flight() (this migration) exist to identify.
-- Track this count over time: it should only ever shrink (as each
-- submission is accepted, rejected, or withdrawn) and never grow.
--
-- That claim depends on one specific fix, not just on "no newly-created
-- Policy-Brief-format Article can reach these statuses" in the abstract: a
-- pre-existing legacy Policy Brief that was still sitting as a DRAFT
-- (never submitted) when Phase 4A shipped is *not* "in flight" by this
-- helper's own definition (draft isn't pending/pending_revision), so it
-- must not be allowed to newly enter review either. publishPost()
-- (app/(write)/write/actions.ts) enforces this by converting any such
-- draft to an ordinary Policy-Brief-format Article at the moment of first
-- publish (dual-writing type="essay", preserving article_format=
-- "policy_brief" as pure genre) instead of routing it into 'pending' via
-- its raw legacy type. Confirm that conversion is intact -- and hasn't
-- regressed -- before trusting this count as a Phase 4B blocker signal: a
-- non-zero, non-shrinking, or growing count close to the intended Phase 4B
-- start date is a blocker either way -- see "Phase 4B exit criteria" in
-- docs/content-model.md.
SELECT id, author_id, status, current_round, created_at, revision_due_at
FROM public.posts
WHERE public.is_legacy_policy_brief_in_flight(type, status)
ORDER BY created_at ASC;

-- 8. Any writer still producing null new-model columns.
-- Same intent as check 1, but grouped to make a systemic source (one
-- write path producing many null rows, vs. scattered one-offs) easy to
-- spot at a glance. `type` groups the offending rows by what legacy value
-- they were written with, which is usually enough to identify the
-- responsible code path (or confirm it's pre-Phase-1 historical data).
SELECT type, count(*) AS null_content_kind_count, min(created_at) AS earliest, max(created_at) AS latest
FROM public.posts
WHERE content_kind IS NULL
GROUP BY type
ORDER BY null_content_kind_count DESC;
