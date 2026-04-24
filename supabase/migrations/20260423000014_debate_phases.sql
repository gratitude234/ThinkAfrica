ALTER TABLE public.debates
  ADD COLUMN IF NOT EXISTS current_phase text
  NOT NULL DEFAULT 'opening'
  CHECK (current_phase IN ('opening', 'rebuttal', 'closing'));

CREATE OR REPLACE FUNCTION public.advance_debate_phase(p_debate_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moderator_id uuid;
  v_current_phase text;
  v_next_phase text;
  v_status text;
BEGIN
  SELECT moderator_id, current_phase, status
    INTO v_moderator_id, v_current_phase, v_status
    FROM public.debates
   WHERE id = p_debate_id;

  IF v_current_phase IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;

  IF auth.uid() IS DISTINCT FROM v_moderator_id THEN
    RAISE EXCEPTION 'Only the moderator can advance the phase.';
  END IF;

  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'This debate is closed.';
  END IF;

  v_next_phase := CASE v_current_phase
    WHEN 'opening' THEN 'rebuttal'
    WHEN 'rebuttal' THEN 'closing'
    WHEN 'closing' THEN 'closing'
    ELSE 'opening'
  END;

  UPDATE public.debates
     SET current_phase = v_next_phase
   WHERE id = p_debate_id;

  RETURN v_next_phase;
END;
$$;
