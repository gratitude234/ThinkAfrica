BEGIN;

-- Every state transition an opportunity outcome can undergo.
--
-- The table grants no INSERT or UPDATE to authenticated, so these functions
-- are the only way in. That is what makes the anti-self-award rules
-- unbypassable rather than merely conventional: a client cannot award itself
-- recognition by writing a row, because it cannot write rows.
--
-- All four are SECURITY DEFINER with a fixed empty search path, and each one
-- performs its own authorization check as its first act.

-- ==========================================================================
-- Who may verify
-- ==========================================================================

-- An administrator always may. For an on-platform source, the person who sent
-- the inquiry may verify the outcome of that inquiry. Nobody else, and never
-- the submitter or the profile owner: those are blocked by table constraints
-- as well, so a bug here still cannot produce a self-awarded outcome.
CREATE OR REPLACE FUNCTION public.can_verify_opportunity_outcome(
  p_outcome_id uuid,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.opportunity_outcomes AS outcome
    WHERE outcome.id = p_outcome_id
      AND outcome.submitted_by <> p_actor_id
      AND outcome.profile_id <> p_actor_id
      AND (
        EXISTS (
          SELECT 1
          FROM public.profiles AS actor
          WHERE actor.id = p_actor_id
            AND actor.role = 'admin'
        )
        OR (
          outcome.source_type = 'talent_inquiry'
          AND EXISTS (
            SELECT 1
            FROM public.talent_inquiries AS inquiry
            WHERE inquiry.id = outcome.source_id
              AND inquiry.sender_id = p_actor_id
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_verify_opportunity_outcome(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_verify_opportunity_outcome(uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.can_verify_opportunity_outcome(uuid, uuid) IS
  'Whether an actor may verify an outcome: an administrator, or the sender of the talent inquiry it came from. Never the submitter and never the profile owner.';

-- ==========================================================================
-- Submit
-- ==========================================================================

-- Either side may record an outcome. Neither recording publishes anything.
-- An owner recording their own selection produces an unverified private
-- claim; a provider recording it produces an unconfirmed private claim.
CREATE OR REPLACE FUNCTION public.submit_opportunity_outcome(
  p_profile_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_status text,
  p_opportunity_title text,
  p_organization_name text DEFAULT NULL,
  p_occurred_on date DEFAULT NULL,
  p_evidence_url text DEFAULT NULL,
  p_private_evidence_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_role text;
  v_outcome_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to record an outcome.'
      USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('contacted', 'shortlisted', 'selected', 'completed', 'declined') THEN
    RAISE EXCEPTION 'Choose a valid outcome stage.' USING ERRCODE = '23514';
  END IF;

  IF v_actor = p_profile_id THEN
    v_role := 'owner';
  ELSE
    -- A provider may only record an outcome against a source they are part
    -- of. Without this, anyone could attach a claim to a stranger's profile.
    IF NOT (
      EXISTS (
        SELECT 1 FROM public.profiles AS actor
        WHERE actor.id = v_actor AND actor.role = 'admin'
      )
      OR (
        p_source_type = 'talent_inquiry'
        AND EXISTS (
          SELECT 1 FROM public.talent_inquiries AS inquiry
          WHERE inquiry.id = p_source_id AND inquiry.sender_id = v_actor
        )
      )
    ) THEN
      RAISE EXCEPTION 'You cannot record an outcome for this profile.'
        USING ERRCODE = '42501';
    END IF;
    v_role := 'provider';
  END IF;

  -- Idempotent on the unique stage indexes: a retry updates the detail rather
  -- than creating a second claim.
  INSERT INTO public.opportunity_outcomes AS outcome (
    profile_id, source_type, source_id, status, opportunity_title,
    organization_name, occurred_on, submitted_by, submitted_role,
    evidence_url, private_evidence_note
  )
  VALUES (
    p_profile_id, p_source_type, p_source_id, p_status, btrim(p_opportunity_title),
    NULLIF(btrim(COALESCE(p_organization_name, '')), ''), p_occurred_on, v_actor, v_role,
    NULLIF(btrim(COALESCE(p_evidence_url, '')), ''),
    NULLIF(btrim(COALESCE(p_private_evidence_note, '')), '')
  )
  ON CONFLICT DO NOTHING
  RETURNING outcome.id INTO v_outcome_id;

  IF v_outcome_id IS NULL THEN
    SELECT existing.id INTO v_outcome_id
    FROM public.opportunity_outcomes AS existing
    WHERE existing.profile_id = p_profile_id
      AND existing.source_type = p_source_type
      AND existing.status = p_status
      AND existing.source_id IS NOT DISTINCT FROM p_source_id
    LIMIT 1;
  END IF;

  INSERT INTO public.opportunity_outcome_events (
    outcome_id, actor_id, action, to_status
  )
  VALUES (v_outcome_id, v_actor, 'submitted', p_status);

  -- The other party is told, because an outcome needs both of them to act.
  IF v_role = 'provider' THEN
    INSERT INTO public.notifications (user_id, actor_id, type, message, link)
    VALUES (
      p_profile_id, v_actor, 'opportunity_outcome_recorded',
      'An opportunity outcome was recorded for your profile. Review and confirm it.',
      '/settings/profile#outcomes'
    );
  END IF;

  RETURN v_outcome_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_opportunity_outcome(uuid, text, uuid, text, text, text, date, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_opportunity_outcome(uuid, text, uuid, text, text, text, date, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.submit_opportunity_outcome(uuid, text, uuid, text, text, text, date, text, text) IS
  'Records an opportunity outcome as a private, unverified claim. Owners may record their own; a provider may record only against a source they belong to. Publishes nothing.';

-- ==========================================================================
-- Verify
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.verify_opportunity_outcome(
  p_outcome_id uuid,
  p_verification_source text DEFAULT 'provider'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_status text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_verify_opportunity_outcome(p_outcome_id, v_actor) THEN
    RAISE EXCEPTION 'You are not authorised to verify this outcome.'
      USING ERRCODE = '42501';
  END IF;

  SELECT outcome.status INTO v_status
  FROM public.opportunity_outcomes AS outcome
  WHERE outcome.id = p_outcome_id;

  IF v_status IN ('revoked', 'disputed') THEN
    RAISE EXCEPTION 'A revoked or disputed outcome cannot be verified.'
      USING ERRCODE = '23514';
  END IF;

  -- Idempotent: verifying twice does not move the timestamp or re-notify.
  UPDATE public.opportunity_outcomes AS outcome
  SET verified_by = v_actor,
      verified_at = now(),
      verification_source = p_verification_source,
      updated_at = now()
  WHERE outcome.id = p_outcome_id
    AND outcome.verified_at IS NULL;

  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.opportunity_outcome_events (outcome_id, actor_id, action, to_status)
  VALUES (p_outcome_id, v_actor, 'verified', v_status);

  INSERT INTO public.notifications (user_id, actor_id, type, message, link)
  SELECT outcome.profile_id, v_actor, 'opportunity_outcome_verified',
         'An opportunity outcome on your profile was verified. You can choose to show it publicly.',
         '/settings/profile#outcomes'
  FROM public.opportunity_outcomes AS outcome
  WHERE outcome.id = p_outcome_id
    AND outcome.profile_id <> v_actor;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_opportunity_outcome(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_opportunity_outcome(uuid, text)
  TO authenticated, service_role;

-- ==========================================================================
-- Owner consent and visibility
-- ==========================================================================

-- The owner's own gate. Confirming is not publishing: an owner may confirm an
-- outcome is true and still keep it private, which is the ordinary case for
-- anything they would rather not advertise.
CREATE OR REPLACE FUNCTION public.set_opportunity_outcome_visibility(
  p_outcome_id uuid,
  p_confirm boolean,
  p_public boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_outcome public.opportunity_outcomes;
BEGIN
  SELECT * INTO v_outcome
  FROM public.opportunity_outcomes AS outcome
  WHERE outcome.id = p_outcome_id;

  IF v_outcome.id IS NULL OR v_outcome.profile_id <> v_actor THEN
    RAISE EXCEPTION 'You can only change outcomes on your own profile.'
      USING ERRCODE = '42501';
  END IF;

  IF p_public AND v_outcome.verified_at IS NULL THEN
    RAISE EXCEPTION 'An outcome must be verified before it can be shown publicly.'
      USING ERRCODE = '23514';
  END IF;

  IF p_public AND v_outcome.status NOT IN ('selected', 'completed') THEN
    RAISE EXCEPTION 'Only a selection or a completion can be shown publicly.'
      USING ERRCODE = '23514';
  END IF;

  IF p_public AND v_outcome.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'A revoked outcome cannot be shown publicly.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.opportunity_outcomes AS outcome
  SET owner_confirmed_at = CASE
        WHEN p_confirm THEN COALESCE(outcome.owner_confirmed_at, now())
        ELSE NULL
      END,
      is_public = (p_public AND p_confirm),
      updated_at = now()
  WHERE outcome.id = p_outcome_id;

  INSERT INTO public.opportunity_outcome_events (outcome_id, actor_id, action, to_status)
  VALUES (
    p_outcome_id,
    v_actor,
    CASE WHEN p_public AND p_confirm THEN 'published'
         WHEN p_confirm THEN 'owner_confirmed'
         ELSE 'unpublished' END,
    v_outcome.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_opportunity_outcome_visibility(uuid, boolean, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_opportunity_outcome_visibility(uuid, boolean, boolean)
  TO authenticated, service_role;

-- ==========================================================================
-- Dispute and revoke
-- ==========================================================================

-- Either party may dispute; the outcome goes private immediately and stays
-- that way. Nothing about a dispute is ever public: the reason, the fact of
-- it, and the parties are all withheld.
CREATE OR REPLACE FUNCTION public.dispute_opportunity_outcome(
  p_outcome_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_allowed boolean;
BEGIN
  SELECT (
    outcome.profile_id = v_actor
    OR outcome.submitted_by = v_actor
    OR outcome.verified_by = v_actor
    OR EXISTS (
      SELECT 1 FROM public.profiles AS actor
      WHERE actor.id = v_actor AND actor.role = 'admin'
    )
  )
  INTO v_allowed
  FROM public.opportunity_outcomes AS outcome
  WHERE outcome.id = p_outcome_id;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'You cannot dispute this outcome.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.opportunity_outcomes AS outcome
  SET status = 'disputed',
      is_public = false,
      dispute_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
      updated_at = now()
  WHERE outcome.id = p_outcome_id;

  INSERT INTO public.opportunity_outcome_events (outcome_id, actor_id, action, to_status, note)
  VALUES (p_outcome_id, v_actor, 'disputed', 'disputed', NULLIF(btrim(COALESCE(p_reason, '')), ''));
END;
$$;

REVOKE ALL ON FUNCTION public.dispute_opportunity_outcome(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispute_opportunity_outcome(uuid, text)
  TO authenticated, service_role;

-- Revocation is the verifier's or an administrator's remedy, and it is
-- terminal: the outcome leaves every public aggregate and cannot be
-- re-published without a fresh verification.
CREATE OR REPLACE FUNCTION public.revoke_opportunity_outcome(
  p_outcome_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_allowed boolean;
BEGIN
  SELECT (
    outcome.verified_by = v_actor
    OR outcome.submitted_by = v_actor
    OR EXISTS (
      SELECT 1 FROM public.profiles AS actor
      WHERE actor.id = v_actor AND actor.role = 'admin'
    )
  )
  INTO v_allowed
  FROM public.opportunity_outcomes AS outcome
  WHERE outcome.id = p_outcome_id;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'You cannot revoke this outcome.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.opportunity_outcomes AS outcome
  SET status = 'revoked',
      is_public = false,
      revoked_at = now(),
      revoked_by = v_actor,
      updated_at = now()
  WHERE outcome.id = p_outcome_id;

  INSERT INTO public.opportunity_outcome_events (outcome_id, actor_id, action, to_status, note)
  VALUES (p_outcome_id, v_actor, 'revoked', 'revoked', NULLIF(btrim(COALESCE(p_reason, '')), ''));
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_opportunity_outcome(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_opportunity_outcome(uuid, text)
  TO authenticated, service_role;

COMMIT;
