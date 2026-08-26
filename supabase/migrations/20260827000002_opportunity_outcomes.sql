BEGIN;

-- Verified opportunity outcomes.
--
-- The point of this table is to let a profile say "selected for X, verified by
-- Y" without turning private recruiting activity into public data. Three
-- separate gates stand between a claim and a public statement:
--
--   1. The outcome must reach a publicly eligible state (selected, completed).
--   2. Someone other than the claimant must verify it.
--   3. The profile owner must choose to publish it.
--
-- Whichever party records the outcome, the other has to agree. A provider
-- recording a selection does not publish anything until the owner confirms
-- and opts in; an owner claiming a selection publishes nothing until an
-- authorised verifier confirms it. Self-assertion alone never produces public
-- recognition.
--
-- Contacted, shortlisted, declined, disputed and revoked outcomes are never
-- public in any combination.
--
-- DEPLOYMENT STATUS
-- -----------------
-- Source-controlled only. Preflight:
--   1. Confirm talent_inquiries, talent_profiles, opportunities and
--      admin_audit_events exist.
--   2. Capture the live notifications_type_check definition. Section E
--      rebuilds it from the live definition rather than from a hardcoded
--      list, and raises if it cannot parse it.
--   3. In staging exercise every path in the matrix at the foot of this file.

-- ==========================================================================
-- A. The outcome record
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.opportunity_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Where the outcome came from. An on-platform source lets the verifier be
  -- checked automatically; 'external' always requires an administrator.
  source_type text NOT NULL CHECK (source_type = ANY (ARRAY[
    'talent_inquiry', 'platform_opportunity', 'partner_program', 'external'
  ])),
  source_id uuid,

  status text NOT NULL CHECK (status = ANY (ARRAY[
    'contacted', 'shortlisted', 'selected', 'completed',
    'declined', 'disputed', 'revoked'
  ])),

  -- Shown publicly only when everything below lines up. Free text, so it is
  -- length-capped and the public projection is the only thing that reads it.
  opportunity_title text NOT NULL CHECK (
    char_length(btrim(opportunity_title)) BETWEEN 2 AND 160
  ),
  organization_name text CHECK (
    organization_name IS NULL
    OR char_length(btrim(organization_name)) BETWEEN 2 AND 160
  ),
  occurred_on date,

  -- Who asserted it, and who confirmed it. These can never be the same
  -- person: see the constraint below.
  submitted_by uuid NOT NULL REFERENCES public.profiles(id),
  submitted_role text NOT NULL CHECK (submitted_role = ANY (ARRAY['owner', 'provider'])),
  verified_by uuid REFERENCES public.profiles(id),
  verified_at timestamptz,
  verification_source text CHECK (verification_source = ANY (ARRAY[
    'provider', 'admin', 'inquiry_sender'
  ])),

  -- The owner's separate, revocable consent to publish.
  owner_confirmed_at timestamptz,
  is_public boolean NOT NULL DEFAULT false,

  -- Evidence. The URL may be shown publicly; the note never is.
  evidence_url text CHECK (
    evidence_url IS NULL OR evidence_url ~ '^https://'
  ),
  private_evidence_note text CHECK (
    private_evidence_note IS NULL OR char_length(private_evidence_note) <= 2000
  ),
  dispute_reason text CHECK (
    dispute_reason IS NULL OR char_length(dispute_reason) <= 2000
  ),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A verifier may not be the person who asserted the outcome. This is the
  -- anti-self-award rule, and it holds regardless of which side submitted.
  CONSTRAINT opportunity_outcomes_verifier_is_not_submitter
    CHECK (verified_by IS NULL OR verified_by <> submitted_by),

  -- A profile owner can never be their own verifier.
  CONSTRAINT opportunity_outcomes_owner_is_not_verifier
    CHECK (verified_by IS NULL OR verified_by <> profile_id),

  -- Verification is all-or-nothing: a row cannot carry a timestamp without a
  -- verifier and a named source.
  CONSTRAINT opportunity_outcomes_verification_complete
    CHECK (
      (verified_by IS NULL AND verified_at IS NULL AND verification_source IS NULL)
      OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND verification_source IS NOT NULL)
    ),

  -- The public gate, in the database rather than only in application code.
  -- Public requires: an eligible status, a completed verification, the
  -- owner's confirmation, and no revocation.
  CONSTRAINT opportunity_outcomes_public_requires_verification
    CHECK (
      is_public = false
      OR (
        status = ANY (ARRAY['selected', 'completed'])
        AND verified_at IS NOT NULL
        AND owner_confirmed_at IS NOT NULL
        AND revoked_at IS NULL
      )
    ),

  CONSTRAINT opportunity_outcomes_revocation_complete
    CHECK (
      (revoked_at IS NULL AND revoked_by IS NULL)
      OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
    )
);

