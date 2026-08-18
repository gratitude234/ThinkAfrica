-- Feed accuracy: real reading times, and topic tags without a stray leading '#'.
--
-- 1. posts.word_count
--
--    Reading time on the feed cards was derived from `excerpt`, which is capped
--    at roughly thirty words, so `ceil(words / 200)` could never exceed 1 and
--    every card in the feed reported "1 min" regardless of the article behind
--    it. On a page selling itself as an intellectual network that is the most
--    expensive wrong number on the screen.
--
--    The count lives on the row rather than being computed at render time
--    because the feed query deliberately does not select `content` -- pulling a
--    dozen full article bodies per page to print one number would be a bad
--    trade -- and it is maintained by a trigger rather than by application
--    code because posts are written from the write flow, the edit flow, the
--    research submission flow and several admin actions. A count maintained in
--    one of those paths would silently rot in the others.

alter table public.posts
  add column if not exists word_count integer not null default 0;

-- Mirrors countWords() in lib/postQuality.ts: strip tags, then count
-- whitespace-separated runs. Kept deliberately identical so a value computed
-- in the database and one computed in TypeScript never disagree.
create or replace function public.count_post_words(p_content text)
returns integer
language sql
immutable
as $$
  select coalesce(
    array_length(
      array_remove(
        regexp_split_to_array(
          btrim(regexp_replace(coalesce(p_content, ''), '<[^>]*>', ' ', 'g')),
          '\s+'
        ),
        ''
      ),
      1
    ),
    0
  );
$$;

create or replace function public.posts_set_word_count()
returns trigger
language plpgsql
as $$
begin
  new.word_count := public.count_post_words(new.content);
  return new;
end;
$$;

drop trigger if exists posts_word_count_trg on public.posts;
create trigger posts_word_count_trg
  before insert or update of content on public.posts
  for each row
  execute function public.posts_set_word_count();

-- Backfill every existing row.
update public.posts
set word_count = public.count_post_words(content)
where word_count is distinct from public.count_post_words(content);

-- 2. Tag normalization
--
--    normalizeTagValue() trimmed, lowercased and collapsed whitespace but
--    never stripped a leading '#', so an author who typed "#africa" stored
--    "#africa" and the card, which renders "#{topic}", printed "##africa".
--
--    The cosmetic half is the smaller problem. The real cost is that "#africa"
--    and "africa" are two distinct topic keys, so a single topic's posts and
--    subscribers were being split across two pages that neither the author nor
--    the reader knew were different. The application-side fix stops new rows
--    from arriving this way; this pass merges the ones already stored.
--
--    Order is preserved (tags are author-ordered and the first two are what
--    the card shows) and duplicates created by the merge -- a post carrying
--    both "#africa" and "africa" -- collapse to the first occurrence.

with normalized as (
  select p.id, array_agg(g.cleaned order by g.first_ord) as tags
  from public.posts p
  cross join lateral (
    select s.cleaned, min(s.ord) as first_ord
    from (
      select btrim(regexp_replace(t, '^#+', '')) as cleaned, ord
      from unnest(p.tags) with ordinality as u(t, ord)
    ) s
    where s.cleaned <> ''
    group by s.cleaned
  ) g
  where exists (select 1 from unnest(p.tags) as t where t like '#%')
  group by p.id
)
update public.posts p
set tags = n.tags
from normalized n
where p.id = n.id;

-- topic_keys ships in supabase/pending/, so it may not exist on every
-- environment this migration runs against. Guarded rather than assumed.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'topic_keys'
  ) then
    execute $sql$
      update public.posts p
      set topic_keys = (
        select coalesce(
          array_agg(distinct lower(btrim(regexp_replace(t, '^#+', '')))),
          '{}'::text[]
        )
        from unnest(p.topic_keys) as t
        where btrim(regexp_replace(t, '^#+', '')) <> ''
      )
      where exists (select 1 from unnest(p.topic_keys) as t where t like '#%')
    $sql$;
  end if;
end $$;
