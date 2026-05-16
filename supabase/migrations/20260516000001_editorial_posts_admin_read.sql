drop policy if exists "editor_admin_read_editorial_posts" on public.posts;

create policy "editor_admin_read_editorial_posts"
  on public.posts for select
  using (
    status in ('pending', 'pending_revision', 'rejected')
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('editor', 'admin')
    )
  );
