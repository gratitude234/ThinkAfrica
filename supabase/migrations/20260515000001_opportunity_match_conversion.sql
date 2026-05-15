alter table public.fellowship_applications
  add column if not exists proof_post_id uuid references public.posts(id) on delete set null;

create table if not exists public.saved_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fellowship_id uuid not null references public.fellowships(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, fellowship_id)
);

create index if not exists saved_opportunities_user_created_idx
  on public.saved_opportunities(user_id, created_at desc);

create index if not exists saved_opportunities_fellowship_idx
  on public.saved_opportunities(fellowship_id);

create index if not exists fellowship_applications_proof_post_idx
  on public.fellowship_applications(proof_post_id)
  where proof_post_id is not null;

alter table public.saved_opportunities enable row level security;

drop policy if exists "Users can read their saved opportunities" on public.saved_opportunities;
create policy "Users can read their saved opportunities"
  on public.saved_opportunities for select
  using (auth.uid() = user_id);

drop policy if exists "Users can save opportunities" on public.saved_opportunities;
create policy "Users can save opportunities"
  on public.saved_opportunities for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can unsave opportunities" on public.saved_opportunities;
create policy "Users can unsave opportunities"
  on public.saved_opportunities for delete
  using (auth.uid() = user_id);
