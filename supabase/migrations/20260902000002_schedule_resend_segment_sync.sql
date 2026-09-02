-- Schedule the Resend recipient sync on Supabase Cron.
--
-- 20260827110918_migrate_scheduler_to_supabase_cron.sql holds the whole
-- scheduler in four private functions, and each of them names every job
-- explicitly: dispatch validates the job/path pair, remove unschedules the
-- known set, inspect reports on the expected set, and install rebuilds it.
-- A new job that is only added to install is dispatched but never removed and
-- never reported, so all four are redefined here with
-- indegenius-resend-segment-sync added and everything else unchanged.
--
-- The route is scheduled but not activated by applying this file. Run
--   select private.install_indegenius_cron_jobs();
-- once, as postgres, after the Vault secrets are in place.

begin;

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
    when 'indegenius-review-reminders' then '/api/cron/review-reminders'
    when 'indegenius-debate-v2-advance' then '/api/cron/advance-debate-rounds'
    when 'indegenius-debate-v2-notifications' then '/api/cron/process-debate-notifications'
    when 'indegenius-publication-recovery' then '/api/cron/process-publication-deliveries'
    when 'indegenius-debate-v15-deadlines' then '/api/cron/debate-v15-deadlines'
    when 'indegenius-resend-segment-sync' then '/api/cron/resend-segment-sync'
    else null
  end;

  if v_expected_path is null or p_path is distinct from v_expected_path then
    raise exception 'Cron job/path pair is not allowed';
  end if;

  v_timeout_ms := case p_job_name
    when 'indegenius-health-probe' then 15000
    when 'indegenius-debate-v2-advance' then 60000
    when 'indegenius-debate-v2-notifications' then 60000
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
       'indegenius-debate-v2-advance',
       'indegenius-debate-v2-notifications',
       'indegenius-publication-recovery',
       'indegenius-debate-v15-deadlines',
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
      ('indegenius-debate-v2-advance', '*/5 * * * *'),
      ('indegenius-debate-v2-notifications', '2-59/5 * * * *'),
      ('indegenius-publication-recovery', '4-59/5 * * * *'),
      ('indegenius-debate-v15-deadlines', '7,22,37,52 * * * *'),
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
     order by requests.requested_at desc
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
    'indegenius-debate-v2-advance',
    '*/5 * * * *',
    $cron$select private.dispatch_indegenius_cron('indegenius-debate-v2-advance', '/api/cron/advance-debate-rounds');$cron$
  );
  perform cron.schedule(
    'indegenius-debate-v2-notifications',
    '2-59/5 * * * *',
    $cron$select private.dispatch_indegenius_cron('indegenius-debate-v2-notifications', '/api/cron/process-debate-notifications');$cron$
  );
  perform cron.schedule(
    'indegenius-publication-recovery',
    '4-59/5 * * * *',
    $cron$select private.dispatch_indegenius_cron('indegenius-publication-recovery', '/api/cron/process-publication-deliveries');$cron$
  );
  perform cron.schedule(
    'indegenius-debate-v15-deadlines',
    '7,22,37,52 * * * *',
    $cron$select private.dispatch_indegenius_cron('indegenius-debate-v15-deadlines', '/api/cron/debate-v15-deadlines');$cron$
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
grant execute on all functions in schema private to postgres;

commit;
