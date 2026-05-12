CREATE INDEX IF NOT EXISTS posts_published_recency_idx
  ON public.posts(published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS posts_published_type_recency_idx
  ON public.posts(type, published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS posts_published_author_recency_idx
  ON public.posts(author_id, published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS follows_follower_following_idx
  ON public.follows(follower_id, following_id);

CREATE INDEX IF NOT EXISTS bookmarks_post_id_idx
  ON public.bookmarks(post_id);
