-- Phase 4A of the Post/Article/Research content-model migration (see
-- docs/content-model.md and docs/content-model-phase4a-audit.md). This is
-- the "cutover-preparation" step: it moves the Phase 3 security/workflow
-- functions' content-classification decisions onto the new
-- content_kind/article_format columns (falling back to legacy `type` only
-- when the new columns are absent), without performing the final
-- "contract" step. This migration does NOT:
--   - drop or rename posts.type, or remove its NOT NULL constraint
--   - drop the Phase 1 sync trigger (posts_sync_content_classification) or
--     the legacy-consistency check (posts_legacy_type_content_kind_check)
--   - make content_kind NOT NULL
--   - change posts_status_check (no new statuses are introduced here)
--   - touch anything Debate V2
-- Everything Phase 3 built (withdrawn/removed/accepted-publication
-- immutability, drafts-only hard delete, reviewer-retirement protection,
-- the auth.role()-vs-current_user SECURITY DEFINER fix) is preserved
-- exactly -- only the *content-classification predicates* inside those
-- functions change, from hand-coded `type IN ('research','policy_brief')`
-- checks to a single, reusable, new-model-aware helper.
--
-- Revision (caught in review before being used): the first draft of
-- guard_locked_post_write()'s self-publish check only ever inspected NEW's
-- *resulting* classification -- unchanged from Phase 3's own design, which
-- had the identical gap. A single authenticated UPDATE that reclassified a
-- pending research row (or pending legacy Policy Brief) away from
-- research/policy_brief *and* set status='published' in the same
-- statement made the row look like an ordinary, self-publishable Article
-- by the time the check ran, escaping review entirely without ever
-- touching citation_id/published_version_id. Fixed by freezing
-- type/content_kind/article_format, and restricting status transitions to
-- the author-legitimate subset, for the entire time a research submission
-- or legacy Policy Brief sits in pending/pending_revision -- see the
-- dedicated block in guard_locked_post_write() below, and the matching fix
-- applied directly to
-- supabase/migrations/20260720000001_lock_accepted_and_removed_posts.sql
-- (still unapplied, so fixing it in place rather than layering a second
-- patch on top is safe and keeps both phases individually correct).
--
-- Product decision this migration encodes (see docs/content-model.md):
-- content_kind = 'research' is the only content that formally requires
-- review under the target model. article_format = 'policy_brief' is
-- descriptive Article metadata and must never, by itself, lock a row,
-- block a self-publish attempt, or gate withdrawal -- a brand-new
-- Policy-Brief-format Article always dual-writes type='essay' (see
-- legacyTypeForNewContent() in lib/contentModel.ts) and publishes
-- immediately like any other Article, so it can never even reach the
-- states these guards protect (published-and-locked, pending-and-
-- withdrawable). Only a row that predates this phase -- or that legacy
-- code somewhere still writes -- carries the literal legacy value
-- type = 'policy_brief', so checking that literal value (never
-- article_format) is what keeps this compatibility narrowly scoped to
-- genuinely legacy rows. This is the exact same reasoning
-- isLegacyPolicyBriefInFlight()/needsEditorialWorkflow() encode in
-- lib/contentModel.ts for the application layer.

-- Centralized SQL equivalent of lib/contentModel.ts's resolveContentKind():
-- prefers a valid content_kind, falls back to mapping the legacy `type`
-- column. Mirrors the CASE expression already proven correct by
-- posts_title_required_unless_post_check
-- (20260718000001_content_model_phase2_titleless_posts.sql) -- reused here
-- verbatim rather than re-derived, so every Phase 3 function that needs
-- "what kind is this row, really" computes it identically instead of
-- hand-coding its own mapping. IMMUTABLE: a pure function of its two text
-- arguments, no table access.
CREATE OR REPLACE FUNCTION public.effective_content_kind(p_type text, p_content_kind text)
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

