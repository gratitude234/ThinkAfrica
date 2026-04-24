CREATE TABLE IF NOT EXISTS public.debate_participants (
  debate_id uuid NOT NULL REFERENCES public.debates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stance text NOT NULL CHECK (stance IN ('for', 'against')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (debate_id, user_id)
);

CREATE INDEX IF NOT EXISTS debate_participants_debate_idx
  ON public.debate_participants(debate_id);

CREATE INDEX IF NOT EXISTS debate_participants_user_idx
  ON public.debate_participants(user_id);

ALTER TABLE public.debate_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants are viewable by everyone"
  ON public.debate_participants FOR SELECT USING (true);

CREATE POLICY "Authenticated users can join a debate once"
  ON public.debate_participants FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.debates
      WHERE id = debate_id
        AND status <> 'closed'
    )
  );

CREATE OR REPLACE FUNCTION public.join_debate(
  p_debate_id uuid,
  p_stance text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_status text;
  v_existing_stance text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_stance NOT IN ('for', 'against') THEN
    RAISE EXCEPTION 'Invalid stance.';
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

  SELECT stance
    INTO v_existing_stance
    FROM public.debate_participants
   WHERE debate_id = p_debate_id
     AND user_id = v_user_id;

  IF v_existing_stance IS NOT NULL THEN
    RETURN v_existing_stance;
  END IF;

  INSERT INTO public.debate_participants (debate_id, user_id, stance)
  VALUES (p_debate_id, v_user_id, p_stance);

  RETURN p_stance;
END;
$$;

DROP POLICY IF EXISTS "Authenticated users can submit arguments" ON public.debate_arguments;

CREATE POLICY "Authenticated users can submit arguments"
  ON public.debate_arguments FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND auth.uid() = author_id
    AND stance IN ('for', 'against')
    AND EXISTS (
      SELECT 1
      FROM public.debates
      WHERE id = debate_id
        AND status <> 'closed'
    )
    AND EXISTS (
      SELECT 1
      FROM public.debate_participants
      WHERE debate_id = public.debate_arguments.debate_id
        AND user_id = public.debate_arguments.author_id
        AND stance = public.debate_arguments.stance
    )
  );
