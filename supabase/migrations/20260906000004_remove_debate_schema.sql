-- Remove the Debate subsystem from the database.
--
-- ============================================================================
-- DESTRUCTIVE. READ THIS BEFORE APPLYING.
-- ============================================================================
--
-- This file drops 17 tables and every row in them. There is no undo. Take a
-- backup of the Debate tables first; section 0 below is the export.
--
-- Deliberately NOT dropped, because each is shared with a live feature:
--
--   profiles.notification_prefs          keeps its shape; only the three
--                                        Debate keys are stripped from the
--                                        JSONB and from the write allowlist
--   notifications                        the table stays; only Debate rows go
--   campus program formats               'debate_night' is a Campus offline
--                                        event, not this subsystem, and is
--                                        left exactly as it is
--   find_or_create_conversation          redefined, not dropped: messaging
--                                        keeps its other three eligibility
--                                        paths
--   profile_record_entries               redefined without its Debate branch
--   get_public_profile_record_summary    redefined without debate_count
--   get_public_credibility_summary       redefined without the two Debate
--                                        counts
--
-- Order matters. Everything that reads a Debate table is redefined first, so
-- no shared object is ever left pointing at a table that has been dropped.

-- ============================================================================
-- 0. BACKUP FIRST. Run these from psql, not from the SQL editor, and keep the
--    output somewhere durable. Nothing below can be recovered without it.
-- ============================================================================
--
--   \copy (select * from public.debates)                 to 'debates.csv' csv header
--   \copy (select * from public.debate_arguments)        to 'debate_arguments.csv' csv header
--   \copy (select * from public.debate_participants)     to 'debate_participants.csv' csv header
--   \copy (select * from public.debate_motion_votes)     to 'debate_motion_votes.csv' csv header
--   \copy (select * from public.debate_votes)            to 'debate_votes.csv' csv header
--   \copy (select * from public.debate_memberships)      to 'debate_memberships.csv' csv header
--   \copy (select * from public.debate_rounds)           to 'debate_rounds.csv' csv header
--   \copy (select * from public.debate_argument_sources) to 'debate_argument_sources.csv' csv header
--   \copy (select * from public.debate_reactions)        to 'debate_reactions.csv' csv header
--   \copy (select * from public.debate_ballots)          to 'debate_ballots.csv' csv header
--   \copy (select * from public.debate_subscriptions)    to 'debate_subscriptions.csv' csv header
--   \copy (select * from public.debate_moderation_events) to 'debate_moderation_events.csv' csv header
--   \copy (select * from public.debate_cross_exchanges)  to 'debate_cross_exchanges.csv' csv header
--   \copy (select * from public.debate_notification_events) to 'debate_notification_events.csv' csv header
--   \copy (select * from public.debate_slots_v1_5)       to 'debate_slots_v1_5.csv' csv header
--   \copy (select * from public.debate_argument_sources_v1) to 'debate_argument_sources_v1.csv' csv header
--   \copy (select * from public.debate_v1_5_reminders)   to 'debate_v1_5_reminders.csv' csv header
--   \copy (select * from public.notifications where type like 'debate%') to 'debate_notifications.csv' csv header
--
-- To see what you are about to lose, before you commit to it:
--
--   select 'debates' as t, count(*) from public.debates
--   union all select 'debate_arguments', count(*) from public.debate_arguments
--   union all select 'debate_participants', count(*) from public.debate_participants
--   union all select 'debate_ballots', count(*) from public.debate_ballots
--   union all select 'notifications (debate)', count(*)
--     from public.notifications where type like 'debate%';

begin;

-- ============================================================================
-- 1. Messaging. find_or_create_conversation had four eligibility paths and one
--    of them was "you both argued in the same debate". That path goes; the
--    other three stay exactly as they were.
--
--    This is a real behaviour change: a pair whose ONLY shared ground was a
--    debate can no longer open a new conversation. Conversations that already
--    exist are untouched and stay readable and writable, because the check
--    runs only when a conversation is created.
-- ============================================================================
create or replace function public.find_or_create_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  pair_key text;
  conversation_id uuid;
  is_eligible boolean := false;
  current_verified boolean := false;