-- Centralized SQL equivalent of lib/contentModel.ts's resolveArticleFormat().
-- Only meaningful when effective_content_kind(...) = 'article'; NULL
-- otherwise. Mirrors the same "once content_kind is an explicit, populated
-- new-model value, it's authoritative -- a null article_format means 'no
-- format', not 'go infer one from type'" guard the JS resolver documents,
-- so a brand-new generic Article (type='essay', content_kind='article',
-- article_format=NULL) is never confused with a genuine legacy Essay.
CREATE OR REPLACE FUNCTION public.effective_article_format(
  p_type text,
  p_content_kind text,
  p_article_format text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.effective_content_kind(p_type, p_content_kind) IS DISTINCT FROM 'article' THEN NULL
    WHEN p_article_format IN ('essay', 'policy_brief') THEN p_article_format
    WHEN p_content_kind IN ('post', 'article', 'research') THEN NULL
    WHEN p_type = 'essay' THEN 'essay'
    WHEN p_type = 'policy_brief' THEN 'policy_brief'
    ELSE NULL
  END;
$$;

-- Companion to isLegacyPolicyBriefInFlight() in lib/contentModel.ts:
-- identifies a legacy Policy Brief still actively inside the pre-Phase-4A
-- editorial workflow (pending or pending_revision). Deliberately checks
-- the literal `type = 'policy_brief'` value, never article_format -- a
-- brand-new Policy-Brief-format Article always dual-writes type='essay'
-- and (per the product decision above) never reaches these statuses at
-- all, so it can never match here. Not used directly by the guard
-- functions below (they use the broader, status-independent
-- "effective_content_kind = 'research' OR type = 'policy_brief'" predicate,
-- which also has to cover an *already-published, locked* legacy Policy
-- Brief -- not just an in-flight one); provided as its own named,
-- reusable predicate for preflight queries
-- (supabase/phase4a_preflight_checks.sql) and any future caller that needs
-- the narrower, status-scoped question specifically.
CREATE OR REPLACE FUNCTION public.is_legacy_policy_brief_in_flight(p_type text, p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_type = 'policy_brief' AND p_status IN ('pending', 'pending_revision');
$$;

-- guard_locked_post_write(): only the content-classification predicates
-- change (self-publish block, already-locked check, withdrawn-transition
-- type check). Everything else -- the current_user/auth.role() bypass, the
-- DELETE/drafts-only guard, the citation_id/published_version_id evidence
-- guard, the removed-status guard, and the withdrawn-terminal guard -- is
-- reproduced verbatim from
-- supabase/migrations/20260720000001_lock_accepted_and_removed_posts.sql.
CREATE OR REPLACE FUNCTION public.guard_locked_post_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- NEW does not exist on DELETE -- returning it unconditionally here
  -- would return NULL for every bypassed DELETE, which a BEFORE DELETE
  -- trigger treats as "skip this row," silently cancelling the delete
  -- instead of allowing it. COALESCE(NEW, OLD) is correct for every
  -- operation this trigger covers.
  --
  -- auth.role() alone cannot tell a direct authenticated write apart from
  -- a SECURITY DEFINER function (withdraw_post_submission() below)
  -- executing on that same authenticated user's behalf -- see the note on
  -- withdraw_post_submission() in the Phase 3 migration for the full
  -- explanation. current_user is what actually distinguishes the two.
  IF auth.role() IS DISTINCT FROM 'authenticated' OR current_user IS DISTINCT FROM 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Hard-delete is for drafts only. Everything else -- pending/
    -- pending_revision (withdraw it instead), published Articles/Posts,
    -- rejected, removed, or already-withdrawn -- is not directly
    -- deletable by its author, full stop.
    IF OLD.status != 'draft' THEN
      RAISE EXCEPTION 'Only drafts can be deleted directly. Withdraw a submission instead of deleting it.';
    END IF;
    RETURN OLD;
  END IF;

  -- No authenticated write may result in a row claiming to be an accepted,
  -- formally-reviewed publication. Phase 4A: "is this row research, or a
  -- legacy Policy Brief" is now resolved through effective_content_kind()
  -- (content_kind first, `type` fallback) OR'd with the literal legacy
  -- type='policy_brief' value -- see the product-decision note at the top
  -- of this file for why article_format itself must never appear in this
  -- predicate.
  IF NEW.status = 'published'
    AND (public.effective_content_kind(NEW.type, NEW.content_kind) = 'research' OR NEW.type = 'policy_brief')
  THEN
    RAISE EXCEPTION 'Research and policy briefs can only be published by an editor accepting a submission.';
  END IF;

  -- BLOCKING gap (caught in review): the self-publish check above only
  -- ever inspects NEW's *resulting* classification. Because it evaluates
  -- against NEW, not OLD, a single authenticated UPDATE that changes
  -- type/content_kind/article_format *and* sets status='published' in the
  -- same statement could make a row that was actually a pending research
  -- submission -- or a pending legacy Policy Brief -- look like an
  -- ordinary Article by the time the check runs, e.g.:
  --   UPDATE posts SET type='essay', content_kind='article',
  --     article_format=NULL, status='published' WHERE id='<pending research>';
  -- effective_content_kind(NEW.type, NEW.content_kind) resolves to
  -- 'article' (not 'research'), NEW.type isn't 'policy_brief' either, so
  -- the self-publish check above never fires, and the row escapes review
  -- entirely without ever touching citation_id/published_version_id (the
  -- evidence guard below doesn't apply either, since neither field is
  -- touched by this attack).
  --
  -- Fixed by freezing classification, and restricting which status
  -- transitions an author may make directly, for the entire time a
  -- research submission or legacy Policy Brief sits in pending/
  -- pending_revision: no authenticated write may change type/
  -- content_kind/article_format while OLD is in that state, and status
  -- may only stay exactly where it is (pending) or move within the
  -- author-legitimate revision cycle (pending_revision -> pending, i.e.
  -- resubmission, or stay in pending_revision, e.g. an autosave while
  -- still revising). Every other transition -- most importantly straight
  -- to 'published', but also a direct 'pending' -> 'pending_revision',
  -- which is an *editorial* decision (recordEditorDecision(), always
  -- service role, and so already bypasses this trigger entirely) -- is
  -- rejected. Withdrawal still works: it goes through
  -- withdraw_post_submission(), which bypasses this whole trigger via the
  -- current_user check above, so it never reaches this block at all; a
  -- *direct* authenticated attempt at the same transition is correctly
  -- rejected here (NEW.status='withdrawn' is not in the allowed set),
  -- on top of the dedicated withdrawn-transition check further below.
  IF TG_OP = 'UPDATE'
    AND OLD.status IN ('pending', 'pending_revision')
    AND (public.effective_content_kind(OLD.type, OLD.content_kind) = 'research' OR OLD.type = 'policy_brief')
  THEN
    IF NEW.type IS DISTINCT FROM OLD.type
      OR NEW.content_kind IS DISTINCT FROM OLD.content_kind
      OR NEW.article_format IS DISTINCT FROM OLD.article_format
    THEN
      RAISE EXCEPTION 'A submission awaiting review or in revision cannot change its classification.';
    END IF;

    IF OLD.status = 'pending' AND NEW.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'A submission awaiting review can only be changed by the editorial decision workflow.';
    END IF;

    IF OLD.status = 'pending_revision' AND NEW.status NOT IN ('pending_revision', 'pending') THEN
      RAISE EXCEPTION 'A submission in revision can only stay in revision or be resubmitted for review.';
    END IF;
  END IF;

  -- citation_id / published_version_id are exactly the workflow-completion
  -- evidence isFormallyReviewed() trusts (lib/contentModel.ts). An
  -- authenticated write may never touch either in any direction.
  IF TG_OP = 'INSERT' THEN
    IF NEW.citation_id IS NOT NULL THEN
      RAISE EXCEPTION 'citation_id can only be assigned by the editorial acceptance workflow.';
    END IF;
    IF NEW.published_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'published_version_id can only be assigned by the editorial acceptance workflow.';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.citation_id IS DISTINCT FROM OLD.citation_id THEN
      RAISE EXCEPTION 'citation_id can only be assigned by the editorial acceptance workflow.';
    END IF;
    IF NEW.published_version_id IS DISTINCT FROM OLD.published_version_id THEN
      RAISE EXCEPTION 'published_version_id can only be assigned by the editorial acceptance workflow.';
    END IF;
  END IF;

  -- Once a research paper or policy brief has actually been accepted, its
  -- content is locked -- not just its status/type/citation fields -- so
  -- its citation record stays stable. OLD only exists on UPDATE. Same
  -- effective-classification predicate as the self-publish check above,
  -- applied to OLD instead of NEW.
  IF TG_OP = 'UPDATE'
    AND OLD.status = 'published'
    AND (public.effective_content_kind(OLD.type, OLD.content_kind) = 'research' OR OLD.type = 'policy_brief')
  THEN
    RAISE EXCEPTION 'This publication is locked after acceptance and cannot be modified directly.';
  END IF;

  -- A removed post is locked from further author edits. Moderation always
  -- applies this through the admin client (service role), so no
  -- authenticated write should ever set or already carry this status.
  IF NEW.status = 'removed' OR (TG_OP = 'UPDATE' AND OLD.status = 'removed') THEN
    RAISE EXCEPTION 'This post was removed and cannot be modified.';
  END IF;

  -- 'withdrawn' is reachable only via withdraw_post_submission(), which
  -- bypasses this trigger entirely for its own writes (current_user check
  -- above). This check exists purely to reject a *different*, direct
  -- authenticated write attempting the same transition. Phase 4A: the
  -- "research or legacy policy brief" test is now effective-
  -- classification-aware, same as the self-publish/already-locked checks.
  IF NEW.status = 'withdrawn' THEN
    IF NOT (public.effective_content_kind(NEW.type, NEW.content_kind) = 'research' OR NEW.type = 'policy_brief') THEN
      RAISE EXCEPTION 'Only a research paper or policy brief submission can be withdrawn.';
    END IF;
    IF TG_OP = 'INSERT' OR OLD.status NOT IN ('pending', 'pending_revision') THEN
      RAISE EXCEPTION 'Only a submission awaiting or in revision can be withdrawn.';
    END IF;
  END IF;

  -- Terminal, like 'removed': once withdrawn, no further authenticated
  -- write of any kind.
  IF TG_OP = 'UPDATE' AND OLD.status = 'withdrawn' THEN
    RAISE EXCEPTION 'This submission was withdrawn and cannot be modified.';
  END IF;

  RETURN NEW;
END;
$$;

-- is_post_editable(): same substitution as guard_locked_post_write's
-- already-locked check -- "published AND (research OR legacy policy
-- brief)" now goes through effective_content_kind() instead of a bare
-- `type IN (...)`. 'removed'/'withdrawn' locking is untouched (neither
-- depends on content classification).
CREATE OR REPLACE FUNCTION public.is_post_editable(target_post_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.posts
    WHERE id = target_post_id
      AND (
        (
          status = 'published'
          AND (public.effective_content_kind(type, content_kind) = 'research' OR type = 'policy_brief')
        )
        OR status = 'removed'
        OR status = 'withdrawn'
      )
  );
$$;

-- withdraw_post_submission(): same substitution in the WHERE clause that
-- scopes which rows may be withdrawn. Transactional behavior (retiring
-- active post_reviews rows in the same call), SECURITY DEFINER, and the
-- REVOKE/GRANT below are all reproduced unchanged from the Phase 3
-- migration.
CREATE OR REPLACE FUNCTION public.withdraw_post_submission(target_post_id uuid)
RETURNS public.posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_post public.posts;
BEGIN
  UPDATE public.posts
  SET status = 'withdrawn'
  WHERE id = target_post_id
    AND author_id = auth.uid()
    AND (public.effective_content_kind(type, content_kind) = 'research' OR type = 'policy_brief')
    AND status IN ('pending', 'pending_revision')
  RETURNING * INTO updated_post;

  IF updated_post.id IS NULL THEN
    RAISE EXCEPTION 'Only a submission awaiting or in revision can be withdrawn.';
  END IF;

  UPDATE public.post_reviews
  SET removed_at = now()
  WHERE post_id = target_post_id
    AND removed_at IS NULL;

  RETURN updated_post;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_post_submission(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_post_submission(uuid) TO authenticated;

-- Verified scenarios (traced by hand; no local Postgres harness is
-- configured in this repo -- see CLAUDE.md):
--   1. A brand-new Policy-Brief-format Article (type='essay',
--      content_kind='article', article_format='policy_brief',
--      status='published', no citation_id): self-publish check ->
--      effective_content_kind = 'article' (not 'research'), type <>
--      'policy_brief' -> condition false -> not blocked, publishes freely,
--      same as any other Article. Already-locked check -> same reasoning,
--      never locks. Never reaches 'pending', so withdrawal/withdrawn-
--      transition checks are moot for it.
--   2. A legacy Policy Brief (type='policy_brief', content_kind='article',
--      article_format='policy_brief') at status='pending': self-publish
--      check on a direct authenticated UPDATE to status='published' ->
--      type = 'policy_brief' -> condition true -> blocked (must go through
--      publishReviewedPost(), service role). Withdrawal via
--      withdraw_post_submission() -> WHERE clause matches (type =
--      'policy_brief', status IN pending/pending_revision) -> succeeds,
--      retires active reviews, same as before this migration.
--   3. The same legacy Policy Brief once accepted (status='published',
--      citation_id set): already-locked check -> type = 'policy_brief' ->
--      condition true -> any further authenticated UPDATE blocked, exactly
--      as Phase 3 already guaranteed. Evidence/citation stays intact and
--      presented -- nothing here touches citation_id/published_version_id
--      or the rows themselves.
--   4. A genuine new-model Research submission (type='research',
--      content_kind='research'): effective_content_kind = 'research' in
--      every check -> identical behavior to Phase 3 (which already keyed
--      correctly off type='research' alone).
--   5. A row with content_kind populated but disagreeing with what `type`
--      would map to on its own is impossible by construction --
--      posts_legacy_type_content_kind_check
--      (20260717000001_content_model_phase1.sql) already rejects that
--      combination at write time -- so effective_content_kind() never
--      actually has to arbitrate a genuine disagreement; it only ever
--      exercises its "content_kind is explicit and valid" branch or its
--      "fall back to type" branch.
--   6. current_user/auth.role() bypass and every other Phase 3 guard
--      (drafts-only DELETE, citation_id/published_version_id evidence,
--      removed-status lock, withdrawn-terminal lock, is_post_reviewer()
--      removed_at, reviewer_can_submit USING/WITH CHECK,
--      guard_post_review_submission()'s immutable-fields check) are
--      untouched by this migration -- none of them branch on content
--      classification, so none needed a substitution.
--   7. (Caught in review) The exact reclassify-and-publish attack: a
--      direct authenticated UPDATE on a pending research row --
--      `SET type='essay', content_kind='article', article_format=NULL,
--      status='published'` -- in one statement. OLD.status='pending' and
--      effective_content_kind(OLD.type, OLD.content_kind)='research', so
--      the classification-freeze block fires on the very first condition
--      (NEW.type IS DISTINCT FROM OLD.type) before status is even
--      considered -> rejected. The identical attack against a pending
--      legacy Policy Brief (OLD.type='policy_brief') is caught the same
--      way, via the OLD.type = 'policy_brief' branch of the same guard.
--   8. A direct authenticated UPDATE attempting 'pending' -> 'pending_revision'
--      for a research/legacy-policy-brief row (impersonating an editorial
--      decision) -> classification unchanged, but
--      OLD.status='pending' AND NEW.status <> 'pending' -> rejected. The
--      real transition (recordEditorDecision(), always service role) never
--      reaches this check at all -- the bypass at the top of this
--      function already returns before it.
--   9. Legitimate author activity while pending/pending_revision: an
--      autosave-style UPDATE that leaves status and classification exactly
--      as they were (OLD.status='pending', NEW.status='pending', no
--      classification change) -> both new conditions pass (status stays
--      'pending', classification unchanged) -> allowed, same as before.
--      A resubmission from pending_revision (current_round bumped,
--      status set to 'pending', classification unchanged) -> allowed by
--      the pending_revision branch's `NEW.status NOT IN ('pending_revision',
--      'pending')` check.
