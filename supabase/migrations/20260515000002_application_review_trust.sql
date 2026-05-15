alter table public.fellowship_applications
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create index if not exists fellowship_applications_reviewed_at_idx
  on public.fellowship_applications(reviewed_at desc)
  where reviewed_at is not null;
