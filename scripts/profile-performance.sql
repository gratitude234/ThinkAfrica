-- Read-only profiling against a representative staging profile.
-- psql "$DATABASE_URL_DIRECT" -v profile_id='MEMBER-UUID' -f scripts/profile-performance.sql
begin read only;
set local statement_timeout = '10s';
explain (analyze, buffers)
select * from public.profile_publication_activity(
  :'profile_id'::uuid,
  (date_trunc('month', current_timestamp at time zone 'UTC') - interval '11 months') at time zone 'UTC',
  12
);
explain (analyze, buffers)
select * from public.profile_publication_topics(:'profile_id'::uuid, 6);
explain (analyze, buffers)
select id, published_at, created_at
from public.posts
where author_id = :'profile_id'::uuid
  and status = 'published' and content_kind in ('post', 'article')
order by published_at desc nulls last, created_at desc, id desc
limit 21;
rollback;
