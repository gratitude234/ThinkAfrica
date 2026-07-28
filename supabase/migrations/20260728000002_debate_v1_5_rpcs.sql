-- Debate V1.5 authoritative write paths.

CREATE OR REPLACE FUNCTION public.count_words_v1_5(p_content text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN btrim(COALESCE(p_content, '')) = '' THEN 0
    ELSE cardinality(regexp_split_to_array(btrim(p_content), '\s+'))
  END;
$$;

REVOKE ALL ON FUNCTION public.count_words_v1_5(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.can_manage_debate_v1_5(
  p_debate_id uuid,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_actor_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.debates d
    LEFT JOIN public.profiles p ON p.id = p_actor_id
    WHERE d.id = p_debate_id
      AND (
        d.moderator_id = p_actor_id
        OR COALESCE(p.role, 'student') IN ('editor', 'admin')
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_debate_v1_5(uuid, uuid) FROM PUBLIC;

-- Catalog-tolerant legacy/V2 discriminator. This keeps the hardened legacy
-- RPCs valid whether the dormant format_version column exists or not.
CREATE OR REPLACE FUNCTION public.debate_format_version_or_one(p_debate_id uuid)
RETURNS smallint
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_version smallint := 1;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'debates'
      AND column_name = 'format_version'
  ) THEN
    EXECUTE
      'SELECT COALESCE(format_version, 1)::smallint FROM public.debates WHERE id = $1'
      INTO v_version
      USING p_debate_id;
  END IF;
  RETURN COALESCE(v_version, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.debate_format_version_or_one(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_debate_v1_5(
  p_title text,
  p_description text,
  p_tags text[],
  p_recruiting_deadline timestamptz,
  p_opening_deadline timestamptz,
  p_rebuttal_deadline timestamptz,
  p_voting_deadline timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_debate_id uuid;
  v_can_create boolean := false;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Suspended accounts cannot create debates.';
  END IF;

  SELECT verified = true OR role IN ('editor', 'admin')
    INTO v_can_create
    FROM public.profiles
   WHERE id = v_actor_id;
  IF NOT COALESCE(v_can_create, false) THEN
    RAISE EXCEPTION 'Only verified users, editors, or admins can create debates.';
  END IF;

  IF length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 10 AND 160 THEN
    RAISE EXCEPTION 'Title must be between 10 and 160 characters.';
  END IF;
  IF length(btrim(COALESCE(p_description, ''))) NOT BETWEEN 30 AND 900 THEN
    RAISE EXCEPTION 'Context must be between 30 and 900 characters.';
  END IF;
  IF cardinality(COALESCE(p_tags, ARRAY[]::text[])) > 6 THEN
    RAISE EXCEPTION 'A debate can have at most 6 tags.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_tags, ARRAY[]::text[])) AS tag(value)
    WHERE length(btrim(COALESCE(value, ''))) NOT BETWEEN 1 AND 40
  ) THEN
    RAISE EXCEPTION 'Every tag must be between 1 and 40 characters.';
  END IF;
  IF p_recruiting_deadline IS NULL
     OR p_opening_deadline IS NULL
     OR p_rebuttal_deadline IS NULL
     OR p_voting_deadline IS NULL
     OR p_recruiting_deadline <= now()
     OR NOT (
       p_recruiting_deadline < p_opening_deadline
       AND p_opening_deadline < p_rebuttal_deadline
       AND p_rebuttal_deadline < p_voting_deadline
     ) THEN
    RAISE EXCEPTION 'Deadlines must be in the future and strictly increasing.';
  END IF;

  INSERT INTO public.debates (
    title, description, tags, moderator_id, status, current_phase,
    debate_variant, recruiting_deadline, opening_deadline,
    rebuttal_deadline, voting_deadline
  )
  VALUES (
    btrim(p_title), NULLIF(btrim(COALESCE(p_description, '')), ''),
    ARRAY(
      SELECT btrim(value)
      FROM unnest(COALESCE(p_tags, ARRAY[]::text[])) AS tag(value)
    ),
    v_actor_id, 'open', 'recruiting',
    'v1_5', p_recruiting_deadline, p_opening_deadline,
    p_rebuttal_deadline, p_voting_deadline
  )
  RETURNING id INTO v_debate_id;

  RETURN v_debate_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_debate_v1_5(
  text, text, text[], timestamptz, timestamptz, timestamptz, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_debate_v1_5(
  text, text, text[], timestamptz, timestamptz, timestamptz, timestamptz
) TO authenticated;

CREATE OR REPLACE FUNCTION public.invite_debater_v1_5(
  p_debate_id uuid,
  p_user_id uuid,
  p_stance text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_debate public.debates%ROWTYPE;
  v_invitee_name text;
  v_invitee_exists boolean := false;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Suspended accounts cannot manage debate invitations.';
  END IF;
  IF p_stance NOT IN ('for', 'against') THEN
    RAISE EXCEPTION 'Invalid stance.';
  END IF;

  SELECT * INTO v_debate
    FROM public.debates d
   WHERE d.id = p_debate_id
   FOR UPDATE;
  IF NOT FOUND OR v_debate.debate_variant <> 'v1_5' THEN
    RAISE EXCEPTION 'Debate V1.5 not found.';
  END IF;
  IF NOT public.can_manage_debate_v1_5(p_debate_id, v_actor_id) THEN
    RAISE EXCEPTION 'Only the moderator or an admin can invite debaters.';
  END IF;
  IF v_debate.status <> 'open' OR v_debate.current_phase <> 'recruiting' THEN
    RAISE EXCEPTION 'Debaters can only be invited during recruiting.';
  END IF;
  IF v_debate.recruiting_deadline IS NULL OR now() > v_debate.recruiting_deadline THEN
    RAISE EXCEPTION 'The recruiting deadline has passed.';
  END IF;
  IF (
    SELECT count(*)
    FROM public.notifications n
    WHERE n.actor_id = v_actor_id
      AND n.type = 'debate_invitation'
      AND n.link = '/debates/' || p_debate_id
      AND n.created_at > now() - interval '1 hour'
  ) >= 12 THEN
    RAISE EXCEPTION 'Too many invitation changes. Please wait before trying again.';
  END IF;
  IF p_user_id = v_debate.moderator_id THEN
    RAISE EXCEPTION 'The moderator cannot occupy a debate side.';
  END IF;

  SELECT true, COALESCE(full_name, username, 'Participant')
    INTO v_invitee_exists, v_invitee_name
    FROM public.profiles
   WHERE id = p_user_id
     AND suspended_at IS NULL;
  IF NOT v_invitee_exists THEN
    RAISE EXCEPTION 'Invitee not found or unavailable.';
  END IF;

  INSERT INTO public.debate_slots_v1_5 (
    debate_id, stance, user_id, status, invited_by
  )
  VALUES (p_debate_id, p_stance, p_user_id, 'invited', v_actor_id);

  INSERT INTO public.notifications (user_id, type, message, link, actor_id)
  VALUES (
    p_user_id,
    'debate_invitation',
    'You were invited to argue ' || upper(p_stance) || ' in "' || v_debate.title || '".',
    '/debates/' || p_debate_id,
    v_actor_id
  );

  RETURN jsonb_build_object(
    'outcome', 'invited',
    'stance', p_stance,
    'user_id', p_user_id,
    'name', v_invitee_name
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'That side is occupied or this person already has a slot.';
END;
$$;

REVOKE ALL ON FUNCTION public.invite_debater_v1_5(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_debater_v1_5(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_debate_invitation_v1_5(
  p_debate_id uuid,
  p_accept boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_debate public.debates%ROWTYPE;
  v_slot public.debate_slots_v1_5%ROWTYPE;
  v_next_status text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Suspended accounts cannot respond to debate invitations.';
  END IF;

  SELECT * INTO v_debate
    FROM public.debates d
   WHERE d.id = p_debate_id
   FOR UPDATE;
  IF NOT FOUND OR v_debate.debate_variant <> 'v1_5' THEN
    RAISE EXCEPTION 'Debate V1.5 not found.';
  END IF;
  IF v_debate.status <> 'open' OR v_debate.current_phase <> 'recruiting' THEN
    RAISE EXCEPTION 'This invitation is no longer open.';
  END IF;
  IF v_debate.recruiting_deadline IS NULL OR now() > v_debate.recruiting_deadline THEN
    RAISE EXCEPTION 'The recruiting deadline has passed.';
  END IF;
  SELECT * INTO v_slot
    FROM public.debate_slots_v1_5 s
   WHERE s.debate_id = p_debate_id
     AND s.user_id = v_actor_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found.';
  END IF;

  v_next_status := CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END;
  IF v_slot.status = v_next_status THEN
    RETURN jsonb_build_object(
      'outcome', 'already_' || v_next_status,
      'status', v_next_status,
      'stance', v_slot.stance
    );
  END IF;
  IF v_slot.status <> 'invited' THEN
    RAISE EXCEPTION 'This invitation has already been answered.';
  END IF;

  UPDATE public.debate_slots_v1_5
     SET status = v_next_status,
         responded_at = now()
   WHERE debate_id = p_debate_id
     AND stance = v_slot.stance;

  IF v_debate.moderator_id IS NOT NULL
     AND v_debate.moderator_id <> v_actor_id THEN
    INSERT INTO public.notifications (user_id, type, message, link)
    VALUES (
      v_debate.moderator_id,
      'debate_invitation_response',
      'A debater ' || v_next_status || ' the ' || upper(v_slot.stance)
        || ' invitation for "' || v_debate.title || '".',
      '/debates/' || p_debate_id
    );
  END IF;

  RETURN jsonb_build_object(
    'outcome', v_next_status,
    'status', v_next_status,
    'stance', v_slot.stance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_debate_invitation_v1_5(uuid, boolean)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_debate_invitation_v1_5(uuid, boolean)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_debate_invitation_v1_5(
  p_debate_id uuid,
  p_stance text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_debate public.debates%ROWTYPE;
  v_slot public.debate_slots_v1_5%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Suspended accounts cannot manage debate invitations.';
  END IF;
  IF p_stance NOT IN ('for', 'against') THEN
    RAISE EXCEPTION 'Invalid stance.';
  END IF;

  SELECT * INTO v_debate
    FROM public.debates d
   WHERE d.id = p_debate_id
   FOR UPDATE;
  IF NOT FOUND OR v_debate.debate_variant <> 'v1_5' THEN
    RAISE EXCEPTION 'Debate V1.5 not found.';
  END IF;
  IF NOT public.can_manage_debate_v1_5(p_debate_id, v_actor_id) THEN
    RAISE EXCEPTION 'Only the moderator or an admin can revoke invitations.';
  END IF;
  IF v_debate.status <> 'open' OR v_debate.current_phase <> 'recruiting' THEN
    RAISE EXCEPTION 'Invitations can only be revoked during recruiting.';
  END IF;
  IF v_debate.recruiting_deadline IS NULL OR now() > v_debate.recruiting_deadline THEN
    RAISE EXCEPTION 'The recruiting deadline has passed.';
  END IF;

  SELECT * INTO v_slot
    FROM public.debate_slots_v1_5 s
   WHERE s.debate_id = p_debate_id
     AND s.stance = p_stance
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'already_empty', 'stance', p_stance);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.debate_arguments da
    WHERE da.debate_id = p_debate_id
      AND da.author_id = v_slot.user_id
  ) THEN
    RAISE EXCEPTION 'A debater who has submitted an argument cannot be removed.';
  END IF;

  DELETE FROM public.debate_slots_v1_5
   WHERE debate_id = p_debate_id
     AND stance = p_stance;

  INSERT INTO public.notifications (user_id, type, message, link, actor_id)
  VALUES (
    v_slot.user_id,
    'debate_invitation',
    'Your ' || upper(p_stance) || ' invitation for "' || v_debate.title
      || '" was withdrawn by the moderator.',
    '/debates/' || p_debate_id,
    v_actor_id
  );

  RETURN jsonb_build_object(
    'outcome', 'revoked',
    'stance', p_stance,
    'user_id', v_slot.user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_debate_invitation_v1_5(uuid, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_debate_invitation_v1_5(uuid, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.start_debate_v1_5(
  p_debate_id uuid,
  p_expected_phase text DEFAULT 'recruiting'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_debate public.debates%ROWTYPE;
  v_ready_count integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Suspended accounts cannot start debates.';
  END IF;
  SELECT * INTO v_debate
    FROM public.debates d
   WHERE d.id = p_debate_id
   FOR UPDATE;
  IF NOT FOUND OR v_debate.debate_variant <> 'v1_5' THEN
    RAISE EXCEPTION 'Debate V1.5 not found.';
  END IF;
  IF NOT public.can_manage_debate_v1_5(p_debate_id, v_actor_id) THEN
    RAISE EXCEPTION 'Only the moderator or an admin can start this debate.';
  END IF;
  IF v_debate.current_phase IS DISTINCT FROM p_expected_phase THEN
    RETURN jsonb_build_object(
      'outcome', 'stale_no_op',
      'current_phase', v_debate.current_phase
    );
  END IF;
  IF v_debate.status <> 'open' OR v_debate.current_phase <> 'recruiting' THEN
    RAISE EXCEPTION 'Only a recruiting debate can be started.';
  END IF;
  IF v_debate.opening_deadline IS NULL OR now() > v_debate.opening_deadline THEN
    RAISE EXCEPTION 'The opening submission deadline has passed.';
  END IF;

  SELECT count(*) INTO v_ready_count
    FROM public.debate_slots_v1_5 s
   WHERE s.debate_id = p_debate_id
     AND s.status = 'accepted';
  IF v_ready_count <> 2 THEN
    RAISE EXCEPTION 'Both FOR and AGAINST debaters must accept before starting.';
  END IF;

  UPDATE public.debates
     SET status = 'active',
         current_phase = 'opening'
   WHERE id = p_debate_id;

  INSERT INTO public.notifications (user_id, type, message, link)
  SELECT s.user_id, 'debate_phase_advanced',
         'Opening arguments are now active for "' || v_debate.title || '".',
         '/debates/' || p_debate_id
    FROM public.debate_slots_v1_5 s
   WHERE s.debate_id = p_debate_id
     AND s.status = 'accepted'
     AND s.user_id <> v_actor_id;

  RETURN jsonb_build_object('outcome', 'started', 'current_phase', 'opening');
END;
$$;

REVOKE ALL ON FUNCTION public.start_debate_v1_5(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_debate_v1_5(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.advance_debate_phase_v1_5(
  p_debate_id uuid,
  p_expected_phase text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_debate public.debates%ROWTYPE;
  v_next_phase text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Suspended accounts cannot advance debates.';
  END IF;
  SELECT * INTO v_debate
    FROM public.debates d
   WHERE d.id = p_debate_id
   FOR UPDATE;
  IF NOT FOUND OR v_debate.debate_variant <> 'v1_5' THEN
    RAISE EXCEPTION 'Debate V1.5 not found.';
  END IF;
  IF NOT public.can_manage_debate_v1_5(p_debate_id, v_actor_id) THEN
    RAISE EXCEPTION 'Only the moderator or an admin can advance this debate.';
  END IF;
  IF v_debate.current_phase IS DISTINCT FROM p_expected_phase THEN
    RETURN jsonb_build_object(
      'outcome', 'stale_no_op',
      'current_phase', v_debate.current_phase
    );
  END IF;
  IF v_debate.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active debate can advance.';
  END IF;

  v_next_phase := CASE v_debate.current_phase
    WHEN 'opening' THEN 'rebuttal'
    WHEN 'rebuttal' THEN 'voting'
    ELSE NULL
  END;
  IF v_next_phase IS NULL THEN
    RAISE EXCEPTION 'This phase cannot be advanced.';
  END IF;

  UPDATE public.debates
     SET current_phase = v_next_phase
   WHERE id = p_debate_id;

  INSERT INTO public.notifications (user_id, type, message, link)
  SELECT s.user_id, 'debate_phase_advanced',
         CASE v_next_phase
           WHEN 'rebuttal' THEN 'Rebuttals are now active for "' || v_debate.title || '".'
           ELSE 'Final community voting is now open for "' || v_debate.title || '".'
         END,
         '/debates/' || p_debate_id
    FROM public.debate_slots_v1_5 s
   WHERE s.debate_id = p_debate_id
     AND s.status = 'accepted'
     AND s.user_id <> v_actor_id;

  RETURN jsonb_build_object('outcome', 'advanced', 'current_phase', v_next_phase);
END;
$$;

REVOKE ALL ON FUNCTION public.advance_debate_phase_v1_5(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_debate_phase_v1_5(uuid, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_debate_argument_v1_5(
  p_debate_id uuid,
  p_content text,
  p_sources jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_debate public.debates%ROWTYPE;
  v_slot public.debate_slots_v1_5%ROWTYPE;
  v_round_number integer;
  v_word_limit integer;
  v_word_count integer;
  v_argument_id uuid;
  v_source jsonb;
  v_url text;
  v_title text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Suspended accounts cannot submit debate arguments.';
  END IF;

  SELECT * INTO v_debate
    FROM public.debates d
   WHERE d.id = p_debate_id
   FOR UPDATE;
  IF NOT FOUND OR v_debate.debate_variant <> 'v1_5' THEN
    RAISE EXCEPTION 'Debate V1.5 not found.';
  END IF;
  IF v_debate.status <> 'active'
     OR v_debate.current_phase NOT IN ('opening', 'rebuttal') THEN
    RAISE EXCEPTION 'Arguments are not open in the current phase.';
  END IF;
  IF v_debate.current_phase = 'opening'
     AND (v_debate.opening_deadline IS NULL OR now() > v_debate.opening_deadline) THEN
    RAISE EXCEPTION 'The opening submission deadline has passed.';
  END IF;
  IF v_debate.current_phase = 'rebuttal'
     AND (v_debate.rebuttal_deadline IS NULL OR now() > v_debate.rebuttal_deadline) THEN
    RAISE EXCEPTION 'The rebuttal submission deadline has passed.';
  END IF;

  SELECT * INTO v_slot
    FROM public.debate_slots_v1_5 s
   WHERE s.debate_id = p_debate_id
     AND s.user_id = v_actor_id
   FOR UPDATE;
  IF NOT FOUND OR v_slot.status <> 'accepted' THEN
    RAISE EXCEPTION 'Only an accepted debater may submit an argument.';
  END IF;

  v_round_number := CASE v_debate.current_phase WHEN 'opening' THEN 1 ELSE 2 END;
  v_word_limit := CASE v_debate.current_phase WHEN 'opening' THEN 300 ELSE 200 END;
  v_word_count := public.count_words_v1_5(p_content);
  IF v_word_count = 0 THEN
    RAISE EXCEPTION 'Argument content is required.';
  END IF;
  IF v_word_count > v_word_limit THEN
    RAISE EXCEPTION 'This phase has a % word limit.', v_word_limit;
  END IF;
  IF length(p_content) > 5000 THEN
    RAISE EXCEPTION 'Argument content cannot exceed 5000 characters.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.debate_arguments da
    WHERE da.debate_id = p_debate_id
      AND da.author_id = v_actor_id
      AND da.round_number = v_round_number
  ) THEN
    RAISE EXCEPTION 'Your submission for this phase is already final.';
  END IF;

  IF p_sources IS NULL THEN
    p_sources := '[]'::jsonb;
  END IF;
  IF jsonb_typeof(p_sources) <> 'array' THEN
    RAISE EXCEPTION 'Sources must be a JSON array.';
  END IF;
  IF jsonb_array_length(p_sources) > 5 THEN
    RAISE EXCEPTION 'An argument can cite at most 5 sources.';
  END IF;

  FOR v_source IN SELECT value FROM jsonb_array_elements(p_sources)
  LOOP
    IF jsonb_typeof(v_source) <> 'object' THEN
      RAISE EXCEPTION 'Each source must be an object.';
    END IF;
    v_url := btrim(COALESCE(v_source->>'url', ''));
    v_title := NULLIF(btrim(COALESCE(v_source->>'title', '')), '');
    IF length(v_url) NOT BETWEEN 1 AND 2048
       OR v_url !~* '^https?://[^[:space:]]+$' THEN
      RAISE EXCEPTION 'Every source must use a valid http or https URL.';
    END IF;
    IF length(COALESCE(v_title, '')) > 300 THEN
      RAISE EXCEPTION 'A source title cannot exceed 300 characters.';
    END IF;
  END LOOP;

  INSERT INTO public.debate_arguments (
    debate_id, author_id, content, round_number, stance
  )
  VALUES (
    p_debate_id, v_actor_id, btrim(p_content), v_round_number, v_slot.stance
  )
  RETURNING id INTO v_argument_id;

  FOR v_source IN SELECT value FROM jsonb_array_elements(p_sources)
  LOOP
    INSERT INTO public.debate_argument_sources_v1 (
      argument_id, url, title, added_by
    )
    VALUES (
      v_argument_id,
      btrim(v_source->>'url'),
      NULLIF(btrim(COALESCE(v_source->>'title', '')), ''),
      v_actor_id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'outcome', 'submitted',
    'argument_id', v_argument_id,
    'phase', v_debate.current_phase,
    'round_number', v_round_number,
    'stance', v_slot.stance,
    'word_count', v_word_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_debate_argument_v1_5(uuid, text, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_debate_argument_v1_5(uuid, text, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.cast_final_vote_v1_5(
  p_debate_id uuid,
  p_vote text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_debate public.debates%ROWTYPE;
  v_existing text;
  v_result_vote text;
  v_for_count integer;
  v_against_count integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Suspended accounts cannot vote.';
  END IF;
  IF p_vote NOT IN ('for', 'against') THEN
    RAISE EXCEPTION 'Invalid vote.';
  END IF;

  SELECT * INTO v_debate
    FROM public.debates d
   WHERE d.id = p_debate_id
   FOR UPDATE;
  IF NOT FOUND OR v_debate.debate_variant <> 'v1_5' THEN
    RAISE EXCEPTION 'Debate V1.5 not found.';
  END IF;
  IF v_debate.status <> 'active' OR v_debate.current_phase <> 'voting' THEN
    RAISE EXCEPTION 'Final voting is not open.';
  END IF;
  IF v_debate.voting_deadline IS NULL OR now() > v_debate.voting_deadline THEN
    RAISE EXCEPTION 'The final voting deadline has passed.';
  END IF;

  SELECT vote INTO v_existing
    FROM public.debate_motion_votes
   WHERE debate_id = p_debate_id
     AND user_id = v_actor_id
   FOR UPDATE;

  IF v_existing = p_vote THEN
    DELETE FROM public.debate_motion_votes
     WHERE debate_id = p_debate_id
       AND user_id = v_actor_id;
    v_result_vote := NULL;
  ELSIF v_existing IS NOT NULL THEN
    UPDATE public.debate_motion_votes
       SET vote = p_vote
     WHERE debate_id = p_debate_id
       AND user_id = v_actor_id;
    v_result_vote := p_vote;
  ELSE
    INSERT INTO public.debate_motion_votes (debate_id, user_id, vote)
    VALUES (p_debate_id, v_actor_id, p_vote);
    v_result_vote := p_vote;
  END IF;

  SELECT
    count(*) FILTER (WHERE vote = 'for'),
    count(*) FILTER (WHERE vote = 'against')
    INTO v_for_count, v_against_count
    FROM public.debate_motion_votes
   WHERE debate_id = p_debate_id;

  UPDATE public.debates
     SET motion_for_count = v_for_count,
         motion_against_count = v_against_count
   WHERE id = p_debate_id;

  RETURN jsonb_build_object(
    'outcome', 'recorded',
    'user_vote', v_result_vote,
    'for_count', v_for_count,
    'against_count', v_against_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cast_final_vote_v1_5(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cast_final_vote_v1_5(uuid, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.extend_deadline_v1_5(
  p_debate_id uuid,
  p_which text,
  p_new_deadline timestamptz,
  p_expected_current_value timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_debate public.debates%ROWTYPE;
  v_current timestamptz;
  v_previous timestamptz;
  v_next timestamptz;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Suspended accounts cannot extend debate deadlines.';
  END IF;
  IF p_which NOT IN ('recruiting', 'opening', 'rebuttal', 'voting') THEN
    RAISE EXCEPTION 'Invalid deadline.';
  END IF;
  IF p_new_deadline IS NULL OR p_new_deadline <= now() THEN
    RAISE EXCEPTION 'The new deadline must be in the future.';
  END IF;

  SELECT * INTO v_debate
    FROM public.debates d
   WHERE d.id = p_debate_id
   FOR UPDATE;
  IF NOT FOUND OR v_debate.debate_variant <> 'v1_5' THEN
    RAISE EXCEPTION 'Debate V1.5 not found.';
  END IF;
  IF NOT public.can_manage_debate_v1_5(p_debate_id, v_actor_id) THEN
    RAISE EXCEPTION 'Only the moderator or an admin can extend a deadline.';
  END IF;
  IF v_debate.status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'A finished debate cannot be extended.';
  END IF;
  IF (
    v_debate.status = 'open'
    AND (v_debate.current_phase <> 'recruiting' OR p_which <> 'recruiting')
  ) OR (
    v_debate.status = 'active'
    AND p_which <> v_debate.current_phase
  ) THEN
    RAISE EXCEPTION 'Only the current phase deadline can be extended.';
  END IF;

  v_current := CASE p_which
    WHEN 'recruiting' THEN v_debate.recruiting_deadline
    WHEN 'opening' THEN v_debate.opening_deadline
    WHEN 'rebuttal' THEN v_debate.rebuttal_deadline
    ELSE v_debate.voting_deadline
  END;
  IF v_current IS DISTINCT FROM p_expected_current_value THEN
    RETURN jsonb_build_object(
      'outcome', 'stale_no_op',
      'deadline', v_current
    );
  END IF;
  IF p_new_deadline <= v_current THEN
    RAISE EXCEPTION 'A deadline extension must move the deadline later.';
  END IF;

  v_previous := CASE p_which
    WHEN 'opening' THEN v_debate.recruiting_deadline
    WHEN 'rebuttal' THEN v_debate.opening_deadline
    WHEN 'voting' THEN v_debate.rebuttal_deadline
    ELSE NULL
  END;
  v_next := CASE p_which
    WHEN 'recruiting' THEN v_debate.opening_deadline
    WHEN 'opening' THEN v_debate.rebuttal_deadline
    WHEN 'rebuttal' THEN v_debate.voting_deadline
    ELSE NULL
  END;
  IF v_previous IS NOT NULL AND p_new_deadline <= v_previous THEN
    RAISE EXCEPTION 'The new deadline must remain after the previous deadline.';
  END IF;
  IF v_next IS NOT NULL AND p_new_deadline >= v_next THEN
    RAISE EXCEPTION 'The new deadline must remain before the next deadline.';
  END IF;

  UPDATE public.debates
     SET recruiting_deadline = CASE WHEN p_which = 'recruiting' THEN p_new_deadline ELSE recruiting_deadline END,
         opening_deadline = CASE WHEN p_which = 'opening' THEN p_new_deadline ELSE opening_deadline END,
         rebuttal_deadline = CASE WHEN p_which = 'rebuttal' THEN p_new_deadline ELSE rebuttal_deadline END,
         voting_deadline = CASE WHEN p_which = 'voting' THEN p_new_deadline ELSE voting_deadline END
   WHERE id = p_debate_id;

  RETURN jsonb_build_object(
    'outcome', 'extended',
    'which', p_which,
    'deadline', p_new_deadline
  );
END;
$$;

REVOKE ALL ON FUNCTION public.extend_deadline_v1_5(
  uuid, text, timestamptz, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extend_deadline_v1_5(
  uuid, text, timestamptz, timestamptz
) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_debate_v1_5(
  p_debate_id uuid,
  p_expected_phase text DEFAULT 'voting'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_debate public.debates%ROWTYPE;
  v_for_count integer;
  v_against_count integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Suspended accounts cannot complete debates.';
  END IF;
  SELECT * INTO v_debate
    FROM public.debates d
   WHERE d.id = p_debate_id
   FOR UPDATE;
  IF NOT FOUND OR v_debate.debate_variant <> 'v1_5' THEN
    RAISE EXCEPTION 'Debate V1.5 not found.';
  END IF;
  IF NOT public.can_manage_debate_v1_5(p_debate_id, v_actor_id) THEN
    RAISE EXCEPTION 'Only the moderator or an admin can complete this debate.';
  END IF;
  IF v_debate.current_phase IS DISTINCT FROM p_expected_phase THEN
    RETURN jsonb_build_object(
      'outcome', 'stale_no_op',
      'current_phase', v_debate.current_phase
    );
  END IF;
  IF v_debate.status <> 'active' OR v_debate.current_phase <> 'voting' THEN
    RAISE EXCEPTION 'Only a voting debate can be completed.';
  END IF;

  SELECT
    count(*) FILTER (WHERE vote = 'for'),
    count(*) FILTER (WHERE vote = 'against')
    INTO v_for_count, v_against_count
    FROM public.debate_motion_votes
   WHERE debate_id = p_debate_id;

  UPDATE public.debates
     SET status = 'closed',
         current_phase = 'completed',
         ends_at = now(),
         motion_for_count = v_for_count,
         motion_against_count = v_against_count,
         recap_status = 'pending',
         recap_error = NULL
   WHERE id = p_debate_id;

  RETURN jsonb_build_object(
    'outcome', 'completed',
    'current_phase', 'completed',
    'recap_status', 'pending',
    'for_count', v_for_count,
    'against_count', v_against_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_debate_v1_5(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_debate_v1_5(uuid, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_debate_v1_5(
  p_debate_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_debate public.debates%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Suspended accounts cannot cancel debates.';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = ''
     OR length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'A cancellation reason between 1 and 500 characters is required.';
  END IF;

  SELECT * INTO v_debate
    FROM public.debates d
   WHERE d.id = p_debate_id
   FOR UPDATE;
  IF NOT FOUND OR v_debate.debate_variant <> 'v1_5' THEN
    RAISE EXCEPTION 'Debate V1.5 not found.';
  END IF;
  IF NOT public.can_manage_debate_v1_5(p_debate_id, v_actor_id) THEN
    RAISE EXCEPTION 'Only the moderator or an admin can cancel this debate.';
  END IF;
  IF v_debate.status = 'cancelled' THEN
    RETURN jsonb_build_object('outcome', 'already_cancelled');
  END IF;
  IF v_debate.status = 'closed' THEN
    RAISE EXCEPTION 'A completed debate cannot be cancelled.';
  END IF;

  UPDATE public.debates
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_actor_id,
         cancellation_reason = btrim(p_reason),
         ends_at = now()
   WHERE id = p_debate_id;

  INSERT INTO public.notifications (user_id, type, message, link)
  SELECT s.user_id, 'debate_cancelled',
         'The debate "' || v_debate.title || '" was cancelled: ' || btrim(p_reason),
         '/debates/' || p_debate_id
    FROM public.debate_slots_v1_5 s
   WHERE s.debate_id = p_debate_id
     AND s.user_id <> v_actor_id;

  RETURN jsonb_build_object(
    'outcome', 'cancelled',
    'reason', btrim(p_reason)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_debate_v1_5(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_debate_v1_5(uuid, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.remind_debate_voters_v1_5(p_debate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_debate public.debates%ROWTYPE;
  v_sent integer := 0;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Suspended accounts cannot remind voters.';
  END IF;
  SELECT * INTO v_debate
    FROM public.debates d
   WHERE d.id = p_debate_id
   FOR UPDATE;
  IF NOT FOUND OR v_debate.debate_variant <> 'v1_5' THEN
    RAISE EXCEPTION 'Debate V1.5 not found.';
  END IF;
  IF NOT public.can_manage_debate_v1_5(p_debate_id, v_actor_id) THEN
    RAISE EXCEPTION 'Only the moderator or an admin can remind voters.';
  END IF;
  IF v_debate.status <> 'active' OR v_debate.current_phase <> 'voting' THEN
    RAISE EXCEPTION 'Voter reminders are only available during voting.';
  END IF;
  IF v_debate.voting_deadline IS NULL OR now() > v_debate.voting_deadline THEN
    RAISE EXCEPTION 'The final voting deadline has passed.';
  END IF;
  IF v_debate.last_voter_reminder_at IS NOT NULL
     AND v_debate.last_voter_reminder_at > now() - interval '6 hours' THEN
    RAISE EXCEPTION 'Voters can be reminded once every 6 hours.';
  END IF;

  WITH recipients AS (
    SELECT DISTINCT recipient_id
    FROM (
      SELECT s.user_id AS recipient_id
      FROM public.debate_slots_v1_5 s
      WHERE s.debate_id = p_debate_id AND s.status = 'accepted'
      UNION
      SELECT dv.user_id
      FROM public.debate_votes dv
      JOIN public.debate_arguments da ON da.id = dv.argument_id
      WHERE da.debate_id = p_debate_id
    ) candidates
    WHERE recipient_id <> v_actor_id
      AND NOT EXISTS (
        SELECT 1 FROM public.debate_motion_votes mv
        WHERE mv.debate_id = p_debate_id
          AND mv.user_id = recipient_id
      )
  ),
  inserted AS (
    INSERT INTO public.notifications (user_id, type, message, link)
    SELECT recipient_id, 'debate_phase_advanced',
           'Final voting is open for "' || v_debate.title || '".',
           '/debates/' || p_debate_id
      FROM recipients
    RETURNING 1
  )
  SELECT count(*) INTO v_sent FROM inserted;

  UPDATE public.debates
     SET last_voter_reminder_at = now()
   WHERE id = p_debate_id;

  RETURN jsonb_build_object('outcome', 'sent', 'recipients', v_sent);
END;
$$;

REVOKE ALL ON FUNCTION public.remind_debate_voters_v1_5(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remind_debate_voters_v1_5(uuid)
  TO authenticated;

-- Shared argument upvote RPC. Lock the argument before reading/toggling and
-- always derive the denormalised counter from the source-of-truth rows.
CREATE OR REPLACE FUNCTION public.toggle_debate_vote(p_argument_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_debate_id uuid;
  v_debate public.debates%ROWTYPE;
  v_voted boolean;
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;
  IF public.is_suspended() THEN
    RETURN json_build_object('error', 'Suspended accounts cannot upvote arguments.');
  END IF;

  SELECT da.debate_id
    INTO v_debate_id
    FROM public.debate_arguments da
   WHERE da.id = p_argument_id;
  IF v_debate_id IS NULL THEN
    RETURN json_build_object('error', 'Argument not found');
  END IF;

  -- Every V1.5 writer locks debate first, then its child row. Matching that
  -- order prevents a concurrent close/cancel from racing an upvote.
  SELECT * INTO v_debate
    FROM public.debates d
   WHERE d.id = v_debate_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Debate not found');
  END IF;
  PERFORM 1
    FROM public.debate_arguments da
   WHERE da.id = p_argument_id
     AND da.debate_id = v_debate_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Argument not found');
  END IF;
  IF public.debate_format_version_or_one(v_debate_id) = 2 THEN
    RETURN json_build_object(
      'error', 'This debate uses Debate V2. Use toggle_debate_reaction_v2 instead.'
    );
  END IF;
  IF v_debate.status IN ('closed', 'cancelled') THEN
    RETURN json_build_object('error', 'This debate is closed.');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.debate_votes
    WHERE user_id = v_user_id AND argument_id = p_argument_id
  ) INTO v_voted;

  IF v_voted THEN
    DELETE FROM public.debate_votes
     WHERE user_id = v_user_id
       AND argument_id = p_argument_id;
  ELSE
    INSERT INTO public.debate_votes (user_id, argument_id)
    VALUES (v_user_id, p_argument_id);
  END IF;

  SELECT count(*) INTO v_count
    FROM public.debate_votes
   WHERE argument_id = p_argument_id;
  UPDATE public.debate_arguments SET upvotes = v_count
   WHERE id = p_argument_id;

  RETURN json_build_object('voted', NOT v_voted);
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_debate_vote(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_debate_vote(uuid) TO authenticated;

-- Harden the five legacy lifecycle RPCs against V1.5 while retaining dormant
-- V2 rejection through the catalog-tolerant helper above. Apart from the new
-- debate_variant rejection, each body intentionally preserves the latest
-- pre-V1.5 definition line-for-line in validation order, return shape, and
-- phase fallback behavior. In particular, advance_debate_phase keeps its
-- historical ELSE -> opening fallback. Do not fold these into the V1.5
-- manager helper or add locks/suspension checks without a separate legacy
-- product decision.
CREATE OR REPLACE FUNCTION public.join_debate(p_debate_id uuid, p_stance text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_status text;
  v_variant text;
  v_existing_stance text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_stance NOT IN ('for', 'against') THEN
    RAISE EXCEPTION 'Invalid stance.';
  END IF;

  SELECT status, debate_variant
    INTO v_status, v_variant
    FROM public.debates
   WHERE id = p_debate_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;

  IF v_variant = 'v1_5' THEN
    RAISE EXCEPTION 'This debate uses invitations. A moderator must invite you.';
  END IF;

  IF public.debate_format_version_or_one(p_debate_id) = 2 THEN
    RAISE EXCEPTION 'This debate uses Debate V2. Use join_debate_v2 instead.';
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

CREATE OR REPLACE FUNCTION public.cast_motion_vote(p_debate_id uuid, p_vote text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing text;
  v_status text;
  v_variant text;
  v_for_count integer;
  v_against_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_vote NOT IN ('for', 'against') THEN
    RAISE EXCEPTION 'Invalid vote.';
  END IF;

  SELECT status, debate_variant
    INTO v_status, v_variant
    FROM public.debates
   WHERE id = p_debate_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;

  IF v_variant = 'v1_5' THEN
    RAISE EXCEPTION 'This debate uses final voting. Use cast_final_vote_v1_5 instead.';
  END IF;

  IF public.debate_format_version_or_one(p_debate_id) = 2 THEN
    RAISE EXCEPTION 'This debate uses Debate V2. Use cast_debate_ballot_v2 instead.';
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
    count(*) FILTER (WHERE vote = 'for'),
    count(*) FILTER (WHERE vote = 'against')
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
  v_variant text;
  v_round_duration integer;
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT moderator_id, status, debate_variant, round_duration_minutes
    INTO v_moderator_id, v_status, v_variant, v_round_duration
    FROM public.debates
   WHERE id = p_debate_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;

  IF v_variant = 'v1_5' THEN
    RAISE EXCEPTION 'This debate uses Debate V1.5. Use start_debate_v1_5 instead.';
  END IF;

  IF public.debate_format_version_or_one(p_debate_id) = 2 THEN
    RAISE EXCEPTION 'This debate uses Debate V2. Use start_debate_v2 instead.';
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
           now() + make_interval(
             mins => GREATEST(COALESCE(v_round_duration, 5), 1) * 3
           )
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
  v_variant text;
  v_role text;
BEGIN
  SELECT moderator_id, current_phase, status, debate_variant
    INTO v_moderator_id, v_current_phase, v_status, v_variant
    FROM public.debates
   WHERE id = p_debate_id;

  IF v_current_phase IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;

  IF v_variant = 'v1_5' THEN
    RAISE EXCEPTION 'This debate uses Debate V1.5. Use advance_debate_phase_v1_5 instead.';
  END IF;

  IF public.debate_format_version_or_one(p_debate_id) = 2 THEN
    RAISE EXCEPTION 'This debate uses Debate V2. Use advance_debate_round_v2 instead.';
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
  v_variant text;
  v_role text;
BEGIN
  SELECT moderator_id, debate_variant
    INTO v_moderator_id, v_variant
    FROM public.debates
   WHERE id = p_debate_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;

  IF v_variant = 'v1_5' THEN
    RAISE EXCEPTION 'This debate uses Debate V1.5. Use complete_debate_v1_5 instead.';
  END IF;

  IF public.debate_format_version_or_one(p_debate_id) = 2 THEN
    RAISE EXCEPTION 'This debate uses Debate V2. Use close_debate_v2 instead.';
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

REVOKE ALL ON FUNCTION public.join_debate(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_debate(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.cast_motion_vote(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cast_motion_vote(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.start_debate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_debate(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.advance_debate_phase(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_debate_phase(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.close_debate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_debate(uuid) TO authenticated;