begin
  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_user_id is null or current_user_id = target_user_id then
    raise exception 'Invalid conversation target.';
  end if;

  select verified into current_verified
  from public.profiles
  where id = current_user_id;

  if not current_verified then
    raise exception 'Account verification required to send messages.';
  end if;

  select exists (
    select 1
    from public.follows mine
    join public.follows theirs
      on theirs.follower_id = target_user_id
     and theirs.following_id = current_user_id
    where mine.follower_id = current_user_id
      and mine.following_id = target_user_id
  )
  into is_eligible;

  if not is_eligible then
    select exists (
      select 1
      from public.profiles mine
      join public.profiles theirs
        on theirs.id = target_user_id
       and theirs.university is not null
       and theirs.university = mine.university
      where mine.id = current_user_id
        and mine.university is not null
    )
    into is_eligible;
  end if;

  if not is_eligible then
    select exists (
      select 1
      from public.talent_profiles
      where user_id = target_user_id
        and open_to_opportunities = true
        and visibility = 'public'
    )
    into is_eligible;
  end if;

  if not is_eligible then
    raise exception 'Conversation not allowed.';
  end if;

  pair_key := least(current_user_id::text, target_user_id::text)
    || ':'
    || greatest(current_user_id::text, target_user_id::text);

  insert into public.conversations (participant_pair)
  values (pair_key)
  on conflict (participant_pair)
  do update set participant_pair = excluded.participant_pair
  returning id into conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (conversation_id, current_user_id),
    (conversation_id, target_user_id)
  on conflict (conversation_id, user_id) do nothing;

  return conversation_id;
end;
$$;

-- ============================================================================
-- 2. The public record index. The view was a UNION of published authorship and
--    every debate argument; the third branch goes and the first two are
--    carried over character for character. create or replace rather than drop
--    and create: the column list is unchanged, so this keeps the view's grants
--    and cannot leave a window where it does not exist.
--
--    security_barrier travels with security_invoker here. Dropping it would
--    let a cheap leakproof-looking predicate be pushed below the RLS checks
--    on posts, which is exactly what this view exists to prevent.
-- ============================================================================
create or replace view public.profile_record_entries
with (security_invoker = true, security_barrier = true)
as
with published_authorship as (
  select
    post.author_id as profile_id,
    post.id as entry_id,
    post.in_response_to,
    post.type,
    post.content_kind,
    coalesce(post.published_at, post.created_at) as occurred_at,
    false as is_coauthor,
    post.citation_id
  from public.posts as post
  where post.status = 'published'

  union all

  select
    author.user_id as profile_id,
    post.id as entry_id,
    post.in_response_to,
    post.type,
    post.content_kind,
    coalesce(post.published_at, post.created_at) as occurred_at,
    true as is_coauthor,
    post.citation_id
  from public.post_authors as author
  join public.posts as post on post.id = author.post_id
  where author.accepted_at is not null
    and author.user_id <> post.author_id
    and post.status = 'published'
)
select
  authorship.profile_id,
  authorship.entry_id,
  case
    when authorship.in_response_to is not null then 'response'
    when public.effective_content_kind(
      authorship.type,
      authorship.content_kind
    ) = 'research' then 'research'
    else 'publication'
  end::text as entry_kind,
  authorship.occurred_at,
  authorship.is_coauthor,
  coalesce(reference_count.reference_count, 0) > 0 as source_backed,
  authorship.citation_id is not null as citable
from published_authorship as authorship
left join public.post_reference_counts as reference_count
  on reference_count.post_id = authorship.entry_id;

revoke all on table public.profile_record_entries
  from public, anon, authenticated;
grant select on table public.profile_record_entries
  to anon, authenticated, service_role;

comment on view public.profile_record_entries is
  'RLS-aware index of public intellectual work. Carries identifiers and evidence flags only; content is loaded from its protected source table.';

-- ============================================================================
-- 3. The record summary. debate_count leaves the returned table, so this needs
--    a drop rather than a replace: create or replace cannot narrow a set
--    returning function's signature.
-- ============================================================================
drop function if exists public.get_public_profile_record_summary(uuid, boolean);

