-- Suppression is not failure, and a campaign is not finished by arithmetic.
--
-- The first production broadcast reached 253 recipients: 222 delivered, 24
-- suppressed. The 24 were counted into failed_count and shown as "Failed or
-- bounced", which is untrue in a way that matters. Resend suppresses a send
-- because the destination is already on its suppression list, so nothing was
-- attempted and nothing bounced. Reporting it as a bounce invites exactly the
-- wrong response, which is to go looking for a delivery problem.
--
-- The same arithmetic was also deciding when a broadcast was finished:
-- delivered + failed >= recipient_count. With 24 suppressed messages that sum
-- never reached 253, so both campaigns sat at 'sending' forever while Resend
-- had long since reported the broadcast as sent.
--
-- This migration separates the two ideas. Recipient outcomes are counted in
-- three mutually exclusive buckets; whether the campaign itself is over is a
-- question about the provider's broadcast, answered by asking it.

begin;

-- ==========================================================================
-- A. A bucket of its own
-- ==========================================================================

ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS suppressed_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.broadcasts
  DROP CONSTRAINT IF EXISTS broadcasts_suppressed_count_check;

ALTER TABLE public.broadcasts
  ADD CONSTRAINT broadcasts_suppressed_count_check CHECK (suppressed_count >= 0);

COMMENT ON COLUMN public.broadcasts.suppressed_count IS
  'Recipients Resend declined to attempt because the address was already on its suppression list. Not a delivery failure and never counted as one.';

-- ==========================================================================
-- B. Deliverability, kept apart from preference
-- ==========================================================================

-- A suppression says nothing about what the member wants. Writing it into
-- notification_prefs would be the system putting words in their mouth, and it
-- would be unrecoverable: nothing could tell a preference the member set from
-- one we invented on their behalf. So it lives here instead, and eligibility
-- reads both.
--
-- The address is stored beside the flag because suppression is a property of
-- an address rather than of a person. A member who moves to a new address is
-- deliverable again the moment the sync notices, with no manual step, because
-- the stored address no longer matches theirs.
ALTER TABLE public.broadcast_contacts
  ADD COLUMN IF NOT EXISTS suppressed_at timestamptz;

ALTER TABLE public.broadcast_contacts
  ADD COLUMN IF NOT EXISTS suppressed_email text;

ALTER TABLE public.broadcast_contacts
  ADD COLUMN IF NOT EXISTS suppression_reason text;

CREATE INDEX IF NOT EXISTS broadcast_contacts_suppressed_idx
  ON public.broadcast_contacts (suppressed_at)
  WHERE suppressed_at IS NOT NULL;

COMMENT ON COLUMN public.broadcast_contacts.suppressed_at IS
  'Set from an email.suppressed webhook. Deliverability, not consent: email_announcements is never touched by it.';

