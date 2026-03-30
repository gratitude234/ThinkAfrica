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
  university text,
  field_of_study text,
  bio text,
  avatar_url text,
  points integer not null default 0,
  created_at timestamptz not null default now()
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
  created_at timestamptz not null default now(),
  published_at timestamptz
);

-- comments
create table if not exists public.comments (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
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

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists posts_author_id_idx on public.posts(author_id);
create index if not exists posts_status_idx on public.posts(status);
create index if not exists posts_slug_idx on public.posts(slug);
create index if not exists comments_post_id_idx on public.comments(post_id);
create index if not exists likes_post_id_idx on public.likes(post_id);

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

  insert into public.profiles (id, username, full_name, university)
  values (
    new.id,
    final_username,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'university', '')
  );

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

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.follows enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

-- ---- profiles ----
create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- ---- posts ----
create policy "Published posts are viewable by everyone"
  on public.posts for select
  using (status = 'published' or auth.uid() = author_id);

create policy "Authenticated users can insert posts"
  on public.posts for insert
  with check (auth.role() = 'authenticated' and auth.uid() = author_id);

create policy "Authors can update their own posts"
  on public.posts for update
  using (auth.uid() = author_id);

create policy "Authors can delete their own posts"
  on public.posts for delete
  using (auth.uid() = author_id);

-- ---- comments ----
create policy "Comments on published posts are viewable by everyone"
  on public.comments for select using (true);

create policy "Authenticated users can insert comments"
  on public.comments for insert
  with check (auth.role() = 'authenticated' and auth.uid() = author_id);

create policy "Authors can update their own comments"
  on public.comments for update
  using (auth.uid() = author_id);

create policy "Authors can delete their own comments"
  on public.comments for delete
  using (auth.uid() = author_id);

-- ---- likes ----
create policy "Likes are viewable by everyone"
  on public.likes for select using (true);

create policy "Authenticated users can like posts"
  on public.likes for insert
  with check (auth.role() = 'authenticated' and auth.uid() = user_id);

create policy "Users can remove their own likes"
  on public.likes for delete
  using (auth.uid() = user_id);

-- ---- follows ----
create policy "Follows are viewable by everyone"
  on public.follows for select using (true);

create policy "Authenticated users can follow"
  on public.follows for insert
  with check (auth.role() = 'authenticated' and auth.uid() = follower_id);

create policy "Users can unfollow"
  on public.follows for delete
  using (auth.uid() = follower_id);

-- ---- badges ----
create policy "Badges are viewable by everyone"
  on public.badges for select using (true);

-- ---- user_badges ----
create policy "User badges are viewable by everyone"
  on public.user_badges for select using (true);

-- ============================================================
-- SEED: default badges
-- ============================================================

insert into public.badges (name, description, icon) values
  ('First Post', 'Published your first piece', '✍️'),
  ('Researcher', 'Published a research paper', '🔬'),
  ('Policy Maker', 'Published a policy brief', '📋'),
  ('Essayist', 'Published an essay', '📝'),
  ('Thought Leader', 'Received 50+ likes', '💡'),
  ('Community Builder', 'Gained 10+ followers', '🌍')
on conflict do nothing;
