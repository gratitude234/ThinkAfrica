CREATE TABLE IF NOT EXISTS public.debate_motion_votes (
  debate_id uuid NOT NULL REFERENCES public.debates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vote text NOT NULL CHECK (vote IN ('for', 'against')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (debate_id, user_id)
);

CREATE INDEX IF NOT EXISTS debate_motion_votes_debate_idx
  ON public.debate_motion_votes(debate_id);

ALTER TABLE public.debate_motion_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Motion votes are viewable by everyone"
  ON public.debate_motion_votes FOR SELECT USING (true);

CREATE POLICY "Authenticated users can vote on a motion"
  ON public.debate_motion_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.debates
      WHERE id = debate_id
        AND status <> 'closed'
    )
  );

ALTER TABLE public.debates
  ADD COLUMN IF NOT EXISTS motion_for_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motion_against_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.cast_motion_vote(
  p_debate_id uuid,
  p_vote text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing text;
  v_status text;
  v_for_count integer;
  v_against_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_vote NOT IN ('for', 'against') THEN
    RAISE EXCEPTION 'Invalid vote.';
  END IF;

  SELECT status
    INTO v_status
    FROM public.debates
   WHERE id = p_debate_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;

  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'This debate is closed.';
  END IF;

  SELECT vote
    INTO v_existing
    FROM public.debate_motion_votes
   WHERE debate_id = p_debate_id
     AND user_id = v_user_id;

  IF v_existing IS NOT NULL THEN
    IF v_existing = p_vote THEN
      DELETE FROM public.debate_motion_votes
       WHERE debate_id = p_debate_id
         AND user_id = v_user_id;
      p_vote := NULL;
    ELSE
      UPDATE public.debate_motion_votes
         SET vote = p_vote
       WHERE debate_id = p_debate_id
         AND user_id = v_user_id;
    END IF;
  ELSE
    INSERT INTO public.debate_motion_votes (debate_id, user_id, vote)
    VALUES (p_debate_id, v_user_id, p_vote);
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE vote = 'for'),
    COUNT(*) FILTER (WHERE vote = 'against')
    INTO v_for_count, v_against_count
    FROM public.debate_motion_votes
   WHERE debate_id = p_debate_id;

  UPDATE public.debates
     SET motion_for_count = v_for_count,
         motion_against_count = v_against_count
   WHERE id = p_debate_id;

  RETURN json_build_object(
    'user_vote', p_vote,
    'for_count', v_for_count,
    'against_count', v_against_count
  );
END;
$$;
