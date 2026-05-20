-- Reader engagement email notifications are now created from server actions.
-- Drop only the comment/follow triggers to avoid duplicate in-app notifications.

DROP TRIGGER IF EXISTS on_comment_insert ON public.comments;
DROP TRIGGER IF EXISTS on_follow_insert ON public.follows;
