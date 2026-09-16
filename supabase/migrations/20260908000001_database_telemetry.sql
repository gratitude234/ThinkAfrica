-- Persistent PostgreSQL telemetry, so the next degradation leaves evidence.
--
-- The outages so far have produced only symptoms: connection timeouts,
-- PostgREST schema-cache failures, REST 522s, Auth 504s, and Vercel functions
-- killed at 300 seconds. Every one of those is observed from outside the
-- database, after it had already stopped answering, which is the one moment
-- Postgres cannot be asked what happened. This migration writes a small,
-- durable record from inside, every five minutes, so the next incident can be
-- reconstructed instead of guessed at.
--
-- Everything lives in the `private` schema, which PostgREST does not expose and
-- which anon and authenticated have no usage on. The tables carry RLS with no
-- policies, so only a BYPASSRLS role (postgres, service_role) can read them.
-- This is the same containment private.cron_http_requests already uses.
--
-- Three rules this file follows, deliberately:
--
--   1. Nothing is assumed to exist. Optional statistics views and optional
--      columns (pg_stat_io, pg_stat_statements, the session_* counters,
--      pg_stat_activity.query_id) are resolved from the catalogue at capture
--      time and recorded as NULL when absent. A telemetry job that errors on a
--      missing column records nothing on the day it matters.
--   2. Nothing is reset. pg_stat_statements is created only if missing, and
--      `create extension if not exists` on an installed extension is a no-op,
--      so accumulated evidence survives this migration.
--   3. The job is bounded. It runs under an 8-second statement timeout and a
--      2-second lock timeout. If telemetry cannot finish quickly it gives up,
--      because the one thing worse than no diagnostics is diagnostics that
--      contribute to the outage they were installed to explain.

begin;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

-- ---------------------------------------------------------------------------
-- 1. pg_stat_statements
-- ---------------------------------------------------------------------------
-- Supabase preloads pg_stat_statements, so in practice this either already
-- exists or is created here. It is wrapped because the extension needs
-- shared_preload_libraries; on a database where that is not the case, creating
-- it raises, and everything else in this file must still install. Telemetry
-- then records health and connections and leaves the query columns empty.
--
-- `if not exists` never touches an installed extension, so nothing is reset and
-- no accumulated counter is lost.
do $$
begin
  create extension if not exists pg_stat_statements with schema extensions;
exception
  when others then
    raise notice
      'pg_stat_statements was not created (%). Query telemetry will record no rows until it is enabled.',
      sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Storage
-- ---------------------------------------------------------------------------

-- One row per capture. The cumulative counters (xact_*, blks_*, temp_*,
-- deadlocks, sessions_*) are stored raw, exactly as Postgres reports them, and
-- turned into deltas by private.db_health_deltas below. Storing raw keeps the
-- record honest across a stats reset: stats_reset sits beside them, so a delta
-- spanning one is discarded rather than reported as an enormous spike.
create table if not exists private.db_health_snapshots (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  database_name text not null,

  -- False means every count below understates reality: without membership of
  -- pg_read_all_stats, pg_stat_activity hides other roles' state and query, so
  -- the snapshot would quietly describe only this session. Recorded rather than
  -- assumed, because a wrong number is worse than a missing one.
  can_read_all_stats boolean,

  -- Connection pressure. max_connections travels with the counts because a
  -- count means nothing without the ceiling it is approaching.
  max_connections integer,
  superuser_reserved_connections integer,
  total_connections integer,
  total_backends_all_databases integer,
  active_connections integer,
  idle_connections integer,
  idle_in_transaction_connections integer,
  waiting_connections integer,
  lock_waiting_connections integer,

  -- Query timing in the instant the snapshot was taken.
  longest_active_query_ms bigint,
  longest_transaction_ms bigint,
  longest_wait_ms bigint,

  -- pg_stat_database, cumulative.
  numbackends integer,
  xact_commit bigint,
  xact_rollback bigint,
  blks_read bigint,
  blks_hit bigint,
  tup_returned bigint,
  tup_fetched bigint,
  temp_files bigint,
  temp_bytes bigint,
  deadlocks bigint,
  conflicts bigint,
  checksum_failures bigint,
  blk_read_time double precision,
  blk_write_time double precision,
  session_time double precision,
  active_time double precision,
  idle_in_transaction_time double precision,
  sessions bigint,
  sessions_abandoned bigint,
  sessions_fatal bigint,
  sessions_killed bigint,
  stats_reset timestamptz,

  -- pg_stat_io, aggregated. The whole view is thirty-odd rows per capture and
  -- most of it is noise, so only the totals that describe I/O pressure are kept.
  io_reads bigint,
  io_read_time double precision,
  io_writes bigint,
  io_write_time double precision,
  io_extends bigint,
  io_hits bigint,
  io_evictions bigint,
  io_fsyncs bigint,

  database_size_bytes bigint,

  -- pg_stat_statements bookkeeping, so a delta can tell the difference between
  -- "this query got slower" and "the view was reset".
  pgss_available boolean not null default false,
  pgss_stats_reset timestamptz,
  pgss_dealloc bigint,
  pgss_statements_tracked integer,

  -- Set when the query capture was skipped or cut short. The health row is
  -- written first and separately so it survives that.
  query_capture_error text,

  capture_duration_ms integer
);

comment on table private.db_health_snapshots is
  'One row every five minutes: connection pressure, wait state and the cumulative pg_stat_database counters. Private to BYPASSRLS roles.';

create index if not exists db_health_snapshots_captured_at_idx
  on private.db_health_snapshots (captured_at desc);

-- Aggregate counts only, never raw pg_stat_activity. A copy of every backend
-- every five minutes would be both noisy and a standing record of whatever
-- literals happened to be in flight.
create table if not exists private.db_connection_snapshots (
  id bigint generated always as identity primary key,
  run_id bigint not null
    references private.db_health_snapshots (id) on delete cascade,
  captured_at timestamptz not null,
  application_name text,
  usename text,
  state text,
  wait_event_type text,
  wait_event text,
  backend_count integer not null,
  max_query_age_ms bigint,
  max_xact_age_ms bigint
);

comment on table private.db_connection_snapshots is
  'pg_stat_activity aggregated by application_name, user, state and wait event. Answers "how many connections, who opened them, what were they doing".';

create index if not exists db_connection_snapshots_captured_at_idx
  on private.db_connection_snapshots (captured_at desc);

create index if not exists db_connection_snapshots_run_idx
  on private.db_connection_snapshots (run_id);

-- A very small list, deliberately: the few backends that were actually stuck.
-- Nothing shorter than the threshold is recorded, and the statement text is
-- truncated, because pg_stat_activity.query carries the literal values a
-- statement was called with and this is a durable table.
create table if not exists private.db_activity_snapshots (
  id bigint generated always as identity primary key,
  run_id bigint not null
    references private.db_health_snapshots (id) on delete cascade,
  captured_at timestamptz not null,
  pid integer,
  usename text,
  application_name text,
  state text,
  wait_event_type text,
  wait_event text,
  backend_start timestamptz,
  xact_start timestamptz,
  query_start timestamptz,
  query_age_ms bigint,
  xact_age_ms bigint,
  query_id bigint,
  query_excerpt text
);

comment on table private.db_activity_snapshots is
  'The few longest-running non-idle backends per capture, statement text truncated to 200 characters. Private to BYPASSRLS roles.';

create index if not exists db_activity_snapshots_captured_at_idx
  on private.db_activity_snapshots (captured_at desc);

create index if not exists db_activity_snapshots_run_idx
  on private.db_activity_snapshots (run_id);

