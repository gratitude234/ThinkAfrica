-- Debate v1 polish: trusted creation, explicit start lifecycle, and moderator/admin controls.

DROP POLICY IF EXISTS "Authenticated users can create debates" ON public.debates;

CREATE POLICY "Verified users and editors can create debates"
  ON public.debates FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND auth.uid() = moderator_id
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND (
          verified = true
          OR role IN ('editor', 'admin')
        )
    )
  );

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
        AND status = 'active'
    )
    AND EXISTS (
      SELECT 1
      FROM public.debate_participants
      WHERE debate_id = public.debate_arguments.debate_id
        AND user_id = public.debate_arguments.author_id
        AND stance = public.debate_arguments.stance
    )
  );

CREATE OR REPLACE FUNCTION public.start_debate(p_debate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_moderator_id uuid;
  v_status text;
  v_round_duration integer;
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT moderator_id, status, round_duration_minutes
    INTO v_moderator_id, v_status, v_round_duration
    FROM public.debates
   WHERE id = p_debate_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;

  SELECT role INTO v_role
    FROM public.profiles
   WHERE id = v_user_id;

  IF v_user_id IS DISTINCT FROM v_moderator_id
     AND COALESCE(v_role, 'student') NOT IN ('editor', 'admin') THEN
    RAISE EXCEPTION 'Only the moderator or an admin can start this debate.';
  END IF;

  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'This debate is closed.';
  END IF;

  UPDATE public.debates
     SET status = 'active',
         current_phase = 'opening',
         ends_at = COALESCE(
           ends_at,
           now() + make_interval(mins => GREATEST(COALESCE(v_round_duration, 5), 1) * 3)
         )
   WHERE id = p_debate_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_debate_phase(p_debate_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_moderator_id uuid;
  v_current_phase text;
  v_next_phase text;
  v_status text;
  v_role text;
BEGIN
  SELECT moderator_id, current_phase, status
    INTO v_moderator_id, v_current_phase, v_status
    FROM public.debates
   WHERE id = p_debate_id;

  IF v_current_phase IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;

  SELECT role INTO v_role
    FROM public.profiles
   WHERE id = v_user_id;

  IF v_user_id IS DISTINCT FROM v_moderator_id
     AND COALESCE(v_role, 'student') NOT IN ('editor', 'admin') THEN
    RAISE EXCEPTION 'Only the moderator or an admin can advance the phase.';
  END IF;

  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'This debate is closed.';
  END IF;

  IF v_status = 'open' THEN
    PERFORM public.start_debate(p_debate_id);
    RETURN 'opening';
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

CREATE OR REPLACE FUNCTION public.close_debate(p_debate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_moderator_id uuid;
  v_role text;
BEGIN
  SELECT moderator_id
    INTO v_moderator_id
    FROM public.debates
   WHERE id = p_debate_id;

  IF v_moderator_id IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;

  SELECT role INTO v_role
    FROM public.profiles
   WHERE id = v_user_id;

  IF v_user_id IS DISTINCT FROM v_moderator_id
     AND COALESCE(v_role, 'student') NOT IN ('editor', 'admin') THEN
    RAISE EXCEPTION 'Only the moderator or an admin can close this debate.';
  END IF;

  UPDATE public.debates
     SET status = 'closed',
         ends_at = now()
   WHERE id = p_debate_id;
END;
$$;
