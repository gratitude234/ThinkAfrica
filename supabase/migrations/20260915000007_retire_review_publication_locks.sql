-- Retire the review-era publication locks, and fix the published edit path
-- they broke.
--
-- Three database objects still enforce a workflow the product does not have.
-- They decide what they protect by reading `type`, and after 20260915000005 no
-- row carries a type they recognize, so each is now either inert or wrong:
--
--   guard_locked_post_write()   refuses to let an author publish or edit
--                               anything typed research or policy_brief, and
--                               governs withdrawal.
--   is_post_editable()          the same rule, for a post's sources and author
--                               credits (guard_locked_post_child_write).
--   apply_post_edit_draft()     refuses the same rows, and then writes a column
--                               that does not exist.
--
-- ## The production bug this fixes
--
-- apply_post_edit_draft() sets `editorial_updated_at = now()`. public.posts has
-- no such column: migration 20260818000002_posts_editorial_updated_at.sql is in
-- this repository and was never applied. A catalogue inspection on 2026-09-15
-- confirmed both the missing column and the function's reference to it.
--
-- Every apply of a published edit therefore fails in production, at the moment
-- the writer presses the button, with an undefined-column error. There are two
-- rows in post_edit_drafts, the newest from 2026-09-09: edits that were written
-- and could not be saved. Removing the assignment is what makes the published
-- edit path work at all, and is the reason this file is not deferrable.
--
-- ## What is retired, and what is kept
--
-- Retired: the type-based self-publish refusal, the locked-after-acceptance
-- lock, and the same lock inside the edit-apply function. Nothing is reviewed
-- any more, so nothing is locked by having been reviewed. An author's own
-- publication is ordinarily editable, which is what the product promises.
--
-- Kept, deliberately:
--
--   - Delete is drafts only. This is the rule the application mirrors in
--     lib/postPolicy.ts checkDelete(), and it is what stops a published piece
--     disappearing out from under its readers and its links.
--   - citation_id and published_version_id stay immutable to an authenticated
--     write. Two published rows carry a citation_id, /publication/[citationId]
--     still resolves old citation URLs through it, and an author clearing one
--     would break a link somebody else published. The columns are read by that
--     redirect and by nothing else.
--   - A removed post stays locked. Moderation is not a retired workflow.
--   - Withdrawn stays terminal, and no authenticated write may produce it. The
--     status is unreachable now (no row has it, and withdraw_post_submission()
--     selects on types no row has), so this is a closed door rather than a
--     rule: it keeps the one transition that could resurrect a submission from
--     being reachable by a direct write.
--
-- ## What this file does not do
--
-- It changes no row, drops nothing, and adds nothing. It redefines three
-- functions and leaves every trigger in place, pointing at the same names.
-- CREATE OR REPLACE FUNCTION preserves privileges, so the existing grants on
-- apply_post_edit_draft() carry over untouched and are deliberately not
-- restated here.
--
-- withdraw_post_submission() and guard_research_project_write() are left as
-- they are. Both select on `type IN ('research', 'policy_brief')` and so now
-- match nothing; neither is reachable from the application. Dropping them
-- belongs to the database cleanup phase, with the columns and tables they read.
--
-- ## Order
--
-- After 20260915000006, before the deploy. Step 0 refuses to run out of order.
-- The new application removes the "this post can't be edited" notice on the
-- strength of these locks being gone, so this must not land after it.

begin;

-- 0. Refuse to run before the classification contract exists.
do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint as c
     where c.conrelid = 'public.posts'::regclass
       and c.conname = 'posts_type_check'
       and c.contype = 'c'
       and pg_catalog.pg_get_constraintdef(c.oid) not like '%research%'
       and pg_catalog.pg_get_constraintdef(c.oid) not like '%policy_brief%'
  ) then
    raise exception
      'public.posts still admits the review-era types. Apply 20260915000006 before 20260915000007.';
  end if;
end;
$$;

-- 1. The write guard, without the review workflow.
create or replace function public.guard_locked_post_write()
returns trigger
language plpgsql
as $$
BEGIN
  -- NEW does not exist on DELETE -- returning it unconditionally here would
  -- return NULL for every bypassed DELETE, which a BEFORE DELETE trigger treats
  -- as "skip this row," silently cancelling the delete instead of allowing it.
  -- COALESCE(NEW, OLD) is correct for every operation this trigger covers.
  --
  -- auth.role() alone is not enough to tell a direct authenticated write apart
  -- from a SECURITY DEFINER function executing on that same user's behalf:
  -- auth.role() reads the request.jwt.claims GUC, which SECURITY DEFINER's role
  -- switch never touches, so it still reads 'authenticated' inside such a
  -- function too. current_user is what SECURITY DEFINER actually changes -- it
  -- becomes the function's owner there, never the literal 'authenticated' role
  -- PostgREST executes real authenticated requests as -- so checking it is what
  -- distinguishes the two. apply_post_edit_draft() depends on this bypass.
  IF auth.role() IS DISTINCT FROM 'authenticated' OR current_user IS DISTINCT FROM 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Hard-delete is for drafts only. A published piece has readers and
    -- inbound links; removing one is moderation, through the service role.
    IF OLD.status != 'draft' THEN
      RAISE EXCEPTION 'Only drafts can be deleted directly.';
    END IF;
    RETURN OLD;
  END IF;

  -- citation_id and published_version_id are written exclusively by the retired
  -- acceptance workflow, and /publication/[citationId] still resolves old URLs
  -- through the first of them. An authenticated write may not touch either in
  -- any direction -- not set it, not clear it, not replace it. Checking IS
  -- DISTINCT FROM unconditionally covers clearing an existing value back to
  -- null, not just introducing one.
  IF TG_OP = 'INSERT' THEN
    IF NEW.citation_id IS NOT NULL THEN
      RAISE EXCEPTION 'citation_id belongs to the retired editorial workflow and cannot be set.';
    END IF;
    IF NEW.published_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'published_version_id belongs to the retired editorial workflow and cannot be set.';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.citation_id IS DISTINCT FROM OLD.citation_id THEN
      RAISE EXCEPTION 'citation_id belongs to the retired editorial workflow and cannot be changed.';
    END IF;
    IF NEW.published_version_id IS DISTINCT FROM OLD.published_version_id THEN
      RAISE EXCEPTION 'published_version_id belongs to the retired editorial workflow and cannot be changed.';
    END IF;
  END IF;

  -- A removed post is locked from further author edits. Moderation always
  -- applies this through the admin client (service role), so no authenticated
  -- write should ever set or already carry this status.
  IF NEW.status = 'removed' OR (TG_OP = 'UPDATE' AND OLD.status = 'removed') THEN
    RAISE EXCEPTION 'This post was removed and cannot be modified.';
  END IF;

  -- Withdrawal is retired along with submission. No authenticated write may
  -- produce the status, and a row that already carries it stays closed: the
  -- transition back to 'pending' would re-enter a review that no longer exists,
  -- with stale reviewer assignments and a stale editorial history.
  IF NEW.status = 'withdrawn' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'withdrawn') THEN
    RAISE EXCEPTION 'Submissions are retired and cannot be withdrawn.';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'withdrawn' THEN
    RAISE EXCEPTION 'This submission was withdrawn and cannot be modified.';
  END IF;

  RETURN NEW;
