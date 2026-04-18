-- Speed up like-count aggregations by post
CREATE INDEX IF NOT EXISTS idx_likes_post_id
  ON public.likes(post_id);

-- Speed up follower count queries on profile and dashboard pages
CREATE INDEX IF NOT EXISTS idx_follows_following_id
  ON public.follows(following_id);

-- Speed up unread notification queries (partial index — only unread rows)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, created_at DESC)
  WHERE read = false;

-- Speed up author+status filtering on dashboard and profile pages
CREATE INDEX IF NOT EXISTS idx_posts_author_status
  ON public.posts(author_id, status);
