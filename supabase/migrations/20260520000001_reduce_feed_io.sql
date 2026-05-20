CREATE INDEX IF NOT EXISTS posts_featured_published_recency_idx
  ON public.posts(published_at DESC)
  WHERE status = 'published' AND featured = true;

CREATE INDEX IF NOT EXISTS posts_published_views_recency_idx
  ON public.posts(view_count DESC, published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS post_authors_accepted_post_order_idx
  ON public.post_authors(post_id, display_order)
  WHERE accepted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS activation_events_user_event_created_idx
  ON public.activation_events(user_id, event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS comments_author_created_idx
  ON public.comments(author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS debate_arguments_author_created_idx
  ON public.debate_arguments(author_id, created_at DESC);