-- Records that Resend declined to deliver to this address. Matched by address
-- rather than by profile, because that is what the webhook carries and what
-- the suppression is actually about.
CREATE OR REPLACE FUNCTION public.record_broadcast_suppression(
  p_email text,
  p_reason text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_updated integer;
BEGIN
  IF v_email = '' THEN
    RETURN false;
  END IF;

  UPDATE public.broadcast_contacts
  SET suppressed_at = coalesce(suppressed_at, now()),
      suppressed_email = v_email,
      suppression_reason = left(coalesce(p_reason, 'Suppressed by the mail provider.'), 300),
      -- Cleared so the next sync pushes the removal from every managed
      -- segment rather than waiting for some other field to change.
      synced_at = NULL,
      updated_at = now()
  WHERE lower(email) = v_email;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.record_broadcast_suppression(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_broadcast_suppression(text, text)
  TO service_role;

-- The manual recovery path. The installed Resend SDK (6.12.3) exposes no
-- suppression-list resource at all, so there is nothing to poll and nothing to
-- delete remotely; inventing one would mean inventing an endpoint. Clearing is
-- therefore deliberate and human: run this once the address is known to be
-- deliverable again. It restores eligibility only as far as the member's own
-- preference allows, because that is checked separately and is untouched here.
CREATE OR REPLACE FUNCTION public.clear_broadcast_suppression(
  p_email text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_updated integer;
BEGIN
  IF v_email = '' THEN
    RETURN false;
  END IF;

  UPDATE public.broadcast_contacts
  SET suppressed_at = NULL,
      suppressed_email = NULL,
      suppression_reason = NULL,
      synced_at = NULL,
      updated_at = now()
  WHERE lower(email) = v_email
    AND suppressed_at IS NOT NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_broadcast_suppression(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_broadcast_suppression(text)
  TO service_role;

-- ==========================================================================
-- C. Recording an outcome
-- ==========================================================================

-- Same dedupe rules as before, restated around three buckets rather than two:
-- the event row is written first and the counters move only when that write
-- was new, and at most one event per email_id ever counts, so a message that
-- is delivered and later complained about is one recipient rather than two.
--
-- What is gone is the count-based completion. A campaign is not over because
-- the numbers add up; it is over when the provider says its broadcast is sent,
-- which is a different question asked in a different place.
CREATE OR REPLACE FUNCTION public.record_broadcast_delivery_outcome(
  p_resend_broadcast_id text,
  p_email_id text,
  p_event_type text,
  p_outcome text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_broadcast_id uuid;
  v_event_id uuid;
  v_already_counted boolean;
  v_moved integer;
BEGIN
  IF p_outcome NOT IN ('delivered', 'suppressed', 'failed') THEN
    RETURN false;
  END IF;

  SELECT id INTO v_broadcast_id
  FROM public.broadcasts
  WHERE resend_broadcast_id = p_resend_broadcast_id;

  -- An event for a broadcast we do not hold is not an error worth retrying.
  IF v_broadcast_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.broadcast_delivery_events (
    broadcast_id, resend_broadcast_id, email_id, event_type
  )
  VALUES (
    v_broadcast_id, p_resend_broadcast_id, p_email_id, p_event_type
  )
  ON CONFLICT (resend_broadcast_id, email_id, event_type) DO NOTHING
  RETURNING id INTO v_event_id;

  -- Seen before. Resend retried, or the same event arrived twice.
  IF v_event_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.broadcast_delivery_events
    WHERE resend_broadcast_id = p_resend_broadcast_id
      AND email_id = p_email_id
      AND counted
  ) INTO v_already_counted;

  IF v_already_counted THEN
    RETURN false;
  END IF;

  -- The predicate is the cap: once every recipient is accounted for, no
  -- further event can push the totals past the audience that was addressed.
  UPDATE public.broadcasts
  SET delivered_count = delivered_count + (CASE WHEN p_outcome = 'delivered' THEN 1 ELSE 0 END),
      suppressed_count = suppressed_count + (CASE WHEN p_outcome = 'suppressed' THEN 1 ELSE 0 END),
      failed_count = failed_count + (CASE WHEN p_outcome = 'failed' THEN 1 ELSE 0 END),
      updated_at = now()
  WHERE id = v_broadcast_id
    AND (
      recipient_count = 0
      OR delivered_count + suppressed_count + failed_count < recipient_count
    );

  GET DIAGNOSTICS v_moved = ROW_COUNT;

  IF v_moved = 0 THEN
    RETURN false;
  END IF;

  UPDATE public.broadcast_delivery_events
  SET counted = true
  WHERE id = v_event_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_broadcast_delivery_outcome(text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_broadcast_delivery_outcome(text, text, text, text)
  TO service_role;

-- The old four-bucket-blind entry point is kept and delegates, so a webhook
-- arriving from the previous deployment during the rollout still lands
-- somewhere correct instead of hitting a function that no longer exists.
CREATE OR REPLACE FUNCTION public.record_broadcast_delivery_event(
  p_resend_broadcast_id text,
  p_email_id text,
  p_event_type text,
  p_delivered integer,
  p_failed integer
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.record_broadcast_delivery_outcome(
    p_resend_broadcast_id,
    p_email_id,
    p_event_type,
    CASE
      WHEN coalesce(p_delivered, 0) > 0 THEN 'delivered'
      WHEN p_event_type = 'email.suppressed' THEN 'suppressed'
      WHEN coalesce(p_failed, 0) > 0 THEN 'failed'
      ELSE 'ignored'
    END
  );
$$;

-- ==========================================================================
-- D. The provider decides when a campaign is over
-- ==========================================================================

-- Resend's broadcast status is the campaign's status. 'sent' there means the
-- provider has finished dispatching it, which is a fact about the campaign and
-- not about any one recipient. Recipient outcomes carry on arriving afterwards
-- and are counted afterwards; they no longer decide anything.
--
-- Guarded on the Resend id so the row being finalised is the one whose status
-- was actually read, and it never touches a row that was not dispatched.
CREATE OR REPLACE FUNCTION public.mark_broadcast_provider_sent(
  p_broadcast_id uuid,
  p_resend_broadcast_id text,
  p_sent_at timestamptz
) RETURNS SETOF public.broadcasts
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.broadcasts
  SET status = 'sent',
      sent_at = coalesce(p_sent_at, sent_at, now()),
      status_note = NULL,
      updated_at = now()
  WHERE id = p_broadcast_id
    AND resend_broadcast_id IS NOT NULL
    AND resend_broadcast_id = p_resend_broadcast_id
    AND dispatch_started_at IS NOT NULL
    AND status IN ('queued', 'sending', 'failed')
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.mark_broadcast_provider_sent(uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_broadcast_provider_sent(uuid, text, timestamptz)
  TO service_role;

-- ==========================================================================
-- E. Repairing what was already recorded
-- ==========================================================================

-- Recomputed from broadcast_delivery_events, which has held event_type since
-- the table was created, so nothing here is invented: every number below is a
-- count of events that actually arrived and actually moved a counter. Rows
-- that never counted are excluded, so a replayed webhook does not appear.
--
-- Idempotent by construction. It derives the totals rather than adjusting
-- them, so running it twice produces the same answer as running it once.
UPDATE public.broadcasts AS b
SET delivered_count = totals.delivered,
    suppressed_count = totals.suppressed,
    failed_count = totals.failed
FROM (
  SELECT
    broadcast_id,
    count(*) FILTER (WHERE event_type = 'email.delivered')::integer AS delivered,
    count(*) FILTER (WHERE event_type = 'email.suppressed')::integer AS suppressed,
    count(*) FILTER (
      WHERE event_type IN ('email.bounced', 'email.complained', 'email.failed')
    )::integer AS failed
  FROM public.broadcast_delivery_events
  WHERE counted
  GROUP BY broadcast_id
) AS totals
WHERE b.id = totals.broadcast_id
  AND (
    b.delivered_count IS DISTINCT FROM totals.delivered
    OR b.suppressed_count IS DISTINCT FROM totals.suppressed
    OR b.failed_count IS DISTINCT FROM totals.failed
  );

NOTIFY pgrst, 'reload schema';

commit;
