create or replace function public.is_post_owner(target_post_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.posts
    where id = target_post_id
      and author_id = auth.uid()
  );
$$;

create or replace function public.is_post_reviewer(target_post_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.post_reviews
    where post_id = target_post_id
      and reviewer_id = auth.uid()
  );
$$;

create or replace function public.is_post_coauthor(target_post_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.post_authors
    where post_id = target_post_id
      and user_id = auth.uid()
  );
$$;

drop policy if exists "Published posts are viewable by everyone" on public.posts;

create policy "Published posts are viewable by everyone"
  on public.posts for select using (
    status = 'published'
    or auth.uid() = author_id
    or public.is_post_reviewer(id)
    or public.is_post_coauthor(id)
  );

drop policy if exists "public_read_accepted" on public.post_authors;
drop policy if exists "invitee_read_pending" on public.post_authors;
drop policy if exists "owner_manages" on public.post_authors;
drop policy if exists "owner_inserts_post_authors" on public.post_authors;
drop policy if exists "owner_updates_post_authors" on public.post_authors;
drop policy if exists "owner_deletes_post_authors" on public.post_authors;

create policy "public_read_accepted"
  on public.post_authors for select using (accepted_at is not null);

create policy "invitee_read_pending"
  on public.post_authors for select using (auth.uid() = user_id);

create policy "owner_inserts_post_authors"
  on public.post_authors for insert
  with check (public.is_post_owner(post_id));

create policy "owner_updates_post_authors"
  on public.post_authors for update
  using (public.is_post_owner(post_id))
  with check (public.is_post_owner(post_id));

create policy "owner_deletes_post_authors"
  on public.post_authors for delete
  using (public.is_post_owner(post_id));

drop policy if exists "public_read_published_references" on public.post_references;
drop policy if exists "owner_manages_references" on public.post_references;
drop policy if exists "attached_reviewer_or_coauthor_reads_references" on public.post_references;
drop policy if exists "owner_inserts_post_references" on public.post_references;
drop policy if exists "owner_updates_post_references" on public.post_references;
drop policy if exists "owner_deletes_post_references" on public.post_references;

create policy "public_read_published_references"
  on public.post_references for select using (
    exists (
      select 1
      from public.posts
      where posts.id = post_references.post_id
        and posts.status = 'published'
    )
  );

create policy "owner_inserts_post_references"
  on public.post_references for insert
  with check (public.is_post_owner(post_id));

create policy "owner_updates_post_references"
  on public.post_references for update
  using (public.is_post_owner(post_id))
  with check (public.is_post_owner(post_id));

create policy "owner_deletes_post_references"
  on public.post_references for delete
  using (public.is_post_owner(post_id));

create policy "attached_reviewer_or_coauthor_reads_references"
  on public.post_references for select using (
    public.is_post_reviewer(post_id)
    or public.is_post_coauthor(post_id)
  );