END;
$$;

comment on function public.guard_locked_post_write() is
  'Drafts-only delete, immutable citation evidence, removed and withdrawn locked. The review-era type locks were retired in Phase 2I.';

-- 2. The same rule for a post's sources and author credits.
--    guard_locked_post_child_write() calls this for post_references and
--    post_authors, so removing the type branch is what makes the sources of a
--    formerly reviewed publication editable alongside its body.
create or replace function public.is_post_editable(target_post_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.posts
    WHERE id = target_post_id
      AND (status = 'removed' OR status = 'withdrawn')
  );
$$;

comment on function public.is_post_editable(uuid) is
  'False only for a removed or withdrawn post. Being formally reviewed no longer locks anything. Phase 2I.';

-- 3. Applying a published edit: unlocked, and writing only columns that exist.
create or replace function public.apply_post_edit_draft(target_draft_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
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

  -- The reviewed-publication refusal that stood here is retired with the
  -- workflow. An author's own published work is editable, including the two
  -- rows that still carry a citation_id: editing a body does not change the
  -- citation, and guard_locked_post_write() still refuses to let the id itself
  -- move.

  normalized_title := NULLIF(trim(both from draft_row.title), '');

  -- content_kind is the whole classification. type and article_format are
  -- derived by sync_post_content_classification(), which is the single place
  -- that decides them, so this writes neither.
  UPDATE public.posts
  SET
    title = normalized_title,
    excerpt = draft_row.excerpt,
    content = draft_row.content,
    tags = draft_row.tags,
    cover_image_url = NULLIF(draft_row.cover_image_url, ''),
    content_kind = CASE WHEN normalized_title IS NULL THEN 'post' ELSE 'article' END,
    updated_at = now()
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

comment on function public.apply_post_edit_draft(uuid) is
  'Applies an author''s private edit to their published post. Phase 2I removed the reviewed-publication lock and the write to the nonexistent editorial_updated_at column.';

-- 4. Refuse to commit unless the retired vocabulary is actually gone.
do $$
declare
  v_definition text;
begin
  v_definition := pg_catalog.pg_get_functiondef('public.apply_post_edit_draft(uuid)'::regprocedure);
  if position('editorial_updated_at' in v_definition) > 0 then
    raise exception 'apply_post_edit_draft still writes editorial_updated_at, which public.posts does not have';
  end if;
  if position('policy_brief' in v_definition) > 0 or position('research' in v_definition) > 0 then
    raise exception 'apply_post_edit_draft still refuses a review-era type';
  end if;

  v_definition := pg_catalog.pg_get_functiondef('public.guard_locked_post_write()'::regprocedure);
  if position('policy_brief' in v_definition) > 0 or position('research' in v_definition) > 0 then
    raise exception 'guard_locked_post_write still locks a review-era type';
  end if;
  -- The kept rules, asserted rather than assumed.
  if position('citation_id' in v_definition) = 0
     or position('published_version_id' in v_definition) = 0
     or position('removed' in v_definition) = 0
     or position('draft' in v_definition) = 0 then
    raise exception 'guard_locked_post_write lost a rule Phase 2I keeps';
  end if;

  v_definition := pg_catalog.pg_get_functiondef('public.is_post_editable(uuid)'::regprocedure);
  if position('policy_brief' in v_definition) > 0 or position('research' in v_definition) > 0 then
    raise exception 'is_post_editable still locks a review-era type';
  end if;
  if position('removed' in v_definition) = 0 or position('withdrawn' in v_definition) = 0 then
    raise exception 'is_post_editable lost the removed or withdrawn lock';
  end if;

  -- The triggers must still point at these names.
  if not exists (
    select 1 from pg_catalog.pg_trigger as t
      join pg_catalog.pg_proc as p on p.oid = t.tgfoid
     where t.tgrelid = 'public.posts'::regclass
       and t.tgname = 'guard_locked_post_write'
       and not t.tgisinternal
       and p.proname = 'guard_locked_post_write'
  ) then
    raise exception 'guard_locked_post_write is no longer attached to public.posts';
  end if;
end;
$$;

commit;
