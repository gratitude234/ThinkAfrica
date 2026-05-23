ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS upvotes integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.comment_votes (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, comment_id)
);

CREATE INDEX IF NOT EXISTS comment_votes_comment_id_idx
  ON public.comment_votes(comment_id);

CREATE INDEX IF NOT EXISTS comments_upvotes_idx
  ON public.comments(upvotes DESC);

ALTER TABLE public.comment_votes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION pg_temp.create_policy_if_missing(
  target_schema text,
  target_table text,
  target_policy text,
  statement text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = target_schema
      AND tablename = target_table
      AND policyname = target_policy
  ) THEN
    EXECUTE statement;
  END IF;
END;
$$;

SELECT pg_temp.create_policy_if_missing('public', 'comment_votes', 'Comment votes are viewable by everyone',
  $$CREATE POLICY "Comment votes are viewable by everyone" ON public.comment_votes FOR SELECT USING (true)$$);

SELECT pg_temp.create_policy_if_missing('public', 'comment_votes', 'Authenticated users can vote on comments',
  $$CREATE POLICY "Authenticated users can vote on comments" ON public.comment_votes FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id)$$);

SELECT pg_temp.create_policy_if_missing('public', 'comment_votes', 'Users can remove their own comment votes',
  $$CREATE POLICY "Users can remove their own comment votes" ON public.comment_votes FOR DELETE USING (auth.uid() = user_id)$$);

CREATE OR REPLACE FUNCTION public.toggle_comment_vote(p_comment_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_voted boolean;
  v_inserted boolean;
  v_upvotes integer;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to vote.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.comments WHERE id = p_comment_id) THEN
    RAISE EXCEPTION 'Comment not found.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.comment_votes
    WHERE user_id = v_user_id
      AND comment_id = p_comment_id
  ) INTO v_voted;

  IF v_voted THEN
    DELETE FROM public.comment_votes
    WHERE user_id = v_user_id
      AND comment_id = p_comment_id;

    UPDATE public.comments
      SET upvotes = greatest(upvotes - 1, 0)
      WHERE id = p_comment_id
      RETURNING upvotes INTO v_upvotes;

    RETURN json_build_object('voted', false, 'upvotes', v_upvotes);
  END IF;

  INSERT INTO public.comment_votes (user_id, comment_id)
  VALUES (v_user_id, p_comment_id)
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_inserted;

  IF NOT coalesce(v_inserted, false) THEN
    SELECT upvotes INTO v_upvotes
    FROM public.comments
    WHERE id = p_comment_id;

    RETURN json_build_object('voted', true, 'upvotes', v_upvotes);
  END IF;

  UPDATE public.comments
    SET upvotes = upvotes + 1
    WHERE id = p_comment_id
    RETURNING upvotes INTO v_upvotes;

  RETURN json_build_object('voted', true, 'upvotes', v_upvotes);
END;
$$;