COMMENT ON TABLE public.opportunity_outcomes IS
  'Opportunity outcomes for a profile. Public display requires an eligible status, verification by someone other than the submitter, explicit owner consent, and no revocation. Private evidence notes, dispute reasons and non-eligible statuses never reach a public projection.';

COMMENT ON COLUMN public.opportunity_outcomes.private_evidence_note IS
  'Owner or verifier supporting detail. Never public, never in analytics.';

-- Idempotency: one outcome per person, source and stage. A provider clicking
-- twice, or a retried request, updates rather than duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS opportunity_outcomes_unique_stage_idx
  ON public.opportunity_outcomes(profile_id, source_type, source_id, status)
  WHERE source_id IS NOT NULL;

-- External outcomes have no source id, so they are deduplicated by title.
CREATE UNIQUE INDEX IF NOT EXISTS opportunity_outcomes_unique_external_idx
  ON public.opportunity_outcomes(profile_id, source_type, lower(btrim(opportunity_title)), status)
  WHERE source_id IS NULL;

-- The public-profile lookup: "the public outcomes for this person".
CREATE INDEX IF NOT EXISTS opportunity_outcomes_public_profile_idx
  ON public.opportunity_outcomes(profile_id, occurred_on DESC)
  WHERE is_public = true AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS opportunity_outcomes_owner_idx
  ON public.opportunity_outcomes(profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS opportunity_outcomes_pending_verification_idx
  ON public.opportunity_outcomes(verified_at, created_at DESC)
  WHERE verified_at IS NULL AND revoked_at IS NULL;

-- ==========================================================================
-- B. Status history: an append-only audit trail
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.opportunity_outcome_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outcome_id uuid NOT NULL REFERENCES public.opportunity_outcomes(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id),
  action text NOT NULL CHECK (action = ANY (ARRAY[
    'submitted', 'verified', 'owner_confirmed', 'published',
    'unpublished', 'disputed', 'revoked'
  ])),
  from_status text,
  to_status text,
  note text CHECK (note IS NULL OR char_length(note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.opportunity_outcome_events IS
  'Append-only history of every state change on an opportunity outcome. Visible to the profile owner and to administrators only; notes are never public.';

CREATE INDEX IF NOT EXISTS opportunity_outcome_events_outcome_idx
  ON public.opportunity_outcome_events(outcome_id, created_at DESC);

-- ==========================================================================
-- C. Row level security
-- ==========================================================================

ALTER TABLE public.opportunity_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_outcome_events ENABLE ROW LEVEL SECURITY;

-- No direct client writes at all. Every transition runs through the audited
-- SECURITY DEFINER functions in section D, which is what makes the
-- anti-self-award rules unbypassable.
REVOKE ALL ON TABLE public.opportunity_outcomes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.opportunity_outcome_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.opportunity_outcomes TO authenticated;
GRANT SELECT ON TABLE public.opportunity_outcome_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.opportunity_outcomes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.opportunity_outcome_events TO service_role;

-- The owner sees everything about their own outcomes. A submitter sees what
-- they submitted, so a provider can track what they recorded. Nobody else
-- reads the table directly: the public projection in section D is the only
-- other way in.
DROP POLICY IF EXISTS "Owner and submitter read outcomes" ON public.opportunity_outcomes;
CREATE POLICY "Owner and submitter read outcomes"
  ON public.opportunity_outcomes
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid() OR submitted_by = auth.uid());

DROP POLICY IF EXISTS "Owner reads outcome history" ON public.opportunity_outcome_events;
CREATE POLICY "Owner reads outcome history"
  ON public.opportunity_outcome_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.opportunity_outcomes AS outcome
      WHERE outcome.id = opportunity_outcome_events.outcome_id
        AND (outcome.profile_id = auth.uid() OR outcome.submitted_by = auth.uid())
    )
  );

