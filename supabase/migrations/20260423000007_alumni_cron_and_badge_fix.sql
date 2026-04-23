update public.badges
set description = 'Graduated scholar. Part of the ThinkAfrika network for life.'
where id = '00000000-0000-0000-0000-000000000010';

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $sql$
      select cron.unschedule(jobid)
      from cron.job
      where jobname = 'promote-alumni'
    $sql$;

    execute $sql$
      select cron.schedule(
        'promote-alumni',
        '0 1 1 1 *',
        'SELECT public.promote_alumni()'
      )
    $sql$;
  end if;
end
$$;