create function public.get_public_profile_record_summary(
  p_profile_id uuid,
  p_include_research boolean default false
)
returns table (
  publication_count bigint,
  source_backed_count bigint,
  citable_count bigint,
  response_count bigint,
  research_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with visible_entry as (
    select entry.entry_kind, entry.source_backed, entry.citable
    from public.profile_record_entries as entry
    where entry.profile_id = p_profile_id
      and (p_include_research or entry.entry_kind <> 'research')
  )
  select
    count(*) filter (
      where entry_kind in ('publication', 'research')
    ) as publication_count,
    count(*) filter (
      where entry_kind in ('publication', 'research') and source_backed
    ) as source_backed_count,
    count(*) filter (
      where entry_kind in ('publication', 'research') and citable
    ) as citable_count,
    count(*) filter (where entry_kind = 'response') as response_count,
    count(*) filter (where entry_kind = 'research') as research_count
  from visible_entry;
$$;

revoke all on function public.get_public_profile_record_summary(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.get_public_profile_record_summary(uuid, boolean)
  to anon, authenticated, service_role;

-- ============================================================================
-- 4. The credibility summary loses debate_contribution_count and
--    completed_debate_count. Everything else it reports is unchanged.
-- ============================================================================
-- Every CTE, predicate and cast below is carried over unchanged from
-- 20260827000001. Only the debate_activity CTE and the two columns it fed are
-- gone, so the seven counts that remain are computed exactly as before.
drop function if exists public.get_public_credibility_summary(uuid);

create function public.get_public_credibility_summary(
  p_profile_id uuid
)
returns table (
  inbound_citation_count integer,
  self_citation_count integer,
  citing_work_count integer,
  peer_reviewed_count integer,
  editorially_reviewed_count integer,
  accepted_collaboration_count integer,
  distinct_collaborator_count integer
)
language sql
stable
security invoker
set search_path = pg_catalog, public
rows 1
as $$
  WITH citations AS (
    SELECT *
    FROM public.public_citation_edges AS edge
    WHERE edge.cited_profile_id = p_profile_id
  ),
  owned_posts AS (
    SELECT post.id
    FROM public.posts AS post
    WHERE post.status = 'published'
      AND (
        post.author_id = p_profile_id
        OR EXISTS (
          SELECT 1
          FROM public.post_authors AS author
          WHERE author.post_id = post.id
            AND author.user_id = p_profile_id
            AND author.accepted_at IS NOT NULL
        )
      )
  ),
  reviews AS (
    SELECT signal.review_kind
    FROM public.public_review_signals AS signal
    JOIN owned_posts ON owned_posts.id = signal.post_id
  ),
  collaborations AS (
    SELECT DISTINCT post.id AS post_id, collaborator.user_id
    FROM public.posts AS post
    JOIN public.post_authors AS collaborator ON collaborator.post_id = post.id
    WHERE post.status = 'published'
      AND collaborator.accepted_at IS NOT NULL
      AND collaborator.user_id <> p_profile_id
      AND (
        post.author_id = p_profile_id
        OR EXISTS (
          SELECT 1
          FROM public.post_authors AS mine
          WHERE mine.post_id = post.id
            AND mine.user_id = p_profile_id
            AND mine.accepted_at IS NOT NULL
        )
      )
      -- A blocked person is not shown as a collaborator in either direction.
      AND NOT public.is_blocked_pair(p_profile_id, collaborator.user_id)
  )
  SELECT
    (SELECT count(*) FROM citations WHERE NOT is_self_citation)::integer,
    (SELECT count(*) FROM citations WHERE is_self_citation)::integer,
    (SELECT count(DISTINCT citing_post_id) FROM citations WHERE NOT is_self_citation)::integer,
    (SELECT count(*) FROM reviews WHERE review_kind = 'peer_reviewed')::integer,
    (SELECT count(*) FROM reviews WHERE review_kind = 'editorially_reviewed')::integer,
    (SELECT count(DISTINCT post_id) FROM collaborations)::integer,
    (SELECT count(DISTINCT user_id) FROM collaborations)::integer;
$$;

revoke all on function public.get_public_credibility_summary(uuid) from public;
grant execute on function public.get_public_credibility_summary(uuid)
  to anon, authenticated, service_role;

comment on function public.get_public_credibility_summary(uuid) is
  'Bounded public credibility aggregates for one profile. Headline citation count excludes self-citations. Collaborations require accepted authorship and respect blocks.';

-- ============================================================================
-- 5. Notification preferences. notification_prefs is JSONB on profiles, so
--    there is no column to drop: the three Debate keys are removed from every
--    row and from the write allowlist. A key left in the JSONB would be
--    unreadable by the application but still flippable by the RPC.
-- ============================================================================
update public.profiles
   set notification_prefs = notification_prefs
     - 'inapp_debates'
     - 'email_debate_updates'
     - 'push_debate_updates'
 where notification_prefs ?| array[
   'inapp_debates',
   'email_debate_updates',
   'push_debate_updates'
 ];

create or replace function public.set_notification_preference(
  p_key text,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_preferences jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_key not in (
    'inapp_likes', 'inapp_comments', 'inapp_follows',
    'inapp_collaboration',
    'email_comments', 'email_follows', 'email_likes', 'email_responses',
    'email_messages', 'email_published', 'email_digest',
    'email_account_security', 'email_profile_reminders',
    'email_announcements',
    'email_review_assigned', 'email_review_started', 'email_review_reminder',
    'email_co_author_invite', 'email_co_author_accepted',
    'email_co_author_declined', 'email_opportunity_inquiry',
    'email_author_publications', 'push_published',
    'push_messages', 'push_comments', 'push_likes', 'push_follows',
    'push_daily_brief', 'push_author_publications'
  ) then
    raise exception 'Unsupported notification preference';
  end if;

  update public.profiles
  set notification_prefs = jsonb_set(
    coalesce(notification_prefs, '{}'::jsonb),
    array[p_key],
    to_jsonb(p_enabled),
    true
  )
  where id = v_user_id
  returning notification_prefs into v_preferences;

  return v_preferences;
end;
$$;

revoke all on function public.set_notification_preference(text, boolean)
  from public, anon;
grant execute on function public.set_notification_preference(text, boolean)
  to authenticated;

-- ============================================================================
-- 6. Historical Debate notifications.
--
--    DESTRUCTIVE. Every one of these links to a /debates/... URL that now 404s
--    and renders as a generic "New notification", so they are dead inbox rows.
--    They are deleted before the type constraint is tightened, because the
--    constraint cannot be added while rows violate it.
-- ============================================================================
delete from public.notifications
 where type like 'debate%';

-- Narrows notifications_type_check by reading the live definition rather than
-- restating a list this migration cannot know is current, the same way
-- 20260827000002 extended it. Removing a type this way cannot silently drop an
-- unrelated one.
do $$
declare
  v_definition text;
  v_values text[];
  v_all text;
begin
  select pg_get_constraintdef(con.oid)
  into v_definition
  from pg_constraint as con
  join pg_class as rel on rel.oid = con.conrelid
  join pg_namespace as nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'notifications'
    and con.conname = 'notifications_type_check';

  if v_definition is null then
    raise exception 'notifications_type_check not found; cannot narrow it safely.';
  end if;

  select array_agg(distinct match[1])
  into v_values
  from regexp_matches(v_definition, '''([a-z0-9_]+)''::text', 'g') as match;

  if v_values is null or array_length(v_values, 1) < 5 then
    raise exception 'Could not parse notifications_type_check values from: %', v_definition;
  end if;

  select string_agg(quote_literal(value), ', ' order by value)
  into v_all
  from (
    select unnest(v_values) as value
  ) as parsed
  where value not like 'debate%';

  execute 'alter table public.notifications drop constraint notifications_type_check';
  execute format(
    'alter table public.notifications add constraint notifications_type_check check (type = any (array[%s]))',
    v_all
  );
end $$;

-- ============================================================================
-- 7. Realtime. Dropping a table does not remove it from a publication that
--    still lists it by name in some deployments, so these come off first.
-- ============================================================================
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'debates', 'debate_arguments', 'debate_rounds', 'debate_memberships',
    'debate_reactions', 'debate_cross_exchanges', 'debate_motion_votes',
    'debate_participants', 'debate_ballots', 'debate_subscriptions'
  ]
  loop
    if exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = v_table
    ) then
      execute format(
        'alter publication supabase_realtime drop table public.%I',
        v_table
      );
    end if;
  end loop;
end $$;

-- ============================================================================
-- 8. The Debate functions. Dropped by signature discovered from the catalogue,
--    because these were defined across eight migrations with overloads and a
--    hand-written list would miss one. Only functions that are Debate-specific
--    by name are matched, and the shared functions redefined above are named
--    nothing like them.
--
--    Trigger functions go with them; the triggers themselves fall with their
--    tables in section 9, so this runs after nothing else depends on them.
-- ============================================================================
do $$
declare
  v_function record;
begin
  for v_function in
    select
      proc.oid::regprocedure as signature
    from pg_proc as proc
    join pg_namespace as nsp on nsp.oid = proc.pronamespace
    where nsp.nspname = 'public'
      and (
        proc.proname like 'debate%'
        or proc.proname like '%_debate'
        or proc.proname like '%_debate\_%'
        or proc.proname like '%_debate%_v%'
        or proc.proname in (
          'activate_debate_v2',
          'advance_debate_phase',
          'advance_debate_phase_v1_5',
          'advance_debate_round_v2',
          'advance_due_debate_rounds_v2',
          'advance_or_close_debate_round_v2',
          'can_manage_debate_v1_5',
          'can_manage_debate_v2',
          'cancel_debate_v1_5',
          'cast_debate_ballot_v2',
          'close_debate',
          'close_debate_v2',
          'complete_debate_v1_5',
          'create_debate_v1_5',
          'emit_debate_notification_event_v2',
          'ensure_debate_subscription_default_v2',
          'extend_debate_round_v2',
          'get_debate_ballot_results_v2',
          'get_debate_room_signal_v2',
          'guard_debate_v1_5_protected_fields',
          'invite_debater_v1_5',
          'join_debate',
          'join_debate_v2',
          'log_debate_moderation_event',
          'notify_debate_reply',
          'prevent_debate_id_change',
          'process_debate_notification_events_v2',
          'remind_debate_voters_v1_5',
          'respond_to_debate_invitation_v1_5',
          'revoke_debate_invitation_v1_5',
          'set_debate_subscription_v2',
          'start_debate',
          'start_debate_round_one_v2',
          'start_debate_v1_5',
          'start_debate_v2',
          'submit_debate_argument_v1_5',
          'submit_debate_argument_v2',
          'sync_debate_moderator_membership',
          'sync_debate_participant_membership',
          'toggle_debate_reaction_v2',
          'toggle_debate_vote'
        )
      )
  loop
    execute format('drop function if exists %s cascade', v_function.signature);
  end loop;
end $$;

-- ============================================================================
-- 9. The tables. cascade takes their indexes, triggers, RLS policies, foreign
--    keys and grants with them. Ordered children first so the cascades stay
--    small and readable in the log, though the order is not load bearing.
-- ============================================================================
drop table if exists public.debate_v1_5_reminders cascade;
drop table if exists public.debate_argument_sources_v1 cascade;
drop table if exists public.debate_slots_v1_5 cascade;
drop table if exists public.debate_notification_events cascade;
drop table if exists public.debate_cross_exchanges cascade;
drop table if exists public.debate_moderation_events cascade;
drop table if exists public.debate_subscriptions cascade;
drop table if exists public.debate_ballots cascade;
drop table if exists public.debate_reactions cascade;
drop table if exists public.debate_argument_sources cascade;
drop table if exists public.debate_rounds cascade;
drop table if exists public.debate_memberships cascade;
drop table if exists public.debate_motion_votes cascade;
drop table if exists public.debate_participants cascade;
drop table if exists public.debate_votes cascade;
drop table if exists public.debate_arguments cascade;
drop table if exists public.debates cascade;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- Post-apply verification. Run all of it, on staging first.
-- ============================================================================
--
-- Nothing Debate-shaped is left in the schema:
--   select table_name from information_schema.tables
--    where table_schema = 'public' and table_name like '%debate%';
--   select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and proname like '%debate%';
--   -- both must return zero rows
--
-- The shared objects still answer:
--   select * from public.get_public_profile_record_summary('<a real uuid>', false);
--   select * from public.get_public_credibility_summary('<a real uuid>');
--   select count(*) from public.profile_record_entries;
--
-- Messaging still gates correctly:
--   a mutual follow            -> conversation opens
--   same university            -> conversation opens
--   public open-to-work talent -> conversation opens
--   none of the above          -> 'Conversation not allowed.'
--   an existing conversation   -> still readable and writable
--
-- Notification preferences round-trip:
--   select public.set_notification_preference('inapp_likes', false);   -- ok
--   select public.set_notification_preference('inapp_debates', false); -- must raise
--
-- And the application:
--   load /, /explore, /<username>, /post/<slug>, /login, /signup and confirm
--   the Supabase logs show no request whose path contains 'debates'
