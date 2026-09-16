-- Normalize every post's classification onto the two kinds the product has.
--
-- The publishing reset made Indegenius one composer with one rule: no title is
-- a Post, a title is an Article. The database still carries the classification
-- of the product that came before it -- a legacy `type`, a descriptive
-- `article_format`, and a `content_kind` that can still say 'research'. This
-- file makes the stored classification say what the product says, and nothing
-- else about any row changes.
--
-- ## What production actually holds
--
-- A read-only inspection on 2026-09-15 found 311 posts in exactly five
-- combinations and no others:
--
--   content_kind  type          article_format   draft  pending  published
--   post          blog          null                33        -         68
--   article       essay         null                43        -         85
--   article       essay         essay               18        -         55
--   article       policy_brief  policy_brief         3        -          1
--   research      research      null                 3        1          1
--
-- No row has a null content_kind. The mapping below is therefore total and
-- deterministic rather than a best guess, and step 0 refuses to run at all if a
-- sixth combination has appeared since.
--
-- ## The mapping
--
--   post    / blog         / null            ->  unchanged
--   article / essay        / null            ->  unchanged
--   article / essay        / essay           ->  article_format cleared
--   article / policy_brief / policy_brief    ->  type essay, article_format cleared
--   research/ research     / null            ->  content_kind article, type essay
--
-- Legacy Research and Policy Briefs become Articles, at every status, drafts
-- and the one pending submission included. They were long-form titled work by
-- their authors, which is what an Article is; Research and Policy Brief were
-- the retired workflow's names for them, not a second kind of writing. Genre
-- (Essay, Policy Brief) was descriptive metadata the product no longer shows,
-- so it is cleared rather than translated into something else.
--
-- ## What this file must not change, and proves it did not
--
-- It changes three columns on 82 rows: `type`, `content_kind`, `article_format`.
-- It deletes no post, rewrites no title, body, excerpt, slug, tag, cover or
-- author, moves no status, and reassigns no date. Step 2 disables
-- posts_touch_updated_at for the duration so `updated_at` is not bumped either:
-- these rows were not edited, and a reader's "last updated" must not say they
-- were.
--
-- That is asserted rather than asserted-by-comment. Step 1 stores an md5 over
-- every row's full jsonb *minus the three classification columns*, ordered by
-- id, and step 4 refuses to commit unless the same hash comes back. Any change
-- to any other column of any row, and any added or removed row, changes it.
--
-- It drops no column, function, trigger, index or constraint. Making the
-- database refuse the old vocabulary is 20260915000006; retiring the review
-- locks is 20260915000007; dropping what nothing reads any more is the database
-- cleanup phase.
--
-- ## Why the two triggers are disabled
--
-- posts_touch_updated_at would stamp now() on all 82 rows, which is the one
-- visible lie this file could tell.
--
-- posts_sync_content_classification derives content_kind from type. Its UPDATE
-- branch happens not to fire for any statement here (it requires content_kind
-- and article_format to be unchanged, and every statement below changes one of
-- them), but "happens not to fire" is a property of a function this file is
-- about to supersede. Disabling it makes the outcome depend on the statements
-- rather than on that reading.
--
-- Both are re-enabled in step 3, in the same transaction, so a failure anywhere
-- rolls the disable back with everything else. Neither is disabled for any
-- other session: the ALTER holds a lock until commit, and by commit they are
-- back on.
--
-- No other trigger on posts fires. posts_word_count_trg is UPDATE OF content,
-- posts_sync_topic_keys is UPDATE OF tags/topic_keys, and
-- posts_capture_first_publication_event is UPDATE OF status -- none of those
-- columns is written here. on_post_approved fires but does nothing, because it
-- needs a status moving to 'published' and no status moves. guard_locked_post_write
-- bypasses non-authenticated writes, and this file is applied as the table owner.
--
-- ## Order
--
-- Before the Phase 2I application deploy, and after 20260915000004.
--
--   node scripts/migration/apply-content-model-migrations.mjs --dry-run
--   node scripts/migration/apply-content-model-migrations.mjs --apply
--
-- The new application reads content_kind alone. Deploying it before this file
-- would leave five research rows it has no name for, so this runs first. The
-- old application survives this file: it resolves content_kind first and falls
-- back to type, both of which stay valid, and the two locked publications keep
-- their citation_id, which is what the old edit page locks on.
--
-- Idempotent. Run twice and the second run matches no rows, because the
-- normalized combinations are themselves two of the five step 0 permits.

begin;

-- 0. Refuse a combination this file was not written for.
do $$
declare
  v_unknown text;
