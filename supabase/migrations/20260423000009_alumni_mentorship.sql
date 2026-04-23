alter table public.profiles
  add column if not exists open_to_mentoring boolean not null default false;

create index if not exists profiles_mentoring_idx
  on public.profiles(open_to_mentoring, is_alumni)
  where open_to_mentoring = true and is_alumni = true;
