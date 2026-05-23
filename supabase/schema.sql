-- ============================================================
-- ThinkAfrica Database Schema
-- Paste this entire file into the Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- profiles: extends auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  country text,
  university text,
  field_of_study text,
  profile_type text,
  secondary_profile_types text[] not null default '{}',
  organization_name text,
  professional_title text,
  organization_website text,
  bio text,
  avatar_url text,
  role text not null default 'student' check (role in ('student', 'reviewer', 'editor', 'admin')),
  points integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists role text not null default 'student',
  add column if not exists country text,
  add column if not exists profile_type text,
  add column if not exists secondary_profile_types text[] not null default '{}',
  add column if not exists organization_name text,
  add column if not exists professional_title text,
  add column if not exists organization_website text;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'reviewer', 'editor', 'admin'));

alter table public.profiles
  drop constraint if exists profiles_profile_type_check;

alter table public.profiles
  add constraint profiles_profile_type_check
  check (
    profile_type is null or profile_type in (
      'student',
      'researcher',
      'educator',
      'ngo_nonprofit',
      'founder',
      'policy_government',
      'journalist_media',
      'professional',
      'other'
    )
  );

alter table public.profiles
  drop constraint if exists profiles_secondary_profile_types_check;

alter table public.profiles
  add constraint profiles_secondary_profile_types_check
  check (
    secondary_profile_types <@ array[
      'student',
      'researcher',
      'educator',
      'ngo_nonprofit',
      'founder',
      'policy_government',
      'journalist_media',
      'professional',
      'other'
    ]::text[]
    and cardinality(secondary_profile_types) <= 3
    and (
      profile_type is null
      or profile_type <> all(secondary_profile_types)
    )
  );

