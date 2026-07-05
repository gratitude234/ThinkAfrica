-- Atomic, year-scoped citation ID generation.
--
-- Previously `generateCitationId` (lib/citationId.ts) computed the next
-- sequence number by counting existing citation_id rows in application
-- code, then formatting `TAK-{year}-{seq}`. That has two problems:
--   1. count-then-format is not atomic: two posts accepted close together
--      can read the same count and mint the same citation ID.
--   2. the count was never scoped to `year`, so the "-NNNN" suffix was a
--      running total across all time, not "the Nth publication of {year}".
--
-- This migration introduces a per-year counter table and a single atomic
-- upsert-and-increment function to replace both count() and the
-- application-level format string.

create table if not exists public.citation_sequences (
  year integer primary key,
  counter integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.citation_sequences enable row level security;

drop policy if exists "Admins can read citation sequences" on public.citation_sequences;
create policy "Admins can read citation sequences"
  on public.citation_sequences for select
  using (public.is_admin());

-- Backfill: seed each year's counter from the highest sequence number that
-- already appears in an existing citation_id, so the atomic function picks
-- up right after the last ID that was ever issued for that year instead of
-- restarting at 1 and colliding with real, already-cited work.
insert into public.citation_sequences (year, counter)
select
  year_part::integer,
  max(seq_part::integer)
from (
  select
    (regexp_match(citation_id, '^TAK-(\d{4})-(\d+)$'))[1] as year_part,
    (regexp_match(citation_id, '^TAK-(\d{4})-(\d+)$'))[2] as seq_part
  from public.posts
  where citation_id is not null
    and citation_id ~ '^TAK-\d{4}-\d+$'
) parsed
group by year_part
on conflict (year) do update
  set counter = greatest(public.citation_sequences.counter, excluded.counter);

-- Atomically returns the next `TAK-{year}-{NNNN}` citation ID for the given
-- year. A single INSERT ... ON CONFLICT DO UPDATE ... RETURNING is one
-- statement, so Postgres row-locks the (year) row for its duration -
-- concurrent callers serialize instead of reading the same stale counter.
create or replace function public.generate_citation_id(p_year integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq integer;
begin
  insert into public.citation_sequences (year, counter, updated_at)
  values (p_year, 1, now())
  on conflict (year) do update
    set counter = public.citation_sequences.counter + 1,
        updated_at = now()
  returning counter into v_seq;

  return 'TAK-' || p_year || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

revoke all on function public.generate_citation_id(integer) from public;
grant execute on function public.generate_citation_id(integer) to service_role;
