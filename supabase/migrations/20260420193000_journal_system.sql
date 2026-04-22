create extension if not exists "pgcrypto";

alter table public.profiles
  add column if not exists role text not null default 'student';

update public.profiles
set role = 'reviewer'
where verified_type in ('faculty', 'institution')
  and role = 'student';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role = any (array['student', 'reviewer', 'editor', 'admin']));

create table if not exists public.submission_tracks (
  post_type text primary key,
  requires_review boolean not null default false,
  min_reviewers integer not null default 1,
  allow_revision boolean not null default true,
  description text
);

insert into public.submission_tracks (post_type, requires_review, min_reviewers, allow_revision, description)
values
  ('blog', false, 0, false, 'Published after basic editorial check'),
  ('essay', false, 1, true, 'Light editorial review'),
  ('research', true, 2, true, 'Full peer review, 2 reviewers required'),
  ('policy_brief', true, 1, true, 'Editorial + one external reviewer')
on conflict (post_type) do update
set requires_review = excluded.requires_review,
    min_reviewers = excluded.min_reviewers,
    allow_revision = excluded.allow_revision,
    description = excluded.description;

create table if not exists public.post_reviews (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  round integer not null default 1,
  recommendation text check (recommendation = any (array['accept', 'revise', 'reject'])),
  notes text,
  submitted_at timestamptz,
  assigned_at timestamptz not null default now(),
  unique (post_id, reviewer_id, round)
);

create table if not exists public.post_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  version_number integer not null,
  content text not null,
  title text not null,
  excerpt text,
  author_note text,
  created_at timestamptz not null default now(),
  unique (post_id, version_number)
);

create table if not exists public.post_authors (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  display_order integer not null default 0,
  corresponding_author boolean not null default false,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (post_id, user_id)
);

create table if not exists public.post_references (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  display_order integer not null default 0,
  ref_type text check (ref_type = any (array['journal', 'book', 'website', 'report', 'other'])),
  authors text,
  title text not null,
  year integer,
  source text,
  url text,
  doi text,
  raw text
);

alter table public.posts
  add column if not exists current_round integer not null default 1,
  add column if not exists citation_id text,
  add column if not exists revision_due_at timestamptz;

do $$
declare
  posts_constraint record;
begin
  for posts_constraint in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'posts'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%status%'
  loop
    execute format('alter table public.posts drop constraint %I', posts_constraint.conname);
  end loop;
end $$;

alter table public.posts
  add constraint posts_status_check
  check (status = any (array['draft', 'pending', 'pending_revision', 'published', 'rejected']));

alter table public.posts
  drop constraint if exists posts_citation_id_key;

alter table public.posts
  add constraint posts_citation_id_key unique (citation_id);

alter table public.notifications
  add column if not exists message text,
  add column if not exists link text,
  add column if not exists actor_id uuid references public.profiles(id) on delete set null,
  add column if not exists post_id uuid references public.posts(id) on delete cascade,
  add column if not exists comment_id uuid references public.comments(id) on delete cascade;

do $$
declare
  notification_constraint record;
begin
  for notification_constraint in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'notifications'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%type%'
  loop
    execute format('alter table public.notifications drop constraint %I', notification_constraint.conname);
  end loop;
end $$;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type = any (
      array[
        'like',
        'comment',
        'follow',
        'debate_reply',
        'debate_argument',
        'fellowship',
        'badge',
        'post_approved',
        'post_rejected',
        'post_published',
        'review_assigned',
        'revision_requested',
        'co_author_invite',
        'co_author_accepted',
        'co_author_declined'
      ]
    )
  );

create index if not exists submission_tracks_requires_review_idx
  on public.submission_tracks(requires_review);
create index if not exists post_reviews_post_round_idx
  on public.post_reviews(post_id, round);
create index if not exists post_reviews_reviewer_idx
  on public.post_reviews(reviewer_id, submitted_at);
create index if not exists post_versions_post_idx
  on public.post_versions(post_id, version_number desc);