-- The top problematic statements at each capture, never the whole view.
-- Counters are cumulative as pg_stat_statements reports them; stats_since and
-- minmax_stats_since travel with them so private.db_query_deltas can refuse to
-- subtract across a reset or an eviction.
create table if not exists private.db_query_snapshots (
  id bigint generated always as identity primary key,
  run_id bigint not null
    references private.db_health_snapshots (id) on delete cascade,
  captured_at timestamptz not null,
  queryid bigint,
  userid oid,
  dbid oid,
  toplevel boolean,
  -- Which of the four rankings selected this row, e.g. {temp,total_time}.
  capture_reasons text[] not null default '{}',
  calls bigint,
  total_exec_time double precision,
  mean_exec_time double precision,
  min_exec_time double precision,
  max_exec_time double precision,
  "rows" bigint,
  shared_blks_hit bigint,
  shared_blks_read bigint,
  shared_blks_dirtied bigint,
  shared_blks_written bigint,
  temp_blks_read bigint,
  temp_blks_written bigint,
  wal_records bigint,
  wal_bytes numeric,
  stats_since timestamptz,
  minmax_stats_since timestamptz,
  -- pg_stat_statements normalises literals to $1, $2 ..., so this is the shape
  -- of the statement rather than anybody's data. Truncated all the same.
  query_excerpt text
);

comment on table private.db_query_snapshots is
  'Top statements by total time, mean time, max time and temp usage at each capture. Cumulative counters; see private.db_query_deltas for what changed.';

create index if not exists db_query_snapshots_captured_at_idx
  on private.db_query_snapshots (captured_at desc);

create index if not exists db_query_snapshots_queryid_idx
  on private.db_query_snapshots (queryid, captured_at desc);

create index if not exists db_query_snapshots_run_idx
  on private.db_query_snapshots (run_id);

alter table private.db_health_snapshots enable row level security;
alter table private.db_health_snapshots force row level security;
alter table private.db_connection_snapshots enable row level security;
alter table private.db_connection_snapshots force row level security;
alter table private.db_activity_snapshots enable row level security;
alter table private.db_activity_snapshots force row level security;
alter table private.db_query_snapshots enable row level security;
alter table private.db_query_snapshots force row level security;

-- ---------------------------------------------------------------------------
-- 3. Catalogue helpers
-- ---------------------------------------------------------------------------

-- "Do not assume a column exists", made executable. Returns either the quoted
-- column name or a typed NULL literal, for composing a select list that works
-- against whichever Postgres and whichever pg_stat_statements version is
-- actually installed here.
create or replace function private.telemetry_column_expr(
  p_schema text,
  p_relation text,
  p_column text,
  p_type text
)
returns text
language sql
stable
security invoker
set search_path = ''
as $function$
  select case
    when exists (
      select 1
        from pg_catalog.pg_attribute as attributes
        join pg_catalog.pg_class as classes
          on classes.oid = attributes.attrelid
        join pg_catalog.pg_namespace as namespaces
          on namespaces.oid = classes.relnamespace
       where namespaces.nspname = p_schema
         and classes.relname = p_relation
         and attributes.attname = p_column
         and attributes.attnum > 0
         and not attributes.attisdropped
    )
    then pg_catalog.quote_ident(p_column)
    else 'null::' || p_type
  end;
$function$;

comment on function private.telemetry_column_expr(text, text, text, text) is
  'The column name if the relation has it, otherwise a typed NULL literal. Lets a capture run against a Postgres that lacks an optional statistics column.';

-- The schema pg_stat_statements was installed into, or NULL when it is not
-- installed at all. Supabase puts extensions in `extensions`; elsewhere it is
-- often `public`, so this is resolved rather than hardcoded.
create or replace function private.pgss_schema()
returns text
language sql
stable
security invoker
set search_path = ''
as $function$
  select namespaces.nspname::text
    from pg_catalog.pg_extension as extensions
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = extensions.extnamespace
   where extensions.extname = 'pg_stat_statements'
   limit 1;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Capture
-- ---------------------------------------------------------------------------

create or replace function private.capture_db_health_snapshot()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_run_id bigint;
  v_captured_at timestamptz := pg_catalog.clock_timestamp();
  v_pgss_schema text := private.pgss_schema();
  v_sql text;
  v_activity record;
  v_database record;
  v_io record;
  v_pgss record;
