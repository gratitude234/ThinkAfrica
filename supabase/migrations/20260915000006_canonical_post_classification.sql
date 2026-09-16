-- Make content_kind the classification, and make the database refuse the
-- vocabulary the product no longer has.
--
-- 20260915000005 normalized the rows. This file changes the contract, so that a
-- row outside Post and Article cannot be written again: not by a legacy client,
-- not by a migration nobody reviewed, not by a stray script. After it, the
-- database says the same thing the product says.
--
-- ## The contract
--
--   content_kind  NOT NULL, one of 'post' or 'article'. This is the
--                 classification. Everything else about it is derived.
--   type          derived by the trigger below from content_kind. Kept only
--                 because it is NOT NULL and because reads in flight still
--                 project it. LEGACY DB COMPATIBILITY -- REMOVE IN PHASE 2J.
--   article_format  always null. Genre is not part of the product.
--   title         required for an Article, optional for a Post. That is the
--                 whole of the "no title is a Post, a title is an Article"
--                 rule, expressed once, in the database.
--
-- ## Why the application can stop writing `type`
--
-- posts.type is NOT NULL with no default, so something has to supply it. This
-- file makes that something the database: a BEFORE ROW trigger runs before NOT
-- NULL and CHECK are evaluated, so a row inserted with no `type` at all leaves
-- the trigger carrying one. The application therefore persists content_kind and
-- nothing else, which is the point -- there is no second place where a write
-- can disagree about what a piece is. Phase 2J drops the column, the trigger's
-- assignment and this paragraph together.
--
-- That is the reason this is not "one temporary legacy write" in the
-- application instead. A compatibility write in TypeScript would have to be
-- passed through every write path and removed from every one of them later; a
-- derivation in the trigger is one place, and it also covers a client this
-- repository does not control.
--
-- ## Old application, new database
--
-- This file lands before the Phase 2I deploy, so the old application runs
-- against it for the length of a deployment. It survives: every classification
-- it writes is already canonical. derivePresentationClassification() sends
-- type 'blog' or 'essay' with content_kind 'post' or 'article' and
-- article_format null, apply_post_edit_draft() sends the same, and the trigger
-- now agrees with all of them rather than contradicting any. There is no
-- window in which publishing breaks.
--
-- ## What this file does not do
--
-- It changes no row: constraints are added against data that already conforms,
-- and step 4 proves the table is byte-for-byte what it was. It drops no column,
-- table, index or trigger, and it does not touch the review locks -- that is
-- 20260915000007.
--
-- ## Order
--
-- After 20260915000005, before the deploy. Step 0 refuses to run out of order.

begin;

-- 0. Refuse to run before the rows are normalized.
do $$
declare
  v_residue text;
begin
  select string_agg(distinct
           coalesce(content_kind, '<null>') || '/' ||
           coalesce(type, '<null>') || '/' ||
           coalesce(article_format, '<null>'), ', ')
    into v_residue
    from public.posts
   where content_kind is null
      or content_kind not in ('post', 'article')
      or type not in ('blog', 'essay')
      or article_format is not null;

  if v_residue is not null then
    raise exception
      'public.posts still holds non-canonical classifications (%). Apply 20260915000005 first.',
      v_residue;
  end if;
end;
$$;

-- 1. content_kind decides; type and article_format are derived from it.
create or replace function public.sync_post_content_classification()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
BEGIN
  -- content_kind is what the product stores, and the application sends it on
  -- every write. The fallbacks exist for a caller that does not.
  IF NEW.content_kind IS NULL THEN
    NEW.content_kind := CASE
      -- A client still speaking the legacy vocabulary is mapped rather than
      -- refused, so an old deployment in a rollout window writes something
      -- valid instead of failing.
      WHEN NEW.type = 'blog' THEN 'post'
      WHEN NEW.type IS NOT NULL THEN 'article'
      -- Neither column supplied: the title is the rule the product has.
      WHEN NULLIF(btrim(NEW.title), '') IS NULL THEN 'post'
      ELSE 'article'
    END;
  END IF;

  -- LEGACY DB COMPATIBILITY -- REMOVE IN PHASE 2J.
  -- posts.type is NOT NULL and no application write supplies it any more, so
  -- it is derived here. This is also what stops a caller reclassifying a piece
  -- through the legacy column: whatever `type` arrives, content_kind decides
  -- what it becomes.
  NEW.type := CASE NEW.content_kind WHEN 'post' THEN 'blog' ELSE 'essay' END;

  -- LEGACY DB COMPATIBILITY -- REMOVE IN PHASE 2J.
  -- Genre is not part of the product. Nulling it unconditionally means a
  -- legacy client writing 'essay' or 'policy_brief' cannot reintroduce one.
  NEW.article_format := NULL;

  RETURN NEW;