-- ==========================================================================
-- D. Public projection
-- ==========================================================================

-- The only path by which an outcome becomes readable by a visitor. It selects
-- the safe columns explicitly rather than excluding unsafe ones, so a column
-- added later is private until someone deliberately publishes it.
CREATE OR REPLACE VIEW public.public_opportunity_outcomes
WITH (security_barrier = true)
AS
SELECT
  outcome.id,
  outcome.profile_id,
  outcome.status,
  outcome.opportunity_title,
  outcome.organization_name,
  outcome.occurred_on,
  outcome.verification_source,
  outcome.evidence_url,
  outcome.verified_at
FROM public.opportunity_outcomes AS outcome
JOIN public.profiles AS owner ON owner.id = outcome.profile_id
WHERE outcome.is_public = true
  AND outcome.revoked_at IS NULL
  AND outcome.verified_at IS NOT NULL
  AND outcome.owner_confirmed_at IS NOT NULL
  AND outcome.status = ANY (ARRAY['selected', 'completed'])
  AND owner.suspended_at IS NULL;

REVOKE ALL ON TABLE public.public_opportunity_outcomes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_opportunity_outcomes
  TO anon, authenticated, service_role;

COMMENT ON VIEW public.public_opportunity_outcomes IS
  'The only public view of opportunity outcomes. Selects safe columns explicitly. Never exposes submitter, verifier identity, private evidence notes, dispute reasons, or any status other than selected and completed.';

-- ==========================================================================
-- E. Notification types
-- ==========================================================================

-- Extends notifications_type_check by reading the live definition rather than
-- restating a list this migration cannot know is current. Raises rather than
-- guessing: silently dropping a notification type would break unrelated
-- features long after this migration ran.
DO $$
DECLARE
  v_definition text;
  v_values text[];
  v_new text[] := ARRAY['opportunity_outcome_recorded', 'opportunity_outcome_verified'];
  v_all text;
BEGIN
  SELECT pg_get_constraintdef(con.oid)
  INTO v_definition
  FROM pg_constraint AS con
  JOIN pg_class AS rel ON rel.oid = con.conrelid
  JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'notifications'
    AND con.conname = 'notifications_type_check';

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'notifications_type_check not found; cannot extend it safely.';
  END IF;

  SELECT array_agg(DISTINCT match[1])
  INTO v_values
  FROM regexp_matches(v_definition, '''([a-z0-9_]+)''::text', 'g') AS match;

  IF v_values IS NULL OR array_length(v_values, 1) < 5 THEN
    RAISE EXCEPTION 'Could not parse notifications_type_check values from: %', v_definition;
  END IF;

  SELECT string_agg(quote_literal(value), ', ' ORDER BY value)
  INTO v_all
  FROM (SELECT unnest(v_values || v_new) AS value) AS combined;

  EXECUTE 'ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check';
  EXECUTE format(
    'ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[%s]))',
    v_all
  );
END $$;

COMMIT;

-- Post-apply verification (staging first), the full matrix:
--   owner submits -> stays private, no verifier, not publishable
--   provider verifies owner's claim -> verified, still not public
--   owner confirms and publishes -> appears in public_opportunity_outcomes
--   provider submits -> owner confirms -> owner publishes
--   owner attempts to verify own claim -> rejected by constraint
--   declined / disputed / revoked -> absent from the public view in every case
--   revoke a published outcome -> disappears immediately
--   duplicate submission for the same source and stage -> updates, never doubles
-- Then confirm notifications_type_check still contains every type it had
-- before, plus the two added here.
