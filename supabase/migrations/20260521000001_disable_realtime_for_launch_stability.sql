do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime drop table public.notifications;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'debate_arguments'
  ) then
    alter publication supabase_realtime drop table public.debate_arguments;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'webinar_questions'
  ) then
    alter publication supabase_realtime drop table public.webinar_questions;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS posts_in_response_to_idx
  ON public.posts(in_response_to)
  WHERE in_response_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS posts_published_at_idx
  ON public.posts(published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS post_references_post_idx
  ON public.post_references(post_id);
