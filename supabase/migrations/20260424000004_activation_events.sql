create table if not exists public.activation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  source text,
  route text,
  created_at timestamptz not null default now()
);

create index if not exists activation_events_user_created_idx
  on public.activation_events(user_id, created_at desc);

create index if not exists activation_events_name_created_idx
  on public.activation_events(event_name, created_at desc);

alter table public.activation_events enable row level security;

drop policy if exists "Anyone can insert activation events" on public.activation_events;
create policy "Anyone can insert activation events"
  on public.activation_events for insert
  with check (true);

drop policy if exists "Users can read own activation events" on public.activation_events;
create policy "Users can read own activation events"
  on public.activation_events for select
  using (auth.uid() = user_id);
