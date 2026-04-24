ALTER TABLE public.debates
  ADD COLUMN IF NOT EXISTS recap_text text,
  ADD COLUMN IF NOT EXISTS recap_generated_at timestamptz;

CREATE OR REPLACE FUNCTION public.close_debate(p_debate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moderator_id uuid;
BEGIN
  SELECT moderator_id
    INTO v_moderator_id
    FROM public.debates
   WHERE id = p_debate_id;

  IF v_moderator_id IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;

  IF auth.uid() IS DISTINCT FROM v_moderator_id THEN
    RAISE EXCEPTION 'Only the moderator can close this debate.';
  END IF;

  UPDATE public.debates
     SET status = 'closed',
         ends_at = now()
   WHERE id = p_debate_id;
END;
$$;
