-- Phase 1 of the notification UX work: per-notification dismissal.
--
-- Until now the only way to clear anything out of the inbox was the bulk
-- "Mark all read" button -- there was no per-row dismiss, and no undo. Dismissal
-- is modelled as a soft delete (dismissed_at) rather than a DELETE for two
-- reasons:
--
--   1. Undo. 20260715000007_restrict_notification_inserts_to_admin.sql removed the
--      client INSERT policy on this table (deliberately -- it was forgeable), so a
--      hard delete would be unrecoverable from the client. Clearing dismissed_at
--      is an UPDATE on a row the user already owns, which the existing
--      "Users can update their own notifications" policy already permits, so undo
--      needs no new policy and no new privilege.
--   2. No new DELETE policy has to be granted to authenticated clients at all.
alter table public.notifications
  add column if not exists dismissed_at timestamptz;

-- The inbox reads "my active notifications, newest first". Partial index so
-- dismissed rows stay out of the scan entirely.
create index if not exists notifications_user_active_idx
  on public.notifications (user_id, created_at desc)
  where dismissed_at is null;

-- uniq_unread_like_notification (20260715000005) suppresses a second like
-- notification from the same actor on the same post while an unread one already
-- exists. A dismissed row must not keep suppressing fresh likes forever, so
-- narrow the predicate to active rows.
--
-- The application also sets read = true when dismissing (dismissing implies the
-- user saw it), which keeps rows out of this predicate on its own; narrowing the
-- index is the durable guarantee rather than a behaviour the UI has to remember.
--
-- CREATE UNIQUE INDEX IF NOT EXISTS will not alter an existing index's predicate,
-- so drop and recreate. The new predicate is strictly narrower than the old one,
-- so any data that satisfied the old uniqueness constraint satisfies this one --
-- the rebuild cannot fail on pre-existing violations.
drop index if exists uniq_unread_like_notification;

create unique index if not exists uniq_unread_like_notification
  on public.notifications (user_id, actor_id, post_id)
  where type = 'like' and read = false and dismissed_at is null;
