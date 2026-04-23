drop policy if exists "owner_manages" on public.post_authors;

create policy "owner_inserts_post_authors"
  on public.post_authors for insert
  with check (
    exists (
      select 1
      from public.posts
      where posts.id = post_authors.post_id
        and posts.author_id = auth.uid()
    )
  );

create policy "owner_updates_post_authors"
  on public.post_authors for update
  using (
    exists (
      select 1
      from public.posts
      where posts.id = post_authors.post_id
        and posts.author_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.posts
      where posts.id = post_authors.post_id
        and posts.author_id = auth.uid()
    )
  );

create policy "owner_deletes_post_authors"
  on public.post_authors for delete
  using (
    exists (
      select 1
      from public.posts
      where posts.id = post_authors.post_id
        and posts.author_id = auth.uid()
    )
  );

drop policy if exists "owner_manages_references" on public.post_references;

create policy "owner_inserts_post_references"
  on public.post_references for insert
  with check (
    exists (
      select 1
      from public.posts
      where posts.id = post_references.post_id
        and posts.author_id = auth.uid()
    )
  );

create policy "owner_updates_post_references"
  on public.post_references for update
  using (
    exists (
      select 1
      from public.posts
      where posts.id = post_references.post_id
        and posts.author_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.posts
      where posts.id = post_references.post_id
        and posts.author_id = auth.uid()
    )
  );

create policy "owner_deletes_post_references"
  on public.post_references for delete
  using (
    exists (
      select 1
      from public.posts
      where posts.id = post_references.post_id
        and posts.author_id = auth.uid()
    )
  );
