-- RELEASE-GATED SQL CANDIDATE — DO NOT APPLY DIRECTLY.
--
-- Before promoting this file into supabase/migrations:
--   1. Complete docs/debate-deployment-state.md for staging and production.
--   2. Reconcile the migration ledger/catalog if they disagree.
--   3. Confirm the deployed notifications_type_check definition.
--   4. Assign a timestamp that is safe relative to the resolved Debate files.
--
-- This script intentionally creates no subscriptions for existing followers
-- and no publication events for existing published posts.

create table if not exists public.author_subscriptions (
  subscriber_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (subscriber_id, author_id),
  constraint author_subscriptions_no_self_check check (subscriber_id <> author_id)
);

create index if not exists author_subscriptions_author_created_idx
  on public.author_subscriptions(author_id, created_at desc);

alter table public.author_subscriptions enable row level security;

drop policy if exists "Subscribers can view their author subscriptions"
  on public.author_subscriptions;
create policy "Subscribers can view their author subscriptions"
  on public.author_subscriptions
  for select
  to authenticated
  using (subscriber_id = auth.uid());

revoke all on public.author_subscriptions from public, anon, authenticated;
grant select on public.author_subscriptions to authenticated;
grant all on public.author_subscriptions to service_role;

create or replace function public.set_author_relationship(
  p_author_id uuid,
  p_following boolean default null,
  p_subscribed boolean default null
)
returns table (
  following boolean,
  subscribed boolean,
  follow_created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscriber_id uuid := auth.uid();
  v_follow_created boolean := false;
  v_row_count integer := 0;
begin
  if v_subscriber_id is null then
    raise exception 'Authentication required';
  end if;

  if p_author_id is null or p_author_id = v_subscriber_id then
    raise exception 'You cannot follow or subscribe to yourself';
  end if;

  if not exists (select 1 from public.profiles where id = p_author_id) then
    raise exception 'Author not found';
  end if;

  if exists (
    select 1
    from public.user_blocks
    where (blocker_id = v_subscriber_id and blocked_id = p_author_id)
       or (blocker_id = p_author_id and blocked_id = v_subscriber_id)
  ) then
    raise exception 'This relationship is unavailable';
  end if;

  -- Unfollow is authoritative and always removes Subscribe as well.
  if p_following is false then
    delete from public.author_subscriptions
    where subscriber_id = v_subscriber_id and author_id = p_author_id;

    delete from public.follows
    where follower_id = v_subscriber_id and following_id = p_author_id;
  else
    -- Subscribe always creates Follow. A plain follow does not subscribe.
    if p_following is true or p_subscribed is true then
      insert into public.follows (follower_id, following_id)
      values (v_subscriber_id, p_author_id)
      on conflict (follower_id, following_id) do nothing;
      get diagnostics v_row_count = row_count;
      v_follow_created := v_row_count > 0;
    end if;

    if p_subscribed is true then
      insert into public.author_subscriptions (subscriber_id, author_id)
      values (v_subscriber_id, p_author_id)
      on conflict (subscriber_id, author_id) do nothing;
    elsif p_subscribed is false then
      -- Unsubscribe deliberately leaves Follow intact.
      delete from public.author_subscriptions
      where subscriber_id = v_subscriber_id and author_id = p_author_id;
    end if;
  end if;

  return query
  select
    exists (
      select 1 from public.follows
      where follower_id = v_subscriber_id and following_id = p_author_id
    ),
    exists (
      select 1 from public.author_subscriptions
      where subscriber_id = v_subscriber_id and author_id = p_author_id
    ),
    v_follow_created;
end;
$$;

revoke all on function public.set_author_relationship(uuid, boolean, boolean)
  from public, anon;
grant execute on function public.set_author_relationship(uuid, boolean, boolean)
  to authenticated;

create or replace function public.remove_author_subscriptions_for_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.author_subscriptions
  where (subscriber_id = new.blocker_id and author_id = new.blocked_id)
     or (subscriber_id = new.blocked_id and author_id = new.blocker_id);
  return new;
end;
$$;

drop trigger if exists user_blocks_remove_author_subscriptions
  on public.user_blocks;
create trigger user_blocks_remove_author_subscriptions
after insert on public.user_blocks
for each row execute function public.remove_author_subscriptions_for_block();

create table if not exists public.publication_events (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.posts(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'partial_failure')),
  attempts integer not null default 0 check (attempts >= 0),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists publication_events_claim_idx
  on public.publication_events(status, locked_at, created_at);

alter table public.publication_events enable row level security;
revoke all on public.publication_events from public, anon, authenticated;
grant all on public.publication_events to service_role;

create or replace function public.capture_first_publication_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    insert into public.publication_events (post_id)
    values (new.id)
    on conflict (post_id) do nothing;
  end if;
  return new;
end;
$$;

-- Creating the trigger does not touch existing rows: no historical backfill.
drop trigger if exists posts_capture_first_publication_event on public.posts;
create trigger posts_capture_first_publication_event
after insert or update of status on public.posts
for each row execute function public.capture_first_publication_event();

create table if not exists public.publication_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.publication_events(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email', 'push')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'skipped', 'failed')),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 5),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  skipped_reason text,
  tracking_token uuid not null default gen_random_uuid(),
  matched_author_ids uuid[] not null,
  opened_at timestamptz,
  viewed_at timestamptz,
  qualified_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publication_deliveries_event_recipient_channel_key
    unique (event_id, recipient_id, channel),
  constraint publication_deliveries_tracking_token_key unique (tracking_token),
  constraint publication_deliveries_has_matched_author_check
    check (cardinality(matched_author_ids) > 0)
);

create index if not exists publication_deliveries_claim_idx
  on public.publication_deliveries(event_id, status, locked_at, created_at);
create index if not exists publication_deliveries_recipient_idx
  on public.publication_deliveries(recipient_id, created_at desc);
create index if not exists publication_deliveries_matched_authors_idx
  on public.publication_deliveries using gin(matched_author_ids);

alter table public.publication_deliveries enable row level security;
revoke all on public.publication_deliveries from public, anon, authenticated;
grant all on public.publication_deliveries to service_role;

create or replace function public.claim_publication_events(
  p_limit integer default 10,
  p_lease_seconds integer default 900
)
returns setof public.publication_events
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select id
    from public.publication_events
    where attempts < 5
      and (
        status = 'pending'
        or (status = 'processing'
            and locked_at < now() - make_interval(secs => greatest(p_lease_seconds, 60)))
      )
    order by created_at
    for update skip locked
    limit greatest(least(p_limit, 50), 1)
  )
  update public.publication_events event
  set status = 'processing',
      attempts = event.attempts + 1,
      locked_at = now(),
      updated_at = now()
  from candidates
  where event.id = candidates.id
  returning event.*;