-- posts
create table if not exists public.posts (
  id uuid primary key default uuid_generate_v4(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  slug text unique not null,
  content text,
  excerpt text,
  type text not null check (type in ('blog', 'essay', 'research', 'policy_brief')),
  status text not null default 'draft' check (status in ('draft', 'pending', 'published', 'rejected')),
  tags text[] default '{}',
  pdf_url text,
  view_count integer not null default 0,
  impression_count integer not null default 0,
  read_count integer not null default 0,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.post_engagement_events (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references public.posts(id) on delete cascade,
  event_type text not null check (event_type in ('impression', 'view', 'read')),
  user_id uuid references public.profiles(id) on delete cascade,
  anonymous_id text,
  surface text,
  route text,
  read_seconds integer check (read_seconds is null or read_seconds >= 0),
  scroll_depth integer check (scroll_depth is null or scroll_depth between 0 and 100),
  metadata jsonb not null default '{}'::jsonb,
  event_date date not null default current_date,
  created_at timestamptz not null default now(),
  check (user_id is not null or nullif(anonymous_id, '') is not null)
);

-- post_authors
create table if not exists public.post_authors (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  display_order integer not null default 0,
  corresponding_author boolean not null default false,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (post_id, user_id)
);

-- comments
create table if not exists public.comments (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  content text not null,
  upvotes integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.comment_votes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

-- likes
create table if not exists public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  primary key (user_id, post_id)
);

-- follows
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  primary key (follower_id, following_id),
  check (follower_id != following_id)
);

-- badges
create table if not exists public.badges (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  icon text
);

-- user_badges
create table if not exists public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

-- universities: country-scoped school directory for onboarding/settings
create table if not exists public.universities (
  id uuid primary key default uuid_generate_v4(),
  country text not null,
  name text not null,
  aliases text[] not null default '{}',
  website_url text,
  verified boolean not null default true,
  created_at timestamptz not null default now(),
  unique (country, name)
);

-- profile_featured_posts
create table if not exists public.profile_featured_posts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  position integer not null check (position between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (user_id, post_id),
  unique (user_id, position)
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists posts_author_id_idx on public.posts(author_id);
create index if not exists posts_status_idx on public.posts(status);
create index if not exists posts_slug_idx on public.posts(slug);
create index if not exists posts_published_reads_recency_idx
  on public.posts(read_count desc, published_at desc)
  where status = 'published';
create index if not exists post_engagement_events_post_created_idx
  on public.post_engagement_events(post_id, created_at desc);
create index if not exists post_engagement_events_type_created_idx
  on public.post_engagement_events(event_type, created_at desc);
create unique index if not exists post_engagement_impression_daily_actor_surface_idx
  on public.post_engagement_events(
    post_id,
    coalesce('user:' || user_id::text, 'anon:' || anonymous_id),
    coalesce(surface, 'unknown'),
    event_date
  )
  where event_type = 'impression';
create unique index if not exists post_engagement_view_daily_actor_idx
  on public.post_engagement_events(
    post_id,
    coalesce('user:' || user_id::text, 'anon:' || anonymous_id),
    event_date
  )
  where event_type = 'view';
create unique index if not exists post_engagement_read_daily_actor_idx
  on public.post_engagement_events(
    post_id,
    coalesce('user:' || user_id::text, 'anon:' || anonymous_id),
    event_date
  )
  where event_type = 'read';
create index if not exists comments_post_id_idx on public.comments(post_id);
create index if not exists comments_upvotes_idx on public.comments(upvotes desc);
create index if not exists comment_votes_comment_id_idx on public.comment_votes(comment_id);
create index if not exists likes_post_id_idx on public.likes(post_id);
create index if not exists profiles_country_idx on public.profiles(country);
create index if not exists profiles_profile_type_idx on public.profiles(profile_type);
create index if not exists universities_country_name_idx on public.universities(country, name);

insert into public.universities (country, name)
values
  ('Algeria', 'University of Algiers'),
  ('Botswana', 'University of Botswana'),
  ('Egypt', 'Ain Shams University'),
  ('Egypt', 'Assiut University'),
  ('Egypt', 'Cairo University'),
  ('Egypt', 'University of Alexandria'),
  ('Ethiopia', 'Addis Ababa University'),
  ('Ghana', 'Kwame Nkrumah University of Science and Technology'),
  ('Ghana', 'University of Ghana'),
  ('Kenya', 'Egerton University'),
  ('Kenya', 'Kenyatta University'),
  ('Kenya', 'Moi University'),
  ('Kenya', 'Strathmore University'),
  ('Kenya', 'USIU Africa'),
  ('Kenya', 'University of Nairobi'),
  ('Mauritius', 'African Leadership University'),
  ('Mauritius', 'University of Mauritius'),
  ('Morocco', 'Mohammed V University'),
  ('Nigeria', 'Ahmadu Bello University'),
  ('Nigeria', 'Babcock University'),
  ('Nigeria', 'Covenant University'),
  ('Nigeria', 'Delta State University'),
  ('Nigeria', 'Federal University of Technology Akure'),
  ('Nigeria', 'Joseph Ayo Babalola University'),
  ('Nigeria', 'Lagos State University'),
  ('Nigeria', 'Nnamdi Azikiwe University'),
  ('Nigeria', 'Obafemi Awolowo University'),
  ('Nigeria', 'Pan-African University'),
  ('Nigeria', 'Rivers State University'),
  ('Nigeria', 'University of Abuja'),
  ('Nigeria', 'University of Benin'),
  ('Nigeria', 'University of Ibadan'),
  ('Nigeria', 'University of Lagos'),
  ('Nigeria', 'University of Nigeria Nsukka'),
  ('Nigeria', 'University of Port Harcourt'),
  ('Rwanda', 'African Leadership University'),
  ('Rwanda', 'National University of Rwanda'),
  ('Senegal', 'Cheikh Anta Diop University'),
  ('South Africa', 'Durban University of Technology'),
  ('South Africa', 'Nelson Mandela University'),
  ('South Africa', 'North-West University'),
  ('South Africa', 'Rhodes University'),
  ('South Africa', 'Stellenbosch University'),
  ('South Africa', 'Tshwane University of Technology'),
  ('South Africa', 'University of Cape Town'),
  ('South Africa', 'University of Johannesburg'),
  ('South Africa', 'University of KwaZulu-Natal'),
  ('South Africa', 'University of Limpopo'),
  ('South Africa', 'University of Pretoria'),
  ('South Africa', 'University of Western Cape'),
  ('South Africa', 'University of Witwatersrand'),
  ('South Africa', 'University of the Free State'),
  ('Sudan', 'University of Khartoum'),
  ('Tanzania', 'University of Dar es Salaam'),
  ('Tunisia', 'University of Tunis'),
  ('Uganda', 'Makerere University'),
  ('Zambia', 'University of Zambia'),
  ('Zimbabwe', 'University of Zimbabwe')
on conflict (country, name) do update
set verified = true;
create index if not exists profile_featured_posts_user_position_idx on public.profile_featured_posts(user_id, position);
create index if not exists profile_featured_posts_post_idx on public.profile_featured_posts(post_id);

-- ============================================================
-- TRIGGER: auto-create profile on signup
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_username text;
  final_username text;
  counter integer := 0;
begin
  -- Generate a base username from email
  base_username := lower(split_part(new.email, '@', 1));
  base_username := regexp_replace(base_username, '[^a-z0-9_]', '', 'g');
  final_username := base_username;

  -- Handle duplicate usernames
  while exists (select 1 from public.profiles where username = final_username) loop
    counter := counter + 1;
    final_username := base_username || counter::text;
  end loop;

  insert into public.profiles (id, username, full_name, country, university)
  values (
    new.id,
    final_username,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'country', ''),
    coalesce(new.raw_user_meta_data->>'university', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Drop trigger if exists, then recreate
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- RPC: increment view count
-- ============================================================

create or replace function public.increment_view_count(post_slug text)
returns void
language sql
security definer
as $$
  update public.posts
  set view_count = view_count + 1
  where slug = post_slug;
$$;

create or replace function public.record_post_engagement(
  post_slug text,
  engagement_type text,
  actor_user_id uuid default null,
  actor_anonymous_id text default null,
  engagement_surface text default null,
  engagement_route text default null,
  engagement_read_seconds integer default null,
  engagement_scroll_depth integer default null,
  engagement_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post_id uuid;
  target_author_id uuid;
  inserted_event_id uuid;
  normalized_anonymous_id text;
begin
  if engagement_type not in ('impression', 'view', 'read') then
    return false;
  end if;

  normalized_anonymous_id :=
    case
      when actor_user_id is null then nullif(actor_anonymous_id, '')
      else null
    end;

  if actor_user_id is null and normalized_anonymous_id is null then
    return false;
  end if;

  select id, author_id
  into target_post_id, target_author_id
  from public.posts
  where slug = post_slug
    and status = 'published'
  limit 1;

  if target_post_id is null then
    return false;
  end if;

  if actor_user_id is not null and actor_user_id = target_author_id then
    return false;
  end if;

  insert into public.post_engagement_events (
    post_id,
    event_type,
    user_id,
    anonymous_id,
    surface,
    route,
    read_seconds,
    scroll_depth,
    metadata
  )
  values (
    target_post_id,
    engagement_type,
    actor_user_id,
    normalized_anonymous_id,
    nullif(engagement_surface, ''),
    nullif(engagement_route, ''),
    case
      when engagement_read_seconds is null then null
      else greatest(0, engagement_read_seconds)
    end,
    case
      when engagement_scroll_depth is null then null
      else least(100, greatest(0, engagement_scroll_depth))
    end,
    coalesce(engagement_metadata, '{}'::jsonb)
  )
  on conflict do nothing
  returning id into inserted_event_id;

  if inserted_event_id is null then
    return false;
  end if;

  if engagement_type = 'impression' then
    update public.posts
    set impression_count = impression_count + 1
    where id = target_post_id;
  elsif engagement_type = 'view' then
    update public.posts
    set view_count = view_count + 1
    where id = target_post_id;
  elsif engagement_type = 'read' then
    update public.posts
    set read_count = read_count + 1
    where id = target_post_id;
  end if;

  return true;
end;
$$;

revoke all on function public.record_post_engagement(
  text,
  text,
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  jsonb
) from public;
grant execute on function public.record_post_engagement(
  text,
  text,
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  jsonb
) to service_role;

-- ============================================================
-- RPC: admin role check
-- ============================================================

create or replace function public.is_admin()
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
      and role = 'admin'
  );
$$;

create or replace function public.toggle_comment_vote(p_comment_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_voted boolean;
  v_inserted boolean;
  v_upvotes integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be signed in to vote.';
  end if;

  if not exists (select 1 from public.comments where id = p_comment_id) then
    raise exception 'Comment not found.';
  end if;

  select exists (
    select 1
    from public.comment_votes
    where user_id = v_user_id
      and comment_id = p_comment_id
  ) into v_voted;

  if v_voted then
    delete from public.comment_votes
    where user_id = v_user_id
      and comment_id = p_comment_id;

    update public.comments
      set upvotes = greatest(upvotes - 1, 0)
      where id = p_comment_id
      returning upvotes into v_upvotes;

    return json_build_object('voted', false, 'upvotes', v_upvotes);
  end if;

  insert into public.comment_votes (user_id, comment_id)
  values (v_user_id, p_comment_id)
  on conflict do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    select upvotes into v_upvotes
    from public.comments
    where id = p_comment_id;

    return json_build_object('voted', true, 'upvotes', v_upvotes);
  end if;

  update public.comments
    set upvotes = upvotes + 1
    where id = p_comment_id
    returning upvotes into v_upvotes;

  return json_build_object('voted', true, 'upvotes', v_upvotes);
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.comment_votes enable row level security;
alter table public.likes enable row level security;
alter table public.follows enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.universities enable row level security;
alter table public.profile_featured_posts enable row level security;
alter table public.post_engagement_events enable row level security;

-- ---- profiles ----
create or replace function pg_temp.create_policy_if_missing(
  target_schema text,
  target_table text,
  target_policy text,
  statement text
)
returns void
language plpgsql
as $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = target_schema
      and tablename = target_table
      and policyname = target_policy
  ) then
    execute statement;
  end if;
end;
$$;

select pg_temp.create_policy_if_missing('public', 'profiles', 'Public profiles are viewable by everyone',
  $$create policy "Public profiles are viewable by everyone" on public.profiles for select using (true)$$);

select pg_temp.create_policy_if_missing('public', 'profiles', 'Users can insert their own profile',
  $$create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id)$$);

select pg_temp.create_policy_if_missing('public', 'profiles', 'Users can update their own profile',
  $$create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id)$$);

-- ---- universities ----
select pg_temp.create_policy_if_missing('public', 'universities', 'Universities are viewable by everyone',
  $$create policy "Universities are viewable by everyone" on public.universities for select using (true)$$);

-- ---- posts ----
select pg_temp.create_policy_if_missing('public', 'posts', 'Published posts are viewable by everyone',
  $$create policy "Published posts are viewable by everyone" on public.posts for select using (status = 'published' or auth.uid() = author_id)$$);

select pg_temp.create_policy_if_missing('public', 'posts', 'Authenticated users can insert posts',
  $$create policy "Authenticated users can insert posts" on public.posts for insert with check (auth.role() = 'authenticated' and auth.uid() = author_id)$$);

select pg_temp.create_policy_if_missing('public', 'posts', 'Authors can update their own posts',
  $$create policy "Authors can update their own posts" on public.posts for update using (auth.uid() = author_id)$$);

select pg_temp.create_policy_if_missing('public', 'posts', 'Authors can delete their own posts',
  $$create policy "Authors can delete their own posts" on public.posts for delete using (auth.uid() = author_id)$$);

-- ---- comments ----
select pg_temp.create_policy_if_missing('public', 'comments', 'Comments on published posts are viewable by everyone',
  $$create policy "Comments on published posts are viewable by everyone" on public.comments for select using (true)$$);

select pg_temp.create_policy_if_missing('public', 'comments', 'Authenticated users can insert comments',
  $$create policy "Authenticated users can insert comments" on public.comments for insert with check (auth.role() = 'authenticated' and auth.uid() = author_id)$$);

select pg_temp.create_policy_if_missing('public', 'comments', 'Authors can update their own comments',
  $$create policy "Authors can update their own comments" on public.comments for update using (auth.uid() = author_id)$$);

select pg_temp.create_policy_if_missing('public', 'comments', 'Authors can delete their own comments',
  $$create policy "Authors can delete their own comments" on public.comments for delete using (auth.uid() = author_id)$$);

select pg_temp.create_policy_if_missing('public', 'comment_votes', 'Comment votes are viewable by everyone',
  $$create policy "Comment votes are viewable by everyone" on public.comment_votes for select using (true)$$);

select pg_temp.create_policy_if_missing('public', 'comment_votes', 'Authenticated users can vote on comments',
  $$create policy "Authenticated users can vote on comments" on public.comment_votes for insert with check (auth.role() = 'authenticated' and auth.uid() = user_id)$$);

select pg_temp.create_policy_if_missing('public', 'comment_votes', 'Users can remove their own comment votes',
  $$create policy "Users can remove their own comment votes" on public.comment_votes for delete using (auth.uid() = user_id)$$);

-- ---- likes ----
select pg_temp.create_policy_if_missing('public', 'likes', 'Likes are viewable by everyone',
  $$create policy "Likes are viewable by everyone" on public.likes for select using (true)$$);

select pg_temp.create_policy_if_missing('public', 'likes', 'Authenticated users can like posts',
  $$create policy "Authenticated users can like posts" on public.likes for insert with check (auth.role() = 'authenticated' and auth.uid() = user_id)$$);

select pg_temp.create_policy_if_missing('public', 'likes', 'Users can remove their own likes',
  $$create policy "Users can remove their own likes" on public.likes for delete using (auth.uid() = user_id)$$);

-- ---- follows ----
select pg_temp.create_policy_if_missing('public', 'follows', 'Follows are viewable by everyone',
  $$create policy "Follows are viewable by everyone" on public.follows for select using (true)$$);

select pg_temp.create_policy_if_missing('public', 'follows', 'Authenticated users can follow',
  $$create policy "Authenticated users can follow" on public.follows for insert with check (auth.role() = 'authenticated' and auth.uid() = follower_id)$$);

select pg_temp.create_policy_if_missing('public', 'follows', 'Users can unfollow',
  $$create policy "Users can unfollow" on public.follows for delete using (auth.uid() = follower_id)$$);

-- ---- badges ----
select pg_temp.create_policy_if_missing('public', 'badges', 'Badges are viewable by everyone',
  $$create policy "Badges are viewable by everyone" on public.badges for select using (true)$$);

-- ---- user_badges ----
select pg_temp.create_policy_if_missing('public', 'user_badges', 'User badges are viewable by everyone',
  $$create policy "User badges are viewable by everyone" on public.user_badges for select using (true)$$);

-- ---- profile_featured_posts ----
select pg_temp.create_policy_if_missing('public', 'profile_featured_posts', 'Featured profile work is viewable by everyone',
  $$create policy "Featured profile work is viewable by everyone" on public.profile_featured_posts for select using (true)$$);

select pg_temp.create_policy_if_missing('public', 'profile_featured_posts', 'Users can feature their eligible published work',
  $$create policy "Users can feature their eligible published work" on public.profile_featured_posts for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.posts
      where posts.id = profile_featured_posts.post_id
        and posts.status = 'published'
        and (
          posts.author_id = profile_featured_posts.user_id
          or exists (
            select 1 from public.post_authors
            where post_authors.post_id = profile_featured_posts.post_id
              and post_authors.user_id = profile_featured_posts.user_id
              and post_authors.accepted_at is not null
          )
        )
    )
  )$$);

