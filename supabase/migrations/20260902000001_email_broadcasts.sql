BEGIN;

-- Email broadcasts.
--
-- Everything the platform sent before this migration was transactional: one
-- message, one recipient, triggered by something that recipient did. A
-- broadcast is the opposite shape, and the difference matters operationally.
-- Twelve thousand transactional sends is twelve thousand API calls, twelve
-- thousand chances to half-finish, and no unsubscribe surface. So broadcasts
-- are handed to Resend as a single broadcast against a segment Resend already
-- holds, and this schema exists to keep our copy of that arrangement honest.
--
-- The tables:
--
--   broadcast_segments         our standing audience keys mapped to the Resend
--                              segment ids that stand for them
--   broadcast_contacts         one row per profile, recording what we last told
--                              Resend about them and what Resend told us back
--   broadcasts                 the local record of a message, its Resend id, and
--                              where its delivery got to
--   broadcast_delivery_events  one row per Resend webhook event, so a retried
--                              webhook cannot be counted twice
--   broadcast_sync_runs        an audit trail for the nightly recipient sync
--   broadcast_sync_state       where the last unsubscribe mirror pass stopped
--
-- DEPLOYMENT STATUS
-- -----------------
-- Source-controlled only. Preflight:
--   1. Apply this migration.
--   2. Apply 20260902000002_schedule_resend_segment_sync.sql and run
--      select private.install_indegenius_cron_jobs();
--   3. Run /api/cron/resend-segment-sync by hand until it answers
--      {"complete": true}. The first run bootstraps every contact at Resend
--      and will need several passes on a large account.
--   4. Confirm broadcast_segments has five rows with non-null
--      resend_segment_id and a recent last_synced_at.
--   5. Point a Resend webhook at /api/webhooks/resend and set
--      RESEND_WEBHOOK_SECRET.
--   6. Only then remove the prototype banner from the admin section.

-- ==========================================================================
-- A. The opt-out category
-- ==========================================================================

-- None of the eighteen existing email keys covers a platform announcement.
-- Reusing email_digest would mean muting the weekly digest silently mutes
-- founder correspondence too, which is not a choice anyone made.
--
-- Every key the previous default carried is repeated verbatim; only
-- email_announcements is new. Dropping one here would quietly re-enable it for
-- accounts created after this migration.
ALTER TABLE public.profiles
  ALTER COLUMN notification_prefs SET DEFAULT '{
    "email_comments": true,
    "email_follows": true,
    "email_likes": true,
    "email_responses": true,
    "email_messages": true,
    "email_published": true,
    "email_digest": true,
    "email_account_security": true,
    "email_profile_reminders": true,
    "email_announcements": true
  }'::jsonb;

-- Existing rows keep every preference they already set. Only the new key is
-- introduced, defaulting to on, because an account that predates the category
-- has not opted out of it.
UPDATE public.profiles
SET notification_prefs =
  '{"email_announcements": true}'::jsonb
  || coalesce(notification_prefs, '{}'::jsonb);