$$;

create or replace function public.claim_publication_event_for_post(
  p_post_id uuid,
  p_lease_seconds integer default 900
)
returns setof public.publication_events
language sql
security definer
set search_path = public
as $$
  with candidate as (
    select id
    from public.publication_events
    where post_id = p_post_id
      and attempts < 5
      and (
        status = 'pending'
        or (status = 'processing'
            and locked_at < now() - make_interval(secs => greatest(p_lease_seconds, 60)))
      )
    for update skip locked
    limit 1
  )
  update public.publication_events event
  set status = 'processing',
      attempts = event.attempts + 1,
      locked_at = now(),
      updated_at = now()
  from candidate
  where event.id = candidate.id
  returning event.*;
$$;

create or replace function public.claim_publication_deliveries(
  p_event_id uuid,
  p_limit integer default 50,
  p_lease_seconds integer default 900
)
returns setof public.publication_deliveries
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select id
    from public.publication_deliveries
    where event_id = p_event_id
      and attempts < 5
      and (
        status = 'pending'
        or status = 'failed'
        or (status = 'processing'
            and locked_at < now() - make_interval(secs => greatest(p_lease_seconds, 60)))
      )
    order by created_at
    for update skip locked
    limit greatest(least(p_limit, 200), 1)
  )
  update public.publication_deliveries delivery
  set status = 'processing',
      attempts = delivery.attempts + 1,
      locked_at = now(),
      updated_at = now()
  from candidates
  where delivery.id = candidates.id
  returning delivery.*;
