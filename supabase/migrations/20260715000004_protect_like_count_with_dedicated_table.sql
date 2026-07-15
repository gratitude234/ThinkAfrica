-- 20260715000003's column-level REVOKE UPDATE (like_count) does not actually block
-- writes: Postgres's privilege check is "table-level grant OR column-level grant",
-- and Supabase's default project setup already grants table-level INSERT/UPDATE on
-- every public table to `authenticated`, so a column-level revoke on top of that
-- standing table-level grant has no effect. INSERT was never revoked at all either,
-- so like_count could still be set at post-creation time. Rather than hand-maintain
-- a column allow-list (fragile — any future column added to posts and forgotten here
-- silently loses client write access), move the counter into its own table that no
-- client role has INSERT/UPDATE/DELETE on at all; only the SECURITY DEFINER trigger
-- functions below can write to it.

CREATE TABLE IF NOT EXISTS public.post_like_counts (
  post_id uuid PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  like_count integer NOT NULL DEFAULT 0
);

INSERT INTO public.post_like_counts (post_id, like_count)
SELECT id, COALESCE(like_count, 0) FROM public.posts
ON CONFLICT (post_id) DO NOTHING;

ALTER TABLE public.post_like_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Like counts are viewable by everyone" ON public.post_like_counts;
CREATE POLICY "Like counts are viewable by everyone"
  ON public.post_like_counts FOR SELECT USING (true);

REVOKE ALL ON public.post_like_counts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.post_like_counts TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_post_like_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.post_like_counts (post_id, like_count)
  VALUES (new.post_id, 1)
  ON CONFLICT (post_id) DO UPDATE
    SET like_count = public.post_like_counts.like_count + 1;
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_post_like_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.post_like_counts
  SET like_count = GREATEST(like_count - 1, 0)
  WHERE post_id = old.post_id;
  RETURN old;
END;
$$;

-- posts.like_count is now redundant and was never fully protected; drop it so there
-- is exactly one source of truth and no stale/forgeable column left behind.
ALTER TABLE public.posts DROP COLUMN IF EXISTS like_count;