-- set_notification_preference() validates p_key against a hardcoded allowlist
-- and raises for anything else, so the settings toggle for a new key throws
-- until the function knows about it. Redefined here with email_announcements
-- added and everything else byte for byte as
-- 20260802000001_comments_ui_restore.sql left it.
CREATE OR REPLACE FUNCTION public.set_notification_preference(
  p_key text,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_user_id uuid := auth.uid();
  v_preferences jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_key not in (
    'inapp_likes', 'inapp_comments', 'inapp_follows', 'inapp_debates',
    'inapp_collaboration',
    'email_comments', 'email_follows', 'email_likes', 'email_responses',
    'email_messages', 'email_published', 'email_digest',
    'email_account_security', 'email_profile_reminders',
    'email_announcements',
    'email_review_assigned', 'email_review_started', 'email_review_reminder',
    'email_co_author_invite', 'email_co_author_accepted',
    'email_co_author_declined', 'email_opportunity_inquiry',
    'email_author_publications', 'email_debate_updates', 'push_published',
    'push_messages', 'push_comments', 'push_likes', 'push_follows',
    'push_daily_brief', 'push_author_publications', 'push_debate_updates'
  ) then
    raise exception 'Unsupported notification preference';
  end if;

  update public.profiles
  set notification_prefs = jsonb_set(
    coalesce(notification_prefs, '{}'::jsonb),
    array[p_key],
    to_jsonb(p_enabled),
    true
  )
  where id = v_user_id
  returning notification_prefs into v_preferences;

  return v_preferences;
end;
$$;

REVOKE ALL ON FUNCTION public.set_notification_preference(text, boolean)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_notification_preference(text, boolean)
  TO authenticated;

-- ==========================================================================
-- B. Audience key to Resend segment
-- ==========================================================================

-- Only standing audiences live here. A hand-picked list is a property of one
-- broadcast rather than of the membership, so it gets a segment of its own
-- recorded on the broadcast row and never appears in this table.
CREATE TABLE IF NOT EXISTS public.broadcast_segments (
  audience_key text PRIMARY KEY CHECK (audience_key = ANY (ARRAY[
    'all', 'active', 'authors', 'verified', 'new'
  ])),

  -- Null until the sync job provisions the segment at Resend on first run.
  resend_segment_id text UNIQUE,

  -- What the last completed sync left in the segment. The send path reads
  -- this rather than counting live, so a send never waits on a full scan.
  contact_count integer NOT NULL DEFAULT 0 CHECK (contact_count >= 0),

  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.broadcast_segments (audience_key)
VALUES ('all'), ('active'), ('authors'), ('verified'), ('new')
ON CONFLICT (audience_key) DO NOTHING;

-- ==========================================================================
-- C. Profile to Resend contact
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.broadcast_contacts (
  profile_id uuid PRIMARY KEY
    REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- The address we last sent to Resend. Kept so the sync can tell a changed
  -- address from an unchanged one without asking Resend.
  email text NOT NULL,
  resend_contact_id text,

  -- Resend owns the unsubscribe link in every broadcast, so Resend learns
  -- about an opt-out before we do. The webhook and the nightly sync both
  -- mirror it back into notification_prefs, and this column records that we
  -- have seen it.
  unsubscribed boolean NOT NULL DEFAULT false,
  unsubscribed_at timestamptz,

  -- Set when the member turns email_announcements back on inside Indegenius.
  -- An opt-out at Resend is authoritative until the person themselves reverses
  -- it here, which is a consent signal we are entitled to act on.
  resubscribed_at timestamptz,

  -- Which audience segments this contact currently belongs to at Resend.
  segment_keys text[] NOT NULL DEFAULT '{}',

  -- Derived audience inputs, computed during sync so the send path and the
  -- composer's recipient counts never scan posts and comments.
  last_activity_at timestamptz,
  published_count integer NOT NULL DEFAULT 0 CHECK (published_count >= 0),
  is_verified boolean NOT NULL DEFAULT false,
  profile_created_at timestamptz,

  -- The eligibility answer itself, so a count is a single indexed predicate.
  is_eligible boolean NOT NULL DEFAULT false,

  synced_at timestamptz,
  sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS broadcast_contacts_eligible_idx
  ON public.broadcast_contacts (is_eligible)
  WHERE is_eligible;

CREATE INDEX IF NOT EXISTS broadcast_contacts_synced_at_idx
  ON public.broadcast_contacts (synced_at NULLS FIRST);

-- The webhook resolves a Resend contact back to a profile by address.
CREATE INDEX IF NOT EXISTS broadcast_contacts_email_idx
  ON public.broadcast_contacts (email);

-- Turning the category back on inside Indegenius clears the opt-out we
-- mirrored from Resend, and blanks synced_at so the next sync pushes
-- unsubscribed:false back up rather than leaving Resend suppressing them.
--
-- A trigger rather than a branch in set_notification_preference() because the
-- settings form has two save paths: the per-switch RPC and a plain
-- notification_prefs update. Both land here.
CREATE OR REPLACE FUNCTION public.sync_broadcast_resubscribe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.notification_prefs -> 'email_announcements', 'null'::jsonb)
     IS DISTINCT FROM 'true'::jsonb THEN
    RETURN NEW;
  END IF;

  IF coalesce(OLD.notification_prefs -> 'email_announcements', 'null'::jsonb)
     IS NOT DISTINCT FROM 'true'::jsonb THEN
    RETURN NEW;
  END IF;

  UPDATE public.broadcast_contacts
  SET unsubscribed = false,
      unsubscribed_at = NULL,
      resubscribed_at = now(),
      synced_at = NULL,
      updated_at = now()
  WHERE profile_id = NEW.id
    AND unsubscribed;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_broadcast_resubscribe ON public.profiles;
CREATE TRIGGER profiles_broadcast_resubscribe
  AFTER UPDATE OF notification_prefs ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_broadcast_resubscribe();

-- ==========================================================================
-- D. The broadcast record
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Drafts are saved continuously from the composer, so an unfinished
  -- broadcast is normal and the content columns cannot be NOT NULL-with-length.
  -- The send path is what refuses to send an empty subject or body.
  subject text NOT NULL DEFAULT '',
  preview_text text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',

  sender_key text NOT NULL CHECK (sender_key = ANY (ARRAY[
    'platform', 'socials', 'partnership', 'ceo', 'cto'
  ])),
  audience_key text NOT NULL DEFAULT 'all' CHECK (audience_key = ANY (ARRAY[
    'all', 'active', 'authors', 'verified', 'new', 'selected'
  ])),
  selected_profile_ids uuid[] NOT NULL DEFAULT '{}',

  -- The Resend segment built for a hand-picked list. Written once, on the
  -- first send attempt that gets past the claim, and reused by every retry, so
  -- a double click cannot leave a second orphan segment behind at Resend.
  selected_segment_id text,

  status text NOT NULL DEFAULT 'draft' CHECK (status = ANY (ARRAY[
    'draft', 'queued', 'sending', 'sent', 'failed'
  ])),

  -- The idempotency anchor. A broadcast is created at Resend as a draft first
  -- and dispatched second; storing the id between those two calls means a
  -- retry re-sends the same Resend draft instead of creating a second one.
  -- UNIQUE so that even a racing writer cannot attach a second id.
  resend_broadcast_id text UNIQUE,

  -- Stamped immediately before broadcasts.send is called. Once it is set we
  -- can no longer prove nothing left Resend, so the row is never re-claimable
  -- however it ends up. The nightly reconciler asks Resend what actually
  -- happened rather than guessing.
  dispatch_started_at timestamptz,

  recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  delivered_count integer NOT NULL DEFAULT 0 CHECK (delivered_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  status_note text,

  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Stamped by the conditional UPDATE that claims a draft for sending. The
  -- claim is what makes a double click safe: the second one matches no row.
  send_claimed_at timestamptz,
  sent_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A sent broadcast must carry the Resend id that sent it. Anything that
  -- reached Resend has one, so a sent row without one is a bug we want loud.
  CONSTRAINT broadcasts_sent_has_resend_id CHECK (
    status NOT IN ('sending', 'sent') OR resend_broadcast_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS broadcasts_status_created_idx
  ON public.broadcasts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS broadcasts_created_at_idx
  ON public.broadcasts (created_at DESC);

-- The reconciler looks for sends that never reached a terminal state.
CREATE INDEX IF NOT EXISTS broadcasts_in_flight_idx
  ON public.broadcasts (send_claimed_at)
  WHERE status IN ('queued', 'sending');

-- ==========================================================================
-- E. Delivery events
-- ==========================================================================

-- Resend reports delivery one message at a time over a webhook, and a webhook
-- is retried until we answer 2xx. Without a record of what we have already
-- seen, one retried delivery is counted twice and the totals drift upward
-- forever. Every event is written here first; the counters only move when the
-- write was genuinely new.
CREATE TABLE IF NOT EXISTS public.broadcast_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  resend_broadcast_id text NOT NULL,

  -- Resend's id for the individual message. Stable across a webhook retry,
  -- which is exactly what makes it usable as the dedupe key.
  email_id text NOT NULL,
  event_type text NOT NULL,

  -- True when this event is the one that moved the aggregate. At most one
  -- event per email_id ever counts, so a message that is delivered and later
  -- complained about is one recipient, not two.
  counted boolean NOT NULL DEFAULT false,

  received_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT broadcast_delivery_events_unique
    UNIQUE (resend_broadcast_id, email_id, event_type)
);

CREATE INDEX IF NOT EXISTS broadcast_delivery_events_broadcast_idx
  ON public.broadcast_delivery_events (broadcast_id, received_at DESC);

CREATE INDEX IF NOT EXISTS broadcast_delivery_events_counted_idx
  ON public.broadcast_delivery_events (resend_broadcast_id, email_id)
  WHERE counted;

-- ==========================================================================
-- F. Sync runs
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.broadcast_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  contacts_examined integer NOT NULL DEFAULT 0,
  contacts_written integer NOT NULL DEFAULT 0,
  contacts_pending integer NOT NULL DEFAULT 0,
  unsubscribes_mirrored integer NOT NULL DEFAULT 0,
  segments_provisioned integer NOT NULL DEFAULT 0,
  complete boolean NOT NULL DEFAULT false,
  error text
);

CREATE INDEX IF NOT EXISTS broadcast_sync_runs_started_idx
  ON public.broadcast_sync_runs (started_at DESC);

-- Where the last unsubscribe mirror pass stopped. A full pass over the "all"
-- segment is one Resend list call per hundred contacts, so on a large account
-- it does not finish inside one run and has to pick up where it left off.
CREATE TABLE IF NOT EXISTS public.broadcast_sync_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  mirror_cursor text,
  mirror_started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.broadcast_sync_state (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- ==========================================================================
-- G. Access
-- ==========================================================================

ALTER TABLE public.broadcast_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_sync_state ENABLE ROW LEVEL SECURITY;

-- No client reaches any of this. Every read and write goes through the admin
-- client behind a capability check, and broadcast_contacts in particular holds
-- one row per member with their email address on it. RLS is enabled with no
-- policies, so the tables are invisible to anon and authenticated regardless
-- of what a future PostgREST query tries.
REVOKE ALL ON TABLE public.broadcast_segments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.broadcast_contacts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.broadcasts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.broadcast_delivery_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.broadcast_sync_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.broadcast_sync_state FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.broadcast_segments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.broadcast_contacts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.broadcasts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.broadcast_delivery_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.broadcast_sync_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.broadcast_sync_state TO service_role;

-- ==========================================================================
-- H. Delivery counters
-- ==========================================================================

-- PostgREST cannot express `col = col + 1`, and reading then writing from the
-- route would drop events whenever two arrived together, which at broadcast
-- volume is most of the time. It also cannot express "only if we have not
-- seen this before", which is the part that keeps a retried webhook honest.
--
-- Returns true when this call actually moved the aggregate, so the route can
-- tell a genuine event from a replay.
CREATE OR REPLACE FUNCTION public.record_broadcast_delivery_event(
  p_resend_broadcast_id text,
  p_email_id text,
  p_event_type text,
  p_delivered integer,
  p_failed integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_broadcast_id uuid;
  v_event_id uuid;
  v_already_counted boolean;
  v_delivered integer := greatest(coalesce(p_delivered, 0), 0);
  v_failed integer := greatest(coalesce(p_failed, 0), 0);
  v_moved integer;
BEGIN
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

  IF v_delivered = 0 AND v_failed = 0 THEN
    RETURN false;
  END IF;

  -- One outcome per message. A message that is delivered and later complained
  -- about is one recipient who received it, not one delivered plus one failed.
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
  SET delivered_count = delivered_count + v_delivered,
      failed_count = failed_count + v_failed,
      updated_at = now()
  WHERE id = v_broadcast_id
    AND (
      recipient_count = 0
      OR delivered_count + failed_count + v_delivered + v_failed <= recipient_count
    );

  GET DIAGNOSTICS v_moved = ROW_COUNT;

  IF v_moved = 0 THEN
    RETURN false;
  END IF;

  UPDATE public.broadcast_delivery_events
  SET counted = true
  WHERE id = v_event_id;

  -- Resend has no "broadcast finished" event, so completion is inferred: once
  -- every recipient has been accounted for one way or the other, the send is
  -- done and the record stops saying Sending.
  UPDATE public.broadcasts
  SET status = 'sent',
      sent_at = coalesce(sent_at, now())
  WHERE id = v_broadcast_id
    AND status IN ('queued', 'sending')
    AND recipient_count > 0
    AND delivered_count + failed_count >= recipient_count;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_broadcast_delivery_event(text, text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_broadcast_delivery_event(text, text, text, integer, integer)
  TO service_role;

-- ==========================================================================
-- I. Unsubscribe mirroring
-- ==========================================================================

-- Resend owns the unsubscribe link in every broadcast, so Resend learns about
-- an opt-out first. The contact.updated webhook brings it back within seconds
-- instead of waiting for the nightly pass, which is what closes the window in
-- which a sync could put somebody back into the segment they just left.
--
-- Deliberately one-directional: this only ever turns the preference off.
-- Turning it back on is a decision the member makes inside Indegenius, and
-- the profiles trigger above is what acts on that.
CREATE OR REPLACE FUNCTION public.mirror_broadcast_unsubscribe(
  p_email text,
  p_resend_contact_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  SELECT profile_id INTO v_profile_id
  FROM public.broadcast_contacts
  WHERE email = lower(trim(p_email))
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.broadcast_contacts
  SET unsubscribed = true,
      unsubscribed_at = coalesce(unsubscribed_at, now()),
      resend_contact_id = coalesce(p_resend_contact_id, resend_contact_id),
      is_eligible = false,
      segment_keys = '{}',
      updated_at = now()
  WHERE profile_id = v_profile_id;

  -- The trigger above only fires on a transition to true, so writing false
  -- here cannot bounce back and undo the opt-out.
  UPDATE public.profiles
  SET notification_prefs = jsonb_set(
    coalesce(notification_prefs, '{}'::jsonb),
    array['email_announcements'],
    'false'::jsonb,
    true
  )
  WHERE id = v_profile_id
    AND coalesce(notification_prefs -> 'email_announcements', 'null'::jsonb)
        IS DISTINCT FROM 'false'::jsonb;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.mirror_broadcast_unsubscribe(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_broadcast_unsubscribe(text, text)
  TO service_role;

-- ==========================================================================
-- J. Send claim
-- ==========================================================================

-- The claim is one statement so that two racing callers cannot both win it.
-- PostgREST can express the conditional update, but not the "and only if we
-- have never dispatched" part in a way that survives a null comparison, and
-- getting that wrong is how a broadcast goes out twice. So it lives here.
--
-- A row whose dispatch_started_at is set is never claimable again, whatever
-- its status says: once broadcasts.send has been called we cannot prove
-- nothing left, and re-sending is the one failure mode with no undo.
CREATE OR REPLACE FUNCTION public.claim_broadcast_for_send(
  p_broadcast_id uuid,
  p_actor_id uuid
) RETURNS SETOF public.broadcasts
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.broadcasts
  SET status = 'queued',
      send_claimed_at = now(),
      sent_by = p_actor_id,
      status_note = NULL,
      updated_at = now()
  WHERE id = p_broadcast_id
    AND status IN ('draft', 'failed')
    AND dispatch_started_at IS NULL
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.claim_broadcast_for_send(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_broadcast_for_send(uuid, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
