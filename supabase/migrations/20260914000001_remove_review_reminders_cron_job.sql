-- Remove the review reminder job from Supabase Cron.
--
-- The editorial review workflow was retired by the publishing reset, and the
-- route this job called has been removed:
--
--   indegenius-review-reminders  -> /api/cron/review-reminders  (0 9 * * *)
--
-- ## Written against production, not against the repository's newest files
--
-- The scheduler lives in four private functions that each name every job:
-- dispatch validates the job/path pair, remove unschedules the known set,
-- inspect reports on the expected set, and install rebuilds it. All four are
-- redefined here with this one job removed and everything else unchanged.
--
-- A read-only inspection of production on 2026-09-15 found all four functions
-- identical, character for character, to their definitions in
-- 20260906000003_remove_debate_cron_jobs.sql, and six scheduled jobs:
-- cron-history-prune, cron-http-reconcile, daily-brief, publication-recovery,
-- resend-segment-sync and review-reminders. 20260908000001_database_telemetry.sql
-- has never been applied there: there is no telemetry job and no telemetry
-- function. So the definitions below are 20260906000003's, minus the review
-- reminder job, and nothing else. supabase/migrations/
-- reviewRemindersCronRemovalMigration.test.ts derives that from the older
-- file on every run rather than trusting this one.
--
-- An earlier draft of this file, never applied to any database and never
-- committed, started from the telemetry migration's definitions instead. It is
-- replaced in place rather than superseded, because a superseded draft would
-- sit in the migration order as a file nobody may run.
--
-- ## The telemetry migration is now stale
--
-- 20260908000001 redefines remove, inspect and install from definitions that
-- still carry the review reminder job. Applying it after this file would put
-- the job back in all three sets, and a later install would schedule it again.
-- It must be rebased onto this file before it is applied anywhere. Step 0
-- below refuses to run on a database that already has telemetry, because on
-- that shape these definitions would silently drop the telemetry job.
--
-- ## Order inside the file
--
-- Once the name is out of the remove set, remove_indegenius_cron_jobs() never
-- unschedules it again, so the job is dropped first, while the set still knows
-- it. The job id is resolved from cron.job by name, and cron.unschedule(jobid)
-- is used rather than cron.unschedule(jobname), which raises when the job is
-- absent.
--
-- Nothing else changes. No table, column or application row is touched. The
-- dispatch log keeps its review reminder rows as the record of what ran, and
-- prune_indegenius_cron_history() ages them out.
--
-- Applying this file is sufficient: install_indegenius_cron_jobs() does not
-- need to be re-run. Apply it with
--   node scripts/migration/apply-cron-removal.mjs --dry-run
--   node scripts/migration/apply-cron-removal.mjs --apply

begin;

-- 0. Refuse to run on a scheduler shape this file was not written for.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'indegenius-db-telemetry')
     or exists (
       select 1
         from pg_catalog.pg_proc as p
         join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
        where n.nspname = 'private'
          and p.proname = 'capture_db_telemetry'
     ) then
    raise exception
      '20260914000001 is written for a scheduler without database telemetry, and this database has it. Rebase it onto 20260908000001 before running it here.';
  end if;
end;
$$;

-- 1. Unschedule the review reminder job while the remove set still knows it.
do $$
declare
  v_job record;
begin
  for v_job in
    select jobid, jobname
      from cron.job
     where jobname = any (array[
       'indegenius-review-reminders'
     ]::text[])
  loop
    perform cron.unschedule(v_job.jobid);
    raise notice 'Unscheduled % (jobid %)', v_job.jobname, v_job.jobid;
  end loop;
end;
$$;

-- 2. Drop it from the dispatch allowlist, so a request for its path is
--    rejected before pg_net is ever called.
create or replace function private.dispatch_indegenius_cron(
  p_job_name text,
  p_path text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_expected_path text;
  v_base_url text;
  v_cron_secret text;
  v_timeout_ms integer;
  v_request_id bigint;
begin
  v_expected_path := case p_job_name
    when 'indegenius-health-probe' then '/api/cron/health'
    when 'indegenius-daily-brief' then '/api/cron/daily-brief'
    when 'indegenius-publication-recovery' then '/api/cron/process-publication-deliveries'
    when 'indegenius-resend-segment-sync' then '/api/cron/resend-segment-sync'
    else null
  end;

  if v_expected_path is null or p_path is distinct from v_expected_path then
    raise exception 'Cron job/path pair is not allowed';
  end if;

  v_timeout_ms := case p_job_name
    when 'indegenius-health-probe' then 15000
    -- The sync spends its whole budget talking to Resend one contact at a
    -- time, so it is allowed to run right up to the route's own maxDuration.
    when 'indegenius-resend-segment-sync' then 300000
    else 180000
  end;

  select decrypted_secret
    into v_base_url
    from vault.decrypted_secrets
   where name = 'indegenius_cron_base_url'
   order by created_at desc
   limit 1;

  select decrypted_secret
    into v_cron_secret
    from vault.decrypted_secrets
   where name = 'indegenius_cron_secret'
   order by created_at desc
   limit 1;

  v_base_url := pg_catalog.rtrim(v_base_url, '/');

  if v_base_url is null
     or v_base_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' then
    raise exception 'Cron base URL is missing or invalid';
  end if;

  if v_cron_secret is null or pg_catalog.length(v_cron_secret) = 0 then
    raise exception 'Cron secret is missing';
  end if;

  v_request_id := net.http_get(
    url := v_base_url || p_path,
    headers := pg_catalog.jsonb_build_object(
      'Authorization', 'Bearer ' || v_cron_secret,
      'User-Agent', 'Indegenius-Supabase-Cron/1.0',
      'X-Indegenius-Cron-Source', 'supabase-cron',
      'X-Indegenius-Cron-Job', p_job_name
    ),
    timeout_milliseconds := v_timeout_ms
  );

  insert into private.cron_http_requests (
    request_id,
    job_name,
    request_path
  )
  values (
    v_request_id,
    p_job_name,
    p_path
  );

  return v_request_id;
end;
$function$;

-- 3. Drop it from the remove set.
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
       'indegenius-publication-recovery',
       'indegenius-resend-segment-sync',
       'indegenius-cron-http-reconcile',
       'indegenius-cron-history-prune'
     ]::text[])
  loop
    perform cron.unschedule(v_job.jobid);
    v_removed := v_removed + 1;
  end loop;

  return v_removed;
end;
$function$;

-- 4. Drop it from the inspect set, so a stray copy left running on any
--    database shows up as an unknown row in cron.job instead of as expected.
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
      ('indegenius-publication-recovery', '4-59/5 * * * *'),
      ('indegenius-resend-segment-sync', '20 2 * * *'),
      ('indegenius-cron-http-reconcile', '1-59/5 * * * *'),
      ('indegenius-cron-history-prune', '30 3 * * *')
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

-- 5. Drop it from install, so no reinstall can bring it back.
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
end;
$function$;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to postgres;
grant select, insert, update, delete on private.cron_http_requests to postgres;
grant execute on all functions in schema private to postgres;

commit;
