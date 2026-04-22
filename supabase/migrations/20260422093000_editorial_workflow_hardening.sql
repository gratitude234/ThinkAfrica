create table if not exists public.post_editor_decisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  round integer not null default 1,
  editor_id uuid not null references public.profiles(id),
  decision text not null check (decision = any (array['accept', 'request_revision', 'reject'])),
  notes text,
  created_at timestamptz not null default now(),
  unique (post_id, round)
);

alter table public.post_versions
  add column if not exists round integer not null default 1,
  add column if not exists version_kind text not null default 'revision',
  add column if not exists submitted_by uuid references public.profiles(id) on delete set null,
  add column if not exists references jsonb not null default '[]'::jsonb,
  add column if not exists authors jsonb not null default '[]'::jsonb;

do $$
declare
  post_versions_constraint record;
begin
  for post_versions_constraint in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'post_versions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%version_kind%'
  loop
    execute format('alter table public.post_versions drop constraint %I', post_versions_constraint.conname);
  end loop;
end $$;

alter table public.post_versions
  add constraint post_versions_version_kind_check
  check (version_kind = any (array['submission', 'revision', 'publication']));

alter table public.posts
  add column if not exists published_version_id uuid references public.post_versions(id) on delete set null;

update public.post_versions
set round = greatest(coalesce(round, 1), 1),
    version_kind = case
      when version_number = 1 then 'submission'
      else 'revision'
    end
where version_kind not in ('submission', 'revision', 'publication')
   or round is null;

insert into public.post_authors (post_id, user_id, display_order, corresponding_author, invited_at, accepted_at)
select
  posts.id,
  posts.author_id,
  0,
  not exists (
    select 1
    from public.post_authors existing_corresponding
    where existing_corresponding.post_id = posts.id
      and existing_corresponding.corresponding_author = true
  ),
  coalesce(posts.created_at, now()),
  coalesce(posts.published_at, posts.created_at, now())
from public.posts
where not exists (
  select 1
  from public.post_authors existing_author
  where existing_author.post_id = posts.id
    and existing_author.user_id = posts.author_id
);

update public.post_authors owner_row
set accepted_at = coalesce(owner_row.accepted_at, posts.published_at, posts.created_at, now())
from public.posts
where owner_row.post_id = posts.id
  and owner_row.user_id = posts.author_id;

create unique index if not exists post_authors_one_corresponding_author_idx
  on public.post_authors(post_id)
  where corresponding_author;

create index if not exists post_editor_decisions_post_round_idx
  on public.post_editor_decisions(post_id, round desc);
create index if not exists post_versions_post_round_kind_idx
  on public.post_versions(post_id, round desc, version_kind);
create index if not exists posts_published_version_idx
  on public.posts(published_version_id)
  where published_version_id is not null;

alter table public.post_editor_decisions enable row level security;

drop policy if exists "editor_admin_manage_decisions" on public.post_editor_decisions;
drop policy if exists "attached_users_read_decisions" on public.post_editor_decisions;

create policy "editor_admin_manage_decisions"
  on public.post_editor_decisions for all
  using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role in ('editor', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role in ('editor', 'admin')
    )
  );

create policy "attached_users_read_decisions"
  on public.post_editor_decisions for select
  using (
    exists (
      select 1
      from public.posts
      where posts.id = post_editor_decisions.post_id
        and posts.author_id = auth.uid()
    )
    or exists (
      select 1
      from public.post_reviews
      where post_reviews.post_id = post_editor_decisions.post_id
        and post_reviews.reviewer_id = auth.uid()
    )
    or exists (
      select 1
      from public.post_authors
      where post_authors.post_id = post_editor_decisions.post_id
        and post_authors.user_id = auth.uid()
    )
  );

drop policy if exists "published_version_public_read" on public.post_versions;
drop policy if exists "attached_reviewer_or_coauthor_read_versions" on public.post_versions;

create policy "published_version_public_read"
  on public.post_versions for select using (
    exists (
      select 1
      from public.posts
      where posts.published_version_id = post_versions.id
        and posts.status = 'published'
    )
  );

create policy "attached_reviewer_or_coauthor_read_versions"
  on public.post_versions for select using (
    exists (
      select 1
      from public.post_reviews
      where post_reviews.post_id = post_versions.post_id
        and post_reviews.reviewer_id = auth.uid()
    )
    or exists (
      select 1
      from public.post_authors
      where post_authors.post_id = post_versions.post_id
        and post_authors.user_id = auth.uid()
    )
  );
