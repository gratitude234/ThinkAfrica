-- ============================================================
-- ThinkAfrica Phase 4 Database Schema
-- Run this in the Supabase SQL Editor after schema_phase3.sql
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.fellowships (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  sponsor_name text,
  sponsor_logo_url text,
  amount text,
  eligibility text,
  deadline timestamptz,
  application_url text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.fellowship_applications (
  id uuid primary key default gen_random_uuid(),
  fellowship_id uuid not null references public.fellowships(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  cover_letter text,
  status text not null default 'pending' check (status in ('pending', 'shortlisted', 'accepted', 'rejected')),
  applied_at timestamptz not null default now(),
  unique (fellowship_id, user_id)
);

create table if not exists public.institutional_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text check (type in ('university', 'ngo', 'government', 'thinktank', 'media')),
  country text,
  logo_url text,
  description text,
  website_url text,
  partnership_since timestamptz not null default now(),
  active boolean not null default true
);

create table if not exists public.talent_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  open_to_opportunities boolean not null default false,
  opportunity_types text[] default '{}',
  cv_url text,
  linkedin_url text,
  skills text[] default '{}',
  visibility text not null default 'public' check (visibility in ('public', 'partners_only', 'private')),
  updated_at timestamptz not null default now()
);

create table if not exists public.talent_inquiries (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_profiles(id) on delete cascade,
  organization_name text,
  contact_email text,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists public.sponsor_placements (
  id uuid primary key default gen_random_uuid(),
  sponsor_name text not null,
  placement_type text not null check (placement_type in ('fellowship', 'webinar', 'leaderboard', 'policy_hub')),
  content text,
  link_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization text not null,
  email text not null,
  message text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PROFILE COLUMNS
-- ============================================================

alter table public.profiles add column if not exists verified boolean not null default false;
alter table public.profiles add column if not exists verified_type text check (verified_type in ('student', 'researcher', 'faculty', 'institution'));

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists fellowships_status_idx on public.fellowships(status);
create index if not exists fellowships_deadline_idx on public.fellowships(deadline asc);
create index if not exists fellowship_applications_fellowship_id_idx on public.fellowship_applications(fellowship_id);
create index if not exists fellowship_applications_user_id_idx on public.fellowship_applications(user_id);
create index if not exists institutional_partners_active_idx on public.institutional_partners(active);
create index if not exists talent_profiles_visibility_idx on public.talent_profiles(visibility);
create index if not exists sponsor_placements_type_active_idx on public.sponsor_placements(placement_type, active);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.fellowships enable row level security;
alter table public.fellowship_applications enable row level security;
alter table public.institutional_partners enable row level security;
alter table public.talent_profiles enable row level security;
alter table public.talent_inquiries enable row level security;
alter table public.sponsor_placements enable row level security;
alter table public.contact_requests enable row level security;

-- fellowships
create policy "Fellowships are viewable by everyone"
  on public.fellowships for select using (true);

create policy "Admins can insert fellowships"
  on public.fellowships for insert
  with check (
    auth.role() = 'authenticated'
    and exists (select 1 from auth.users where id = auth.uid() and email = current_setting('app.admin_email', true))
  );

create policy "Admins can update fellowships"
  on public.fellowships for update
  using (
    exists (select 1 from auth.users where id = auth.uid() and email = current_setting('app.admin_email', true))
  );

-- fellowship_applications
create policy "Users can read their own applications"
  on public.fellowship_applications for select
  using (auth.uid() = user_id);

create policy "Admins can read all applications"
  on public.fellowship_applications for select
  using (
    exists (select 1 from auth.users where id = auth.uid() and email = current_setting('app.admin_email', true))
  );

create policy "Authenticated users can apply"
  on public.fellowship_applications for insert
  with check (auth.role() = 'authenticated' and auth.uid() = user_id);

create policy "Admins can update application status"
  on public.fellowship_applications for update
  using (
    exists (select 1 from auth.users where id = auth.uid() and email = current_setting('app.admin_email', true))
  );

-- institutional_partners
create policy "Partners are viewable by everyone"
  on public.institutional_partners for select using (true);

create policy "Admins can manage partners"
  on public.institutional_partners for all
  using (
    exists (select 1 from auth.users where id = auth.uid() and email = current_setting('app.admin_email', true))
  );

-- talent_profiles
create policy "Public talent profiles visible to all"
  on public.talent_profiles for select
  using (visibility = 'public' or auth.uid() = user_id);

create policy "partners_only visible to authenticated"
  on public.talent_profiles for select
  using (visibility = 'partners_only' and auth.role() = 'authenticated');

create policy "Users can manage their own talent profile"
  on public.talent_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- talent_inquiries
create policy "Anyone authenticated can send inquiries"
  on public.talent_inquiries for insert
  with check (auth.role() = 'authenticated');

create policy "Talent can read their own inquiries"
  on public.talent_inquiries for select
  using (
    exists (select 1 from public.talent_profiles where id = talent_id and user_id = auth.uid())
  );

-- sponsor_placements
create policy "Sponsor placements viewable by everyone"
  on public.sponsor_placements for select using (true);

create policy "Admins can manage sponsor placements"
  on public.sponsor_placements for all
  using (
    exists (select 1 from auth.users where id = auth.uid() and email = current_setting('app.admin_email', true))
  );

-- contact_requests
create policy "Anyone can submit contact requests"
  on public.contact_requests for insert with check (true);

create policy "Admins can read contact requests"
  on public.contact_requests for select
  using (
    exists (select 1 from auth.users where id = auth.uid() and email = current_setting('app.admin_email', true))
  );
