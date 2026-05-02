-- ============================================================
-- ThinkAfrica Phase 3 Database Schema
-- Run this in the Supabase SQL Editor after schema_phase2.sql
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.webinars (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  host_id uuid references public.profiles(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended')),
  scheduled_at timestamptz not null,
  ended_at timestamptz,
  tags text[] default '{}',
  attendee_count int not null default 0,
  recording_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.webinar_attendees (
  user_id uuid not null references public.profiles(id) on delete cascade,
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  registered_at timestamptz not null default now(),
  attended boolean not null default false,
  primary key (user_id, webinar_id)
);

create table if not exists public.webinar_questions (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  upvotes int not null default 0,
  answered boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.campus_ambassadors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  university text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'inactive')),
  referral_count int not null default 0,
  joined_at timestamptz not null default now()
);

create table if not exists public.policy_briefs_featured (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  featured_by uuid references public.profiles(id) on delete set null,
  institution_target text,
  featured_at timestamptz not null default now()
);

-- ============================================================
-- PROFILE COLUMNS
-- ============================================================

alter table public.profiles add column if not exists interests text[] default '{}';
alter table public.profiles add column if not exists onboarding_completed boolean not null default false;

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists webinars_status_idx on public.webinars(status);
create index if not exists webinars_scheduled_at_idx on public.webinars(scheduled_at desc);
create index if not exists webinar_attendees_webinar_id_idx on public.webinar_attendees(webinar_id);
create index if not exists webinar_questions_webinar_id_idx on public.webinar_questions(webinar_id);
create index if not exists webinar_questions_upvotes_idx on public.webinar_questions(upvotes desc);
create index if not exists campus_ambassadors_status_idx on public.campus_ambassadors(status);
create index if not exists policy_briefs_featured_post_id_idx on public.policy_briefs_featured(post_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.webinars enable row level security;
alter table public.webinar_attendees enable row level security;
alter table public.webinar_questions enable row level security;
alter table public.campus_ambassadors enable row level security;
alter table public.policy_briefs_featured enable row level security;

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

-- webinars
select pg_temp.create_policy_if_missing('public', 'webinars', 'Webinars are viewable by everyone',
  $$create policy "Webinars are viewable by everyone" on public.webinars for select using (true)$$);

select pg_temp.create_policy_if_missing('public', 'webinars', 'Authenticated users can create webinars',
  $$create policy "Authenticated users can create webinars" on public.webinars for insert with check (auth.role() = 'authenticated' and auth.uid() = host_id)$$);

select pg_temp.create_policy_if_missing('public', 'webinars', 'Hosts can update their webinars',
  $$create policy "Hosts can update their webinars" on public.webinars for update using (auth.uid() = host_id)$$);

-- webinar_attendees
select pg_temp.create_policy_if_missing('public', 'webinar_attendees', 'Webinar attendees are viewable by everyone',
  $$create policy "Webinar attendees are viewable by everyone" on public.webinar_attendees for select using (true)$$);

select pg_temp.create_policy_if_missing('public', 'webinar_attendees', 'Authenticated users can register for webinars',
  $$create policy "Authenticated users can register for webinars" on public.webinar_attendees for insert with check (auth.role() = 'authenticated' and auth.uid() = user_id)$$);

select pg_temp.create_policy_if_missing('public', 'webinar_attendees', 'Users can unregister themselves',
  $$create policy "Users can unregister themselves" on public.webinar_attendees for delete using (auth.uid() = user_id)$$);

-- webinar_questions
select pg_temp.create_policy_if_missing('public', 'webinar_questions', 'Webinar questions are viewable by everyone',
  $$create policy "Webinar questions are viewable by everyone" on public.webinar_questions for select using (true)$$);

select pg_temp.create_policy_if_missing('public', 'webinar_questions', 'Authenticated users can submit questions',
  $$create policy "Authenticated users can submit questions" on public.webinar_questions for insert with check (auth.role() = 'authenticated' and auth.uid() = author_id)$$);

select pg_temp.create_policy_if_missing('public', 'webinar_questions', 'Webinar hosts can update questions (mark answered)',
  $$create policy "Webinar hosts can update questions (mark answered)" on public.webinar_questions for update using (exists (select 1 from public.webinars where id = webinar_id and host_id = auth.uid()))$$);

-- campus_ambassadors
select pg_temp.create_policy_if_missing('public', 'campus_ambassadors', 'Active ambassadors are viewable by everyone',
  $$create policy "Active ambassadors are viewable by everyone" on public.campus_ambassadors for select using (status = 'active' or auth.uid() = user_id)$$);

select pg_temp.create_policy_if_missing('public', 'campus_ambassadors', 'Authenticated users can apply to become ambassador',
  $$create policy "Authenticated users can apply to become ambassador" on public.campus_ambassadors for insert with check (auth.role() = 'authenticated' and auth.uid() = user_id)$$);

select pg_temp.create_policy_if_missing('public', 'campus_ambassadors', 'Admins can update ambassador status',
  $$create policy "Admins can update ambassador status" on public.campus_ambassadors for update using (public.is_admin()) with check (public.is_admin())$$);

-- policy_briefs_featured
select pg_temp.create_policy_if_missing('public', 'policy_briefs_featured', 'Featured policy briefs are viewable by everyone',
  $$create policy "Featured policy briefs are viewable by everyone" on public.policy_briefs_featured for select using (true)$$);

select pg_temp.create_policy_if_missing('public', 'policy_briefs_featured', 'Admins can feature policy briefs',
  $$create policy "Admins can feature policy briefs" on public.policy_briefs_featured for insert with check (public.is_admin())$$);

-- ============================================================
-- RPC: toggle webinar question upvote
-- ============================================================

create or replace function public.toggle_question_upvote(p_question_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  -- Simple increment for now (can be extended with a votes table)
  update public.webinar_questions
  set upvotes = upvotes + 1
  where id = p_question_id;

  return json_build_object('success', true);
end;
$$;

-- ============================================================
-- REALTIME: enable live subscriptions
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'webinar_questions'
  ) then
    alter publication supabase_realtime add table public.webinar_questions;
  end if;
end $$;
