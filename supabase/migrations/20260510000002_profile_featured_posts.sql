CREATE TABLE IF NOT EXISTS public.profile_featured_posts (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id),
  UNIQUE (user_id, position)
);

CREATE INDEX IF NOT EXISTS profile_featured_posts_user_position_idx
  ON public.profile_featured_posts(user_id, position);

CREATE INDEX IF NOT EXISTS profile_featured_posts_post_idx
  ON public.profile_featured_posts(post_id);

ALTER TABLE public.profile_featured_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Featured profile work is viewable by everyone"
  ON public.profile_featured_posts FOR SELECT USING (true);

CREATE POLICY "Users can feature their eligible published work"
  ON public.profile_featured_posts FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.posts
      WHERE posts.id = profile_featured_posts.post_id
        AND posts.status = 'published'
        AND (
          posts.author_id = profile_featured_posts.user_id
          OR EXISTS (
            SELECT 1
            FROM public.post_authors
            WHERE post_authors.post_id = profile_featured_posts.post_id
              AND post_authors.user_id = profile_featured_posts.user_id
              AND post_authors.accepted_at IS NOT NULL
          )
        )
    )
  );

CREATE POLICY "Users can update their featured profile work"
  ON public.profile_featured_posts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.posts
      WHERE posts.id = profile_featured_posts.post_id
        AND posts.status = 'published'
        AND (
          posts.author_id = profile_featured_posts.user_id
          OR EXISTS (
            SELECT 1
            FROM public.post_authors
            WHERE post_authors.post_id = profile_featured_posts.post_id
              AND post_authors.user_id = profile_featured_posts.user_id
              AND post_authors.accepted_at IS NOT NULL
          )
        )
    )
  );

CREATE POLICY "Users can remove their featured profile work"
  ON public.profile_featured_posts FOR DELETE
  USING (auth.uid() = user_id);
