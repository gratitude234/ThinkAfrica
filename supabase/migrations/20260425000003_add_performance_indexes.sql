CREATE INDEX IF NOT EXISTS idx_likes_post_id
  ON public.likes(post_id);

CREATE INDEX IF NOT EXISTS idx_follows_following_id
  ON public.follows(following_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, created_at DESC)
  WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_posts_author_status
  ON public.posts(author_id, status);
