-- AI-Assisted Topic Selection V1 release candidate.
-- Pending only: do not copy to supabase/migrations or apply until the Debate
-- deployment ledger has been reconciled.

alter table public.posts
  add column if not exists research_keywords text[];

alter table public.posts
  drop constraint if exists posts_research_keywords_limit_check;
alter table public.posts
  add constraint posts_research_keywords_limit_check
  check (
    research_keywords is null
    or cardinality(research_keywords) <= 10
  );

-- Existing Research tags are deliberately not rewritten. Published records
-- cannot be split safely. NULL identifies an untouched legacy row; editable
-- legacy drafts are separated on first save and then write an array (including
-- an empty array) so later loads no longer need to guess.

create table if not exists public.ai_topic_suggestion_quotas (
  user_id uuid not null references public.profiles(id) on delete cascade,
  quota_date date not null,
  request_count smallint not null default 0
    check (request_count between 0 and 20),
  updated_at timestamptz not null default now(),
  primary key (user_id, quota_date)
);

alter table public.ai_topic_suggestion_quotas enable row level security;
revoke all on public.ai_topic_suggestion_quotas from public, anon, authenticated;
grant all on public.ai_topic_suggestion_quotas to service_role;

create or replace function public.claim_ai_topic_suggestion_quota()
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'UTC')::date;
  v_count integer;
  v_reset_at timestamptz :=
    ((now() at time zone 'UTC')::date + 1)::timestamp at time zone 'UTC';
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.ai_topic_suggestion_quotas (
    user_id,
    quota_date,
    request_count,
    updated_at
  )
  values (v_user_id, v_today, 1, now())
  on conflict (user_id, quota_date) do update
    set request_count =
          public.ai_topic_suggestion_quotas.request_count + 1,
        updated_at = now()
    where public.ai_topic_suggestion_quotas.request_count < 20
  returning request_count into v_count;

  if v_count is null then
    return query select false, 0, v_reset_at;
    return;
  end if;

  return query select true, greatest(20 - v_count, 0), v_reset_at;
end;
$$;

revoke all on function public.claim_ai_topic_suggestion_quota()
  from public, anon;
grant execute on function public.claim_ai_topic_suggestion_quota()
  to authenticated;

notify pgrst, 'reload schema';
