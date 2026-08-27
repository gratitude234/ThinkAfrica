-- Move application scheduling to Supabase Cron without activating jobs.
-- Runtime destinations and credentials are resolved from Vault, never stored
-- in this migration or in cron.job.

begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema private revoke all on tables from public;

create table if not exists private.cron_http_requests (
  request_id bigint primary key,
  job_name text not null
    constraint cron_http_requests_job_name_check
    check (job_name ~ '^indegenius-[a-z0-9-]+$'),
  request_path text not null
    constraint cron_http_requests_path_check
    check (request_path like '/api/cron/%'),
  requested_at timestamptz not null default now(),
  response_status integer
    constraint cron_http_requests_status_check
    check (response_status between 100 and 599),
  response_content_type text,
  timed_out boolean not null default false,
  error_message text,
  response_received_at timestamptz,
  reconciled_at timestamptz
);

alter table private.cron_http_requests enable row level security;
alter table private.cron_http_requests force row level security;

create index if not exists cron_http_requests_pending_idx
  on private.cron_http_requests (requested_at)
  where reconciled_at is null;

create index if not exists cron_http_requests_retention_idx
  on private.cron_http_requests (requested_at);

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
    else null
  end;

  if v_expected_path is null or p_path is distinct from v_expected_path then
    raise exception 'Cron job/path pair is not allowed';
  end if;

  v_timeout_ms := case p_job_name
    when 'indegenius-health-probe' then 15000
    when 'indegenius-debate-v2-advance' then 60000
    when 'indegenius-debate-v2-notifications' then 60000
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

create or replace function private.reconcile_indegenius_cron_http_requests()
returns table (reconciled integer, missing_response integer)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_reconciled integer;
  v_missing_response integer;
begin
  update private.cron_http_requests as requests
     set response_status = responses.status_code,
         response_content_type = responses.content_type,
         timed_out = coalesce(responses.timed_out, false),
         error_message = nullif(
           pg_catalog.left(responses.error_msg, 1000),
           ''
         ),
         response_received_at = coalesce(
           responses.created,
           pg_catalog.now()
         ),
         reconciled_at = pg_catalog.now()
    from net._http_response as responses
   where requests.request_id = responses.id
     and requests.reconciled_at is null;

  get diagnostics v_reconciled = row_count;

  update private.cron_http_requests
     set timed_out = true,
         error_message = 'No pg_net response was retained for this request',
         response_received_at = pg_catalog.now(),
         reconciled_at = pg_catalog.now()
   where reconciled_at is null
     and requested_at < pg_catalog.now() - interval '15 minutes';

  get diagnostics v_missing_response = row_count;

  return query select v_reconciled, v_missing_response;
end;
$function$;

create or replace function private.prune_indegenius_cron_history()
returns table (http_requests_deleted integer, cron_runs_deleted integer)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_http_requests_deleted integer;
  v_cron_runs_deleted integer;
begin
  delete from private.cron_http_requests
   where requested_at < pg_catalog.now() - interval '30 days';

  get diagnostics v_http_requests_deleted = row_count;

  delete from cron.job_run_details
   where coalesce(end_time, start_time)
           < pg_catalog.now() - interval '30 days'
     and (
       command like 'select private.dispatch_indegenius_cron(%'
       or command = 'select private.reconcile_indegenius_cron_http_requests();'
       or command = 'select private.prune_indegenius_cron_history();'
     );

  get diagnostics v_cron_runs_deleted = row_count;

  return query select v_http_requests_deleted, v_cron_runs_deleted;
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

-- This tightly scoped bootstrap RPC exists only for the first deployment.
-- A follow-up migration drops it immediately after Vault provisioning.
create or replace function public.__temporary_provision_indegenius_cron(
  p_base_url text,
  p_cron_secret text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_base_url text;
  v_secret_id uuid;
begin
  v_base_url := pg_catalog.rtrim(p_base_url, '/');

  if v_base_url is null
     or v_base_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' then
    raise exception 'Cron base URL is missing or invalid';
  end if;

  if p_cron_secret is null or pg_catalog.length(p_cron_secret) < 16 then
    raise exception 'Cron secret is missing or too short';
  end if;

  select id into v_secret_id
    from vault.secrets
   where name = 'indegenius_cron_base_url';

  if v_secret_id is null then
    perform vault.create_secret(
      v_base_url,
      'indegenius_cron_base_url',
      'Base URL used by private Supabase Cron dispatch',
      null::uuid
    );
  else
    perform vault.update_secret(
      v_secret_id,
      v_base_url,
      'indegenius_cron_base_url',
      'Base URL used by private Supabase Cron dispatch',
      null::uuid
    );
  end if;

  v_secret_id := null;
  select id into v_secret_id
    from vault.secrets
   where name = 'indegenius_cron_secret';

  if v_secret_id is null then
    perform vault.create_secret(
      p_cron_secret,
      'indegenius_cron_secret',
      'Bearer secret used by private Supabase Cron dispatch',
      null::uuid
    );
  else
    perform vault.update_secret(
      v_secret_id,
      p_cron_secret,
      'indegenius_cron_secret',
      'Bearer secret used by private Supabase Cron dispatch',
      null::uuid
    );
  end if;
end;
$function$;

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to postgres;
grant select, insert, update, delete on private.cron_http_requests to postgres;
grant execute on all functions in schema private to postgres;

revoke all on function public.__temporary_provision_indegenius_cron(text, text)
  from public, anon, authenticated;
grant execute on function public.__temporary_provision_indegenius_cron(text, text)
  to service_role;

comment on function public.__temporary_provision_indegenius_cron(text, text)
  is 'Temporary service-role-only Vault bootstrap; drop immediately after cutover provisioning.';

notify pgrst, 'reload schema';

commit;