select pg_temp.create_policy_if_missing('public', 'profile_featured_posts', 'Users can update their featured profile work',
  $$create policy "Users can update their featured profile work" on public.profile_featured_posts for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.posts
      where posts.id = profile_featured_posts.post_id
        and posts.status = 'published'
        and (
          posts.author_id = profile_featured_posts.user_id
          or exists (
            select 1 from public.post_authors
            where post_authors.post_id = profile_featured_posts.post_id
              and post_authors.user_id = profile_featured_posts.user_id
              and post_authors.accepted_at is not null
          )
        )
    )
  )$$);

select pg_temp.create_policy_if_missing('public', 'profile_featured_posts', 'Users can remove their featured profile work',
  $$create policy "Users can remove their featured profile work" on public.profile_featured_posts for delete using (auth.uid() = user_id)$$);

-- ============================================================
-- SEED: default badges
-- ============================================================

insert into public.badges (name, description, icon)
select 'First Post', 'Published your first piece', '✍️'
where not exists (select 1 from public.badges where name = 'First Post');

insert into public.badges (name, description, icon)
select 'Researcher', 'Published a research paper', '🔬'
where not exists (select 1 from public.badges where name = 'Researcher');

insert into public.badges (name, description, icon)
select 'Policy Maker', 'Published a policy brief', '📋'
where not exists (select 1 from public.badges where name = 'Policy Maker');

insert into public.badges (name, description, icon)
select 'Essayist', 'Published an essay', '📝'
where not exists (select 1 from public.badges where name = 'Essayist');

insert into public.badges (name, description, icon)
select 'Thought Leader', 'Received 50+ likes', '💡'
where not exists (select 1 from public.badges where name = 'Thought Leader');

insert into public.badges (name, description, icon)
select 'Community Builder', 'Gained 10+ followers', '🌍'
where not exists (select 1 from public.badges where name = 'Community Builder');
