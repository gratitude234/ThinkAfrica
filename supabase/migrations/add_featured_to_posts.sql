ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_posts_featured
  ON public.posts(featured) WHERE featured = true;
