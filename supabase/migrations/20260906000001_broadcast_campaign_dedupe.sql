-- Cross-broadcast duplicate protection, and a resting place for the drafts a
-- sent campaign leaves behind.
--
-- Two rows carrying the same "Welcome to Indegenius" reached the same standing
-- audience two minutes apart, one as platform and one as ceo:
--
--   c5134c35-dc18-4cd4-8bc0-ad23e0c8bfd4 -> 807c168c-6fd5-42c3-9ae0-977bd6869364
--   24b75e7d-b9c4-4fbb-887b-c8f4c903b138 -> 1ae001e6-ac31-48b7-8383-7778e5ba5cc7
--
-- Per-row idempotency did its job on both: each row was claimed once and sent
-- once. Nothing anywhere asked whether the campaign had already gone out, and
-- a check written in the application would not have answered it either, since
-- two tabs can both read "no duplicate" before either one writes.
--
-- So the question is asked inside the claim, under an advisory lock keyed on
-- the fingerprint. Two racing claims for the same campaign serialise on that
-- lock; the second one wakes up, sees the first one's row sitting in 'queued',
-- and is refused. The lock is a transaction lock, so it is released by the
-- commit or rollback of the statement that took it and cannot be leaked.

begin;

-- ==========================================================================
-- A. Columns
-- ==========================================================================

-- The campaign identity, computed in the application from the normalised
-- subject, body text and audience. Deliberately not computed in SQL: the
-- normalisation is the same htmlToPlainText the plain-text part of every
-- broadcast is built with, and a second implementation here would be a second
-- thing to keep in step.
ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS campaign_fingerprint text;

-- Set on a draft that was left behind when an equivalent campaign went out.
-- The row keeps everything it had; it simply stops being sendable.
ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS superseded_by uuid
    REFERENCES public.broadcasts(id) ON DELETE SET NULL;

ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

-- 'superseded' joins the status vocabulary rather than being a flag beside it,
-- so every guard that already reasons about status covers it for free:
-- claim_broadcast_for_send matches only ('draft','failed') and will not claim
-- it, and saveDraft's status filter will not write over it.
ALTER TABLE public.broadcasts
  DROP CONSTRAINT IF EXISTS broadcasts_status_check;

ALTER TABLE public.broadcasts
  ADD CONSTRAINT broadcasts_status_check CHECK (status = ANY (ARRAY[
    'draft', 'queued', 'sending', 'sent', 'failed', 'superseded'
  ]));

-- The duplicate lookup: same campaign, recently, and irreversible.
CREATE INDEX IF NOT EXISTS broadcasts_campaign_fingerprint_idx
  ON public.broadcasts (campaign_fingerprint, updated_at DESC)
  WHERE campaign_fingerprint IS NOT NULL;

COMMENT ON COLUMN public.broadcasts.campaign_fingerprint IS
  'Deterministic hash of normalised subject, body text and audience identity. Deliberately excludes the sender: the same message from two identities is one campaign.';

-- ==========================================================================
-- B. Claiming, with the duplicate question asked inside the claim
-- ==========================================================================

