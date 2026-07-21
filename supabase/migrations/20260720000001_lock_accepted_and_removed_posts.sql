-- Closes a trust-boundary gap flagged in Phase 3 review: "Authors can
-- update their own posts" (base_schema.sql) is row-level only and does not
-- restrict *what* changes -- unlike like_count, which was locked down with
-- a column-level REVOKE (see 20260715000003_lock_like_count_column.sql),
-- the fields this migration protects (content, status, citation_id, etc.)
-- must stay editable by their author while a post is a draft or mid-
-- revision, so a blanket REVOKE isn't the right tool: the restriction has
-- to be conditional on the row's own state, which only a trigger can
-- express.
--
-- Revision history (this file was never applied -- caught in review before
-- being used, seven times):
--   1. The first draft only inspected OLD.status on UPDATE, so it did
--      nothing about an INSERT that arrives already published, a direct
--      pending->published UPDATE, or reclassifying a published Article's
--      `type` into research/policy_brief. Rewritten to check NEW instead,
--      and to also guard INSERT.
--   2. The second draft's evidence guard only rejected a *non-null*
--      citation_id/published_version_id being introduced or changed, so an
--      authenticated write could still clear either back to null on an
--      otherwise-untouched row. Rewritten below to reject any distinct
--      change in either direction. Its companion child-table trigger
--      (guard_locked_post_child_write) also only ever checked
--      COALESCE(NEW.post_id, OLD.post_id) -- which resolves to NEW.post_id
--      on every UPDATE, since NEW always exists there -- so
--      `UPDATE post_references SET post_id = '<own editable draft>' WHERE
--      id = '<reference belonging to an accepted paper>'` passed with only
--      the *destination* post checked, silently detaching the row from the
--      locked publication it belonged to. Rewritten to branch explicitly
--      on TG_OP and check OLD.post_id and NEW.post_id separately.
--   3. The trigger only covered `BEFORE INSERT OR UPDATE`. "Authors can
--      delete their own posts" (base_schema.sql) has no status
--      restriction either, and post_versions/post_references/post_authors
--      all reference posts(id) ON DELETE CASCADE, so an author could
--      `DELETE FROM posts WHERE id = '<accepted paper>'` directly and take
--      its entire editorial record -- versions, references, co-authors --
--      with it. Reachable through the app itself, not just a direct API
--      call: app/(main)/dashboard/PostsTable.tsx's delete button only
--      hides itself for non-draft rows client-side (`post.status ===
--      "draft"`); its handler calls `.from("posts").delete()` on the
--      regular RLS-scoped client with no status check at all. Rewritten to
--      also guard DELETE, and see the note on the bypass check below for a
--      bug this introduced and then fixed in the same revision. The
--      initial version of this DELETE guard only blocked the same two
--      "locked" cases the UPDATE guard already blocked (published
--      research/policy_brief, or removed) -- see the product decision
--      below for why that turned out not to be the intended contract.
--   4. The 'withdrawn' transition added in the next revision (see the
--      prose note further down) was validated for *shape* but not for
--      *who*/*how*: "Authors can update their own posts" had no WITH CHECK
--      of its own, so any direct authenticated write matching that shape
--      passed identically to going through withdraw_post_submission(), but
--      skipped its post_reviews.removed_at cleanup -- an author could
--      withdraw a submission directly and leave its active reviewer
--      assignments live. Separately, is_post_reviewer() granted read access
--      and review-submission rights with no regard for removed_at at all,
--      so even reviewers correctly retired by that RPC (or by an editor's
--      removeReviewer()) kept both. Fixed by: a WITH CHECK on the posts
--      UPDATE policy rejecting status='withdrawn' from any direct
--      authenticated write; is_post_reviewer() now requiring
--      removed_at IS NULL; and guard_post_review_submission() additionally
--      requiring immutable post_id/reviewer_id, OLD.recommendation IS NULL,
--      and OLD.removed_at IS NULL. See the corresponding notes below.
--   5. The is_post_reviewer() fix in revision 4 was itself reachable by a
--      removed reviewer directly: "reviewer_can_submit" (the RLS policy
--      backing submitReview()) had no column restriction at all, and
--      guard_post_review_submission()'s new removed_at check only ran when
--      recommendation changed -- so `UPDATE post_reviews SET removed_at =
--      NULL WHERE id = '<own retired row>'` restored exactly the access
--      revision 4 had just revoked. Fixed by rewriting
--      "reviewer_can_submit"'s USING/WITH CHECK to make a removed or
--      already-submitted row unreachable for a reviewer's own direct write
--      in the first place, and extending guard_post_review_submission() to
--      make round/assigned_at/removed_at/reminded_at immutable
--      unconditionally, not just alongside a recommendation change.
--   6. Revision 5's unconditional removed_at check broke the withdrawal RPC
--      it was meant to backstop: SECURITY DEFINER changes current_user (to
--      the function's owner) but not the request.jwt.claims GUC
--      auth.role()/auth.uid() read, so auth.role() still returns
--      'authenticated' *inside* withdraw_post_submission() too -- the
--      bypass check never fired there, and the function's own
--      `SET removed_at = now()` on post_reviews was rejected by its own
--      backstop, rolling back the entire withdrawal (including the post's
--      status change) every time. Fixed by also requiring current_user =
--      'authenticated' in the bypass check on guard_locked_post_write,
--      guard_locked_post_child_write, and guard_post_review_submission --
--      current_user is what SECURITY DEFINER actually changes, so it's
--      what actually distinguishes this function's own writes from a
--      direct authenticated write attempting the same thing. See the note
--      on withdraw_post_submission() below for the full explanation.
--   7. The self-publish check from revision 1 only ever inspected NEW.type,
--      never OLD.type -- so a single authenticated UPDATE reclassifying a
--      *pending* research/policy_brief row's `type` away from those values
--      while *also* setting status='published' in the same statement made
--      the row look like an ordinary, already-Article row by the time that
--      check ran, escaping review entirely without ever touching
--      citation_id/published_version_id. Fixed by freezing type (and
--      content_kind/article_format, for defense in depth) and restricting
--      status transitions to the author-legitimate subset, for the entire
--      time a research/policy_brief row sits in pending/pending_revision.
--      See the corresponding note below.
--
-- Server actions (app/(write)/write/actions.ts, app/(main)/edit/[slug]/
-- actions.ts) already enforce the "locked after acceptance" half of this
-- in application code. But those actions run as the 'authenticated' role
-- via RLS, the exact same role a request that bypasses them entirely
-- (calling Supabase directly with a valid session) would use. Without a
-- matching DB-level guard, that second path was never actually enforced.
--
-- Scope mirrors what the application already trusts as evidence of formal
-- review (see isFormallyReviewed() in lib/contentModel.ts: citation_id or
-- published_version_id) and the existing "published + requiresEditorialWorkflow"
-- lock in app/(main)/edit/[slug]/actions.ts. Draft, pending, and
-- pending_revision rows -- and Articles/Posts, which are never formally
-- reviewed -- are otherwise untouched; author edits to those remain
-- legitimate through the normal RLS-scoped write paths.
--
-- Every legitimate way to reach the state this trigger blocks --
-- publishReviewedPost() accepting a submission, moderation marking a post
-- removed/restoring it, admin edits -- already runs through
-- createAdminClient() (service role) elsewhere in this codebase. The guard
-- is scoped to `auth.role() = 'authenticated'` specifically (an allow-list
-- of one, rather than a bypass-list): service-role writes pass through as
-- before, and so does any session with no PostgREST JWT context at all --
-- a Postgres superuser maintenance session, a migration script, the
-- Supabase SQL editor -- none of which set auth.role() to 'authenticated'.
-- (This trigger, and its siblings below, also check current_user =
-- 'authenticated' alongside auth.role() -- see the note on
-- withdraw_post_submission() further down for why auth.role() by itself
-- isn't enough once a SECURITY DEFINER function enters the picture.)
--
-- Product decision (Phase 3 DB review): authenticated users may hard-delete
-- only status='draft' rows -- nothing else. Pending/pending_revision
-- submissions and published Articles/Posts are not hard-deletable by their
-- author at all; a pending/pending_revision research or policy brief is
-- withdrawn instead (status='withdrawn', see withdrawSubmission() in
-- app/(write)/write/actions.ts and the posts_status_check update below),
-- which preserves its post_versions/post_references/post_authors/
-- post_reviews/post_editor_decisions rather than cascade-deleting them.
-- This matches the DELETE guard to what app/(main)/dashboard/
-- PostsTable.tsx's delete button already implies (draft-only) rather than
-- leaving the database more permissive than the UI without a reason.
-- 'withdrawn' is the new terminal status withdrawSubmission()
-- (app/(write)/write/actions.ts) moves a pending/pending_revision research
-- paper or policy brief into, in place of deleting it. Like 'removed', it
-- is not covered by the "Published posts are viewable by everyone" SELECT
-- policy on its own (status = 'published' OR auth.uid() = author_id OR
-- is_post_reviewer(id) OR is_post_coauthor(id) --
-- 20260423000006_fix_editorial_rls_cycles.sql), so a withdrawn submission
-- is visible to its author and any co-author, but not the public. Whether
-- it also stayed visible to reviewers depended entirely on
-- is_post_reviewer() -- see the fix to that function below: until it
-- required removed_at IS NULL, every reviewer withdraw_post_submission()
-- had just retired kept read access anyway, which is corrected as of this
-- revision. Nothing about a withdrawn submission is deleted either way.
--
-- Revision (caught in review again): the version above left 'withdrawn'
-- entirely outside this trigger's own rules -- its only precondition
-- (pending/pending_revision only) lived in withdrawSubmission(), an
-- 'authenticated'-role server action with no matching DB-level backstop.
-- That meant a direct authenticated write could set a draft or rejected
-- post straight to 'withdrawn', flip a withdrawn submission back to
-- 'pending' (undoing the withdrawal without going through resubmission),
-- or -- since is_post_editable() didn't count 'withdrawn' as locked --
-- still edit a withdrawn submission's references/co-authors. Fixed below:
-- the transition into 'withdrawn' is now enforced here too (only from
-- pending/pending_revision, only for research/policy_brief), and once a
-- row is 'withdrawn' it is just as terminal as 'removed' -- no further
-- authenticated write of any kind, and is_post_editable() now excludes it.
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_status_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_status_check
  CHECK (status = ANY (ARRAY['draft', 'pending', 'pending_revision', 'published', 'rejected', 'removed', 'withdrawn']));

CREATE OR REPLACE FUNCTION public.guard_locked_post_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- NEW does not exist on DELETE -- returning it unconditionally here
  -- (as an earlier revision did, before DELETE was a guarded event) would
  -- return NULL for every bypassed DELETE, which a BEFORE DELETE trigger
  -- treats as "skip this row," silently cancelling the delete instead of
  -- allowing it. COALESCE(NEW, OLD) is correct for every operation this
  -- trigger now covers.
  --
  -- auth.role() alone is not enough to tell a direct authenticated write
  -- apart from a SECURITY DEFINER function (withdraw_post_submission()
  -- below) executing on that same authenticated user's behalf: auth.role()
  -- reads the request.jwt.claims GUC, which SECURITY DEFINER's role switch
  -- never touches, so it still reads 'authenticated' inside that function
  -- too. current_user is what SECURITY DEFINER actually changes -- it
  -- becomes the function's owner there, never the literal 'authenticated'
  -- role PostgREST executes real authenticated requests as -- so checking
  -- it here is what actually distinguishes the two.
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
  -- formally-reviewed publication. This single check blocks every
  -- self-publish path: an INSERT already marked published, a
  -- pending->published UPDATE, and reclassifying an already-published
  -- Article's `type` into research/policy_brief while status stays
  -- published.
  IF NEW.status = 'published' AND NEW.type IN ('research', 'policy_brief') THEN
    RAISE EXCEPTION 'Research and policy briefs can only be published by an editor accepting a submission.';
  END IF;

  -- BLOCKING gap (caught in review): the self-publish check above only
  -- ever inspects NEW.type, not OLD.type. A single authenticated UPDATE
  -- that changes `type` away from research/policy_brief *and* sets
  -- status='published' in the same statement -- e.g.
  -- `SET type='essay', status='published' WHERE id='<pending research>'`
  -- -- makes the row look like an ordinary, self-publishable Article by
  -- the time the check above runs, escaping review entirely without ever
  -- touching citation_id/published_version_id (the evidence guard below
  -- doesn't apply either, since neither field is touched by this attack).
  --
  -- Fixed by freezing `type` -- and, for defense in depth, content_kind/
  -- article_format too, even though this trigger's own decisions never
  -- read them -- and restricting which status transitions an author may
  -- make directly, for the entire time a research submission or policy
  -- brief sits in pending/pending_revision: status may only stay exactly
  -- where it is (pending) or move within the author-legitimate revision
  -- cycle (pending_revision -> pending, i.e. resubmission, or stay in
  -- pending_revision). Every other transition -- most importantly
  -- straight to 'published', but also a direct 'pending' ->
  -- 'pending_revision', which is an *editorial* decision
  -- (recordEditorDecision(), always service role, and so already bypasses
  -- this trigger entirely) -- is rejected. Withdrawal is unaffected: it
  -- goes through withdraw_post_submission(), which bypasses this whole
  -- trigger via the current_user check above, so it never reaches this
  -- block; a *direct* authenticated attempt at the same transition is
  -- correctly rejected here, on top of the dedicated withdrawn-transition
  -- check further below.
  IF TG_OP = 'UPDATE' AND OLD.status IN ('pending', 'pending_revision') AND OLD.type IN ('research', 'policy_brief') THEN
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
  -- authenticated write may never touch either in any direction -- not set
  -- it, not clear it, not replace it -- since both are written exclusively
  -- by publishReviewedPost() (service role). Checking IS DISTINCT FROM
  -- unconditionally (rather than only when the new value is non-null)
  -- covers clearing an existing value back to null, not just introducing
  -- one.
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
  -- its citation record stays stable. OLD only exists on UPDATE.
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' AND OLD.type IN ('research', 'policy_brief') THEN
    RAISE EXCEPTION 'This publication is locked after acceptance and cannot be modified directly.';
  END IF;

  -- A removed post is locked from further author edits. Moderation always
  -- applies this through the admin client (service role), so no
  -- authenticated write should ever set or already carry this status.
  IF NEW.status = 'removed' OR (TG_OP = 'UPDATE' AND OLD.status = 'removed') THEN
    RAISE EXCEPTION 'This post was removed and cannot be modified.';
  END IF;

  -- 'withdrawn' is reachable only via withdraw_post_submission() (see
  -- below), which is itself the only place this transition is meant to
  -- happen. That function's own posts UPDATE now bypasses this trigger
  -- entirely (current_user is the function's owner there, not
  -- 'authenticated' -- see the note above this function's IF), so its own
  -- WHERE clause (author_id = auth.uid() AND type/status already
  -- constrained) is the sole gate on that path. This check exists purely
  -- to reject a *different*, direct authenticated write attempting the
  -- same transition (or an INSERT that arrives already withdrawn) outside
  -- that function altogether.
  IF NEW.status = 'withdrawn' THEN
    IF NEW.type NOT IN ('research', 'policy_brief') THEN
      RAISE EXCEPTION 'Only a research paper or policy brief submission can be withdrawn.';
    END IF;
    IF TG_OP = 'INSERT' OR OLD.status NOT IN ('pending', 'pending_revision') THEN
      RAISE EXCEPTION 'Only a submission awaiting or in revision can be withdrawn.';
    END IF;
  END IF;

  -- Terminal, like 'removed': once withdrawn, no further authenticated
  -- write of any kind -- including flipping it back to 'pending', which
  -- would resurrect a submission outside any resubmission flow this
  -- codebase actually has and let it re-enter review with stale reviewer
  -- assignments (already retired via post_reviews.removed_at) and a stale
  -- editorial history.
  IF TG_OP = 'UPDATE' AND OLD.status = 'withdrawn' THEN
    RAISE EXCEPTION 'This submission was withdrawn and cannot be modified.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_locked_post_update ON public.posts;
DROP TRIGGER IF EXISTS guard_locked_post_write ON public.posts;
CREATE TRIGGER guard_locked_post_write
BEFORE INSERT OR UPDATE OR DELETE ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.guard_locked_post_write();

-- Companion guard: post_references/post_authors RLS (see
-- 20260423000006_fix_editorial_rls_cycles.sql) gates writes on
-- `is_post_owner(post_id)` alone, with no check on the parent post's
-- status -- so an author could edit an accepted paper's reference list or
-- co-author roster directly, the same class of gap as the posts table
-- itself.
--
-- What this guard does and does not guarantee:
--   - It DOES make the "locked after acceptance" rule (published research/
--     policy_brief, or removed) hold for these child tables the same way
--     it holds for posts itself, including against an UPDATE that
--     reassigns post_id in either direction (see revision history above).
--   - It does NOT give app/(write)/write/actions.ts's savePostReferences()
--     a fully atomic "must still be exactly status='draft'" guarantee.
--     That action's own SELECT-then-write is not one transaction, and
--     is_post_editable() below intentionally still permits 'pending' and
--     'pending_revision' -- app/(main)/edit/[slug]/actions.ts's
--     saveEditedPost() legitimately edits references while a submission is
--     in revision, and this trigger is shared by both callers. So a
--     request that reads status='draft' and writes after a concurrent
--     publishPost() has already moved the same row to 'pending' can still
--     succeed here. That narrow window is an accepted, documented gap
--     unless/until the draft-only contract is enforced by its own
--     transactional RPC -- it is not silently assumed to be closed.
--   - For the same reason, it does NOT make editorial acceptance
--     (publishReviewedPost(), lib/reviewWorkflow.ts) atomic either: that
--     function reads/freezes the citable "publication" version snapshot
--     and updates posts.status to 'published' as two separate calls, and
--     a reference/co-author edit landing in between (still legal, since
--     the row is 'pending' at that point) is reflected in neither
--     consistently. See the comment on publishReviewedPost() for detail --
--     that, too, needs a transactional acceptance RPC to close fully.
--   - 'withdrawn' is locked here too, matching guard_locked_post_write's
--     terminal treatment of it on the posts table itself: once withdrawn,
--     an author can't edit a submission's references/co-authors either.
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
        (status = 'published' AND type IN ('research', 'policy_brief'))
        OR status = 'removed'
        OR status = 'withdrawn'
      )
  );
$$;

-- Branches explicitly on TG_OP per the documented convention (NEW is null
-- on DELETE, OLD is null on INSERT -- https://www.postgresql.org/docs/18/plpgsql-trigger.html)
-- rather than leaning on COALESCE(NEW.post_id, OLD.post_id), which resolves
-- to NEW.post_id on every UPDATE (NEW always exists there) and so only
-- ever checked the destination post, not the source.
CREATE OR REPLACE FUNCTION public.guard_locked_post_child_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Same current_user check as guard_locked_post_write() above, and for
  -- the same reason: auth.role() alone can't tell a direct authenticated
  -- write apart from a SECURITY DEFINER function running on that user's
  -- behalf, since SECURITY DEFINER never touches the JWT-claims GUC
  -- auth.role() reads -- only current_user, which becomes the function's
  -- owner rather than the literal 'authenticated' role. No SECURITY
  -- DEFINER function touches post_references/post_authors today, but this
  -- keeps the two guards' bypass conditions identical rather than leaving
  -- a latent trap for whichever future one does.
  IF auth.role() IS DISTINCT FROM 'authenticated' OR current_user IS DISTINCT FROM 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT public.is_post_editable(OLD.post_id) THEN
      RAISE EXCEPTION 'This post is locked; % cannot be modified directly.', TG_TABLE_NAME;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- The row's *current* parent must be editable too, or an author could
    -- move a reference/co-author off an accepted publication by
    -- reassigning post_id to one of their own editable drafts -- the
    -- destination check below would pass, since the draft itself is fine,
    -- while silently detaching the row from the locked paper it belonged
    -- to.
    IF NOT public.is_post_editable(OLD.post_id) THEN
      RAISE EXCEPTION 'This post is locked; % cannot be modified directly.', TG_TABLE_NAME;
    END IF;
  END IF;

  -- INSERT and UPDATE both need the row's resulting parent checked, so a
  -- new or reassigned row can't be attached to a locked post either.
  IF NOT public.is_post_editable(NEW.post_id) THEN
    RAISE EXCEPTION 'This post is locked; % cannot be modified directly.', TG_TABLE_NAME;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_locked_post_references_write ON public.post_references;
CREATE TRIGGER guard_locked_post_references_write
BEFORE INSERT OR UPDATE OR DELETE ON public.post_references
FOR EACH ROW
EXECUTE FUNCTION public.guard_locked_post_child_write();

DROP TRIGGER IF EXISTS guard_locked_post_authors_write ON public.post_authors;
CREATE TRIGGER guard_locked_post_authors_write
BEFORE INSERT OR UPDATE OR DELETE ON public.post_authors
FOR EACH ROW
EXECUTE FUNCTION public.guard_locked_post_child_write();

-- Withdrawal must retire the submission's active reviewer assignments in
-- the same transaction, not as a separate step from application code: a
-- withdrawn-but-still-actively-assigned review would keep showing up in
-- the reviewer queue (app/(main)/review/page.tsx), stay reachable at
-- /review/[postId], and keep collecting reminder emails
-- (app/api/cron/review-reminders/route.ts) -- all three already filter on
-- post_reviews.removed_at, the same column an editor removing a stalled
-- reviewer sets (see removeReviewer() in app/(main)/admin/review/actions.ts).
-- This function is the single place withdrawal happens, wrapping both
-- writes in one Postgres function invocation (one transaction) so there is
-- no gap where the post is withdrawn but its reviewers are not, or vice
-- versa.
--
-- SECURITY DEFINER is required specifically for the post_reviews half: the
-- calling author has no RLS grant to touch post_reviews at all (its only
-- authenticated-role UPDATE policy, "reviewer_can_submit", is scoped to
-- `auth.uid() = reviewer_id`) -- unlike the posts update, which the
-- existing author-ownership RLS policy already permits on its own.
--
-- auth.role() vs. current_user (caught in review): SECURITY DEFINER
-- changes the role this function's body executes as -- current_user
-- becomes the function's owner for the duration of the call -- but it does
-- NOT touch the request.jwt.claims GUC auth.role()/auth.uid() read, which
-- is set once per PostgREST request and stays exactly as it was for the
-- calling authenticated user. So *inside* this function, auth.role() still
-- reads 'authenticated' and auth.uid() still reads the caller's own id
-- (both correctly, and relied on by the WHERE clause below), while
-- current_user is no longer 'authenticated' -- it's whatever role owns
-- this function. guard_locked_post_write, guard_locked_post_child_write,
-- and guard_post_review_submission all now check current_user =
-- 'authenticated' *in addition to* auth.role() for exactly this reason:
-- auth.role() alone can't tell this function's own writes apart from a
-- genuine direct authenticated write attempting the same thing, so without
-- the current_user check those triggers either (a) wrongly re-validate/
-- reject this function's writes as if they were direct writes, or (b) --
-- for a shape-check that happens to already match what this function's
-- WHERE clause guarantees, as guard_locked_post_write's withdrawn-
-- transition check did before this revision -- silently rely on that
-- coincidence instead of an explicit distinction. All three guards skip
-- entirely for this function's own writes now; its WHERE clauses
-- (author_id = auth.uid(), post_id scoping) are the sole gate on those
-- writes, the same trust already extended to every other SECURITY DEFINER
-- function in this codebase.
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
    AND type IN ('research', 'policy_brief')
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

-- BLOCKING gap (caught in review again): guard_locked_post_write validates
-- the *shape* of the withdrawn transition (pending/pending_revision ->
-- withdrawn, research/policy_brief only) but not *how* it is reached.
-- "Authors can update their own posts" (base_schema.sql) declares no
-- WITH CHECK of its own, so Postgres falls back to reusing its USING clause
-- (auth.uid() = author_id) for the resulting row too -- meaning any direct
-- authenticated UPDATE satisfying that one transition shape passes RLS and
-- the trigger exactly as if it had gone through withdraw_post_submission(),
-- but skips that function's post_reviews.removed_at cleanup entirely: an
-- author calling Supabase directly, setting status='withdrawn' themselves,
-- leaves their active reviewer assignments never retired -- defeating the
-- RPC's atomic guarantee without either RLS or the trigger ever noticing.
--
-- Fixed by giving the policy an explicit WITH CHECK that rejects
-- status = 'withdrawn' outright for a direct authenticated write.
-- withdraw_post_submission() itself is unaffected: it is SECURITY DEFINER,
-- so it runs as the function's owner, and this table has ROW LEVEL SECURITY
-- enabled but never FORCEd -- RLS does not apply to a table's owner in the
-- first place, regardless of what this policy says. The trigger's own
-- transition validation still applies to it too, independently, for
-- defense in depth.
DROP POLICY IF EXISTS "Authors can update their own posts" ON public.posts;
CREATE POLICY "Authors can update their own posts" ON public.posts
  FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id AND status <> 'withdrawn');

-- Reviewer access revocation gap (caught alongside the bypass above):
-- is_post_reviewer() (20260423000006_fix_editorial_rls_cycles.sql) grants
-- read access to a post -- via the "Published posts are viewable by
-- everyone" SELECT policy and "attached_reviewer_or_coauthor_reads_references"
-- -- to anyone with a post_reviews row naming them, with no regard for
-- removed_at. That's already wrong for an editor's removeReviewer()
-- (app/(main)/admin/review/actions.ts), and withdraw_post_submission()
-- above makes it worse: it retires every active post_reviews row for the
-- withdrawn post (removed_at = now()), but until this function accounts for
-- that, every one of those now-retired reviewers keeps direct RLS read
-- access to a submission the author withdrew, even though the UI's review
-- queues already hide it via the same removed_at column. Fixed to require
-- removed_at IS NULL, matching what "retired" is supposed to mean
-- everywhere else in this codebase.
CREATE OR REPLACE FUNCTION public.is_post_reviewer(target_post_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.post_reviews
    WHERE post_id = target_post_id
      AND reviewer_id = auth.uid()
      AND removed_at IS NULL
  );
$$;

-- BLOCKING gap (caught in review yet again): the fix above still left a
-- direct route back to the exact access is_post_reviewer() was just
-- corrected to revoke. "reviewer_can_submit" (20260420193000_journal_system.sql)
-- is `FOR UPDATE USING (auth.uid() = reviewer_id) WITH CHECK (auth.uid() =
-- reviewer_id)` -- a normal row-level policy with no column restriction at
-- all, and it does not stop a *removed* reviewer's own row from being
-- reachable. `UPDATE post_reviews SET removed_at = NULL WHERE id = '<their
-- own retired assignment>'` passes RLS (still their row) and passes the
-- trigger below too, since that only validates removed_at when
-- recommendation changes in the same statement -- self-un-retiring doesn't
-- touch recommendation at all. That one write silently restores exactly
-- the read access and review-submission rights withdraw_post_submission()
-- (or an editor's removeReviewer()) had just revoked.
--
-- Fixed at the RLS layer, not just the trigger: USING now also requires
-- recommendation IS NULL AND removed_at IS NULL, so a removed reviewer (or
-- one who already submitted) cannot select their own row for UPDATE in the
-- first place -- the statement affects zero rows before WITH CHECK or the
-- trigger even run. WITH CHECK requires the resulting removed_at IS NULL
-- too, so even a still-active reviewer's update can never introduce a
-- removed_at value themselves; only an editor's removeReviewer() or
-- withdraw_post_submission() (both service-role/SECURITY DEFINER, neither
-- subject to this policy) may set it.
DROP POLICY IF EXISTS "reviewer_can_submit" ON public.post_reviews;
CREATE POLICY "reviewer_can_submit" ON public.post_reviews
  FOR UPDATE
  USING (auth.uid() = reviewer_id AND recommendation IS NULL AND removed_at IS NULL)
  WITH CHECK (auth.uid() = reviewer_id AND removed_at IS NULL);

-- Companion to withdraw_post_submission(): submitReview()
-- (app/(main)/review/actions.ts) already scopes its UPDATE to
-- `.is("recommendation", null).is("removed_at", null)`, and since Postgres
-- serializes concurrent UPDATEs to the same post_reviews row (the second
-- writer's WHERE clause is re-evaluated against the first writer's
-- committed result), that already closes the race against a concurrent
-- withdrawal touching the *same* review row. This trigger is the
-- independent, defense-in-depth version of the same rule the application
-- layer trusts: it re-checks the *parent post's* actual current status
-- directly, so a reviewer's recommendation can never be recorded unless
-- the submission is still genuinely open for review, regardless of
-- whether every path that closes a submission remembers to update
-- removed_at correctly.
--
-- Revision (caught in review again): this only ever checked the parent
-- post's status, and only when recommendation changed. The
-- "reviewer_can_submit" RLS policy (20260420193000_journal_system.sql) is a
-- normal row-level UPDATE policy scoped to `auth.uid() = reviewer_id` --
-- nothing stopped a direct authenticated write from reassigning post_id or
-- reviewer_id instead of just setting recommendation, or from replacing an
-- already-submitted recommendation, or from recording one against a review
-- row already retired via removed_at (an editor's removeReviewer(), or
-- withdraw_post_submission() above) -- submitReview()'s own
-- `.is("recommendation", null).is("removed_at", null)` guard is
-- application-level only and a direct write bypasses it entirely. Fixed to
-- also require: post_id and reviewer_id are immutable; OLD.recommendation
-- IS NULL (no replacing an existing one); OLD.removed_at IS NULL (no
-- submitting against a retired assignment).
--
-- Revision (caught in review yet again): the fix above still only touched
-- post_id/reviewer_id and only validated removed_at inside the
-- recommendation-changed branch, so a direct authenticated write that left
-- recommendation alone -- `UPDATE post_reviews SET removed_at = NULL WHERE
-- id = '<own retired row>'` -- passed this trigger untouched, the exact
-- self-reactivation bypass the "reviewer_can_submit" policy fix above now
-- closes at the RLS layer. This trigger backstops that independently:
-- round, assigned_at, removed_at, and reminded_at -- all assignment-
-- management fields assignReviewer()/removeReviewer()
-- (app/(main)/admin/review/actions.ts) own, both of which run through the
-- service-role admin client and never hit this branch at all -- are now
-- immutable for a direct authenticated write, the same treatment already
-- given to post_id/reviewer_id.
--
-- BLOCKING regression from the immediately preceding revision (caught in
-- review once more): the removed_at immutability check above is now
-- unconditional, but this trigger's bypass still only checked auth.role().
-- withdraw_post_submission()'s own `UPDATE public.post_reviews SET
-- removed_at = now() ...` runs inside that SECURITY DEFINER function, where
-- auth.role() still reads 'authenticated' (see the note on that function
-- above for why) -- so the bypass never fired for it, the new
-- removed_at-immutability check saw NEW.removed_at IS DISTINCT FROM
-- OLD.removed_at, and raised, aborting the whole withdrawal transaction
-- including the post's own status change. Fixed the same way as
-- guard_locked_post_write above: also require current_user =
-- 'authenticated', which withdraw_post_submission()'s execution context
-- never satisfies (current_user there is the function's owner), so its
-- writes now bypass this trigger entirely and are gated solely by its own
-- WHERE clauses -- while a genuine direct authenticated write (where
-- current_user really is 'authenticated') is still caught exactly as
-- before.
CREATE OR REPLACE FUNCTION public.guard_post_review_submission()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR current_user IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.post_id IS DISTINCT FROM OLD.post_id
    OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
    OR NEW.round IS DISTINCT FROM OLD.round
    OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
    OR NEW.removed_at IS DISTINCT FROM OLD.removed_at
    OR NEW.reminded_at IS DISTINCT FROM OLD.reminded_at
  THEN
    RAISE EXCEPTION 'post_id, reviewer_id, round, assigned_at, removed_at, and reminded_at are managed by editorial review assignment and cannot be changed directly.';
  END IF;

  IF NEW.recommendation IS DISTINCT FROM OLD.recommendation THEN
    IF OLD.recommendation IS NOT NULL THEN
      RAISE EXCEPTION 'A recommendation has already been submitted for this review.';
    END IF;
    IF OLD.removed_at IS NOT NULL THEN
      RAISE EXCEPTION 'This review assignment has been retired and can no longer be submitted.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.posts WHERE id = NEW.post_id AND status = 'pending'
    ) THEN
      RAISE EXCEPTION 'This submission is no longer open for review.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_post_review_submission ON public.post_reviews;
CREATE TRIGGER guard_post_review_submission
BEFORE UPDATE ON public.post_reviews
FOR EACH ROW
EXECUTE FUNCTION public.guard_post_review_submission();
