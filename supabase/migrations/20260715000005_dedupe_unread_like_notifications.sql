-- likeActions.ts previously pre-checked for an existing unread like notification
-- before inserting a new one, but that check ran as the liker via the RLS-bound
-- client, and the notifications SELECT policy only permits reading rows where
-- auth.uid() = user_id (the recipient) -- the liker is never the recipient here,
-- so the check always saw zero rows and never actually deduplicated anything. It
-- was also racy even ignoring RLS (check-then-insert). Enforce this atomically and
-- race-safely at the database level instead: while an unread like notification from
-- a given actor for a given post exists, a second insert for the same trio conflicts
-- and is skipped; once the author reads it (read = true), a new like can notify again.

-- Existing data may already contain duplicate unread like notifications (from the
-- pre-existing double-trigger bug and the ineffective RLS-blind pre-check above), so
-- collapse those to one per (user_id, actor_id, post_id) before the index can enforce
-- uniqueness -- otherwise CREATE UNIQUE INDEX below fails on the existing violations.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, actor_id, post_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.notifications
  WHERE type = 'like' AND read = false
)
DELETE FROM public.notifications
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_unread_like_notification
  ON public.notifications (user_id, actor_id, post_id)
  WHERE type = 'like' AND read = false;