END;
$$;

comment on function public.sync_post_content_classification() is
  'Derives the legacy type and clears article_format from content_kind, which is the only classification the product has. Phase 2I.';

-- 2. The contract itself.
alter table public.posts
  alter column content_kind set not null;

alter table public.posts
  drop constraint if exists posts_content_kind_check;
alter table public.posts
  add constraint posts_content_kind_check
  check (content_kind in ('post', 'article'));

-- Genre is gone rather than restricted. The old pair of constraints (a value
-- list, and "only an Article may carry one") is replaced by the single fact.
alter table public.posts
  drop constraint if exists posts_article_format_requires_article_check;
alter table public.posts
  drop constraint if exists posts_article_format_check;
alter table public.posts
  add constraint posts_article_format_check
  check (article_format is null);

alter table public.posts
  drop constraint if exists posts_type_check;
alter table public.posts
  add constraint posts_type_check
  check (type in ('blog', 'essay'));

-- The legacy column may not disagree with the classification. Unlike the
-- version this replaces, it is no longer satisfiable by a null content_kind.
alter table public.posts
  drop constraint if exists posts_legacy_type_content_kind_check;
alter table public.posts
  add constraint posts_legacy_type_content_kind_check
  check (type = case content_kind when 'post' then 'blog' else 'essay' end);

-- The product rule, stated once. content_kind is NOT NULL and constrained to
-- two values above, so the left side is never null and never silently passes.
alter table public.posts
  drop constraint if exists posts_title_required_unless_post_check;
alter table public.posts
  add constraint posts_title_required_unless_post_check
  check (content_kind = 'post' or (title is not null and btrim(title) <> ''));

-- 3. Say so in the catalogue, where the next reader looks.
comment on column public.posts.content_kind is
  'The classification: post or article. A title decides which. See docs/content-model.md.';
comment on column public.posts.type is
  'LEGACY DB COMPATIBILITY -- REMOVE IN PHASE 2J. Derived from content_kind by sync_post_content_classification(); no application write supplies it.';
comment on column public.posts.article_format is
  'LEGACY DB COMPATIBILITY -- REMOVE IN PHASE 2J. Always null: genre is not part of the product.';
comment on column public.posts.title is
  'Required for an Article, optional for a Post -- see posts_title_required_unless_post_check and lib/postDisplay.ts.';

-- 4. Refuse to commit unless the contract is in force and no row moved.
do $$
declare
  v_missing text;
  v_nullable boolean;
begin
  select string_agg(expected.conname, ', ')
    into v_missing
    from (values
      ('posts_content_kind_check'),
      ('posts_article_format_check'),
      ('posts_type_check'),
      ('posts_legacy_type_content_kind_check'),
      ('posts_title_required_unless_post_check')
    ) as expected(conname)
   where not exists (
     select 1
       from pg_catalog.pg_constraint as c
      where c.conrelid = 'public.posts'::regclass
        and c.conname = expected.conname
        and c.contype = 'c'
        and c.convalidated
   );
  if v_missing is not null then
    raise exception 'constraint missing or not validated after 20260915000006: %', v_missing;
  end if;

  select a.attnotnull into v_nullable
    from pg_catalog.pg_attribute as a
   where a.attrelid = 'public.posts'::regclass and a.attname = 'content_kind';
  if v_nullable is distinct from true then
    raise exception 'posts.content_kind is still nullable';
  end if;

  -- The retired vocabulary must be unreachable, not merely unused.
  if exists (
    select 1
      from pg_catalog.pg_constraint as c
     where c.conrelid = 'public.posts'::regclass
       and c.conname in ('posts_content_kind_check', 'posts_type_check')
       and (pg_catalog.pg_get_constraintdef(c.oid) like '%research%'
            or pg_catalog.pg_get_constraintdef(c.oid) like '%policy_brief%')
  ) then
    raise exception 'a posts classification constraint still admits research or policy_brief';
  end if;

  if exists (
    select 1 from public.posts
     where content_kind not in ('post', 'article')
        or type not in ('blog', 'essay')
        or article_format is not null
        or (content_kind = 'article' and nullif(btrim(title), '') is null)
  ) then
    raise exception 'a row does not satisfy the contract this file just added';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_trigger as t
      join pg_catalog.pg_proc as p on p.oid = t.tgfoid
     where t.tgrelid = 'public.posts'::regclass
       and t.tgname = 'posts_sync_content_classification'
       and not t.tgisinternal
       and t.tgenabled <> 'D'
       and p.proname = 'sync_post_content_classification'
  ) then
    raise exception 'posts_sync_content_classification is missing or disabled; posts.type would have no value to satisfy NOT NULL';
  end if;
end;
$$;

commit;