-- Returns exactly one row. `outcome` is:
--   'claimed'     - the send may proceed, `broadcast` carries the claimed row
--   'duplicate'   - an equivalent campaign is already irreversible
--   'unclaimable' - the row itself could not be claimed (already dispatched,
--                   already in flight, superseded, or gone)
--
-- p_override skips only the duplicate check. It never relaxes the per-row
-- guards, so an override still cannot send one broadcast twice.
CREATE OR REPLACE FUNCTION public.claim_broadcast_for_campaign(
  p_broadcast_id uuid,
  p_actor_id uuid,
  p_fingerprint text,
  p_window_hours integer DEFAULT 24,
  p_override boolean DEFAULT false
) RETURNS TABLE (
  outcome text,
  duplicate_broadcast_id uuid,
  duplicate_subject text,
  duplicate_status text,
  duplicate_sent_at timestamptz,
  broadcast jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duplicate public.broadcasts;
  v_claimed public.broadcasts;
  v_cutoff timestamptz := now() - make_interval(hours => greatest(coalesce(p_window_hours, 24), 0));
BEGIN
  -- Everything below happens under this lock, so two racing claims for the
  -- same campaign cannot both pass the duplicate check. hashtextextended keeps
  -- the whole fingerprint in play rather than the 32 bits hashtext would.
  IF p_fingerprint IS NOT NULL AND length(p_fingerprint) > 0 THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_fingerprint, 0));
  END IF;

  IF NOT coalesce(p_override, false)
     AND p_fingerprint IS NOT NULL
     AND length(p_fingerprint) > 0
  THEN
    SELECT * INTO v_duplicate
    FROM public.broadcasts
    WHERE campaign_fingerprint = p_fingerprint
      AND id <> p_broadcast_id
      -- Irreversible means one of two things: the provider has it, or a
      -- claim is live and about to hand it over. A row that was claimed and
      -- then released is neither, and its status is back to 'draft'.
      AND (status IN ('queued', 'sending', 'sent') OR dispatch_started_at IS NOT NULL)
      AND coalesce(sent_at, dispatch_started_at, send_claimed_at, updated_at) >= v_cutoff
    ORDER BY coalesce(sent_at, dispatch_started_at, send_claimed_at, updated_at) DESC
    LIMIT 1;

    IF v_duplicate.id IS NOT NULL THEN
      RETURN QUERY SELECT
        'duplicate'::text,
        v_duplicate.id,
        v_duplicate.subject,
        v_duplicate.status,
        coalesce(v_duplicate.sent_at, v_duplicate.dispatch_started_at),
        NULL::jsonb;
      RETURN;
    END IF;
  END IF;

  -- The per-row guards are unchanged from claim_broadcast_for_send, which is
  -- the point: this adds a question, it does not relax one.
  UPDATE public.broadcasts
  SET status = 'queued',
      send_claimed_at = now(),
      sent_by = p_actor_id,
      status_note = NULL,
      campaign_fingerprint = coalesce(p_fingerprint, campaign_fingerprint),
      updated_at = now()
  WHERE id = p_broadcast_id
    AND status IN ('draft', 'failed')
    AND dispatch_started_at IS NULL
  RETURNING * INTO v_claimed;

  IF v_claimed.id IS NULL THEN
    RETURN QUERY SELECT
      'unclaimable'::text, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz, NULL::jsonb;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    'claimed'::text, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz, to_jsonb(v_claimed);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_broadcast_for_campaign(uuid, uuid, text, integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_broadcast_for_campaign(uuid, uuid, text, integer, boolean)
  TO service_role;

-- ==========================================================================
-- C. Superseding the drafts a sent campaign leaves behind
-- ==========================================================================

-- The ids are worked out in the application, because a draft written before
-- fingerprints existed carries none and the only way to know whether it is
-- equivalent is to normalise it the same way the sender did. What belongs here
-- is the guard: only an editable, never-dispatched row that is not the one
-- that just sent can be superseded, and no row is ever deleted.
CREATE OR REPLACE FUNCTION public.supersede_broadcast_drafts(
  p_broadcast_ids uuid[],
  p_superseded_by uuid,
  p_fingerprint text
) RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.broadcasts
  SET status = 'superseded',
      superseded_by = p_superseded_by,
      superseded_at = now(),
      campaign_fingerprint = coalesce(campaign_fingerprint, p_fingerprint),
      status_note = 'An equivalent broadcast was sent, so this draft was superseded. It is kept for the record and can no longer be sent.',
      updated_at = now()
  WHERE id = ANY (p_broadcast_ids)
    AND id <> p_superseded_by
    AND status IN ('draft', 'failed')
    AND dispatch_started_at IS NULL
  RETURNING id;
$$;

REVOKE ALL ON FUNCTION public.supersede_broadcast_drafts(uuid[], uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supersede_broadcast_drafts(uuid[], uuid, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';

commit;
