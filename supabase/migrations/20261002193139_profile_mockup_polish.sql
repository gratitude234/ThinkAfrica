-- Bounded aggregate reads for Profile V3; all reads retain the caller's RLS.
begin;

create index if not exists posts_profile_publication_order_idx
  on public.posts (author_id, published_at desc nulls last, created_at desc, id desc)
  where status = 'published' and content_kind in ('post', 'article');
create index if not exists posts_profile_activity_idx
  on public.posts (author_id, (coalesce(published_at, created_at)))
  where status = 'published' and content_kind in ('post', 'article');

create or replace function public.profile_publication_activity(p_profile_id uuid, p_start_month timestamptz, p_months integer default 12)
returns table (month text, publication_count bigint)
language sql stable security invoker set search_path = ''
as $$
  with months as (
    select date_trunc('month', p_start_month at time zone 'UTC') + n * interval '1 month' as month_start
    from generate_series(0, greatest(1, least(coalesce(p_months, 12), 24)) - 1) as n
  ), counts as (
    select date_trunc('month', coalesce(p.published_at, p.created_at) at time zone 'UTC') as month_start, count(*) as n
    from public.posts as p
    where p.author_id = p_profile_id and p.status = 'published' and p.content_kind in ('post', 'article')
      and exists (select 1 from public.profiles as person where person.id = p_profile_id)
      and coalesce(p.published_at, p.created_at) >= (select min(month_start) at time zone 'UTC' from months)
      and coalesce(p.published_at, p.created_at) < (select (max(month_start) + interval '1 month') at time zone 'UTC' from months)
    group by 1
  )
  select to_char(m.month_start, 'YYYY-MM'), coalesce(c.n, 0)::bigint
  from months as m left join counts as c using (month_start) order by m.month_start;
$$;

create or replace function public.profile_publication_topics(p_profile_id uuid, p_limit integer default 6)
returns table (topic_key text, publication_count bigint)
language sql stable security invoker set search_path = ''
as $$
  select keys.topic_key, count(*) as publication_count
  from public.posts as p
  cross join lateral (
    select distinct lower(btrim(t.topic_key)) as topic_key
    from unnest(coalesce(p.topic_keys, '{}'::text[])) as t(topic_key)
    where length(btrim(t.topic_key)) between 1 and 80
  ) as keys
  where p.author_id = p_profile_id and p.status = 'published' and p.content_kind in ('post', 'article')
    and exists (select 1 from public.profiles as person where person.id = p_profile_id)
  group by keys.topic_key
  order by publication_count desc, max(coalesce(p.published_at, p.created_at)) desc, keys.topic_key
  limit greatest(1, least(coalesce(p_limit, 6), 12));
$$;

-- No profile-id argument: this catalogue always belongs to auth.uid(). A
-- literal substring search avoids dynamic SQL and PostgREST filter injection.
create or replace function public.search_my_profile_work(p_query text default '', p_page integer default 0, p_page_size integer default 50)
returns table (id uuid, title text, excerpt text, content_kind text, published_at timestamptz, cover_image_url text)
language sql stable security invoker set search_path = ''
as $$
  select p.id, p.title, p.excerpt, p.content_kind::text, p.published_at, p.cover_image_url
  from public.posts as p
  where p.author_id = auth.uid() and p.status = 'published' and p.content_kind in ('post', 'article')
    and (coalesce(btrim(p_query), '') = ''
      or strpos(lower(coalesce(p.title, '')), lower(left(btrim(p_query), 100))) > 0
      or strpos(lower(coalesce(p.excerpt, '')), lower(left(btrim(p_query), 100))) > 0)
  order by p.published_at desc nulls last, p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_page_size, 50), 50)) + 1
  offset greatest(0, least(coalesce(p_page, 0), 1000)) * greatest(1, least(coalesce(p_page_size, 50), 50));
$$;

revoke all on function public.profile_publication_activity(uuid, timestamptz, integer) from public;
revoke all on function public.profile_publication_topics(uuid, integer) from public;
revoke all on function public.search_my_profile_work(text, integer, integer) from public, anon;
grant execute on function public.profile_publication_activity(uuid, timestamptz, integer) to anon, authenticated;
grant execute on function public.profile_publication_topics(uuid, integer) to anon, authenticated;
grant execute on function public.search_my_profile_work(text, integer, integer) to authenticated;

commit;
