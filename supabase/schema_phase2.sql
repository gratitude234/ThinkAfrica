-- ============================================================
-- ThinkAfrica Phase 2 Database Schema
-- Run this in the Supabase SQL Editor after schema.sql
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.debates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  moderator_id uuid references public.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'active', 'closed')),
  round_duration_minutes int not null default 5,
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  ends_at timestamptz
);

create table if not exists public.debate_arguments (
  id uuid primary key default gen_random_uuid(),
  debate_id uuid not null references public.debates(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  round_number int not null default 1,
  upvotes int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.debate_votes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  argument_id uuid not null references public.debate_arguments(id) on delete cascade,
  primary key (user_id, argument_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  message text not null,
  read boolean not null default false,
  link text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists debates_status_idx on public.debates(status);
create index if not exists debates_created_at_idx on public.debates(created_at desc);
create index if not exists debate_arguments_debate_id_idx on public.debate_arguments(debate_id);
create index if not exists debate_arguments_upvotes_idx on public.debate_arguments(upvotes desc);
create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists notifications_user_read_idx on public.notifications(user_id, read);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.debates enable row level security;
alter table public.debate_arguments enable row level security;
alter table public.debate_votes enable row level security;
alter table public.notifications enable row level security;

-- debates
create policy "Debates are viewable by everyone"
  on public.debates for select using (true);

create policy "Authenticated users can create debates"
  on public.debates for insert
  with check (auth.role() = 'authenticated' and auth.uid() = moderator_id);

create policy "Moderators can update their debates"
  on public.debates for update
  using (auth.uid() = moderator_id);

-- debate_arguments
create policy "Debate arguments are viewable by everyone"
  on public.debate_arguments for select using (true);

create policy "Authenticated users can submit arguments"
  on public.debate_arguments for insert
  with check (auth.role() = 'authenticated' and auth.uid() = author_id);

-- debate_votes
create policy "Debate votes are viewable by everyone"
  on public.debate_votes for select using (true);

create policy "Authenticated users can vote"
  on public.debate_votes for insert
  with check (auth.role() = 'authenticated' and auth.uid() = user_id);

create policy "Users can remove their own votes"
  on public.debate_votes for delete
  using (auth.uid() = user_id);

-- notifications
create policy "Users can read their own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users can update their own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);

create policy "System can insert notifications"
  on public.notifications for insert
  with check (true);

-- ============================================================
-- RPC: toggle debate vote
-- ============================================================

create or replace function public.toggle_debate_vote(p_argument_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_voted boolean;
begin
  if v_user_id is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  select exists(
    select 1 from public.debate_votes
    where user_id = v_user_id and argument_id = p_argument_id
  ) into v_voted;

  if v_voted then
    delete from public.debate_votes
    where user_id = v_user_id and argument_id = p_argument_id;

    update public.debate_arguments
    set upvotes = greatest(upvotes - 1, 0)
    where id = p_argument_id;

    return json_build_object('voted', false);
  else
    insert into public.debate_votes (user_id, argument_id)
    values (v_user_id, p_argument_id);

    update public.debate_arguments
    set upvotes = upvotes + 1
    where id = p_argument_id;

    return json_build_object('voted', true);
  end if;
end;
$$;

-- ============================================================
-- TRIGGER: notify on post approved
-- ============================================================

create or replace function public.notify_post_approved()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.status != 'published' and new.status = 'published' then
    insert into public.notifications (user_id, type, message, link)
    values (
      new.author_id,
      'post_approved',
      'Your post "' || new.title || '" has been approved and published!',
      '/post/' || new.slug
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_post_approved on public.posts;
create trigger on_post_approved
  after update on public.posts
  for each row execute procedure public.notify_post_approved();

-- ============================================================
-- TRIGGER: notify on post liked
-- ============================================================

create or replace function public.notify_post_liked()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_post public.posts%rowtype;
  v_liker_name text;
begin
  select * into v_post from public.posts where id = new.post_id;
  select coalesce(full_name, username) into v_liker_name
    from public.profiles where id = new.user_id;

  if v_post.author_id != new.user_id then
    insert into public.notifications (user_id, type, message, link)
    values (
      v_post.author_id,
      'like',
      v_liker_name || ' liked your post "' || v_post.title || '"',
      '/post/' || v_post.slug
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_post_liked on public.likes;
create trigger on_post_liked
  after insert on public.likes
  for each row execute procedure public.notify_post_liked();

-- ============================================================
-- TRIGGER: notify on comment
-- ============================================================

create or replace function public.notify_post_commented()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_post public.posts%rowtype;
  v_commenter_name text;
begin
  if new.parent_id is null then
    select * into v_post from public.posts where id = new.post_id;
    select coalesce(full_name, username) into v_commenter_name
      from public.profiles where id = new.author_id;

    if v_post.author_id != new.author_id then
      insert into public.notifications (user_id, type, message, link)
      values (
        v_post.author_id,
        'comment',
        v_commenter_name || ' commented on your post "' || v_post.title || '"',
        '/post/' || v_post.slug
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_post_commented on public.comments;
create trigger on_post_commented
  after insert on public.comments
  for each row execute procedure public.notify_post_commented();

-- ============================================================
-- TRIGGER: notify on new follower
-- ============================================================

create or replace function public.notify_new_follower()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_follower_name text;
  v_follower_username text;
begin
  select coalesce(full_name, username), username
    into v_follower_name, v_follower_username
    from public.profiles where id = new.follower_id;

  insert into public.notifications (user_id, type, message, link)
  values (
    new.following_id,
    'follow',
    v_follower_name || ' started following you',
    '/' || v_follower_username
  );
  return new;
end;
$$;

drop trigger if exists on_new_follower on public.follows;
create trigger on_new_follower
  after insert on public.follows
  for each row execute procedure public.notify_new_follower();

-- ============================================================
-- TRIGGER: notify debate participants on new argument
-- ============================================================

create or replace function public.notify_debate_reply()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_debate_title text;
  v_author_name text;
  v_participant record;
begin
  select title into v_debate_title from public.debates where id = new.debate_id;
  select coalesce(full_name, username) into v_author_name
    from public.profiles where id = new.author_id;

  for v_participant in
    select distinct author_id
    from public.debate_arguments
    where debate_id = new.debate_id
      and author_id != new.author_id
  loop
    insert into public.notifications (user_id, type, message, link)
    values (
      v_participant.author_id,
      'debate_reply',
      v_author_name || ' posted an argument in "' || v_debate_title || '"',
      '/debates/' || new.debate_id
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists on_debate_argument_inserted on public.debate_arguments;
create trigger on_debate_argument_inserted
  after insert on public.debate_arguments
  for each row execute procedure public.notify_debate_reply();

-- ============================================================
-- TRIGGER: award points on post publish
-- ============================================================

create or replace function public.award_points_on_publish()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_points int;
begin
  if old.status != 'published' and new.status = 'published' then
    v_points := case new.type
      when 'blog'         then 10
      when 'essay'        then 20
      when 'research'     then 50
      when 'policy_brief' then 30
      else 10
    end;

    update public.profiles
    set points = points + v_points
    where id = new.author_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_post_published_points on public.posts;
create trigger on_post_published_points
  after update on public.posts
  for each row execute procedure public.award_points_on_publish();

-- ============================================================
-- TRIGGER: award +2 points on like received
-- ============================================================

create or replace function public.award_points_on_like()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_post_author uuid;
begin
  select author_id into v_post_author from public.posts where id = new.post_id;

  if v_post_author is not null and v_post_author != new.user_id then
    update public.profiles
    set points = points + 2
    where id = v_post_author;
  end if;
  return new;
end;
$$;

drop trigger if exists on_like_points on public.likes;
create trigger on_like_points
  after insert on public.likes
  for each row execute procedure public.award_points_on_like();

-- ============================================================
-- TRIGGER: award +3 points on comment
-- ============================================================

create or replace function public.award_points_on_comment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
  set points = points + 3
  where id = new.author_id;
  return new;
end;
$$;

drop trigger if exists on_comment_points on public.comments;
create trigger on_comment_points
  after insert on public.comments
  for each row execute procedure public.award_points_on_comment();

-- ============================================================
-- TRIGGER: award badges on post publish
-- ============================================================

create or replace function public.check_and_award_badges()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_post_count int;
  v_badge_id uuid;
begin
  if old.status = 'published' or new.status != 'published' then
    return new;
  end if;

  select count(*) into v_post_count
  from public.posts
  where author_id = new.author_id and status = 'published';

  -- First Post badge
  if v_post_count = 1 then
    select id into v_badge_id from public.badges where name = 'First Post' limit 1;
    if v_badge_id is not null then
      insert into public.user_badges (user_id, badge_id)
      values (new.author_id, v_badge_id)
      on conflict do nothing;
    end if;
  end if;

  -- Researcher badge
  if new.type = 'research' then
    select id into v_badge_id from public.badges where name = 'Researcher' limit 1;
    if v_badge_id is not null then
      insert into public.user_badges (user_id, badge_id)
      values (new.author_id, v_badge_id)
      on conflict do nothing;
    end if;
  end if;

  -- Policy Maker badge
  if new.type = 'policy_brief' then
    select id into v_badge_id from public.badges where name = 'Policy Maker' limit 1;
    if v_badge_id is not null then
      insert into public.user_badges (user_id, badge_id)
      values (new.author_id, v_badge_id)
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_post_published_badges on public.posts;
create trigger on_post_published_badges
  after update on public.posts
  for each row execute procedure public.check_and_award_badges();

-- ============================================================
-- TRIGGER: award Rising Star / Thought Leader on points update
-- ============================================================

create or replace function public.check_points_badges()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_badge_id uuid;
begin
  if new.points >= 100 and old.points < 100 then
    select id into v_badge_id from public.badges where name = 'Rising Star' limit 1;
    if v_badge_id is not null then
      insert into public.user_badges (user_id, badge_id)
      values (new.id, v_badge_id)
      on conflict do nothing;
    end if;
  end if;

  if new.points >= 500 and old.points < 500 then
    select id into v_badge_id from public.badges where name = 'Thought Leader' limit 1;
    if v_badge_id is not null then
      insert into public.user_badges (user_id, badge_id)
      values (new.id, v_badge_id)
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_points_updated on public.profiles;
create trigger on_points_updated
  after update of points on public.profiles
  for each row execute procedure public.check_points_badges();

-- ============================================================
-- SEED: Phase 2 badges
-- ============================================================

insert into public.badges (name, description, icon) values
  ('Debate Champion', 'Won a debate with the most upvotes', '🏆'),
  ('Rising Star', 'Reached 100 points', '⭐'),
  ('Thought Leader', 'Reached 500 points', '💡')
on conflict do nothing;

-- ============================================================
-- REALTIME: enable live subscriptions for key tables
-- Run once; safe to re-run (add if not already a member)
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'debate_arguments'
  ) then
    alter publication supabase_realtime add table public.debate_arguments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