begin
  -- Connection pressure, read once. Backends of this database are what the
  -- application competes for; the all-databases count sits beside it because
  -- the pooler and Supabase's own services share the instance.
  select
    pg_catalog.count(*) filter (
      where activity.datname = pg_catalog.current_database()
    )::integer as total_connections,
    pg_catalog.count(*) filter (
      where activity.backend_type = 'client backend'
    )::integer as total_backends_all_databases,
    pg_catalog.count(*) filter (
      where activity.datname = pg_catalog.current_database()
        and activity.state = 'active'
    )::integer as active_connections,
    pg_catalog.count(*) filter (
      where activity.datname = pg_catalog.current_database()
        and activity.state = 'idle'
    )::integer as idle_connections,
    pg_catalog.count(*) filter (
      where activity.datname = pg_catalog.current_database()
        and activity.state like 'idle in transaction%'
    )::integer as idle_in_transaction_connections,
    pg_catalog.count(*) filter (
      where activity.datname = pg_catalog.current_database()
        and activity.state = 'active'
        and activity.wait_event_type is not null
    )::integer as waiting_connections,
    pg_catalog.count(*) filter (
      where activity.datname = pg_catalog.current_database()
        and activity.wait_event_type = 'Lock'
    )::integer as lock_waiting_connections,
    pg_catalog.max(
      case
        when activity.state = 'active' and activity.query_start is not null
        then (extract(epoch from v_captured_at - activity.query_start) * 1000)::bigint
      end
    ) as longest_active_query_ms,
    pg_catalog.max(
      case
        when activity.xact_start is not null
        then (extract(epoch from v_captured_at - activity.xact_start) * 1000)::bigint
      end
    ) as longest_transaction_ms,
    pg_catalog.max(
      case
        when activity.wait_event_type is not null
             and activity.state_change is not null
        then (extract(epoch from v_captured_at - activity.state_change) * 1000)::bigint
      end
    ) as longest_wait_ms
    into v_activity
    from pg_catalog.pg_stat_activity as activity
   where activity.pid <> pg_catalog.pg_backend_pid();

  -- pg_stat_database. Every optional counter goes through the catalogue check,
  -- so this same statement runs on a server that does not have them.
  v_sql := pg_catalog.format(
    $sql$
      select
        numbackends::integer as numbackends,
        xact_commit, xact_rollback, blks_read, blks_hit,
        tup_returned, tup_fetched,
        temp_files, temp_bytes, deadlocks, conflicts,
        %s as checksum_failures,
        %s as blk_read_time,
        %s as blk_write_time,
        %s as session_time,
        %s as active_time,
        %s as idle_in_transaction_time,
        %s as sessions,
        %s as sessions_abandoned,
        %s as sessions_fatal,
        %s as sessions_killed,
        stats_reset
      from pg_catalog.pg_stat_database
      where datname = pg_catalog.current_database()
    $sql$,
    private.telemetry_column_expr('pg_catalog', 'pg_stat_database', 'checksum_failures', 'bigint'),
    private.telemetry_column_expr('pg_catalog', 'pg_stat_database', 'blk_read_time', 'double precision'),
    private.telemetry_column_expr('pg_catalog', 'pg_stat_database', 'blk_write_time', 'double precision'),
    private.telemetry_column_expr('pg_catalog', 'pg_stat_database', 'session_time', 'double precision'),
    private.telemetry_column_expr('pg_catalog', 'pg_stat_database', 'active_time', 'double precision'),
    private.telemetry_column_expr('pg_catalog', 'pg_stat_database', 'idle_in_transaction_time', 'double precision'),
    private.telemetry_column_expr('pg_catalog', 'pg_stat_database', 'sessions', 'bigint'),
    private.telemetry_column_expr('pg_catalog', 'pg_stat_database', 'sessions_abandoned', 'bigint'),
    private.telemetry_column_expr('pg_catalog', 'pg_stat_database', 'sessions_fatal', 'bigint'),
    private.telemetry_column_expr('pg_catalog', 'pg_stat_database', 'sessions_killed', 'bigint')
  );

  execute v_sql into v_database;

  -- pg_stat_io arrived in Postgres 16 and its column set has moved since, so
  -- both the view and each column are checked. A small aggregate, never a dump
  -- of the whole view.
  if pg_catalog.to_regclass('pg_catalog.pg_stat_io') is not null then
    v_sql := pg_catalog.format(
      $sql$
        select
          pg_catalog.sum(%s)::bigint as io_reads,
          pg_catalog.sum(%s)::double precision as io_read_time,
          pg_catalog.sum(%s)::bigint as io_writes,
          pg_catalog.sum(%s)::double precision as io_write_time,
          pg_catalog.sum(%s)::bigint as io_extends,
          pg_catalog.sum(%s)::bigint as io_hits,
          pg_catalog.sum(%s)::bigint as io_evictions,
          pg_catalog.sum(%s)::bigint as io_fsyncs
        from pg_catalog.pg_stat_io
      $sql$,
      private.telemetry_column_expr('pg_catalog', 'pg_stat_io', 'reads', 'bigint'),
      private.telemetry_column_expr('pg_catalog', 'pg_stat_io', 'read_time', 'double precision'),
      private.telemetry_column_expr('pg_catalog', 'pg_stat_io', 'writes', 'bigint'),
      private.telemetry_column_expr('pg_catalog', 'pg_stat_io', 'write_time', 'double precision'),
      private.telemetry_column_expr('pg_catalog', 'pg_stat_io', 'extends', 'bigint'),
      private.telemetry_column_expr('pg_catalog', 'pg_stat_io', 'hits', 'bigint'),
      private.telemetry_column_expr('pg_catalog', 'pg_stat_io', 'evictions', 'bigint'),
      private.telemetry_column_expr('pg_catalog', 'pg_stat_io', 'fsyncs', 'bigint')
    );
    execute v_sql into v_io;
  else
    select
      null::bigint as io_reads,
      null::double precision as io_read_time,
      null::bigint as io_writes,
      null::double precision as io_write_time,
      null::bigint as io_extends,
      null::bigint as io_hits,
      null::bigint as io_evictions,
      null::bigint as io_fsyncs
      into v_io;
  end if;

  -- pg_stat_statements bookkeeping. stats_reset here is what makes a delta
  -- trustworthy: without it, a reset reads as every query suddenly getting
  -- cheaper.
  if v_pgss_schema is not null then
    v_sql := pg_catalog.format(
      $sql$
        select
          true as available,
          (select %s from %I.pg_stat_statements_info limit 1) as stats_reset,
          (select %s from %I.pg_stat_statements_info limit 1) as dealloc,
          (select pg_catalog.count(*)::integer from %I.pg_stat_statements) as tracked
      $sql$,
      private.telemetry_column_expr(v_pgss_schema, 'pg_stat_statements_info', 'stats_reset', 'timestamptz'),
      v_pgss_schema,
      private.telemetry_column_expr(v_pgss_schema, 'pg_stat_statements_info', 'dealloc', 'bigint'),
      v_pgss_schema,
      v_pgss_schema
    );
    begin
      execute v_sql into v_pgss;
    exception
      when others then
        select
          false as available,
          null::timestamptz as stats_reset,
          null::bigint as dealloc,
          null::integer as tracked
          into v_pgss;
    end;
  else
    select
      false as available,
      null::timestamptz as stats_reset,
      null::bigint as dealloc,
      null::integer as tracked
      into v_pgss;
  end if;

  insert into private.db_health_snapshots (
    captured_at, database_name, can_read_all_stats,
    max_connections, superuser_reserved_connections,
    total_connections, total_backends_all_databases,
    active_connections, idle_connections, idle_in_transaction_connections,
    waiting_connections, lock_waiting_connections,
    longest_active_query_ms, longest_transaction_ms, longest_wait_ms,
    numbackends, xact_commit, xact_rollback, blks_read, blks_hit,
    tup_returned, tup_fetched, temp_files, temp_bytes, deadlocks, conflicts,
    checksum_failures, blk_read_time, blk_write_time,
    session_time, active_time, idle_in_transaction_time,
    sessions, sessions_abandoned, sessions_fatal, sessions_killed, stats_reset,
    io_reads, io_read_time, io_writes, io_write_time,
    io_extends, io_hits, io_evictions, io_fsyncs,
    database_size_bytes,
    pgss_available, pgss_stats_reset, pgss_dealloc, pgss_statements_tracked
  )
  values (
    v_captured_at,
    pg_catalog.current_database(),
    (
      select pg_catalog.pg_has_role(current_user, 'pg_read_all_stats', 'usage')
       where exists (
         select 1 from pg_catalog.pg_roles as roles
          where roles.rolname = 'pg_read_all_stats'
       )
    ),
    pg_catalog.current_setting('max_connections', true)::integer,
    pg_catalog.current_setting('superuser_reserved_connections', true)::integer,
    v_activity.total_connections,
    v_activity.total_backends_all_databases,
    v_activity.active_connections,
    v_activity.idle_connections,
    v_activity.idle_in_transaction_connections,
    v_activity.waiting_connections,
    v_activity.lock_waiting_connections,
    v_activity.longest_active_query_ms,
    v_activity.longest_transaction_ms,
    v_activity.longest_wait_ms,
    v_database.numbackends, v_database.xact_commit, v_database.xact_rollback,
    v_database.blks_read, v_database.blks_hit,
    v_database.tup_returned, v_database.tup_fetched,
    v_database.temp_files, v_database.temp_bytes,
    v_database.deadlocks, v_database.conflicts,
    v_database.checksum_failures,
    v_database.blk_read_time, v_database.blk_write_time,
    v_database.session_time, v_database.active_time,
    v_database.idle_in_transaction_time,
    v_database.sessions, v_database.sessions_abandoned,
    v_database.sessions_fatal, v_database.sessions_killed,
    v_database.stats_reset,
    v_io.io_reads, v_io.io_read_time, v_io.io_writes, v_io.io_write_time,
    v_io.io_extends, v_io.io_hits, v_io.io_evictions, v_io.io_fsyncs,
    pg_catalog.pg_database_size(pg_catalog.current_database()),
    v_pgss.available, v_pgss.stats_reset, v_pgss.dealloc, v_pgss.tracked
  )
  returning id into v_run_id;

  return v_run_id;
end;
$function$;

create or replace function private.capture_db_connection_snapshot(p_run_id bigint)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_captured_at timestamptz;
  v_inserted integer;
begin
  select snapshots.captured_at into v_captured_at
    from private.db_health_snapshots as snapshots
   where snapshots.id = p_run_id;

  insert into private.db_connection_snapshots (
    run_id, captured_at, application_name, usename, state,
    wait_event_type, wait_event, backend_count, max_query_age_ms, max_xact_age_ms
  )
  select
    p_run_id,
    v_captured_at,
    nullif(activity.application_name, ''),
    activity.usename::text,
    activity.state,
    activity.wait_event_type,
    activity.wait_event,
    pg_catalog.count(*)::integer,
    pg_catalog.max(
      case
        when activity.query_start is not null
        then (extract(epoch from v_captured_at - activity.query_start) * 1000)::bigint
      end
    ),
    pg_catalog.max(
      case
        when activity.xact_start is not null
        then (extract(epoch from v_captured_at - activity.xact_start) * 1000)::bigint
      end
    )
    from pg_catalog.pg_stat_activity as activity
   where activity.pid <> pg_catalog.pg_backend_pid()
   group by
     nullif(activity.application_name, ''),
     activity.usename,
     activity.state,
     activity.wait_event_type,
     activity.wait_event;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

