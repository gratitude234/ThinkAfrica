-- Give private.cron_http_requests a primary key of its own.
--
-- The table was keyed on the pg_net request id, which reads like a stable
-- identifier and is not one. pg_net hands out ids from a sequence that lives
-- with the extension, and that sequence restarts: after one, a dispatch that
-- gets request id 297 collides with the row written the last time 297 was
-- handed out, and the insert fails with
--
--   23505 duplicate key value violates unique constraint "cron_http_requests_pkey"
--
-- which aborts private.dispatch_indegenius_cron() after the HTTP call has
-- already gone out. The request is made, the row is lost, and the job reports
-- a failure it did not have.
--
-- So the request id becomes what it always was, a lookup key into
-- net._http_response that is unique only for as long as pg_net keeps the
-- response, and the table gets a surrogate key. Existing history is preserved:
-- the identity column backfills in place and no row is deleted or rewritten.

begin;

-- 1. The surrogate key. GENERATED ALWAYS AS IDENTITY rather than bigserial:
--    an identity column's sequence needs no separate grant, so the existing
--    table grants keep working untouched.
alter table private.cron_http_requests
  add column if not exists id bigint generated always as identity;

-- Dropping the old primary key does not remove the NOT NULL it implied, but
-- saying so explicitly means the column's contract does not depend on that.
alter table private.cron_http_requests
  alter column request_id set not null;

-- Written as a check on what the primary key actually covers rather than on
-- its name, so re-applying the migration is a no-op instead of an error.
do $$
declare
  v_pkey_name text;
  v_pkey_columns text[];
begin
  select con.conname,
         array_agg(att.attname order by att.attname)
    into v_pkey_name, v_pkey_columns
    from pg_catalog.pg_constraint as con
    join pg_catalog.pg_attribute as att
      on att.attrelid = con.conrelid
     and att.attnum = any (con.conkey)
   where con.conrelid = 'private.cron_http_requests'::regclass
     and con.contype = 'p'
   group by con.conname;

  if v_pkey_columns = array['id']::text[] then
    return;
  end if;

  if v_pkey_name is not null then
    execute pg_catalog.format(
      'alter table private.cron_http_requests drop constraint %I',
      v_pkey_name
    );
  end if;

  alter table private.cron_http_requests
    add constraint cron_http_requests_pkey primary key (id);
end;
$$;

-- 2. request_id keeps its index, and only its index. Reconciliation and
--    inspection both look rows up by it, and neither needs it to be unique.
create index if not exists cron_http_requests_request_id_idx
  on private.cron_http_requests (request_id);

-- 3. Reconciliation, rewritten around the surrogate key.
--
--    Matching on request_id alone was safe while it was unique and is not any
--    more: two rows can now carry the same id, one from before a pg_net
--    sequence restart and one from after. Only the newest unreconciled row for
--    a given id can plausibly belong to the response still sitting in
--    net._http_response, so that is the only one that gets it. The rest are
--    closed out by the fifteen-minute sweep below, exactly as before.
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
  with matched as (
    select distinct on (requests.request_id)
           requests.id as request_row_id,
           responses.status_code,
           responses.content_type,
           responses.timed_out,
           responses.error_msg,
           responses.created
      from private.cron_http_requests as requests
      join net._http_response as responses
        on responses.id = requests.request_id
     where requests.reconciled_at is null
     order by requests.request_id, requests.requested_at desc, requests.id desc
  )
  update private.cron_http_requests as requests
     set response_status = matched.status_code,
         response_content_type = matched.content_type,
         timed_out = coalesce(matched.timed_out, false),
         error_message = nullif(
           pg_catalog.left(matched.error_msg, 1000),
           ''
         ),
         response_received_at = coalesce(
           matched.created,
           pg_catalog.now()
         ),
         reconciled_at = pg_catalog.now()
    from matched
   where requests.id = matched.request_row_id;

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

-- 4. Inspection, given a deterministic tie-break.
--
--    Ordering by requested_at alone could show either of two rows written in
--    the same statement timestamp. The surrogate key settles it, so "the last
--    HTTP result for this job" means the same thing on every call.
--
--    Job list unchanged from 20260902000002. It is repeated in full because
--    this function names every job explicitly and create or replace has no
--    way to amend one.
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
     order by requests.requested_at desc, requests.id desc
     limit 1
  ) as last_http on true
  order by expected.job_name;
$function$;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to postgres;
grant select, insert, update, delete on private.cron_http_requests to postgres;
grant execute on all functions in schema private to postgres;

commit;