$$;

create or replace function public.renew_publication_event_lease(p_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with renewed as (
    update public.publication_events
    set locked_at = now(), updated_at = now()
    where id = p_event_id and status = 'processing'
    returning 1
  )
  select exists(select 1 from renewed);
$$;

create or replace function public.renew_publication_delivery_lease(p_delivery_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with renewed as (
    update public.publication_deliveries
    set locked_at = now(), updated_at = now()
    where id = p_delivery_id and status = 'processing'
    returning 1
  )
  select exists(select 1 from renewed);
$$;

revoke all on function public.claim_publication_events(integer, integer)
  from public, anon, authenticated;
revoke all on function public.claim_publication_event_for_post(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.claim_publication_deliveries(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.renew_publication_event_lease(uuid)
  from public, anon, authenticated;
revoke all on function public.renew_publication_delivery_lease(uuid)
  from public, anon, authenticated;

grant execute on function public.claim_publication_events(integer, integer)
  to service_role;
grant execute on function public.claim_publication_event_for_post(uuid, integer)
  to service_role;
grant execute on function public.claim_publication_deliveries(uuid, integer, integer)
  to service_role;
grant execute on function public.renew_publication_event_lease(uuid)
  to service_role;
grant execute on function public.renew_publication_delivery_lease(uuid)
  to service_role;

-- The deployed notifications_type_check was probed against the live database on
-- 2026-07-29. It matched 20260728000001_debate_v1_5_foundation.sql exactly:
-- thirty types, same order. This block therefore restates the complete list the
-- way every other migration in this repository does, rather than appending
-- author_published to whatever it finds. That matters because eight migrations
-- rewrite this constraint wholesale; the next one will be copied from a file, so
-- author_published has to live in a file or it will be silently dropped.
--
-- The guard fails loudly if the deployed list has drifted since the probe, so a
-- type added elsewhere can never be removed here without someone noticing.
do $$
declare
  v_types text[] := array[
    'like', 'comment', 'follow', 'debate_reply', 'debate_argument',
    'fellowship', 'badge', 'post_approved', 'post_rejected',
    'post_published', 'review_assigned', 'review_started', 'review_reminder',
    'revision_requested',
    'co_author_invite', 'co_author_accepted', 'co_author_declined',
    'response_post', 'opportunity_inquiry',
    'moderation_post_removed', 'moderation_comment_hidden', 'account_suspended',
    'debate_v2_round_change', 'debate_v2_final_vote',
    'debate_v2_direct_response', 'debate_v2_evidence_requested',
    'debate_invitation', 'debate_invitation_response',
    'debate_phase_advanced', 'debate_cancelled',
    'author_published'
  ];
  v_definition text;
  v_dropped text;
  v_list text;
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

  select string_agg(distinct match[1], ', ' order by match[1])
  into v_dropped
  from regexp_matches(v_definition, '''([a-z0-9_]+)''::text', 'g') as match
  where match[1] <> all (v_types);

  if v_dropped is not null then
    raise exception
      'Deployed notifications_type_check allows types this file would drop: %. Re-probe and extend v_types before applying.',
      v_dropped;
  end if;

  -- Rendered as ARRAY['like'::text, ...] so the stored definition keeps the
  -- same shape the probe and the guard above both read.
  select string_agg(quote_literal(item) || '::text', ', ' order by ord)
  into v_list
  from unnest(v_types) with ordinality as t(item, ord);

  alter table public.notifications drop constraint notifications_type_check;
  execute format(
    'alter table public.notifications add constraint notifications_type_check check (type = any (array[%s])) not valid',
    v_list
  );
  alter table public.notifications validate constraint notifications_type_check;
end;
$$;

