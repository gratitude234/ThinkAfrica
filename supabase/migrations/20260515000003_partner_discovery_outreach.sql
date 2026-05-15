alter table public.talent_inquiries
  add column if not exists timeline text,
  add column if not exists commitment text,
  add column if not exists fit_reason text;
