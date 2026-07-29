-- RELEASE-GATED SQL CANDIDATE — DO NOT APPLY DIRECTLY.
--
-- Prerequisites:
--   1. Complete the Debate deployment probes and reconcile the migration ledger.
--   2. Promote, apply, and verify author_subscriptions_publication_delivery_v1.sql.
--   3. Confirm the complete live notifications_type_check definition.
--   4. Assign this extension a later migration timestamp than the verified
--      author-subscriptions migration.
--
-- This script intentionally creates no subscriptions from profiles.interests
-- and no publication events or deliveries for existing published posts.

create or replace function public.normalize_topic_key(p_topic text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(regexp_replace(btrim(coalesce(p_topic, '')), '\s+', ' ', 'g'));
$$;

revoke all on function public.normalize_topic_key(text) from public, anon, authenticated;
grant execute on function public.normalize_topic_key(text) to service_role;

alter table public.posts
  add column if not exists topic_keys text[] not null default '{}'::text[];

-- Existing tags remain readable. Only non-empty canonical keys within the V1
-- 80-character subscription limit participate in subscription matching.
with normalized as (
  select
    post.id,
    coalesce(
      array_agg(distinct public.normalize_topic_key(tag))
        filter (
          where char_length(public.normalize_topic_key(tag)) between 1 and 80
        ),
      '{}'::text[]
    ) as topic_keys
  from public.posts post
  left join lateral unnest(coalesce(post.tags, '{}'::text[])) as tag on true
  group by post.id
)
update public.posts post
set topic_keys = normalized.topic_keys
from normalized
where post.id = normalized.id
  and post.topic_keys is distinct from normalized.topic_keys;

create or replace function public.sync_post_topic_keys()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag text;
  v_key text;
begin
  if tg_op = 'UPDATE'
     and new.tags is not distinct from old.tags then
    -- topic_keys is derived state. Ignore direct client writes that do not
    -- also change tags.
    new.topic_keys := old.topic_keys;
    return new;
  end if;

  foreach v_tag in array coalesce(new.tags, '{}'::text[]) loop
    v_key := public.normalize_topic_key(v_tag);
    if char_length(v_key) < 1 or char_length(v_key) > 80 then
      raise exception 'Topics must contain between 1 and 80 characters';
    end if;
  end loop;

  select coalesce(
    array_agg(distinct public.normalize_topic_key(tag)),
    '{}'::text[]
  )
  into new.topic_keys
  from unnest(coalesce(new.tags, '{}'::text[])) as tag;

  return new;
end;
$$;

revoke all on function public.sync_post_topic_keys() from public, anon, authenticated;
grant execute on function public.sync_post_topic_keys() to service_role;

drop trigger if exists posts_sync_topic_keys on public.posts;
create trigger posts_sync_topic_keys
before insert or update of tags, topic_keys on public.posts
for each row execute function public.sync_post_topic_keys();

create index if not exists posts_published_topic_keys_idx
  on public.posts using gin(topic_keys)
  where status = 'published';

create table if not exists public.topic_subscriptions (
  subscriber_id uuid not null references public.profiles(id) on delete cascade,
  topic_key text not null,
  display_label text not null,
  created_at timestamptz not null default now(),
  primary key (subscriber_id, topic_key),
  constraint topic_subscriptions_key_length_check
    check (char_length(topic_key) between 1 and 80),
  constraint topic_subscriptions_key_normalized_check
    check (topic_key = public.normalize_topic_key(topic_key)),
  constraint topic_subscriptions_label_length_check
    check (char_length(btrim(display_label)) between 1 and 80)
);

create index if not exists topic_subscriptions_topic_created_idx
  on public.topic_subscriptions(topic_key, created_at desc);

alter table public.topic_subscriptions enable row level security;

drop policy if exists "Subscribers can view their topic subscriptions"
  on public.topic_subscriptions;
create policy "Subscribers can view their topic subscriptions"
  on public.topic_subscriptions
  for select
  to authenticated
  using (subscriber_id = auth.uid());

revoke all on public.topic_subscriptions from public, anon, authenticated;
grant select on public.topic_subscriptions to authenticated;
grant all on public.topic_subscriptions to service_role;

create or replace function public.set_topic_subscription(
  p_topic text,
  p_subscribed boolean
)
returns table (
  topic_key text,
  display_label text,
  subscribed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscriber_id uuid := auth.uid();
  v_topic_key text := public.normalize_topic_key(p_topic);
  v_display_label text := btrim(coalesce(p_topic, ''));
begin
  if v_subscriber_id is null then
    raise exception 'Authentication required';
  end if;

  if p_subscribed is null then
    raise exception 'Subscription state is required';
  end if;

  if char_length(v_topic_key) < 1 or char_length(v_topic_key) > 80 then
    raise exception 'Topics must contain between 1 and 80 characters';
  end if;

  if p_subscribed then
    if not exists (
      select 1
      from public.posts
      where status = 'published'
        and topic_keys @> array[v_topic_key]::text[]
    ) then
      raise exception 'This topic does not have published content';
    end if;

    insert into public.topic_subscriptions (
      subscriber_id,
      topic_key,
      display_label
    )
    values (
      v_subscriber_id,
      v_topic_key,
      v_display_label
    )
    on conflict (subscriber_id, topic_key)
    do update set display_label = excluded.display_label;
  else
    delete from public.topic_subscriptions
    where subscriber_id = v_subscriber_id
      and topic_subscriptions.topic_key = v_topic_key;
  end if;

  return query
  select
    v_topic_key,
    coalesce(
      (
        select subscription.display_label
        from public.topic_subscriptions subscription
        where subscription.subscriber_id = v_subscriber_id
          and subscription.topic_key = v_topic_key
      ),
      v_display_label
    ),
    exists (
      select 1
      from public.topic_subscriptions subscription
      where subscription.subscriber_id = v_subscriber_id
        and subscription.topic_key = v_topic_key
    );
end;
$$;

revoke all on function public.set_topic_subscription(text, boolean)
  from public, anon;
grant execute on function public.set_topic_subscription(text, boolean)
  to authenticated;

alter table public.publication_deliveries
  add column if not exists matched_topic_keys text[] not null default '{}'::text[];

alter table public.publication_deliveries
  alter column matched_author_ids set default '{}'::uuid[];

alter table public.publication_deliveries
  drop constraint if exists publication_deliveries_has_matched_author_check;
alter table public.publication_deliveries
  drop constraint if exists publication_deliveries_has_match_check;
alter table public.publication_deliveries
  add constraint publication_deliveries_has_match_check
  check (
    cardinality(matched_author_ids) > 0
    or cardinality(matched_topic_keys) > 0
  );

create index if not exists publication_deliveries_matched_topics_idx
  on public.publication_deliveries using gin(matched_topic_keys);

-- Preserve the deployed notification constraint and append only
-- topic_published. The live probe remains mandatory before promotion.
do $$
declare
  v_definition text;
  v_expression text;
begin
  select pg_get_constraintdef(oid)
  into v_definition
  from pg_constraint
  where conrelid = 'public.notifications'::regclass
    and conname = 'notifications_type_check'
    and contype = 'c';

  if v_definition is null then
    raise exception 'notifications_type_check was not found; stop and re-run the live probe';
  end if;

  if position('topic_published' in v_definition) = 0 then
    v_expression := regexp_replace(v_definition, '^CHECK \((.*)\)$', '\1');
    if v_expression = v_definition then
      raise exception 'Unable to parse deployed notifications_type_check: %', v_definition;
    end if;

    alter table public.notifications drop constraint notifications_type_check;
    execute format(
      'alter table public.notifications add constraint notifications_type_check check ((%s) or type = %L) not valid',
      v_expression,
      'topic_published'
    );
    alter table public.notifications validate constraint notifications_type_check;
  end if;
end;
$$;

notify pgrst, 'reload schema';
