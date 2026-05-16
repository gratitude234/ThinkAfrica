create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  action text not null,
  target_table text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_events_created_at_idx
  on public.admin_audit_events(created_at desc);

create index if not exists admin_audit_events_actor_idx
  on public.admin_audit_events(actor_id, created_at desc)
  where actor_id is not null;

alter table public.admin_audit_events enable row level security;

drop policy if exists "Admins can read audit events" on public.admin_audit_events;
create policy "Admins can read audit events"
  on public.admin_audit_events for select
  using (public.is_admin());

drop policy if exists "Admins can insert audit events" on public.admin_audit_events;
create policy "Admins can insert audit events"
  on public.admin_audit_events for insert
  with check (public.is_admin());