-- The five longest-running backends that were doing something, and only when
-- they had been at it for more than five seconds. On a healthy database this
-- inserts nothing at all.
create or replace function private.capture_db_activity_snapshot(
  p_run_id bigint,
  p_min_age_ms integer default 5000,
  p_limit integer default 5
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_captured_at timestamptz;
  v_sql text;
  v_inserted integer;
begin
  select snapshots.captured_at into v_captured_at
    from private.db_health_snapshots as snapshots
   where snapshots.id = p_run_id;

  -- query_id arrived in pg_stat_activity in Postgres 14, so it goes through the
  -- same catalogue check as everything else optional.
  v_sql := pg_catalog.format(
    $sql$
    insert into private.db_activity_snapshots (
      run_id, captured_at, pid, usename, application_name, state,
      wait_event_type, wait_event, backend_start, xact_start, query_start,
      query_age_ms, xact_age_ms, query_id, query_excerpt
    )
    select
      %s,
      %L::timestamptz,
      activity.pid,
      activity.usename::text,
      nullif(activity.application_name, ''),
      activity.state,
      activity.wait_event_type,
      activity.wait_event,
      activity.backend_start,
      activity.xact_start,
      activity.query_start,
      (extract(epoch from %L::timestamptz - activity.query_start) * 1000)::bigint,
      case
        when activity.xact_start is not null
        then (extract(epoch from %L::timestamptz - activity.xact_start) * 1000)::bigint
      end,
      %s,
      pg_catalog.left(activity.query, 200)
      from pg_catalog.pg_stat_activity as activity
     where activity.pid <> pg_catalog.pg_backend_pid()
       and activity.state is distinct from 'idle'
       and activity.backend_type = 'client backend'
       and activity.query_start is not null
       and activity.query_start
             < %L::timestamptz - pg_catalog.make_interval(secs => %s)
     order by activity.query_start asc
     limit %s
    $sql$,
    p_run_id,
    v_captured_at,
    v_captured_at,
    v_captured_at,
    private.telemetry_column_expr('pg_catalog', 'pg_stat_activity', 'query_id', 'bigint'),
    v_captured_at,
    (p_min_age_ms / 1000.0)::text,
    p_limit
  );

  execute v_sql;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

-- The top statements, four ways: total time (what is consuming the database),
-- mean time (what is slow per call), max time (what has a bad tail) and temp
-- blocks written (what is spilling to disk, the signature of a query that
-- outgrew work_mem). Eight of each, deduplicated, so a capture writes roughly
-- twenty to thirty rows rather than the whole view.
create or replace function private.capture_db_query_snapshot(
  p_run_id bigint,
  p_per_ranking integer default 8
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_captured_at timestamptz;
  v_pgss_schema text := private.pgss_schema();
  v_sql text;
  v_inserted integer;
begin
  if v_pgss_schema is null then
    return 0;
  end if;

  select snapshots.captured_at into v_captured_at
    from private.db_health_snapshots as snapshots
   where snapshots.id = p_run_id;

  v_sql := pg_catalog.format(
    $sql$
    with source as (
      select
        statements.queryid,
        statements.userid,
        statements.dbid,
        %s as toplevel,
        statements.calls,
        statements.total_exec_time,
        statements.mean_exec_time,
        statements.min_exec_time,
        statements.max_exec_time,
        statements."rows" as row_count,
        statements.shared_blks_hit,
        statements.shared_blks_read,
        statements.shared_blks_dirtied,
        statements.shared_blks_written,
        statements.temp_blks_read,
        statements.temp_blks_written,
        %s as wal_records,
        %s as wal_bytes,
        %s as stats_since,
        %s as minmax_stats_since,
        pg_catalog.left(statements.query, 500) as query_excerpt
      from %I.pg_stat_statements as statements
      where statements.dbid = (
        select databases.oid
          from pg_catalog.pg_database as databases
         where databases.datname = pg_catalog.current_database()
      )
    ),
    ranked as (
      select source.*, 'total_time' as reason,
             row_number() over (order by source.total_exec_time desc nulls last)
               as rank_position
        from source
      union all
      select source.*, 'mean_time',
             row_number() over (order by source.mean_exec_time desc nulls last)
        from source
       -- A statement called twice is not evidence of anything. Ranking by mean
       -- without a floor surfaces one-off migrations forever.
       where source.calls >= 5
      union all
      select source.*, 'max_time',
             row_number() over (order by source.max_exec_time desc nulls last)
        from source
      union all
      select source.*, 'temp',
             row_number() over (order by source.temp_blks_written desc nulls last)
        from source
       where source.temp_blks_written > 0
    ),
    selected as (
      select
        ranked.queryid, ranked.userid, ranked.dbid, ranked.toplevel,
        pg_catalog.array_agg(distinct ranked.reason order by ranked.reason)
          as capture_reasons,
        pg_catalog.min(ranked.calls) as calls,
        pg_catalog.min(ranked.total_exec_time) as total_exec_time,
        pg_catalog.min(ranked.mean_exec_time) as mean_exec_time,
        pg_catalog.min(ranked.min_exec_time) as min_exec_time,
        pg_catalog.min(ranked.max_exec_time) as max_exec_time,
        pg_catalog.min(ranked.row_count) as row_count,
        pg_catalog.min(ranked.shared_blks_hit) as shared_blks_hit,
        pg_catalog.min(ranked.shared_blks_read) as shared_blks_read,
        pg_catalog.min(ranked.shared_blks_dirtied) as shared_blks_dirtied,
        pg_catalog.min(ranked.shared_blks_written) as shared_blks_written,
        pg_catalog.min(ranked.temp_blks_read) as temp_blks_read,
        pg_catalog.min(ranked.temp_blks_written) as temp_blks_written,
        pg_catalog.min(ranked.wal_records) as wal_records,
        pg_catalog.min(ranked.wal_bytes) as wal_bytes,
        pg_catalog.min(ranked.stats_since) as stats_since,
        pg_catalog.min(ranked.minmax_stats_since) as minmax_stats_since,
        pg_catalog.min(ranked.query_excerpt) as query_excerpt
        from ranked
       where ranked.rank_position <= %s
       group by ranked.queryid, ranked.userid, ranked.dbid, ranked.toplevel
    )
    insert into private.db_query_snapshots (
      run_id, captured_at, queryid, userid, dbid, toplevel, capture_reasons,
      calls, total_exec_time, mean_exec_time, min_exec_time, max_exec_time,
      "rows",
      shared_blks_hit, shared_blks_read, shared_blks_dirtied, shared_blks_written,
      temp_blks_read, temp_blks_written, wal_records, wal_bytes,
      stats_since, minmax_stats_since, query_excerpt
    )
    select
      %s, %L::timestamptz,
      selected.queryid, selected.userid, selected.dbid, selected.toplevel,
      selected.capture_reasons,
      selected.calls, selected.total_exec_time, selected.mean_exec_time,
      selected.min_exec_time, selected.max_exec_time, selected.row_count,
      selected.shared_blks_hit, selected.shared_blks_read,
      selected.shared_blks_dirtied, selected.shared_blks_written,
      selected.temp_blks_read, selected.temp_blks_written,
      selected.wal_records, selected.wal_bytes,
      selected.stats_since, selected.minmax_stats_since, selected.query_excerpt
    from selected
    $sql$,
    private.telemetry_column_expr(v_pgss_schema, 'pg_stat_statements', 'toplevel', 'boolean'),
    private.telemetry_column_expr(v_pgss_schema, 'pg_stat_statements', 'wal_records', 'bigint'),
    private.telemetry_column_expr(v_pgss_schema, 'pg_stat_statements', 'wal_bytes', 'numeric'),
    private.telemetry_column_expr(v_pgss_schema, 'pg_stat_statements', 'stats_since', 'timestamptz'),
    private.telemetry_column_expr(v_pgss_schema, 'pg_stat_statements', 'minmax_stats_since', 'timestamptz'),
    v_pgss_schema,
    p_per_ranking,
    p_run_id,
    v_captured_at
  );

  execute v_sql;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Retention
-- ---------------------------------------------------------------------------

-- Seven days. The children go first, by their own captured_at index, so
-- removing the parents is a cheap no-op cascade rather than a wide one.
create or replace function private.prune_db_telemetry(
  p_retain interval default interval '7 days'
)
returns table (
  query_rows_deleted integer,
  activity_rows_deleted integer,
  connection_rows_deleted integer,
  health_rows_deleted integer
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_cutoff timestamptz := pg_catalog.now() - p_retain;
  v_query integer;
  v_activity integer;
  v_connection integer;
  v_health integer;
begin
  delete from private.db_query_snapshots where captured_at < v_cutoff;
  get diagnostics v_query = row_count;

  delete from private.db_activity_snapshots where captured_at < v_cutoff;
  get diagnostics v_activity = row_count;

  delete from private.db_connection_snapshots where captured_at < v_cutoff;
  get diagnostics v_connection = row_count;

  delete from private.db_health_snapshots where captured_at < v_cutoff;
  get diagnostics v_health = row_count;

  return query select v_query, v_activity, v_connection, v_health;
end;
$function$;

comment on function private.prune_db_telemetry(interval) is
  'Retention for the telemetry tables. Deletes nothing else, ever.';

-- ---------------------------------------------------------------------------
-- 6. The job body
-- ---------------------------------------------------------------------------

-- One entry point, one transaction, hard-bounded.
--
-- statement_timeout is set on the function, which re-arms the timer against the
-- start of the calling statement, so eight seconds is the ceiling for the whole
-- capture rather than for each statement inside it. lock_timeout is short
-- because telemetry has no business waiting on a lock during an incident.
--
-- Order matters. Health, connections and long-running activity are cheap reads
-- of pg_stat_activity and pg_stat_database and are recorded first; the prune
-- follows; and the pg_stat_statements scan, the only expensive step, runs last
-- inside its own exception block. If that is what runs out of time, the reason
-- is written to query_capture_error and everything captured before it is kept.
create or replace function private.capture_db_telemetry()
returns table (
  run_id bigint,
  connection_rows integer,
  activity_rows integer,
  query_rows integer,
  pruned_rows integer,
  duration_ms integer
)
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '8s'
set lock_timeout = '2s'
as $function$
declare
  v_started timestamptz := pg_catalog.clock_timestamp();
  v_run_id bigint;
  v_connections integer := 0;
  v_activity integer := 0;
  v_queries integer := 0;
  v_pruned integer := 0;
  v_error text;
  v_duration integer;
begin
  v_run_id := private.capture_db_health_snapshot();
  v_connections := private.capture_db_connection_snapshot(v_run_id);
  v_activity := private.capture_db_activity_snapshot(v_run_id);

  select
    prune.query_rows_deleted + prune.activity_rows_deleted
      + prune.connection_rows_deleted + prune.health_rows_deleted
    into v_pruned
    from private.prune_db_telemetry() as prune;

  begin
    v_queries := private.capture_db_query_snapshot(v_run_id);
  exception
    when others then
      v_error := pg_catalog.left(sqlstate || ' ' || sqlerrm, 500);
  end;

  v_duration := (
    extract(epoch from pg_catalog.clock_timestamp() - v_started) * 1000
  )::integer;

  update private.db_health_snapshots
     set query_capture_error = v_error,
         capture_duration_ms = v_duration
   where id = v_run_id;

  return query select v_run_id, v_connections, v_activity, v_queries, v_pruned, v_duration;
end;
$function$;

comment on function private.capture_db_telemetry() is
  'The five-minute telemetry job. Bounded by an 8s statement timeout and a 2s lock timeout; fails rather than adding to database pressure.';

-- ---------------------------------------------------------------------------
-- 7. Deltas
-- ---------------------------------------------------------------------------

-- pg_stat_statements counters are cumulative since the last reset, so "what has
-- been expensive since startup" is not the question worth asking during an
-- incident. This is the difference between consecutive captures of the same
-- statement.
--
-- A delta is NULL, never a number, when it cannot be trusted: a different
-- stats_since means the entry was evicted and re-created, a different
-- pgss_stats_reset means the whole view was reset, and a counter that went
-- backwards means one of those happened without either marker being available.
create or replace view private.db_query_deltas as
with joined as (
  select
    snapshots.*,
    health.pgss_stats_reset
  from private.db_query_snapshots as snapshots
  join private.db_health_snapshots as health
    on health.id = snapshots.run_id
),
paired as (
  select
    joined.*,
    lag(joined.captured_at) over w as previous_captured_at,
    lag(joined.calls) over w as previous_calls,
    lag(joined.total_exec_time) over w as previous_total_exec_time,
    lag(joined."rows") over w as previous_rows,
    lag(joined.shared_blks_read) over w as previous_shared_blks_read,
    lag(joined.shared_blks_hit) over w as previous_shared_blks_hit,
    lag(joined.shared_blks_written) over w as previous_shared_blks_written,
    lag(joined.temp_blks_written) over w as previous_temp_blks_written,
    lag(joined.temp_blks_read) over w as previous_temp_blks_read,
    lag(joined.wal_bytes) over w as previous_wal_bytes,
    lag(joined.stats_since) over w as previous_stats_since,
    lag(joined.pgss_stats_reset) over w as previous_pgss_stats_reset
  from joined
  window w as (
    partition by joined.queryid, joined.userid, joined.dbid, joined.toplevel
    order by joined.captured_at
  )
),
guarded as (
  select
    paired.*,
    (
      paired.previous_captured_at is not null
      and paired.stats_since is not distinct from paired.previous_stats_since
      and paired.pgss_stats_reset is not distinct from paired.previous_pgss_stats_reset
    ) as comparable
  from paired
)
select
  guarded.captured_at,
  guarded.previous_captured_at,
  extract(epoch from guarded.captured_at - guarded.previous_captured_at)::numeric
    as interval_seconds,
  guarded.run_id,
  guarded.queryid,
  guarded.userid,
  guarded.dbid,
  guarded.toplevel,
  guarded.capture_reasons,
  guarded.query_excerpt,
  guarded.calls,
  guarded.total_exec_time,
  guarded.mean_exec_time,
  guarded.min_exec_time,
  guarded.max_exec_time,
  case
    when guarded.comparable and guarded.calls >= guarded.previous_calls
    then guarded.calls - guarded.previous_calls
  end as calls_delta,
  case
    when guarded.comparable and guarded.total_exec_time >= guarded.previous_total_exec_time
    then guarded.total_exec_time - guarded.previous_total_exec_time
  end as total_exec_time_delta,
  case
    when guarded.comparable and guarded."rows" >= guarded.previous_rows
    then guarded."rows" - guarded.previous_rows
  end as rows_delta,
  case
    when guarded.comparable and guarded.shared_blks_read >= guarded.previous_shared_blks_read
    then guarded.shared_blks_read - guarded.previous_shared_blks_read
  end as shared_blks_read_delta,
  case
    when guarded.comparable and guarded.shared_blks_hit >= guarded.previous_shared_blks_hit
    then guarded.shared_blks_hit - guarded.previous_shared_blks_hit
  end as shared_blks_hit_delta,
  case
    when guarded.comparable and guarded.shared_blks_written >= guarded.previous_shared_blks_written
    then guarded.shared_blks_written - guarded.previous_shared_blks_written
  end as shared_blks_written_delta,
  case
    when guarded.comparable and guarded.temp_blks_written >= guarded.previous_temp_blks_written
    then guarded.temp_blks_written - guarded.previous_temp_blks_written
  end as temp_blks_written_delta,
  case
    when guarded.comparable and guarded.temp_blks_read >= guarded.previous_temp_blks_read
    then guarded.temp_blks_read - guarded.previous_temp_blks_read
  end as temp_blks_read_delta,
  case
    when guarded.comparable and guarded.wal_bytes >= guarded.previous_wal_bytes
    then guarded.wal_bytes - guarded.previous_wal_bytes
  end as wal_bytes_delta,
  case
    when guarded.comparable
      and guarded.calls > guarded.previous_calls
      and guarded.total_exec_time >= guarded.previous_total_exec_time
    then (guarded.total_exec_time - guarded.previous_total_exec_time)
         / (guarded.calls - guarded.previous_calls)
  end as mean_exec_time_delta
from guarded;

comment on view private.db_query_deltas is
  'Per-interval change for each captured statement. Deltas are NULL rather than wrong across a pg_stat_statements reset or eviction.';

-- The same idea for the database-wide counters: what changed in this interval,
-- guarded on pg_stat_database.stats_reset.
create or replace view private.db_health_deltas as
with paired as (
  select
    snapshots.*,
    lag(snapshots.captured_at) over w as previous_captured_at,
    lag(snapshots.xact_commit) over w as previous_xact_commit,
    lag(snapshots.xact_rollback) over w as previous_xact_rollback,
    lag(snapshots.blks_read) over w as previous_blks_read,
    lag(snapshots.blks_hit) over w as previous_blks_hit,
    lag(snapshots.temp_files) over w as previous_temp_files,
    lag(snapshots.temp_bytes) over w as previous_temp_bytes,
    lag(snapshots.deadlocks) over w as previous_deadlocks,
    lag(snapshots.conflicts) over w as previous_conflicts,
    lag(snapshots.sessions) over w as previous_sessions,
    lag(snapshots.sessions_abandoned) over w as previous_sessions_abandoned,
    lag(snapshots.sessions_fatal) over w as previous_sessions_fatal,
    lag(snapshots.sessions_killed) over w as previous_sessions_killed,
    lag(snapshots.io_reads) over w as previous_io_reads,
    lag(snapshots.io_writes) over w as previous_io_writes,
    lag(snapshots.stats_reset) over w as previous_stats_reset
  from private.db_health_snapshots as snapshots
  window w as (partition by snapshots.database_name order by snapshots.captured_at)
),
guarded as (
  select
    paired.*,
    (
      paired.previous_captured_at is not null
      and paired.stats_reset is not distinct from paired.previous_stats_reset
    ) as comparable
  from paired
)
select
  guarded.id as run_id,
  guarded.captured_at,
  guarded.previous_captured_at,
  extract(epoch from guarded.captured_at - guarded.previous_captured_at)::numeric
    as interval_seconds,
  guarded.database_name,
  guarded.can_read_all_stats,
  guarded.max_connections,
  guarded.total_connections,
  guarded.total_backends_all_databases,
  guarded.active_connections,
  guarded.idle_connections,
  guarded.idle_in_transaction_connections,
  guarded.waiting_connections,
  guarded.lock_waiting_connections,
  guarded.longest_active_query_ms,
  guarded.longest_transaction_ms,
  guarded.longest_wait_ms,
  guarded.database_size_bytes,
  guarded.pgss_available,
  guarded.query_capture_error,
  guarded.capture_duration_ms,
  case when guarded.comparable then guarded.xact_commit - guarded.previous_xact_commit end
    as xact_commit_delta,
  case when guarded.comparable then guarded.xact_rollback - guarded.previous_xact_rollback end
    as xact_rollback_delta,
  case when guarded.comparable then guarded.blks_read - guarded.previous_blks_read end
    as blks_read_delta,
  case when guarded.comparable then guarded.blks_hit - guarded.previous_blks_hit end
    as blks_hit_delta,
  case when guarded.comparable then guarded.temp_files - guarded.previous_temp_files end
    as temp_files_delta,
  case when guarded.comparable then guarded.temp_bytes - guarded.previous_temp_bytes end
    as temp_bytes_delta,
  case when guarded.comparable then guarded.deadlocks - guarded.previous_deadlocks end
    as deadlocks_delta,
  case when guarded.comparable then guarded.conflicts - guarded.previous_conflicts end
    as conflicts_delta,
  case when guarded.comparable then guarded.sessions - guarded.previous_sessions end
    as sessions_delta,
  case when guarded.comparable then guarded.sessions_abandoned - guarded.previous_sessions_abandoned end
    as sessions_abandoned_delta,
  case when guarded.comparable then guarded.sessions_fatal - guarded.previous_sessions_fatal end
    as sessions_fatal_delta,
  case when guarded.comparable then guarded.sessions_killed - guarded.previous_sessions_killed end
    as sessions_killed_delta,
  case when guarded.comparable then guarded.io_reads - guarded.previous_io_reads end
    as io_reads_delta,
  case when guarded.comparable then guarded.io_writes - guarded.previous_io_writes end
    as io_writes_delta,
  case
    when guarded.comparable
      and (guarded.blks_hit - guarded.previous_blks_hit)
        + (guarded.blks_read - guarded.previous_blks_read) > 0
    then round(
      100.0 * (guarded.blks_hit - guarded.previous_blks_hit)
        / ((guarded.blks_hit - guarded.previous_blks_hit)
           + (guarded.blks_read - guarded.previous_blks_read)),
      2
    )
  end as cache_hit_percent
from guarded;

comment on view private.db_health_deltas is
  'Per-interval change in the database-wide counters, plus the point-in-time connection and wait numbers. NULL deltas mean a stats reset fell inside the interval.';

-- ---------------------------------------------------------------------------
-- 8. The incident report
-- ---------------------------------------------------------------------------

-- One call, six sections, ordered for reading top to bottom. Run it after the
-- next incident with a window that covers it:
--
--   select * from private.db_incident_report(60);
--
-- See docs/database-incident-diagnostics.md.
create or replace function private.db_incident_report(
  p_minutes integer default 60,
  p_ending_at timestamptz default null
)
returns table (
  section text,
  ordinal integer,
  label text,
  detail jsonb
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with bounds as (
    select
      coalesce(p_ending_at, pg_catalog.now()) as ends_at,
      coalesce(p_ending_at, pg_catalog.now())
        - pg_catalog.make_interval(mins => greatest(p_minutes, 1)) as starts_at
  ),
  window_summary as (
    select
      '1_window'::text as section,
      1 as ordinal,
      'incident window'::text as label,
      pg_catalog.jsonb_build_object(
        'starts_at', bounds.starts_at,
        'ends_at', bounds.ends_at,
        'minutes', greatest(p_minutes, 1),
        'captures', (
          select pg_catalog.count(*)
            from private.db_health_snapshots as health
           where health.captured_at between bounds.starts_at and bounds.ends_at
        ),
        'expected_captures', greatest(p_minutes, 1) / 5,
        'note',
        'Fewer captures than expected is itself evidence: the job could not run.'
      ) as detail
    from bounds
  ),
  health_series as (
    select
      '2_health'::text as section,
      row_number() over (order by deltas.captured_at)::integer as ordinal,
      pg_catalog.to_char(deltas.captured_at, 'YYYY-MM-DD HH24:MI:SS') as label,
      pg_catalog.jsonb_build_object(
        'connections', deltas.total_connections,
        'max_connections', deltas.max_connections,
        'active', deltas.active_connections,
        'idle', deltas.idle_connections,
        'idle_in_transaction', deltas.idle_in_transaction_connections,
        'waiting', deltas.waiting_connections,
        'lock_waiting', deltas.lock_waiting_connections,
        'longest_active_query_ms', deltas.longest_active_query_ms,
        'longest_transaction_ms', deltas.longest_transaction_ms,
        'temp_bytes_delta', deltas.temp_bytes_delta,
        'temp_files_delta', deltas.temp_files_delta,
        'blks_read_delta', deltas.blks_read_delta,
        'blks_hit_delta', deltas.blks_hit_delta,
        'cache_hit_percent', deltas.cache_hit_percent,
        'deadlocks_delta', deltas.deadlocks_delta,
        'rollbacks_delta', deltas.xact_rollback_delta,
        'commits_delta', deltas.xact_commit_delta,
        'sessions_fatal_delta', deltas.sessions_fatal_delta,
        'sessions_killed_delta', deltas.sessions_killed_delta,
        'sessions_abandoned_delta', deltas.sessions_abandoned_delta,
        'capture_duration_ms', deltas.capture_duration_ms,
        'query_capture_error', deltas.query_capture_error,
        'can_read_all_stats', deltas.can_read_all_stats
      ) as detail
    from private.db_health_deltas as deltas, bounds
    where deltas.captured_at between bounds.starts_at and bounds.ends_at
  ),
  query_totals as (
    select
      deltas.queryid,
      pg_catalog.min(deltas.query_excerpt) as query_excerpt,
      pg_catalog.sum(deltas.total_exec_time_delta) as total_exec_time_delta,
      pg_catalog.sum(deltas.calls_delta) as calls_delta,
      pg_catalog.sum(deltas.rows_delta) as rows_delta,
      pg_catalog.max(deltas.mean_exec_time_delta) as worst_interval_mean_ms,
      pg_catalog.max(deltas.max_exec_time) as max_exec_time_ms,
      pg_catalog.sum(deltas.shared_blks_read_delta) as shared_blks_read_delta,
      pg_catalog.sum(deltas.temp_blks_written_delta) as temp_blks_written_delta,
      pg_catalog.sum(deltas.wal_bytes_delta) as wal_bytes_delta
    from private.db_query_deltas as deltas, bounds
    where deltas.captured_at between bounds.starts_at and bounds.ends_at
    group by deltas.queryid
  ),
  top_queries as (
    select
      '3_top_queries'::text as section,
      row_number() over (
        order by query_totals.total_exec_time_delta desc nulls last
      )::integer as ordinal,
      pg_catalog.left(
        pg_catalog.regexp_replace(
          coalesce(query_totals.query_excerpt, '(unknown)'),
          '\s+', ' ', 'g'
        ),
        160
      ) as label,
      pg_catalog.jsonb_build_object(
        'queryid', query_totals.queryid,
        'total_exec_time_ms_delta', round(query_totals.total_exec_time_delta::numeric, 1),
        'calls_delta', query_totals.calls_delta,
        'mean_ms_worst_interval', round(query_totals.worst_interval_mean_ms::numeric, 2),
        'max_exec_time_ms', round(query_totals.max_exec_time_ms::numeric, 1),
        'rows_delta', query_totals.rows_delta,
        'shared_blks_read_delta', query_totals.shared_blks_read_delta,
        'temp_blks_written_delta', query_totals.temp_blks_written_delta,
        'wal_bytes_delta', query_totals.wal_bytes_delta
      ) as detail
    from query_totals
    where coalesce(query_totals.total_exec_time_delta, 0) > 0
       or coalesce(query_totals.temp_blks_written_delta, 0) > 0
       or coalesce(query_totals.shared_blks_read_delta, 0) > 0
  ),
  connection_sources as (
    select
      '4_connection_sources'::text as section,
      row_number() over (
        order by pg_catalog.max(connections.backend_count) desc
      )::integer as ordinal,
      pg_catalog.concat_ws(
        ' / ',
        coalesce(connections.application_name, '(no application_name)'),
        coalesce(connections.usename, '(no user)'),
        coalesce(connections.state, '(no state)')
      ) as label,
      pg_catalog.jsonb_build_object(
        'application_name', connections.application_name,
        'usename', connections.usename,
        'state', connections.state,
        'wait_event_type', connections.wait_event_type,
        'wait_event', connections.wait_event,
        'peak_backends', pg_catalog.max(connections.backend_count),
        'mean_backends', round(pg_catalog.avg(connections.backend_count), 1),
        'max_query_age_ms', pg_catalog.max(connections.max_query_age_ms),
        'max_xact_age_ms', pg_catalog.max(connections.max_xact_age_ms)
      ) as detail
    from private.db_connection_snapshots as connections, bounds
    where connections.captured_at between bounds.starts_at and bounds.ends_at
    group by
      connections.application_name,
      connections.usename,
      connections.state,
      connections.wait_event_type,
      connections.wait_event
  ),
  long_running as (
    select
      '5_long_running'::text as section,
      row_number() over (order by activity.query_age_ms desc)::integer as ordinal,
      pg_catalog.to_char(activity.captured_at, 'YYYY-MM-DD HH24:MI:SS') as label,
      pg_catalog.jsonb_build_object(
        'pid', activity.pid,
        'usename', activity.usename,
        'application_name', activity.application_name,
        'state', activity.state,
        'wait_event_type', activity.wait_event_type,
        'wait_event', activity.wait_event,
        'query_age_ms', activity.query_age_ms,
        'xact_age_ms', activity.xact_age_ms,
        'query_id', activity.query_id,
        'query_excerpt', activity.query_excerpt
      ) as detail
    from private.db_activity_snapshots as activity, bounds
    where activity.captured_at between bounds.starts_at and bounds.ends_at
  ),
  limits as (
    select
      '6_limits'::text as section,
      1 as ordinal,
      'what this report cannot show'::text as label,
      pg_catalog.jsonb_build_object(
        'observable',
        pg_catalog.jsonb_build_array(
          'query time, call counts and per-statement counters',
          'connection counts and the applications and users behind them',
          'wait events, including lock waits',
          'shared buffer hits and reads',
          'temp file and temp block I/O',
          'transaction commits, rollbacks and deadlocks'
        ),
        'not_observable',
        pg_catalog.jsonb_build_array(
          'host RAM, swap usage and the Linux OOM killer',
          'platform CPU and disk saturation',
          'connections refused before Postgres accepted them',
          'anything at all during the minutes the database was unreachable'
        ),
        'where_to_look_instead',
        'Supabase dashboard: Database > Reports, plus the project metrics endpoint.'
      ) as detail
  )
  select section, ordinal, label, detail from window_summary
  union all
  select section, ordinal, label, detail from health_series
  union all
  select section, ordinal, label, detail from top_queries where ordinal <= 25
  union all
  select section, ordinal, label, detail from connection_sources where ordinal <= 25
  union all
  select section, ordinal, label, detail from long_running where ordinal <= 25
  union all
  select section, ordinal, label, detail from limits
  order by section, ordinal;
$function$;

comment on function private.db_incident_report(integer, timestamptz) is
  'Post-incident diagnostics over a recent window: health series, top statements by delta, connection sources, long-running activity, and an explicit statement of what SQL telemetry cannot see.';

-- ---------------------------------------------------------------------------
-- 9. Privileges
-- ---------------------------------------------------------------------------

revoke all on private.db_health_snapshots from public, anon, authenticated;
revoke all on private.db_connection_snapshots from public, anon, authenticated;
revoke all on private.db_activity_snapshots from public, anon, authenticated;
revoke all on private.db_query_snapshots from public, anon, authenticated;
revoke all on private.db_query_deltas from public, anon, authenticated;
revoke all on private.db_health_deltas from public, anon, authenticated;

revoke all on function private.capture_db_telemetry() from public, anon, authenticated;
revoke all on function private.capture_db_health_snapshot() from public, anon, authenticated;
revoke all on function private.capture_db_connection_snapshot(bigint) from public, anon, authenticated;
revoke all on function private.capture_db_activity_snapshot(bigint, integer, integer) from public, anon, authenticated;
revoke all on function private.capture_db_query_snapshot(bigint, integer) from public, anon, authenticated;
revoke all on function private.prune_db_telemetry(interval) from public, anon, authenticated;
revoke all on function private.db_incident_report(integer, timestamptz) from public, anon, authenticated;
revoke all on function private.telemetry_column_expr(text, text, text, text) from public, anon, authenticated;
revoke all on function private.pgss_schema() from public, anon, authenticated;

grant usage on schema private to postgres;
grant select, insert, update, delete on private.db_health_snapshots to postgres;
grant select, insert, delete on private.db_connection_snapshots to postgres;
grant select, insert, delete on private.db_activity_snapshots to postgres;
grant select, insert, delete on private.db_query_snapshots to postgres;
grant select on private.db_query_deltas to postgres;
grant select on private.db_health_deltas to postgres;
grant execute on all functions in schema private to postgres;

-- ---------------------------------------------------------------------------
-- 10. Scheduling
-- ---------------------------------------------------------------------------
--
-- The scheduler lives in four private functions in
-- 20260827110918_migrate_scheduler_to_supabase_cron.sql, and each of them names
-- every job explicitly. Three of the four are redefined here with
-- indegenius-db-telemetry added and everything else unchanged. The fourth,
-- dispatch_indegenius_cron, is deliberately untouched: it is the allowlist for
-- jobs that make an HTTP request to the application, and this job makes none.
-- It runs entirely inside the database, which is the point of it.
--
-- The job is also scheduled directly below, so applying this file is
-- sufficient. install_indegenius_cron_jobs() does not need to be re-run, and
-- re-running it stays safe: it removes this job and recreates it identically.

create or replace function private.remove_indegenius_cron_jobs()
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_job record;
  v_removed integer := 0;
begin
  for v_job in
    select jobid
      from cron.job
     where jobname = any (array[
       'indegenius-daily-brief',
       'indegenius-review-reminders',
       'indegenius-publication-recovery',
       'indegenius-resend-segment-sync',
       'indegenius-cron-http-reconcile',
       'indegenius-cron-history-prune',
       'indegenius-db-telemetry'
     ]::text[])
  loop
    perform cron.unschedule(v_job.jobid);
    v_removed := v_removed + 1;
  end loop;

  return v_removed;
end;
$function$;

create or replace function private.inspect_indegenius_cron_jobs()
returns table (
  job_name text,
  expected_schedule text,
  actual_schedule text,
  command text,
  active boolean,
  job_id bigint,
  last_run_status text,
  last_run_started_at timestamptz,
  last_run_finished_at timestamptz,
  last_http_status integer,
  last_http_completed_at timestamptz
)
language sql
security invoker
set search_path = ''
as $function$
  with expected(job_name, schedule) as (
    values
      ('indegenius-daily-brief', '0 8 * * *'),
      ('indegenius-review-reminders', '0 9 * * *'),
      ('indegenius-publication-recovery', '4-59/5 * * * *'),
      ('indegenius-resend-segment-sync', '20 2 * * *'),
      ('indegenius-cron-http-reconcile', '1-59/5 * * * *'),
      ('indegenius-cron-history-prune', '30 3 * * *'),
      ('indegenius-db-telemetry', '3-59/5 * * * *')
  )
  select
    expected.job_name,
    expected.schedule,
    jobs.schedule,
    jobs.command,
    coalesce(jobs.active, false),
    jobs.jobid,
    last_run.status,
    last_run.start_time,
    last_run.end_time,
    last_http.response_status,
    last_http.response_received_at
  from expected
  left join cron.job as jobs
    on jobs.jobname = expected.job_name
  left join lateral (
    select details.status, details.start_time, details.end_time
      from cron.job_run_details as details
     where details.jobid = jobs.jobid
     order by details.start_time desc
     limit 1
  ) as last_run on true
  left join lateral (
    select requests.response_status, requests.response_received_at
      from private.cron_http_requests as requests
     where requests.job_name = expected.job_name
     order by requests.requested_at desc, requests.id desc
     limit 1
  ) as last_http on true
  order by expected.job_name;
$function$;

create or replace function private.install_indegenius_cron_jobs()
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_secret_count integer;
begin
  select pg_catalog.count(*)::integer
    into v_secret_count
    from vault.decrypted_secrets
   where name in ('indegenius_cron_base_url', 'indegenius_cron_secret')
     and decrypted_secret is not null
     and pg_catalog.length(decrypted_secret) > 0;

  if v_secret_count <> 2 then
    raise exception 'Indegenius Cron Vault configuration is incomplete';
  end if;

  perform private.remove_indegenius_cron_jobs();

  perform cron.schedule(
    'indegenius-daily-brief',
    '0 8 * * *',
    $cron$select private.dispatch_indegenius_cron('indegenius-daily-brief', '/api/cron/daily-brief');$cron$
  );
  perform cron.schedule(
    'indegenius-review-reminders',
    '0 9 * * *',
    $cron$select private.dispatch_indegenius_cron('indegenius-review-reminders', '/api/cron/review-reminders');$cron$
  );
  perform cron.schedule(
    'indegenius-publication-recovery',
    '4-59/5 * * * *',
    $cron$select private.dispatch_indegenius_cron('indegenius-publication-recovery', '/api/cron/process-publication-deliveries');$cron$
  );
  -- 02:20 UTC: after the day's activity has settled and well before the
  -- 08:00 daily brief, so a long bootstrap run does not collide with it.
  perform cron.schedule(
    'indegenius-resend-segment-sync',
    '20 2 * * *',
    $cron$select private.dispatch_indegenius_cron('indegenius-resend-segment-sync', '/api/cron/resend-segment-sync');$cron$
  );
  perform cron.schedule(
    'indegenius-cron-http-reconcile',
    '1-59/5 * * * *',
    $cron$select private.reconcile_indegenius_cron_http_requests();$cron$
  );
  perform cron.schedule(
    'indegenius-cron-history-prune',
    '30 3 * * *',
    $cron$select private.prune_indegenius_cron_history();$cron$
  );
  -- Every five minutes, offset to minute 3 so it does not start in the same
  -- second as the publication recovery dispatch at minute 4 or the pg_net
  -- reconcile at minute 1. Not every minute: this database is already under
  -- pressure and the telemetry must not become part of it.
  perform cron.schedule(
    'indegenius-db-telemetry',
    '3-59/5 * * * *',
    $cron$select private.capture_db_telemetry();$cron$
  );
end;
$function$;

-- Schedule it now, so applying this migration is sufficient. cron.schedule
-- updates the command in place when the job name already exists, so this is
-- repeatable.
select cron.schedule(
  'indegenius-db-telemetry',
  '3-59/5 * * * *',
  $cron$select private.capture_db_telemetry();$cron$
);

-- Take the first capture immediately, so the tables are never empty and the
-- objects above are proven to run on this server rather than merely to parse.
-- Wrapped: a first capture that fails is worth a loud notice, not a migration
-- that refuses to install the diagnostics we are trying to install.
do $$
declare
  v_result record;
begin
  select * into v_result from private.capture_db_telemetry();
  raise notice
    'First telemetry capture: run_id %, % connection rows, % activity rows, % query rows, %ms.',
    v_result.run_id, v_result.connection_rows, v_result.activity_rows,
    v_result.query_rows, v_result.duration_ms;
exception
  when others then
    raise notice
      'First telemetry capture failed (%). The objects are installed and the cron job is scheduled; run "select * from private.capture_db_telemetry();" as postgres to see the error.',
      sqlerrm;
end;
$$;

commit;
