-- Structured notifications can derive display copy from type, actor_id, post_id,
-- and related records. Triggers for follow/like/comment intentionally omit message.
ALTER TABLE public.notifications
  ALTER COLUMN message DROP NOT NULL;