begin
  select string_agg(distinct
           coalesce(content_kind, '<null>') || '/' ||
           coalesce(type, '<null>') || '/' ||
           coalesce(article_format, '<null>'), ', ')
    into v_unknown
    from public.posts
   where not coalesce(
       (content_kind = 'post'     and type = 'blog'         and article_format is null)
    or (content_kind = 'article'  and type = 'essay'        and article_format is null)
    or (content_kind = 'article'  and type = 'essay'        and article_format = 'essay')
    or (content_kind = 'article'  and type = 'policy_brief' and article_format = 'policy_brief')
    or (content_kind = 'research' and type = 'research'     and article_format is null),
     false);

  if v_unknown is not null then
    raise exception
      'public.posts holds classification combinations 20260915000005 was not written for: %. Refusing to guess.',
      v_unknown;
  end if;
end;
$$;

-- 1. Everything the result is checked against, captured before anything moves.
create temporary table phase2i_classification_before on commit drop as
select
  (select count(*) from public.posts)::bigint as total_posts,
  (select count(*) from public.posts where content_kind = 'post')::bigint as kind_post,
  (select count(*) from public.posts where content_kind = 'article')::bigint as kind_article,
  (select count(*) from public.posts where content_kind = 'research')::bigint as kind_research,
  (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
     from (select status, count(*) as n from public.posts group by status) as s) as status_counts,
  -- Every column of every row except the three this file is allowed to touch.
  -- updated_at is deliberately inside it: a normalization is not an edit.
  (select coalesce(md5(string_agg(
            md5((to_jsonb(p) - 'type' - 'content_kind' - 'article_format')::text), '' order by p.id)), '')
     from public.posts as p) as row_hash;

-- 2. Hold updated_at still, and let the statements below decide the
--    classification rather than the trigger that is about to be superseded.
alter table public.posts disable trigger posts_touch_updated_at;
alter table public.posts disable trigger posts_sync_content_classification;

--    Genre is descriptive metadata the product does not show. 77 rows.
update public.posts
   set article_format = null
 where article_format is not null;

--    A Policy Brief is an Article. 4 rows.
update public.posts
   set type = 'essay'
 where type = 'policy_brief';

--    Legacy Research is an Article: the same long-form titled work, under the
--    name the product still has for it. 5 rows, every status. 23 of these are
--    not touched -- there are only 5 -- and none of them changes status.
update public.posts
   set type = 'essay',
       content_kind = 'article'
 where type = 'research'
    or content_kind = 'research';

-- 3. Back on, before this transaction ends.
alter table public.posts enable trigger posts_sync_content_classification;
alter table public.posts enable trigger posts_touch_updated_at;

-- 4. Refuse to commit unless the catalogue says exactly what was intended.
do $$
declare
  v_before phase2i_classification_before%rowtype;
  v_total bigint;
  v_post bigint;
  v_article bigint;
  v_residue text;
  v_status jsonb;
  v_hash text;
begin
  select * into v_before from phase2i_classification_before;

  select count(*) filter (where true),
         count(*) filter (where content_kind = 'post'),
         count(*) filter (where content_kind = 'article')
    into v_total, v_post, v_article
    from public.posts;

  if v_total is distinct from v_before.total_posts then
    raise exception 'post count changed: % before, % after', v_before.total_posts, v_total;
  end if;

  -- Posts stay Posts. Articles absorb exactly the legacy Research rows.
  if v_post is distinct from v_before.kind_post then
    raise exception 'Post count changed: % before, % after', v_before.kind_post, v_post;
  end if;
  if v_article is distinct from v_before.kind_article + v_before.kind_research then
    raise exception 'Article count is %, expected % (% articles plus % research)',
      v_article, v_before.kind_article + v_before.kind_research,
      v_before.kind_article, v_before.kind_research;
  end if;

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
    raise exception 'posts still carries a non-canonical classification: %', v_residue;
  end if;

  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
    into v_status
    from (select status, count(*) as n from public.posts group by status) as s;
  if v_status is distinct from v_before.status_counts then
    raise exception 'a status moved: % before, % after', v_before.status_counts, v_status;
  end if;

  select coalesce(md5(string_agg(
           md5((to_jsonb(p) - 'type' - 'content_kind' - 'article_format')::text), '' order by p.id)), '')
    into v_hash
    from public.posts as p;
  if v_hash is distinct from v_before.row_hash then
    raise exception
      'a column other than type, content_kind or article_format changed, or a row was added or removed';
  end if;
end;
$$;

commit;
