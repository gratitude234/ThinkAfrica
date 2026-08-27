begin;

drop function if exists public.__temporary_provision_indegenius_cron(text, text);

notify pgrst, 'reload schema';

commit;
