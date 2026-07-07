-- Rebrand: switch the citation ID prefix from 'TAK-' (ThinkAfrica) to
-- 'IND-' (Indegenius) for all citation IDs generated from now on.
--
-- This only changes the prefix used going forward. It does not touch the
-- `citation_sequences` counter table, so the per-year sequence numbering
-- continues uninterrupted (e.g. if TAK-2026-0002 was the last ID issued,
-- the next one is IND-2026-0003, not IND-2026-0001).
--
-- Existing citation_id values already issued (e.g. TAK-2026-0001) are
-- backfilled separately in 20260707000003_backfill_citation_id_prefix.sql
-- (review and run manually, not applied automatically).
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

  return 'IND-' || p_year || '-' || lpad(v_seq::text, 4, '0');
end;
$$;