create index if not exists post_authors_user_idx
  on public.post_authors(user_id, accepted_at);
create index if not exists post_authors_post_idx
  on public.post_authors(post_id, display_order);
create index if not exists post_references_post_idx
  on public.post_references(post_id, display_order);
create index if not exists posts_citation_id_idx
  on public.posts(citation_id)
  where citation_id is not null;
create index if not exists posts_review_state_idx
  on public.posts(status, type, current_round);

alter table public.submission_tracks enable row level security;
alter table public.post_reviews enable row level security;
alter table public.post_versions enable row level security;
alter table public.post_authors enable row level security;
alter table public.post_references enable row level security;

drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

drop policy if exists "Published posts are viewable by everyone" on public.posts;
create policy "Published posts are viewable by everyone"
  on public.posts for select using (
    status = 'published'
    or auth.uid() = author_id
    or exists (
      select 1
      from public.post_reviews
      where post_reviews.post_id = posts.id
        and post_reviews.reviewer_id = auth.uid()
    )
    or exists (
      select 1
      from public.post_authors
      where post_authors.post_id = posts.id
        and post_authors.user_id = auth.uid()
    )
  );

drop policy if exists "Users can read their own notifications" on public.notifications;
drop policy if exists "Users can update their own notifications" on public.notifications;
drop policy if exists "System can insert notifications" on public.notifications;
drop policy if exists "Users see own notifications" on public.notifications;

create policy "Users can read their own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users can update their own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);

create policy "System can insert notifications"
  on public.notifications for insert
  with check (true);

drop policy if exists "submission_tracks_public_read" on public.submission_tracks;
create policy "submission_tracks_public_read"
  on public.submission_tracks for select
  using (true);

drop policy if exists "reviewer_can_read_assigned" on public.post_reviews;
drop policy if exists "reviewer_can_submit" on public.post_reviews;
drop policy if exists "editor_admin_full" on public.post_reviews;

create policy "reviewer_can_read_assigned"
  on public.post_reviews for select
  using (auth.uid() = reviewer_id);

create policy "reviewer_can_submit"
  on public.post_reviews for update
  using (auth.uid() = reviewer_id)
  with check (auth.uid() = reviewer_id);

create policy "editor_admin_full"
  on public.post_reviews for all
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

drop policy if exists "author_can_read_own" on public.post_versions;
drop policy if exists "editor_admin_read_all" on public.post_versions;

create policy "author_can_read_own"
  on public.post_versions for select using (
    exists (
      select 1
      from public.posts
      where posts.id = post_versions.post_id
        and posts.author_id = auth.uid()
    )
  );

create policy "editor_admin_read_all"
  on public.post_versions for select using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role in ('editor', 'admin')
    )
  );

drop policy if exists "public_read_accepted" on public.post_authors;
drop policy if exists "invitee_read_pending" on public.post_authors;
drop policy if exists "owner_manages" on public.post_authors;

create policy "public_read_accepted"
  on public.post_authors for select using (accepted_at is not null);

create policy "invitee_read_pending"
  on public.post_authors for select using (auth.uid() = user_id);

create policy "owner_manages"
  on public.post_authors for all using (
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

drop policy if exists "public_read_published_references" on public.post_references;
drop policy if exists "owner_manages_references" on public.post_references;
drop policy if exists "attached_reviewer_or_coauthor_reads_references" on public.post_references;

create policy "public_read_published_references"
  on public.post_references for select using (
    exists (
      select 1
      from public.posts
      where posts.id = post_references.post_id
        and posts.status = 'published'
    )
  );

create policy "owner_manages_references"
  on public.post_references for all using (
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

create policy "attached_reviewer_or_coauthor_reads_references"
  on public.post_references for select using (
    exists (
      select 1
      from public.post_reviews
      where post_reviews.post_id = post_references.post_id
        and post_reviews.reviewer_id = auth.uid()
    )
    or exists (
      select 1
      from public.post_authors
      where post_authors.post_id = post_references.post_id
        and post_authors.user_id = auth.uid()
    )
  );
