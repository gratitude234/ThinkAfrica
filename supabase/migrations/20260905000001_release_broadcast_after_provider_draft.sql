-- Unlock a dispatched broadcast that the provider never accepted.
--
-- This is the mirror of claim_broadcast_for_send, and it is here for the same
-- reason that one is: the guard is a conditional update over a nullable
-- column, PostgREST expresses that as a chain of separate filters, and a guard
-- assembled from separate filters is one whose failure is silent. The claim
-- comment already says as much. The release was written as a PostgREST update
-- instead, and in production it did nothing to broadcast
-- c5134c35-dc18-4cd4-8bc0-ad23e0c8bfd4 while reporting no error at all, which
-- is precisely the failure mode that argument predicts.
--
-- So the release becomes one statement too, and it returns the row it changed,
-- so the caller can tell the difference between "unlocked" and "matched
-- nothing" instead of assuming the first.
--
-- What this function does NOT decide is whether the unlock is allowed. The
-- caller must already have asked Resend and been told the broadcast is still a
-- draft on its side; that is the only evidence that nobody was emailed, and it
-- cannot be checked from inside Postgres. What this function guarantees is
-- narrower and is the part that must never be got wrong:
--
--   * the broadcast named is the one whose provider status was just read,
--     matched on resend_broadcast_id, so a row that has since been re-pointed
--     at a different Resend broadcast is left alone;
--   * a row that was never dispatched is not its business, and a 'sent' row is
--     never touched;
--   * the whole guard is evaluated in the same statement as the write.

begin;

CREATE OR REPLACE FUNCTION public.release_broadcast_after_provider_draft(
  p_broadcast_id uuid,
  p_resend_broadcast_id text,
  p_status_note text
) RETURNS SETOF public.broadcasts
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.broadcasts
  SET status = 'draft',
      dispatch_started_at = NULL,
      send_claimed_at = NULL,
      sent_at = NULL,
      status_note = left(p_status_note, 500),
      updated_at = now()
  WHERE id = p_broadcast_id
    -- 'sent' is absent deliberately: a broadcast we have recorded as sent is
    -- never unlocked, whatever the provider says afterwards.
    AND status IN ('queued', 'sending', 'failed')
    AND dispatch_started_at IS NOT NULL
    AND resend_broadcast_id IS NOT NULL
    AND resend_broadcast_id = p_resend_broadcast_id
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.release_broadcast_after_provider_draft(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_broadcast_after_provider_draft(uuid, text, text)
  TO service_role;

COMMENT ON FUNCTION public.release_broadcast_after_provider_draft(uuid, text, text)
  IS 'Returns a dispatched broadcast to an editable draft. Callers must have confirmed with Resend that the broadcast is still a draft there; this only enforces that the row was dispatched, is not sent, and still carries the Resend id that was checked.';

NOTIFY pgrst, 'reload schema';

commit;
