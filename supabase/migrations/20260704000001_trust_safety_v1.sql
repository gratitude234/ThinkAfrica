-- Trust & Safety v1: user blocks, content/user reports, suspensions,
-- moderation takedowns (post 'removed' status, comment hiding), and
-- block/suspension enforcement in messaging and write policies.

-- ============================================================
-- user_blocks
-- ============================================================

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked_id);

alter table public.user_blocks enable row level security;

-- No select policy for the blocked side: users cannot discover who blocked them.
drop policy if exists "Users can view their own blocks" on public.user_blocks;
create policy "Users can view their own blocks"
  on public.user_blocks for select
  using (auth.uid() = blocker_id);

drop policy if exists "Users can block other users" on public.user_blocks;
create policy "Users can block other users"
  on public.user_blocks for insert
  with check (auth.uid() = blocker_id);

drop policy if exists "Users can unblock users they blocked" on public.user_blocks;
create policy "Users can unblock users they blocked"
  on public.user_blocks for delete
  using (auth.uid() = blocker_id);

-- ============================================================
-- Helper functions
-- ============================================================

-- SECURITY DEFINER so policies and RPCs can see reverse-direction blocks
-- that RLS hides from the requesting user.
create or replace function public.is_blocked_pair(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_blocks
    where (blocker_id = user_a and blocked_id = user_b)
       or (blocker_id = user_b and blocked_id = user_a)
  );
$$;

revoke all on function public.is_blocked_pair(uuid, uuid) from public;
grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated;

create or replace function public.is_suspended()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and suspended_at is not null
  );
$$;

revoke all on function public.is_suspended() from public;
grant execute on function public.is_suspended() to authenticated;

-- ============================================================
-- Suspension columns
-- ============================================================

alter table public.profiles
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text;

-- ============================================================
-- reports
-- ============================================================

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'user')),
  target_post_id uuid references public.posts(id) on delete cascade,
  target_comment_id uuid references public.comments(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete cascade,
  reason text not null check (reason in (
    'spam',
    'harassment',
    'hate_speech',
    'misinformation',
    'plagiarism',
    'inappropriate_content',
    'other'
  )),
  details text,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_action text,
  created_at timestamptz not null default now(),
  check (
    (target_type = 'post' and target_post_id is not null and target_comment_id is null and target_user_id is null)
    or (target_type = 'comment' and target_comment_id is not null and target_post_id is null and target_user_id is null)
    or (target_type = 'user' and target_user_id is not null and target_post_id is null and target_comment_id is null)
  )
);

-- One open report per reporter per target (doubles as a light rate limit).
create unique index if not exists reports_open_dedupe_idx
  on public.reports (
    reporter_id,
    target_type,
    coalesce(target_post_id, target_comment_id, target_user_id)
  )
  where status = 'pending';

create index if not exists reports_status_created_idx on public.reports(status, created_at desc);

alter table public.reports enable row level security;

drop policy if exists "Users can file reports" on public.reports;
create policy "Users can file reports"
  on public.reports for insert
  with check (auth.uid() = reporter_id and not public.is_suspended());

drop policy if exists "Reporters and admins can view reports" on public.reports;
create policy "Reporters and admins can view reports"
  on public.reports for select
  using (auth.uid() = reporter_id or public.is_admin());

drop policy if exists "Admins can update reports" on public.reports;
create policy "Admins can update reports"
  on public.reports for update
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- Post takedown: 'removed' status
-- ============================================================

-- 'removed' is a moderation state outside the editorial workflow; all public
-- reads already filter status = 'published', so removed posts disappear
-- everywhere. Authors can still see their own removed posts.
alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts
  add constraint posts_status_check
  check (status = any (array['draft', 'pending', 'pending_revision', 'published', 'rejected', 'removed']));

-- ============================================================
-- Comment hiding
-- ============================================================

alter table public.comments
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references public.profiles(id) on delete set null;

drop policy if exists "Comments on published posts are viewable by everyone" on public.comments;
create policy "Comments on published posts are viewable by everyone"
  on public.comments for select
  using (hidden_at is null or auth.uid() = author_id or public.is_admin());

-- ============================================================
-- Suspension enforcement in write policies
-- ============================================================

drop policy if exists "Authenticated users can insert posts" on public.posts;
create policy "Authenticated users can insert posts"
  on public.posts for insert
  with check (
    auth.role() = 'authenticated'
    and auth.uid() = author_id
    and not public.is_suspended()
  );

drop policy if exists "Authenticated users can insert comments" on public.comments;
create policy "Authenticated users can insert comments"
  on public.comments for insert
  with check (
    auth.role() = 'authenticated'
    and auth.uid() = author_id
    and not public.is_suspended()
  );

-- Debate arguments insert client-side, so this policy is the enforcement point.
drop policy if exists "Authenticated users can submit arguments" on public.debate_arguments;
create policy "Authenticated users can submit arguments"
  on public.debate_arguments for insert
  with check (
    auth.role() = 'authenticated'
    and auth.uid() = author_id
    and not public.is_suspended()
    and stance in ('for', 'against')
    and exists (
      select 1
      from public.debates
      where id = debate_id
        and status = 'active'
    )
    and exists (
      select 1
      from public.debate_participants
      where debate_id = public.debate_arguments.debate_id
        and user_id = public.debate_arguments.author_id
        and stance = public.debate_arguments.stance
    )
  );

-- ============================================================
-- Block enforcement in follows
-- ============================================================

drop policy if exists "Authenticated users can follow" on public.follows;
create policy "Authenticated users can follow"
  on public.follows for insert
  with check (
    auth.role() = 'authenticated'
    and auth.uid() = follower_id
    and not public.is_blocked_pair(follower_id, following_id)
  );

-- ============================================================
-- Notification types for moderation events
-- ============================================================

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type = any (array[
    'like', 'comment', 'follow', 'debate_reply', 'debate_argument',
    'fellowship', 'badge', 'post_approved', 'post_rejected',
    'post_published', 'review_assigned', 'revision_requested',
    'co_author_invite', 'co_author_accepted', 'co_author_declined',
    'response_post', 'opportunity_inquiry',
    'moderation_post_removed', 'moderation_comment_hidden', 'account_suspended'
  ]));

-- ============================================================
-- Messaging: block + suspension checks in find_or_create_conversation
-- ============================================================

create or replace function public.find_or_create_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user_id uuid := auth.uid();
  v_pair_key text;
  v_conversation_id uuid;
  v_target_exists boolean := false;
begin
  if v_current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_user_id is null or v_current_user_id = target_user_id then
    raise exception 'Invalid conversation target.';
  end if;

  select exists (
    select 1
    from public.profiles
    where id = target_user_id
  )
  into v_target_exists;

  if not v_target_exists then
    raise exception 'Invalid conversation target.';
  end if;

  if exists (
    select 1
    from public.profiles
    where id = v_current_user_id
      and suspended_at is not null
  ) then
    raise exception 'Your account is currently suspended.';
  end if;

  if public.is_blocked_pair(v_current_user_id, target_user_id) then
    raise exception 'You cannot message this user.';
  end if;

  v_pair_key := least(v_current_user_id::text, target_user_id::text)
    || ':'
    || greatest(v_current_user_id::text, target_user_id::text);

  insert into public.conversations (participant_pair)
  values (v_pair_key)
  on conflict (participant_pair)
  do update set participant_pair = excluded.participant_pair
  returning id into v_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (v_conversation_id, v_current_user_id),
    (v_conversation_id, target_user_id)
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;
