-- =============================================================================
-- Debate V2 Phase 4B: subscriptions and trustworthy event-driven notifications
-- =============================================================================
-- Builds on Phase 1 (20260718000002, debate_subscriptions -- self-only read,
-- intentionally dormant), Phase 2 (20260718000003, lifecycle/participation
-- RPCs), and Phase 4A (20260721000002, cross-examination). Additive only --
-- no existing migration is edited, no column/table is dropped, no V1 code
-- path is touched.
--
-- Scope (per the product contract's Phase 1 "non-goals" list, item
-- "Notification delivery" -- the one item this migration finally
-- implements): follow/unfollow a V2 debate, manage the five existing
-- per-debate notification preferences, and deliver deduplicated in-app
-- notifications for five event categories (round/phase changes, final vote
-- opened, direct responses, evidence requests, recap-ready-if-a-reliable-
-- trigger-exists). Explicitly NOT in scope: discovery/feed ranking, AI
-- features, recap generation/redesign, recommendations, analytics
-- dashboards, email, push delivery -- all deferred, see
-- docs/debate-v2-phase4b-subscriptions-notifications.md's "Phase 5
-- deferrals" section.
--
-- Architecture in one paragraph: every participation/lifecycle RPC that can
-- produce a notification-worthy event writes ONE compact row into the new
-- debate_notification_events outbox table, atomically, in the SAME
-- transaction as its own mutation, keyed by a stable/unique event_key so a
-- retried or duplicate call can never create a second event
-- (ON CONFLICT (event_key) DO NOTHING). No fan-out happens synchronously
-- inside those RPCs -- resolving subscribers and inserting notification rows
-- is entirely the job of the new process_debate_notification_events_v2
-- worker, a service_role-only, SKIP LOCKED, bounded-batch function that a
-- new Vercel Cron route calls on an interval (see
-- app/api/cron/process-debate-notifications/route.ts). This mirrors
-- advance_due_debate_rounds_v2's own batch/locking/error-isolation shape
-- exactly, for the same reason: automatic and manual paths must never
-- diverge into two implementations, and one malformed row must never abort
-- a whole batch.
--
-- Lock order: every function below that acquires more than one lock follows
-- the same debate -> membership/round/domain-row -> mutation/event order
-- established in Phase 2/4A. Emitting an event is the LAST thing any
-- function does, after its own mutation has already succeeded, and never
-- acquires a lock of its own (INSERT ... ON CONFLICT DO NOTHING is
-- self-atomic -- see emit_debate_notification_event_v2's own comment).
--
-- This migration creates or replaces 13 functions in total (counted
-- programmatically in the security-audit footer at the end of this file,
-- section 8).
-- =============================================================================

-- =============================================================================
-- 1. Schema: debate_subscriptions.is_subscribed
-- =============================================================================
-- Phase 1 shipped debate_subscriptions with five notify_* preference columns
-- but no explicit subscribed/unsubscribed flag -- Phase 1's own comment says
-- "Phase 5 implements subscription UX", and no RPC anywhere has ever written
-- to this table, so in practice zero rows exist in any environment this has
-- been deployed to. is_subscribed is added as NOT NULL DEFAULT true purely
-- for the hypothetical case of a pre-existing row: "existing rows should
-- remain subscribed unless the schema or application clearly establishes
-- different semantics" (no such different semantics exist here), so a
-- default of true is the only value consistent with that instruction and
-- with every notify_* column already defaulting to true.
--
-- A row persists after unsubscribe (is_subscribed = false) rather than being
-- deleted, so this table can always distinguish three states: no row at all
-- (never subscribed), is_subscribed = true (subscribed), is_subscribed =
-- false (explicitly opted out). Deleting the row on unsubscribe would
-- collapse the second and third states into "no row", which is exactly what
-- would let ensure_debate_subscription_default_v2's ON CONFLICT DO NOTHING
-- silently resubscribe someone who had deliberately opted out.
ALTER TABLE public.debate_subscriptions
  ADD COLUMN IF NOT EXISTS is_subscribed boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.debate_subscriptions.is_subscribed IS
  'Phase 4B: explicit subscribed/opted-out state, distinct from row existence. A row is never deleted on unsubscribe -- is_subscribed is set to false instead -- so "never subscribed" (no row) and "explicitly opted out" (is_subscribed = false) stay distinguishable. See ensure_debate_subscription_default_v2 (only ever INSERTs via ON CONFLICT DO NOTHING -- never flips this back to true) and set_debate_subscription_v2 (the only path that can set it, always from an authenticated caller acting on their own row).';

COMMENT ON TABLE public.debate_subscriptions IS
  'Debate V2 Phase 1 (schema) / Phase 4B (write path + delivery): per-user notification preferences and follow state for a debate. Self-only SELECT. No direct client INSERT/UPDATE/DELETE policy -- the only write path is set_debate_subscription_v2 (explicit user action) and ensure_debate_subscription_default_v2 (durable, opt-out-safe auto-subscribe on high-intent participation), both SECURITY DEFINER.';

-- =============================================================================
-- 2. Schema: debate_notification_events (transactional outbox)
-- =============================================================================
-- Pure server-side plumbing -- never read or written by any client role,
-- directly or through a client-callable RPC. RLS is enabled with
-- deliberately NO policies at all (not even a moderator-read policy, unlike
-- debate_moderation_events): this is an internal delivery queue, not a
-- user-facing audit trail, so there is no visibility requirement to serve.
-- Every access path is either a SECURITY DEFINER function owned by the
-- migration owner (bypasses RLS the same way every other V2 write-helper
-- does) or the service_role-only worker (bypasses RLS by role, same as
-- every other service_role-granted function in this codebase).
--
-- event_key is the deduplication mechanism: every emission call site builds
-- it from data that is only ever produced once for the thing the event
-- represents (a round's one-time transition to active, an exchange's
-- one-time answer, a specific reaction-add on a specific argument, ...), so
-- retries, concurrent calls, and repeated toggling all collide on the same
-- key and are absorbed by ON CONFLICT (event_key) DO NOTHING. See each
-- emission call site below for its exact key format, and
-- docs/debate-v2-phase4b-subscriptions-notifications.md's "Event inventory
-- and deduplication" table for the full list in one place.
--
-- target_user_id is set only for events with exactly one intended recipient
-- (direct-response and evidence-request events); it is left NULL for
-- broadcast events (round_change, final_vote_open), which the worker
-- resolves against every eligible subscriber at delivery time instead.
CREATE TABLE IF NOT EXISTS public.debate_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id uuid NOT NULL REFERENCES public.debates(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'round_change', 'final_vote_open', 'direct_response_question',
    'direct_response_answer', 'direct_response_rebuttal', 'evidence_requested'
  )),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  round_id uuid REFERENCES public.debate_rounds(id) ON DELETE SET NULL,
  argument_id uuid REFERENCES public.debate_arguments(id) ON DELETE SET NULL,
  exchange_id uuid REFERENCES public.debate_cross_exchanges(id) ON DELETE SET NULL,
  -- Pre-built, ready-to-insert notification fields (notification_type,
  -- message, link), assembled once at emission time by the RPC that already
  -- has the relevant names/ids in scope. The worker copies these verbatim --
  -- it never re-derives a message or re-joins profiles, keeping delivery
  -- cheap and keeping "what this notification says" reviewable in one place
  -- (the emission call site) rather than split across emission and
  -- delivery.
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT debate_notification_events_event_key_key UNIQUE (event_key)
);

COMMENT ON TABLE public.debate_notification_events IS
  'Debate V2 Phase 4B: transactional outbox. Every participation/lifecycle RPC that produces a notification-worthy event inserts exactly one row here (ON CONFLICT (event_key) DO NOTHING), atomically with its own mutation. process_debate_notification_events_v2 (service_role only) later claims pending/retryable-failed rows with FOR UPDATE SKIP LOCKED, resolves recipients from debate_subscriptions, and inserts into public.notifications. RLS is enabled with no policies at all -- never directly readable or writable by anon/authenticated; every access path is SECURITY DEFINER composition or the service_role-only worker.';

CREATE INDEX IF NOT EXISTS debate_notification_events_status_created_idx
  ON public.debate_notification_events (status, created_at);
CREATE INDEX IF NOT EXISTS debate_notification_events_debate_idx
  ON public.debate_notification_events (debate_id);

ALTER TABLE public.debate_notification_events ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies at all -- see the table comment above.

-- =============================================================================
-- 3. Schema: notifications.type CHECK constraint -- four new Debate V2 values
-- =============================================================================
-- Same DROP/ADD pattern used by every prior migration that has extended this
-- constraint. The most recent prior definition -- and the one this
-- statement must extend, not the older 20260501000002_opportunity_hub_v1.sql
-- list -- is 20260706000001_review_reminder_tracking.sql, itself extending
-- 20260705000003_reviewer_removal_and_review_started_notice.sql and
-- 20260704000001_trust_safety_v1.sql. That full 21-value list is reproduced
-- here byte-for-byte and only appended to -- never edit any of those
-- migrations themselves, this is a fresh statement against the live
-- constraint. (Correction: an earlier revision of this migration rebuilt the
-- constraint from the older 20260501000002 list and silently dropped
-- review_started, review_reminder, moderation_post_removed,
-- moderation_comment_hidden, and account_suspended -- a deployment blocker,
-- since the migration could fail outright against any environment with
-- existing rows of those types, or otherwise silently break every review-
-- reminder and trust-and-safety notification going forward.)
-- The three cross-examination sub-events (question/answer) and the rebuttal
-- direct-response all share one notifications.type
-- ('debate_v2_direct_response') -- the message text (always explicit, never
-- derived from type at render time for these rows) is what distinguishes
-- them for the reader; a coarser type keeps this CHECK list, TYPE_ICONS, and
-- any future type-based filtering simpler. round_change and final_vote stay
-- separate types because a reader may plausibly want to visually
-- distinguish "a round changed" from "voting is open" at a glance.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
    'like', 'comment', 'follow', 'debate_reply', 'debate_argument',
    'fellowship', 'badge', 'post_approved', 'post_rejected',
    'post_published', 'review_assigned', 'review_started', 'review_reminder',
    'revision_requested',
    'co_author_invite', 'co_author_accepted', 'co_author_declined',
    'response_post', 'opportunity_inquiry',
    'moderation_post_removed', 'moderation_comment_hidden', 'account_suspended',
    'debate_v2_round_change', 'debate_v2_final_vote',
    'debate_v2_direct_response', 'debate_v2_evidence_requested'
  ]));

-- =============================================================================
-- 4. Internal helper: debate_display_name_v2
-- =============================================================================
-- Pure read against public.profiles, which is publicly readable throughout
-- this codebase -- no SECURITY DEFINER needed, matching is_editor_or_admin's
-- identical reasoning (20260718000003, section B). Used only to embed an
-- actor's display name into a notification message at emission time (the
-- established pattern in app/(main)/post/[slug]/likeActions.ts: resolve the
-- name once, embed it in `message` directly, so the worker and the
-- notification UI never need to re-join profiles for these rows).
CREATE OR REPLACE FUNCTION public.debate_display_name_v2(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(full_name, username, 'A participant')
    FROM public.profiles
   WHERE id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.debate_display_name_v2(uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.debate_display_name_v2(uuid) IS
  'Phase 4B internal helper: display name for embedding into a notification message at emission time. Not SECURITY DEFINER (profiles is publicly readable) and not granted to any client role -- composed only from inside the SECURITY DEFINER functions below.';

-- =============================================================================
-- 5. Internal helper: ensure_debate_subscription_default_v2 (auto-subscribe)
-- =============================================================================
-- The entire durable, opt-out-safe auto-subscription mechanism is this one
-- statement: INSERT the table's own defaults (is_subscribed = true, every
-- notify_* = true) ON CONFLICT (debate_id, user_id) DO NOTHING. It is
-- impossible for this statement to touch an existing row -- DO NOTHING means
-- exactly that -- so a user who previously called set_debate_subscription_v2
-- with is_subscribed = false can never have this flip back to true, no
-- matter how many times or from how many call sites this runs. This is what
-- "durable" and "opt-out-safe" mean operationally: the safety property comes
-- from ON CONFLICT DO NOTHING's own semantics, not from an extra existence
-- check this function would otherwise need to get right (and could race).
--
-- SECURITY DEFINER: debate_subscriptions has no client INSERT policy (by
-- design -- see the table comment), so this must run as the owner to write
-- to it regardless of which authenticated RPC calls it, matching
-- log_debate_moderation_event's identical reasoning (20260718000003, section
-- B) for the same kind of no-client-policy table.
--
-- High-intent call sites, chosen and documented here (per the task's
-- explicit "choose and document" instruction): join_debate_v2 (debater or
-- juror -- the explicit minimum bar) and cast_debate_ballot_v2 (any stage --
-- a ballot can be cast without ever having called join_debate_v2, so this is
-- not redundant with the join hook). submit_debate_argument_v2,
-- submit_cross_examination_question_v2, and submit_cross_examination_answer_v2
-- all require an existing debater membership row already, so by the time any
-- of them can succeed, join_debate_v2 has already run for that user --
-- calling this again from those functions would be a harmless but pointless
-- extra write, so they do not. toggle_debate_reaction_v2 requires no
-- membership at all and is a single lightweight click, judged not high-intent
-- enough to auto-opt someone into a subscription they may not want.
CREATE OR REPLACE FUNCTION public.ensure_debate_subscription_default_v2(
  p_debate_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.debate_subscriptions (debate_id, user_id)
  VALUES (p_debate_id, p_user_id)
  ON CONFLICT (debate_id, user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_debate_subscription_default_v2(uuid, uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.ensure_debate_subscription_default_v2(uuid, uuid) IS
  'Phase 4B internal helper: creates a default-subscribed row only if none exists yet (INSERT ... ON CONFLICT DO NOTHING), never touching an existing row -- the entire durable/opt-out-safe guarantee. Not granted to any client role -- composed only from join_debate_v2 and cast_debate_ballot_v2 (see this function''s own comment for why those two and not the others).';

-- =============================================================================
-- 6. Internal helper: emit_debate_notification_event_v2 (outbox writer)
-- =============================================================================
-- The single write path into debate_notification_events. Like the helper
-- above, SECURITY DEFINER because that table has no client policy at all.
-- ON CONFLICT (event_key) DO NOTHING is the entire deduplication mechanism:
-- a retried RPC call, a concurrent duplicate, or repeated toggling all
-- produce the same event_key for the "same" real-world event and collide
-- here into a single row -- no caller needs its own idempotency check before
-- calling this. Never raises, never acquires a lock -- an INSERT ... ON
-- CONFLICT is self-atomic, so this can safely be the very last statement in
-- any of the participation/lifecycle RPCs below without changing their lock
-- order or failure behaviour.
CREATE OR REPLACE FUNCTION public.emit_debate_notification_event_v2(
  p_debate_id uuid,
  p_event_key text,
  p_event_type text,
  p_actor_id uuid,
  p_target_user_id uuid,
  p_round_id uuid,
  p_argument_id uuid,
  p_exchange_id uuid,
  p_notification_type text,
  p_message text,
  p_link text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.debate_notification_events (
    debate_id, event_key, event_type, actor_id, target_user_id,
    round_id, argument_id, exchange_id, payload
  )
  VALUES (
    p_debate_id, p_event_key, p_event_type, p_actor_id, p_target_user_id,
    p_round_id, p_argument_id, p_exchange_id,
    jsonb_build_object(
      'notification_type', p_notification_type,
      'message', p_message,
      'link', p_link
    )
  )
  ON CONFLICT (event_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_debate_notification_event_v2(uuid, text, text, uuid, uuid, uuid, uuid, uuid, text, text, text) FROM PUBLIC;

COMMENT ON FUNCTION public.emit_debate_notification_event_v2(uuid, text, text, uuid, uuid, uuid, uuid, uuid, text, text, text) IS
  'Phase 4B internal helper: the only write path into debate_notification_events. ON CONFLICT (event_key) DO NOTHING is the full deduplication mechanism -- see each call site below for its event_key format. Not granted to any client role -- composed only from the participation/lifecycle RPCs below, always as their last statement, after their own mutation has already succeeded.';

-- =============================================================================
-- 7. set_debate_subscription_v2: the authenticated subscription write RPC
-- =============================================================================
-- Atomic upsert on (debate_id, user_id). is_subscribed is always the
-- caller-supplied value (a required parameter -- there is no ambiguity to
-- preserve for it, unlike the five nullable preference parameters below,
-- each of which is preserved via COALESCE(p_param, <existing row's own
-- column>) when omitted (NULL), so a caller updating only is_subscribed (or
-- only one preference) never has to resend every field just to avoid
-- clobbering the others. On first-ever subscribe (no existing row), an
-- omitted preference falls back to the table's own default (true) via the
-- second COALESCE argument in the INSERT branch.
--
-- auth.uid() is the only source of identity -- p_debate_id and every
-- preference are the only client-supplied values; there is no p_user_id
-- parameter for a caller to spoof. Returns only the caller's own resulting
-- row -- never another user's subscription state, never a subscriber count
-- or list (this function cannot even see another user's row: it only ever
-- touches the one row keyed by (p_debate_id, auth.uid())).
CREATE OR REPLACE FUNCTION public.set_debate_subscription_v2(
  p_debate_id uuid,
  p_is_subscribed boolean,
  p_notify_phase_changes boolean DEFAULT NULL,
  p_notify_direct_responses boolean DEFAULT NULL,
  p_notify_evidence_requests boolean DEFAULT NULL,
  p_notify_final_vote boolean DEFAULT NULL,
  p_notify_recap boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_format_version smallint;
  v_row public.debate_subscriptions;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Correction (post-review): deliberately NOT gated on is_suspended(),
  -- unlike every other authenticated V2 participation RPC. Those functions
  -- gate on suspension because they let a suspended user create new content
  -- or otherwise participate (arguments, ballots, reactions, questions,
  -- answers, joining). This function only ever lets a caller manage their
  -- own notification preferences for their own inbox -- unsubscribing or
  -- disabling notifications is not content creation and does not need to be
  -- blocked. Blocking it would actively make suspension worse: the system
  -- would keep sending a suspended user notifications while refusing to let
  -- them opt out.
  IF p_is_subscribed IS NULL THEN
    RAISE EXCEPTION 'is_subscribed is required.';
  END IF;

  -- Unlocked read is safe here: format_version never reverts once a debate
  -- is V2 (same reasoning used throughout Phase 4A for identical checks),
  -- and this function performs no other read of the debate row.
  SELECT format_version INTO v_format_version
    FROM public.debates WHERE id = p_debate_id;

  IF v_format_version IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;
  IF v_format_version <> 2 THEN
    RAISE EXCEPTION 'This debate is not a Debate V2 debate.';
  END IF;

  INSERT INTO public.debate_subscriptions (
    debate_id, user_id, is_subscribed,
    notify_phase_changes, notify_direct_responses, notify_evidence_requests,
    notify_final_vote, notify_recap
  )
  VALUES (
    p_debate_id, v_user_id, p_is_subscribed,
    COALESCE(p_notify_phase_changes, true),
    COALESCE(p_notify_direct_responses, true),
    COALESCE(p_notify_evidence_requests, true),
    COALESCE(p_notify_final_vote, true),
    COALESCE(p_notify_recap, true)
  )
  ON CONFLICT (debate_id, user_id) DO UPDATE SET
    is_subscribed = p_is_subscribed,
    notify_phase_changes = COALESCE(p_notify_phase_changes, debate_subscriptions.notify_phase_changes),
    notify_direct_responses = COALESCE(p_notify_direct_responses, debate_subscriptions.notify_direct_responses),
    notify_evidence_requests = COALESCE(p_notify_evidence_requests, debate_subscriptions.notify_evidence_requests),
    notify_final_vote = COALESCE(p_notify_final_vote, debate_subscriptions.notify_final_vote),
    notify_recap = COALESCE(p_notify_recap, debate_subscriptions.notify_recap),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'debate_id', v_row.debate_id,
    'is_subscribed', v_row.is_subscribed,
    'notify_phase_changes', v_row.notify_phase_changes,
    'notify_direct_responses', v_row.notify_direct_responses,
    'notify_evidence_requests', v_row.notify_evidence_requests,
    'notify_final_vote', v_row.notify_final_vote,
    'notify_recap', v_row.notify_recap
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_debate_subscription_v2(uuid, boolean, boolean, boolean, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_debate_subscription_v2(uuid, boolean, boolean, boolean, boolean, boolean, boolean) TO authenticated;

COMMENT ON FUNCTION public.set_debate_subscription_v2(uuid, boolean, boolean, boolean, boolean, boolean, boolean) IS
  'Phase 4B: authenticated subscribe/unsubscribe + preference upsert, atomic via INSERT ... ON CONFLICT DO UPDATE. is_subscribed is always the caller-supplied value; each of the five notify_* parameters is preserved (COALESCE against the existing row) when omitted (NULL), so a caller can update is_subscribed alone without resetting preferences. Returns only the caller''s own resulting row -- never another user''s state, never a subscriber count. Identity is always auth.uid(), never a client-supplied user id.';

-- =============================================================================
-- 8. Auto-subscription: join_debate_v2 (extended)
-- =============================================================================
-- Reproduced in full from 20260718000003 with one addition: a call to
-- ensure_debate_subscription_default_v2 after the debate/status checks pass
-- and before the debater/juror branch, covering both roles with a single
-- call (see that helper's own comment for why join_debate_v2 is one of the
-- two chosen high-intent call sites). Every other line -- error ordering,
-- locking, the ON CONFLICT / GET DIAGNOSTICS race-safety pattern in each
-- branch -- is unchanged.
CREATE OR REPLACE FUNCTION public.join_debate_v2(
  p_debate_id uuid,
  p_role text,
  p_stance text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_format_version smallint;
  v_status text;
  v_existing_stance text;
  v_rows_affected integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Your account is currently suspended.';
  END IF;

  IF p_role NOT IN ('debater', 'juror') THEN
    RAISE EXCEPTION 'You cannot self-assign this role. Allowed roles are debater and juror.';
  END IF;

  SELECT format_version, status
    INTO v_format_version, v_status
    FROM public.debates
   WHERE id = p_debate_id
   FOR UPDATE;

  IF v_format_version IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;

  IF v_format_version <> 2 THEN
    RAISE EXCEPTION 'This debate is not a Debate V2 debate. Use join_debate instead.';
  END IF;

  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'This debate is closed.';
  END IF;

  -- Phase 4B: high-intent auto-subscribe, covering both roles with one call.
  -- ON CONFLICT DO NOTHING inside the helper means this is a harmless no-op
  -- for a returning member or an already-subscribed/opted-out user -- see
  -- ensure_debate_subscription_default_v2's own comment.
  PERFORM public.ensure_debate_subscription_default_v2(p_debate_id, v_user_id);

  IF p_role = 'debater' THEN
    IF p_stance NOT IN ('for', 'against') THEN
      RAISE EXCEPTION 'A debater must select for or against.';
    END IF;

    IF v_status <> 'open' THEN
      RAISE EXCEPTION 'Debaters may only join while the debate is in its open lobby.';
    END IF;

    INSERT INTO public.debate_memberships (debate_id, user_id, role, stance)
    VALUES (p_debate_id, v_user_id, 'debater', p_stance)
    ON CONFLICT (debate_id, user_id, role) DO NOTHING;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    SELECT stance INTO v_existing_stance
      FROM public.debate_memberships
     WHERE debate_id = p_debate_id AND user_id = v_user_id AND role = 'debater';

    RETURN jsonb_build_object(
      'role', 'debater',
      'stance', v_existing_stance,
      'already_joined', v_rows_affected = 0
    );
  ELSE
    IF p_stance IS NOT NULL THEN
      RAISE EXCEPTION 'Jurors do not carry a stance.';
    END IF;

    IF v_status NOT IN ('open', 'active') THEN
      RAISE EXCEPTION 'Jurors may only join while the debate is open or active.';
    END IF;

    INSERT INTO public.debate_memberships (debate_id, user_id, role, stance)
    VALUES (p_debate_id, v_user_id, 'juror', NULL)
    ON CONFLICT (debate_id, user_id, role) DO NOTHING;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    RETURN jsonb_build_object('role', 'juror', 'stance', NULL, 'already_joined', v_rows_affected = 0);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.join_debate_v2(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_debate_v2(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.join_debate_v2(uuid, text, text) IS
  'Phase 2, extended Phase 4B: authenticated debater/juror self-join for a V2 debate. A debater''s stance locks permanently on first join; calling again returns the existing stance unchanged. Phase 4B addition: creates a default subscription (durable, opt-out-safe) the first time any user joins in either role -- see ensure_debate_subscription_default_v2. Deliberately not logged to debate_moderation_events (ordinary high-volume activity, not a privileged/moderation action).';

-- =============================================================================
-- 9. Auto-subscription: cast_debate_ballot_v2 (extended)
-- =============================================================================
-- Reproduced in full with one addition: a call to
-- ensure_debate_subscription_default_v2 immediately before the final RETURN,
-- i.e. only after the ballot upsert has actually succeeded. A ballot can be
-- cast without ever having called join_debate_v2 (no membership row is
-- required), so this is a genuinely separate high-intent path, not a
-- duplicate of join_debate_v2's own hook.
CREATE OR REPLACE FUNCTION public.cast_debate_ballot_v2(
  p_debate_id uuid,
  p_stage text,
  p_vote text,
  p_confidence smallint,
  p_reason text DEFAULT NULL,
  p_influential_argument_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_format_version smallint;
  v_status text;
  v_final_vote_status text;
  v_ballot_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Your account is currently suspended.';
  END IF;

  IF p_stage NOT IN ('initial', 'final') THEN
    RAISE EXCEPTION 'Invalid ballot stage.';
  END IF;
  IF p_vote NOT IN ('for', 'against', 'undecided') THEN
    RAISE EXCEPTION 'Invalid vote.';
  END IF;
  IF p_confidence IS NULL OR p_confidence < 1 OR p_confidence > 5 THEN
    RAISE EXCEPTION 'Confidence (1-5) is required.';
  END IF;
  IF p_influential_argument_id IS NOT NULL AND p_stage <> 'final' THEN
    RAISE EXCEPTION 'influential_argument_id is only allowed on a final ballot.';
  END IF;

  SELECT format_version, status INTO v_format_version, v_status
    FROM public.debates WHERE id = p_debate_id
   FOR UPDATE;

  IF v_format_version IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;
  IF v_format_version <> 2 THEN
    RAISE EXCEPTION 'This debate is not a Debate V2 debate. Use cast_motion_vote instead.';
  END IF;
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'This debate is closed.';
  END IF;

  IF p_stage = 'initial' THEN
    IF v_status <> 'open' THEN
      RAISE EXCEPTION 'Initial ballots are only accepted while the debate is in its open lobby.';
    END IF;
  ELSE
    SELECT status INTO v_final_vote_status
      FROM public.debate_rounds
     WHERE debate_id = p_debate_id AND phase = 'final_vote'
     FOR UPDATE;

    IF v_final_vote_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'Final ballots are only accepted while the final vote round is active.';
    END IF;
  END IF;

  INSERT INTO public.debate_ballots (
    debate_id, user_id, stage, vote, confidence, reason, influential_argument_id
  )
  VALUES (
    p_debate_id, v_user_id, p_stage, p_vote, p_confidence, p_reason, p_influential_argument_id
  )
  ON CONFLICT (debate_id, user_id, stage)
  DO UPDATE SET
    vote = excluded.vote,
    confidence = excluded.confidence,
    reason = excluded.reason,
    influential_argument_id = excluded.influential_argument_id,
    updated_at = now()
  RETURNING id INTO v_ballot_id;

  -- Phase 4B: high-intent auto-subscribe -- only after the ballot write has
  -- actually succeeded. See this migration's helper section for why this is
  -- a genuinely separate high-intent path from join_debate_v2's own hook.
  PERFORM public.ensure_debate_subscription_default_v2(p_debate_id, v_user_id);

  RETURN jsonb_build_object(
    'ballot_id', v_ballot_id,
    'debate_id', p_debate_id,
    'stage', p_stage,
    'vote', p_vote,
    'confidence', p_confidence
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cast_debate_ballot_v2(uuid, text, text, smallint, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cast_debate_ballot_v2(uuid, text, text, smallint, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.cast_debate_ballot_v2(uuid, text, text, smallint, text, uuid) IS
  'Phase 2, extended Phase 4B: authenticated initial/final ballot upsert. created_at is preserved and updated_at bumped by ON CONFLICT DO UPDATE. Returns only the caller''s own ballot -- never another user''s. Phase 4B addition: creates a default subscription (durable, opt-out-safe) the first time any user casts a ballot, independent of whether they ever called join_debate_v2 -- see ensure_debate_subscription_default_v2.';

-- =============================================================================
-- 10. Round/phase-change events: start_debate_round_one_v2 (extended)
-- =============================================================================
-- Reproduced in full with one addition: on a genuine (non-idempotent) start,
-- emit a round_change event immediately before the final RETURN. Round 1 is
-- always the opening phase (SEEDED_ROUND_PHASES_V2's first entry), so this
-- never needs to distinguish a final_vote case the way section 11 below
-- does. event_key is keyed to this round's one-time transition to active,
-- so it can never collide with any other event this migration emits and
-- never fires twice for the same round (a repeat call short-circuits into
-- the already_started branch above, which returns before reaching this
-- statement -- no event, matching "stale_no_op/not_due transitions emit
-- nothing").
CREATE OR REPLACE FUNCTION public.start_debate_round_one_v2(
  p_debate_id uuid,
  p_actor_id uuid,
  p_is_automatic boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_format_version smallint;
  v_status text;
  v_debate_duration integer;
  v_round_id uuid;
  v_round_status text;
  v_round_duration integer;
  v_round_starts_at timestamptz;
  v_now timestamptz := now();
BEGIN
  SELECT format_version, status, round_duration_minutes
    INTO v_format_version, v_status, v_debate_duration
    FROM public.debates
   WHERE id = p_debate_id
   FOR UPDATE;

  IF v_format_version IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;
  IF v_format_version <> 2 THEN
    RAISE EXCEPTION 'This debate is not a Debate V2 debate.';
  END IF;

  IF NOT p_is_automatic AND NOT public.can_manage_debate_v2(p_debate_id, p_actor_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage this debate.';
  END IF;

  SELECT id, status, duration_minutes, starts_at
    INTO v_round_id, v_round_status, v_round_duration, v_round_starts_at
    FROM public.debate_rounds
   WHERE debate_id = p_debate_id
     AND sequence_number = 1
   FOR UPDATE;

  IF v_round_id IS NULL THEN
    RAISE EXCEPTION 'No opening round found. Has this debate been activated for Debate V2 (activate_debate_v2)?';
  END IF;

  IF v_round_status <> 'scheduled' THEN
    RETURN jsonb_build_object(
      'already_started', true, 'debate_id', p_debate_id,
      'round_id', v_round_id, 'status', v_round_status
    );
  END IF;

  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Debate must be open (in its lobby) to start. Current status: %', v_status;
  END IF;

  UPDATE public.debates
     SET status = 'active'
   WHERE id = p_debate_id;

  UPDATE public.debate_rounds
     SET status = 'active',
         started_at = v_now,
         starts_at = COALESCE(v_round_starts_at, v_now),
         ends_at = v_now + make_interval(mins => GREATEST(COALESCE(v_round_duration, v_debate_duration, 5), 1)),
         updated_at = v_now
   WHERE id = v_round_id;

  PERFORM public.log_debate_moderation_event(
    p_debate_id, p_actor_id, 'round', v_round_id, 'debate_started', NULL,
    jsonb_build_object('automatic', p_is_automatic)
  );

  -- Phase 4B: round/phase-change event, subscribers with notify_phase_changes
  -- enabled. event_key is scoped to this round's one-time active transition.
  PERFORM public.emit_debate_notification_event_v2(
    p_debate_id,
    p_debate_id::text || ':round:' || v_round_id::text || ':active',
    'round_change',
    p_actor_id,
    NULL,
    v_round_id,
    NULL,
    NULL,
    'debate_v2_round_change',
    'The debate has started. Opening statements are underway.',
    '/debates/' || p_debate_id::text
  );

  RETURN jsonb_build_object(
    'already_started', false, 'debate_id', p_debate_id,
    'round_id', v_round_id, 'status', 'active'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_debate_round_one_v2(uuid, uuid, boolean) FROM PUBLIC;

COMMENT ON FUNCTION public.start_debate_round_one_v2(uuid, uuid, boolean) IS
  'Phase 2, extended Phase 4B: shared internal opening-round transition (see 20260718000003''s own module comment for the manual/automatic sharing rationale). Phase 4B addition: emits one round_change notification event on a genuine (non-idempotent) start -- never on the already_started short-circuit. Not granted to any client role.';

-- =============================================================================
-- 11. Round/phase-change + final-vote events: advance_or_close_debate_round_v2
-- =============================================================================
-- Reproduced in full with one addition: on a genuine round_advanced
-- transition (never on stale_no_op, not_due, or debate_completed -- all
-- three return before reaching this code), emit either a dedicated
-- final_vote_open event (if the newly-active round's phase is final_vote) or
-- a generic round_change event -- never both, per the task's explicit
-- "avoid sending a generic phase-change notification for final_vote if a
-- dedicated final-vote notification will also be sent". debate_completed
-- (final_vote -> closed) intentionally emits nothing -- "debate closed" is
-- not one of the five required event categories; see the Phase 4B doc's
-- deferrals section.
CREATE OR REPLACE FUNCTION public.advance_or_close_debate_round_v2(
  p_debate_id uuid,
  p_actor_id uuid,
  p_is_automatic boolean,
  p_expected_round_id uuid DEFAULT NULL,
  p_require_due boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_format_version smallint;
  v_debate_status text;
  v_active_round_id uuid;
  v_active_sequence integer;
  v_active_phase text;
  v_active_ends_at timestamptz;
  v_next_round_id uuid;
  v_next_phase text;
  v_next_duration integer;
  v_debate_duration integer;
  v_now timestamptz := now();
  v_action text;
BEGIN
  v_action := CASE WHEN p_is_automatic THEN 'round_auto_advanced' ELSE 'round_advanced' END;

  SELECT format_version, status, round_duration_minutes
    INTO v_format_version, v_debate_status, v_debate_duration
    FROM public.debates
   WHERE id = p_debate_id
   FOR UPDATE;

  IF v_format_version IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;
  IF v_format_version <> 2 THEN
    RAISE EXCEPTION 'This debate is not a Debate V2 debate.';
  END IF;
  IF v_debate_status <> 'active' THEN
    RAISE EXCEPTION 'Debate must be active to advance its round. Current status: %', v_debate_status;
  END IF;

  IF NOT p_is_automatic AND NOT public.can_manage_debate_v2(p_debate_id, p_actor_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage this debate.';
  END IF;

  SELECT id, sequence_number, phase, ends_at
    INTO v_active_round_id, v_active_sequence, v_active_phase, v_active_ends_at
    FROM public.debate_rounds
   WHERE debate_id = p_debate_id
     AND status = 'active'
   FOR UPDATE;

  IF v_active_round_id IS NULL THEN
    RAISE EXCEPTION 'No active round to advance.';
  END IF;

  IF p_expected_round_id IS NOT NULL AND p_expected_round_id <> v_active_round_id THEN
    RETURN jsonb_build_object(
      'result', 'stale_no_op',
      'debate_id', p_debate_id,
      'expected_round_id', p_expected_round_id,
      'actual_active_round_id', v_active_round_id
    );
  END IF;

  IF p_require_due AND (v_active_ends_at IS NULL OR v_active_ends_at > v_now) THEN
    RETURN jsonb_build_object(
      'result', 'not_due',
      'debate_id', p_debate_id,
      'round_id', v_active_round_id,
      'ends_at', v_active_ends_at
    );
  END IF;

  UPDATE public.debate_rounds
     SET status = 'completed', completed_at = v_now, updated_at = v_now
   WHERE id = v_active_round_id;

  IF v_active_phase = 'final_vote' THEN
    UPDATE public.debates
       SET status = 'closed', ends_at = v_now, closure_kind = 'completed'
     WHERE id = p_debate_id;

    PERFORM public.log_debate_moderation_event(
      p_debate_id, p_actor_id, 'round', v_active_round_id, v_action, NULL,
      jsonb_build_object(
        'old_round_id', v_active_round_id, 'old_phase', v_active_phase,
        'result', 'debate_completed', 'automatic', p_is_automatic
      )
    );
    PERFORM public.log_debate_moderation_event(
      p_debate_id, p_actor_id, 'debate', p_debate_id, 'debate_completed', NULL,
      jsonb_build_object('closure_kind', 'completed', 'automatic', p_is_automatic)
    );

    RETURN jsonb_build_object('result', 'debate_completed', 'debate_id', p_debate_id);
  END IF;

  SELECT id, phase, duration_minutes
    INTO v_next_round_id, v_next_phase, v_next_duration
    FROM public.debate_rounds
   WHERE debate_id = p_debate_id
     AND sequence_number = v_active_sequence + 1
   FOR UPDATE;

  IF v_next_round_id IS NULL THEN
    RAISE EXCEPTION 'No round found after sequence % for debate %.', v_active_sequence, p_debate_id;
  END IF;

  UPDATE public.debate_rounds
     SET status = 'active',
         started_at = v_now,
         starts_at = COALESCE(starts_at, v_now),
         ends_at = v_now + make_interval(mins => GREATEST(COALESCE(v_next_duration, v_debate_duration, 5), 1)),
         updated_at = v_now
   WHERE id = v_next_round_id;

  PERFORM public.log_debate_moderation_event(
    p_debate_id, p_actor_id, 'round', v_next_round_id, v_action, NULL,
    jsonb_build_object(
      'old_round_id', v_active_round_id, 'old_phase', v_active_phase,
      'new_round_id', v_next_round_id, 'new_phase', v_next_phase,
      'automatic', p_is_automatic
    )
  );

  -- Phase 4B: dedicated final_vote_open event when the newly-active round is
  -- the final vote, otherwise a generic round_change event -- never both.
  -- event_key is scoped to the newly-active round's one-time transition, so
  -- this can never fire twice for the same round even under a concurrent
  -- retry (already excluded by the locking above regardless).
  IF v_next_phase = 'final_vote' THEN
    PERFORM public.emit_debate_notification_event_v2(
      p_debate_id,
      p_debate_id::text || ':final_vote:' || v_next_round_id::text,
      'final_vote_open',
      p_actor_id,
      NULL,
      v_next_round_id,
      NULL,
      NULL,
      'debate_v2_final_vote',
      'Final voting has opened in a debate you''re following.',
      '/debates/' || p_debate_id::text
    );
  ELSE
    PERFORM public.emit_debate_notification_event_v2(
      p_debate_id,
      p_debate_id::text || ':round:' || v_next_round_id::text || ':active',
      'round_change',
      p_actor_id,
      NULL,
      v_next_round_id,
      NULL,
      NULL,
      'debate_v2_round_change',
      'A new round has started in a debate you''re following.',
      '/debates/' || p_debate_id::text
    );
  END IF;

  RETURN jsonb_build_object(
    'result', 'round_advanced', 'debate_id', p_debate_id,
    'old_phase', v_active_phase, 'new_phase', v_next_phase
  );
END;
$$;

REVOKE ALL ON FUNCTION public.advance_or_close_debate_round_v2(uuid, uuid, boolean, uuid, boolean) FROM PUBLIC;

COMMENT ON FUNCTION public.advance_or_close_debate_round_v2(uuid, uuid, boolean, uuid, boolean) IS
  'Phase 2, extended Phase 4B: the single shared round-advance/close transition (see 20260718000003''s own comment for the double-advance/round-skip race it closes). Phase 4B addition: on a genuine round_advanced result, emits exactly one notification event -- final_vote_open if the new round is the final vote, round_change otherwise, never both. stale_no_op, not_due, and debate_completed emit nothing. Not granted to any client role.';

-- =============================================================================
-- 12. Direct response (rebuttal): submit_debate_argument_v2 (extended)
-- =============================================================================
-- Reproduced in full with one addition: after a rebuttal argument is
-- successfully inserted (and its sources, if any), emit a
-- direct_response_rebuttal event targeting the parent argument's author.
-- v_parent_author_id is already resolved (and already guaranteed <> v_user_id
-- by the existing "you cannot rebut your own argument" check above) by the
-- rebuttal-validation branch, so no new query is needed for the target.
-- event_key is scoped to the new rebuttal argument's own id, which is
-- created exactly once, so this can never fire twice for the same rebuttal.
CREATE OR REPLACE FUNCTION public.submit_debate_argument_v2(
  p_debate_id uuid,
  p_claim text,
  p_content text,
  p_entry_type text,
  p_parent_argument_id uuid DEFAULT NULL,
  p_relation_type text DEFAULT NULL,
  p_sources jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_stance text;
  v_format_version smallint;
  v_status text;
  v_active_round_id uuid;
  v_active_phase text;
  v_active_sequence integer;
  v_claim text;
  v_content text;
  v_word_limit integer;
  v_word_count integer;
  v_existing_count integer;
  v_parent_debate_id uuid;
  v_parent_stance text;
  v_parent_round_id uuid;
  v_parent_author_id uuid;
  v_parent_round_seq integer;
  v_argument_id uuid;
  v_source jsonb;
  v_source_count integer := 0;
  v_max_opening CONSTANT integer := 300;
  v_max_rebuttal CONSTANT integer := 200;
  v_max_closing CONSTANT integer := 150;
  v_max_claim_len CONSTANT integer := 240;
  v_max_content_len CONSTANT integer := 8000;
  v_max_source_url_len CONSTANT integer := 2048;
  v_max_source_title_len CONSTANT integer := 300;
  v_max_source_publisher_len CONSTANT integer := 200;
  v_max_source_quote_len CONSTANT integer := 1000;
  v_max_sources CONSTANT integer := 5;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Your account is currently suspended.';
  END IF;

  IF p_entry_type NOT IN ('opening', 'rebuttal', 'closing') THEN
    RAISE EXCEPTION 'Invalid entry_type for argument submission.';
  END IF;

  v_claim := btrim(COALESCE(p_claim, ''));
  v_content := btrim(COALESCE(p_content, ''));

  IF v_claim = '' THEN
    RAISE EXCEPTION 'A claim is required.';
  END IF;
  IF v_content = '' THEN
    RAISE EXCEPTION 'Argument content is required.';
  END IF;
  IF length(v_claim) > v_max_claim_len THEN
    RAISE EXCEPTION 'Claim exceeds the maximum length of % characters.', v_max_claim_len;
  END IF;
  IF length(v_content) > v_max_content_len THEN
    RAISE EXCEPTION 'Argument content exceeds the maximum length of % characters.', v_max_content_len;
  END IF;

  SELECT format_version, status INTO v_format_version, v_status
    FROM public.debates WHERE id = p_debate_id
   FOR UPDATE;

  IF v_format_version IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;
  IF v_format_version <> 2 THEN
    RAISE EXCEPTION 'This debate is not a Debate V2 debate. Use the V1 argument form instead.';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Arguments can only be submitted while the debate is active.';
  END IF;

  SELECT stance INTO v_stance
    FROM public.debate_memberships
   WHERE debate_id = p_debate_id AND user_id = v_user_id AND role = 'debater'
   FOR UPDATE;

  IF v_stance IS NULL THEN
    RAISE EXCEPTION 'You must join this debate as a debater (join_debate_v2) before submitting an argument.';
  END IF;

  SELECT id, phase, sequence_number
    INTO v_active_round_id, v_active_phase, v_active_sequence
    FROM public.debate_rounds
   WHERE debate_id = p_debate_id AND status = 'active'
   FOR UPDATE;

  IF v_active_round_id IS NULL THEN
    RAISE EXCEPTION 'No active round to submit an argument into.';
  END IF;

  IF v_active_phase = 'cross_examination' THEN
    RAISE EXCEPTION 'Cross-examination has its own question/answer mechanics, coming in a later phase. General argument submission is not accepted during this round.';
  END IF;
  IF v_active_phase = 'final_vote' THEN
    RAISE EXCEPTION 'Argument submission is closed once final voting begins.';
  END IF;
  IF v_active_phase <> p_entry_type THEN
    RAISE EXCEPTION 'entry_type (%) does not match the active round phase (%).', p_entry_type, v_active_phase;
  END IF;

  IF p_entry_type = 'opening' THEN
    IF p_parent_argument_id IS NOT NULL OR p_relation_type IS NOT NULL THEN
      RAISE EXCEPTION 'Opening arguments cannot have a parent_argument_id or relation_type.';
    END IF;
    v_word_limit := v_max_opening;

    SELECT count(*) INTO v_existing_count
      FROM public.debate_arguments
     WHERE debate_id = p_debate_id AND author_id = v_user_id AND entry_type = 'opening';
    IF v_existing_count >= 1 THEN
      RAISE EXCEPTION 'You have already submitted your opening argument.';
    END IF;

  ELSIF p_entry_type = 'closing' THEN
    IF p_parent_argument_id IS NOT NULL OR p_relation_type IS NOT NULL THEN
      RAISE EXCEPTION 'Closing arguments cannot have a parent_argument_id or relation_type.';
    END IF;
    v_word_limit := v_max_closing;

    SELECT count(*) INTO v_existing_count
      FROM public.debate_arguments
     WHERE debate_id = p_debate_id AND author_id = v_user_id AND entry_type = 'closing';
    IF v_existing_count >= 1 THEN
      RAISE EXCEPTION 'You have already submitted your closing argument.';
    END IF;

  ELSE -- rebuttal
    IF p_parent_argument_id IS NULL OR p_relation_type IS NULL THEN
      RAISE EXCEPTION 'A rebuttal requires both parent_argument_id and relation_type.';
    END IF;
    IF p_relation_type NOT IN ('supports', 'challenges', 'answers', 'clarifies') THEN
      RAISE EXCEPTION 'Invalid relation_type.';
    END IF;
    v_word_limit := v_max_rebuttal;

    SELECT count(*) INTO v_existing_count
      FROM public.debate_arguments
     WHERE debate_id = p_debate_id AND author_id = v_user_id AND entry_type = 'rebuttal';
    IF v_existing_count >= 2 THEN
      RAISE EXCEPTION 'You have already submitted the maximum of two rebuttals.';
    END IF;

    SELECT debate_id, stance, round_id, author_id
      INTO v_parent_debate_id, v_parent_stance, v_parent_round_id, v_parent_author_id
      FROM public.debate_arguments
     WHERE id = p_parent_argument_id;

    IF v_parent_debate_id IS NULL THEN
      RAISE EXCEPTION 'parent_argument_id does not reference an existing argument.';
    END IF;
    IF v_parent_debate_id <> p_debate_id THEN
      RAISE EXCEPTION 'parent_argument_id must belong to the same debate.';
    END IF;
    IF v_parent_author_id = v_user_id THEN
      RAISE EXCEPTION 'You cannot rebut your own argument.';
    END IF;

    SELECT sequence_number INTO v_parent_round_seq
      FROM public.debate_rounds WHERE id = v_parent_round_id;

    IF v_parent_round_seq IS NULL OR v_parent_round_seq >= v_active_sequence THEN
      RAISE EXCEPTION 'A rebuttal must target an argument from an earlier round.';
    END IF;

    IF p_relation_type = 'challenges' AND v_parent_stance = v_stance THEN
      RAISE EXCEPTION 'A direct challenge must target the opposing stance.';
    END IF;
  END IF;

  v_word_count := public.count_words_v2(v_content);
  IF v_word_count > v_word_limit THEN
    RAISE EXCEPTION 'Argument exceeds the %-word limit for % (currently % words).', v_word_limit, p_entry_type, v_word_count;
  END IF;

  IF jsonb_typeof(p_sources) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_sources must be a JSON array.';
  END IF;

  SELECT count(*) INTO v_source_count FROM jsonb_array_elements(p_sources);
  IF v_source_count > v_max_sources THEN
    RAISE EXCEPTION 'A maximum of % sources may be attached.', v_max_sources;
  END IF;

  FOR v_source IN SELECT * FROM jsonb_array_elements(p_sources)
  LOOP
    IF jsonb_typeof(v_source -> 'url') IS DISTINCT FROM 'string' OR btrim(v_source ->> 'url') = '' THEN
      RAISE EXCEPTION 'Each source must have a non-empty url.';
    END IF;
    IF length(v_source ->> 'url') > v_max_source_url_len THEN
      RAISE EXCEPTION 'A source url exceeds the maximum length of % characters.', v_max_source_url_len;
    END IF;
    IF (v_source ? 'title') AND jsonb_typeof(v_source -> 'title') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'A source title must be a string.';
    END IF;
    IF length(v_source ->> 'title') > v_max_source_title_len THEN
      RAISE EXCEPTION 'A source title exceeds the maximum length of % characters.', v_max_source_title_len;
    END IF;
    IF length(v_source ->> 'publisher') > v_max_source_publisher_len THEN
      RAISE EXCEPTION 'A source publisher exceeds the maximum length of % characters.', v_max_source_publisher_len;
    END IF;
    IF length(v_source ->> 'quoted_text') > v_max_source_quote_len THEN
      RAISE EXCEPTION 'A source quote exceeds the maximum length of % characters.', v_max_source_quote_len;
    END IF;
  END LOOP;

  INSERT INTO public.debate_arguments (
    debate_id, author_id, content, round_number, stance,
    round_id, parent_argument_id, relation_type, entry_type, claim
  )
  VALUES (
    p_debate_id, v_user_id, v_content, v_active_sequence, v_stance,
    v_active_round_id, p_parent_argument_id, p_relation_type, p_entry_type, v_claim
  )
  RETURNING id INTO v_argument_id;

  IF v_source_count > 0 THEN
    FOR v_source IN SELECT * FROM jsonb_array_elements(p_sources)
    LOOP
      INSERT INTO public.debate_argument_sources (
        argument_id, added_by, url, title, publisher, published_at, quoted_text
      )
      VALUES (
        v_argument_id, v_user_id,
        btrim(v_source ->> 'url'),
        NULLIF(btrim(COALESCE(v_source ->> 'title', '')), ''),
        NULLIF(btrim(COALESCE(v_source ->> 'publisher', '')), ''),
        CASE WHEN COALESCE(v_source ->> 'published_at', '') <> ''
             THEN (v_source ->> 'published_at')::timestamptz ELSE NULL END,
        NULLIF(btrim(COALESCE(v_source ->> 'quoted_text', '')), '')
      );
    END LOOP;
  END IF;

  -- Phase 4B: direct-response event for a rebuttal, targeting the parent
  -- argument's author (already confirmed <> v_user_id above). event_key is
  -- scoped to this new argument's own id, created exactly once.
  IF p_entry_type = 'rebuttal' THEN
    PERFORM public.emit_debate_notification_event_v2(
      p_debate_id,
      p_debate_id::text || ':rebuttal:' || v_argument_id::text,
      'direct_response_rebuttal',
      v_user_id,
      v_parent_author_id,
      v_active_round_id,
      v_argument_id,
      NULL,
      'debate_v2_direct_response',
      public.debate_display_name_v2(v_user_id) || ' responded to your argument.',
      '/debates/' || p_debate_id::text
    );
  END IF;

  RETURN jsonb_build_object(
    'argument_id', v_argument_id,
    'debate_id', p_debate_id,
    'round_id', v_active_round_id,
    'round_number', v_active_sequence,
    'stance', v_stance,
    'entry_type', p_entry_type,
    'source_count', v_source_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_debate_argument_v2(uuid, text, text, text, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_debate_argument_v2(uuid, text, text, text, uuid, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.submit_debate_argument_v2(uuid, text, text, text, uuid, text, jsonb) IS
  'Phase 2, extended Phase 4B: authenticated V2 argument submission. Stance is always the caller''s locked debate_memberships stance, never a caller-supplied value. round_id/round_number are assigned server-side from the active round. Rejects cross_examination and final_vote outright. Phase 4B addition: a rebuttal emits one direct_response_rebuttal event targeting the parent argument''s author. The Phase 1 debate_arguments_check_same_debate and debate_arguments_parent_relation_pairing_check remain final integrity guards on round_id/parent_argument_id/relation_type.';

-- =============================================================================
-- 13. Evidence-requested event: toggle_debate_reaction_v2 (extended)
-- =============================================================================
-- Reproduced in full with one addition: in the "adding a reaction" branch
-- only (never on removal -- toggling off must not notify), when the
-- reaction being added is needs_evidence, emit one evidence_requested event
-- targeting the argument's author. event_key is scoped to
-- (debate, argument) only -- not the reactor, not the individual reaction
-- row -- so the FIRST needs_evidence add on a given argument, by anyone,
-- creates the one and only lifetime event for that argument; every
-- subsequent add (a different user, or the same user after an off/on cycle)
-- collides on the same key and is silently absorbed. This is the chosen,
-- documented answer to "repeated off/on activity must not create
-- notification spam": the author is told once that an argument was flagged,
-- not once per flagger and not once per toggle cycle.
CREATE OR REPLACE FUNCTION public.toggle_debate_reaction_v2(
  p_argument_id uuid,
  p_reaction_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_debate_id uuid;
  v_author_id uuid;
  v_format_version smallint;
  v_status text;
  v_existing boolean;
  v_counts jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Your account is currently suspended.';
  END IF;

  IF p_reaction_type NOT IN (
    'well_supported', 'strong_reasoning', 'clear', 'strong_rebuttal',
    'fair_to_opposition', 'changed_my_mind', 'needs_evidence'
  ) THEN
    RAISE EXCEPTION 'Invalid reaction type.';
  END IF;

  SELECT da.debate_id, da.author_id, d.format_version, d.status
    INTO v_debate_id, v_author_id, v_format_version, v_status
    FROM public.debate_arguments da
    JOIN public.debates d ON d.id = da.debate_id
   WHERE da.id = p_argument_id
   FOR UPDATE OF d, da;

  IF v_debate_id IS NULL THEN
    RAISE EXCEPTION 'Argument not found.';
  END IF;
  IF v_format_version <> 2 THEN
    RAISE EXCEPTION 'This argument does not belong to a Debate V2 debate.';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Reactions are only accepted while the debate is active.';
  END IF;
  IF v_author_id = v_user_id THEN
    RAISE EXCEPTION 'You cannot react to your own argument.';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.debate_reactions
     WHERE argument_id = p_argument_id AND user_id = v_user_id AND reaction_type = p_reaction_type
  ) INTO v_existing;

  IF v_existing THEN
    DELETE FROM public.debate_reactions
     WHERE argument_id = p_argument_id AND user_id = v_user_id AND reaction_type = p_reaction_type;
  ELSE
    INSERT INTO public.debate_reactions (argument_id, user_id, reaction_type)
    VALUES (p_argument_id, v_user_id, p_reaction_type)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.debate_memberships (debate_id, user_id, role, stance)
    VALUES (v_debate_id, v_user_id, 'juror', NULL)
    ON CONFLICT (debate_id, user_id, role) DO NOTHING;

    -- Phase 4B: evidence-requested event, once per (debate, argument) ever --
    -- see this section's own module comment for why the key is scoped this
    -- way rather than per-reactor or per-reaction-row.
    IF p_reaction_type = 'needs_evidence' THEN
      PERFORM public.emit_debate_notification_event_v2(
        v_debate_id,
        v_debate_id::text || ':evidence:' || p_argument_id::text,
        'evidence_requested',
        v_user_id,
        v_author_id,
        NULL,
        p_argument_id,
        NULL,
        'debate_v2_evidence_requested',
        public.debate_display_name_v2(v_user_id) || ' flagged your argument as needing more evidence.',
        '/debates/' || v_debate_id::text
      );
    END IF;
  END IF;

  SELECT COALESCE(jsonb_object_agg(reaction_type, cnt), '{}'::jsonb) INTO v_counts
    FROM (
      SELECT reaction_type, count(*) AS cnt
        FROM public.debate_reactions
       WHERE argument_id = p_argument_id
       GROUP BY reaction_type
    ) counts;

  RETURN jsonb_build_object(
    'argument_id', p_argument_id,
    'reacted', NOT v_existing,
    'reaction_type', p_reaction_type,
    'counts', v_counts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_debate_reaction_v2(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_debate_reaction_v2(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.toggle_debate_reaction_v2(uuid, text) IS
  'Phase 2, extended Phase 4B: atomic reaction toggle. Rejects self-reaction. Reacting creates a juror membership for the reactor if they do not already hold one. Returns per-reaction-type counts, no reactor identities. Phase 4B addition: adding needs_evidence emits one evidence_requested event, at most once ever per (debate, argument) regardless of how many users flag it or how many times the same user toggles it off and back on; removing a reaction never emits anything.';

-- =============================================================================
-- 14. Direct response (question): submit_cross_examination_question_v2 (extended)
-- =============================================================================
-- Reproduced in full with one addition: after the question is inserted,
-- emit a direct_response_question event targeting p_target_user_id (already
-- confirmed to be a different debater with the opposing stance by the
-- existing checks above). event_key is scoped to the new exchange's own id,
-- created exactly once per question.
CREATE OR REPLACE FUNCTION public.submit_cross_examination_question_v2(
  p_debate_id uuid,
  p_target_user_id uuid,
  p_question text,
  p_target_argument_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_format_version smallint;
  v_status text;
  v_stance text;
  v_target_stance text;
  v_active_round_id uuid;
  v_active_phase text;
  v_active_sequence integer;
  v_question text;
  v_word_count integer;
  v_existing_count integer;
  v_arg_debate_id uuid;
  v_arg_author_id uuid;
  v_arg_round_id uuid;
  v_arg_round_seq integer;
  v_exchange_id uuid;
  v_max_question_words CONSTANT integer := 60;
  v_max_question_chars CONSTANT integer := 2000;
  v_max_questions_per_asker CONSTANT integer := 2;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Your account is currently suspended.';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'A target debater is required.';
  END IF;

  v_question := btrim(COALESCE(p_question, ''));
  IF v_question = '' THEN
    RAISE EXCEPTION 'A question is required.';
  END IF;
  IF length(v_question) > v_max_question_chars THEN
    RAISE EXCEPTION 'Question exceeds the maximum length of % characters.', v_max_question_chars;
  END IF;

  SELECT format_version, status INTO v_format_version, v_status
    FROM public.debates WHERE id = p_debate_id
   FOR UPDATE;

  IF v_format_version IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;
  IF v_format_version <> 2 THEN
    RAISE EXCEPTION 'This debate is not a Debate V2 debate.';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Cross-examination questions can only be submitted while the debate is active.';
  END IF;

  SELECT stance INTO v_stance
    FROM public.debate_memberships
   WHERE debate_id = p_debate_id AND user_id = v_user_id AND role = 'debater'
   FOR UPDATE;

  IF v_stance IS NULL THEN
    RAISE EXCEPTION 'You must be a debater in this debate to ask a cross-examination question.';
  END IF;

  SELECT id, phase, sequence_number
    INTO v_active_round_id, v_active_phase, v_active_sequence
    FROM public.debate_rounds
   WHERE debate_id = p_debate_id AND status = 'active'
   FOR UPDATE;

  IF v_active_round_id IS NULL THEN
    RAISE EXCEPTION 'No active round to submit a question into.';
  END IF;
  IF v_active_phase <> 'cross_examination' THEN
    RAISE EXCEPTION 'Cross-examination questions can only be submitted while the cross-examination round is active.';
  END IF;

  IF p_target_user_id = v_user_id THEN
    RAISE EXCEPTION 'You cannot question yourself.';
  END IF;

  SELECT stance INTO v_target_stance
    FROM public.debate_memberships
   WHERE debate_id = p_debate_id AND user_id = p_target_user_id AND role = 'debater';

  IF v_target_stance IS NULL THEN
    RAISE EXCEPTION 'The target must be a debater in this debate.';
  END IF;
  IF v_target_stance = v_stance THEN
    RAISE EXCEPTION 'The target must have the opposing stance.';
  END IF;

  IF p_target_argument_id IS NOT NULL THEN
    SELECT debate_id, author_id, round_id
      INTO v_arg_debate_id, v_arg_author_id, v_arg_round_id
      FROM public.debate_arguments
     WHERE id = p_target_argument_id;

    IF v_arg_debate_id IS NULL THEN
      RAISE EXCEPTION 'target_argument_id does not reference an existing argument.';
    END IF;
    IF v_arg_debate_id <> p_debate_id THEN
      RAISE EXCEPTION 'target_argument_id must belong to the same debate.';
    END IF;
    IF v_arg_author_id <> p_target_user_id THEN
      RAISE EXCEPTION 'target_argument_id must be authored by the selected target.';
    END IF;

    SELECT sequence_number INTO v_arg_round_seq
      FROM public.debate_rounds WHERE id = v_arg_round_id;

    IF v_arg_round_seq IS NULL OR v_arg_round_seq >= v_active_sequence THEN
      RAISE EXCEPTION 'target_argument_id must be from an earlier round.';
    END IF;
  END IF;

  v_word_count := public.count_words_v2(v_question);
  IF v_word_count > v_max_question_words THEN
    RAISE EXCEPTION 'Question exceeds the %-word limit (currently % words).', v_max_question_words, v_word_count;
  END IF;

  SELECT count(*) INTO v_existing_count
    FROM public.debate_cross_exchanges
   WHERE debate_id = p_debate_id AND asker_id = v_user_id;
  IF v_existing_count >= v_max_questions_per_asker THEN
    RAISE EXCEPTION 'You have already asked the maximum of % cross-examination questions.', v_max_questions_per_asker;
  END IF;

  INSERT INTO public.debate_cross_exchanges (
    debate_id, round_id, asker_id, target_id, target_argument_id, question
  )
  VALUES (
    p_debate_id, v_active_round_id, v_user_id, p_target_user_id, p_target_argument_id, v_question
  )
  RETURNING id INTO v_exchange_id;

  -- Phase 4B: direct-response event targeting the asked debater. event_key
  -- is scoped to this new exchange's own id, created exactly once per
  -- question (there is no idempotency/retry branch on the ask side -- see
  -- this function's own pre-existing comment on that).
  PERFORM public.emit_debate_notification_event_v2(
    p_debate_id,
    p_debate_id::text || ':cross_question:' || v_exchange_id::text,
    'direct_response_question',
    v_user_id,
    p_target_user_id,
    v_active_round_id,
    p_target_argument_id,
    v_exchange_id,
    'debate_v2_direct_response',
    public.debate_display_name_v2(v_user_id) || ' asked you a cross-examination question.',
    '/debates/' || p_debate_id::text
  );

  RETURN jsonb_build_object(
    'exchange_id', v_exchange_id,
    'debate_id', p_debate_id,
    'round_id', v_active_round_id,
    'target_id', p_target_user_id,
    'target_argument_id', p_target_argument_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_cross_examination_question_v2(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_cross_examination_question_v2(uuid, uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.submit_cross_examination_question_v2(uuid, uuid, text, uuid) IS
  'Phase 4A, extended Phase 4B: authenticated cross-examination question submission. Only a debater may ask; the target must be a different debater in the same debate with the opposing stance; at most 2 questions per asker. Phase 4B addition: emits one direct_response_question event targeting the asked debater -- every question is a genuinely new write, so this always fires exactly once per successful call.';

-- =============================================================================
-- 15. Direct response (answer): submit_cross_examination_answer_v2 (extended)
-- =============================================================================
-- Reproduced in full with two additions: the locked exchange-row SELECT now
-- also fetches asker_id (needed as this event's target), and after the
-- answer is recorded (the genuinely-new-answer path only -- the
-- already_answered short-circuit returns earlier and never reaches this),
-- emit a direct_response_answer event targeting the original asker.
-- event_key is scoped to the exchange's own id, which can be answered at
-- most once (both by this RPC's own idempotency short-circuit and by the
-- Phase 4A answer-immutability trigger) -- a duplicate/retried answer call
-- always hits the already_answered branch and never reaches the emission
-- statement, so "duplicate answer retry emits no new event" holds even
-- without relying on the event_key's own uniqueness as a backstop.
CREATE OR REPLACE FUNCTION public.submit_cross_examination_answer_v2(
  p_debate_id uuid,
  p_exchange_id uuid,
  p_answer text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_format_version smallint;
  v_status text;
  v_stance text;
  v_active_round_id uuid;
  v_active_phase text;
  v_exchange_debate_id uuid;
  v_exchange_round_id uuid;
  v_exchange_target_id uuid;
  v_exchange_asker_id uuid;
  v_existing_answer text;
  v_answer text;
  v_word_count integer;
  v_max_answer_words CONSTANT integer := 120;
  v_max_answer_chars CONSTANT integer := 4000;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Your account is currently suspended.';
  END IF;

  v_answer := btrim(COALESCE(p_answer, ''));
  IF v_answer = '' THEN
    RAISE EXCEPTION 'An answer is required.';
  END IF;
  IF length(v_answer) > v_max_answer_chars THEN
    RAISE EXCEPTION 'Answer exceeds the maximum length of % characters.', v_max_answer_chars;
  END IF;

  SELECT format_version, status INTO v_format_version, v_status
    FROM public.debates WHERE id = p_debate_id
   FOR UPDATE;

  IF v_format_version IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;
  IF v_format_version <> 2 THEN
    RAISE EXCEPTION 'This debate is not a Debate V2 debate.';
  END IF;

  SELECT stance INTO v_stance
    FROM public.debate_memberships
   WHERE debate_id = p_debate_id AND user_id = v_user_id AND role = 'debater'
   FOR UPDATE;

  IF v_stance IS NULL THEN
    RAISE EXCEPTION 'You must be a debater in this debate to answer a cross-examination question.';
  END IF;

  SELECT debate_id, round_id, target_id, asker_id, answer
    INTO v_exchange_debate_id, v_exchange_round_id, v_exchange_target_id, v_exchange_asker_id, v_existing_answer
    FROM public.debate_cross_exchanges
   WHERE id = p_exchange_id
   FOR UPDATE;

  IF v_exchange_debate_id IS NULL THEN
    RAISE EXCEPTION 'Cross-examination question not found.';
  END IF;
  IF v_exchange_debate_id <> p_debate_id THEN
    RAISE EXCEPTION 'This question does not belong to the specified debate.';
  END IF;
  IF v_exchange_target_id <> v_user_id THEN
    RAISE EXCEPTION 'Only the targeted debater may answer this question.';
  END IF;

  IF v_existing_answer IS NOT NULL THEN
    RETURN jsonb_build_object(
      'exchange_id', p_exchange_id,
      'debate_id', p_debate_id,
      'already_answered', true
    );
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Cross-examination answers can only be submitted while the debate is active.';
  END IF;

  SELECT id, phase INTO v_active_round_id, v_active_phase
    FROM public.debate_rounds
   WHERE debate_id = p_debate_id AND status = 'active'
   FOR UPDATE;

  IF v_active_round_id IS NULL THEN
    RAISE EXCEPTION 'No active round to answer into.';
  END IF;
  IF v_active_phase <> 'cross_examination' THEN
    RAISE EXCEPTION 'Cross-examination answers can only be submitted while the cross-examination round is active.';
  END IF;
  IF v_exchange_round_id <> v_active_round_id THEN
    RAISE EXCEPTION 'This question belongs to a round that is no longer active.';
  END IF;

  v_word_count := public.count_words_v2(v_answer);
  IF v_word_count > v_max_answer_words THEN
    RAISE EXCEPTION 'Answer exceeds the %-word limit (currently % words).', v_max_answer_words, v_word_count;
  END IF;

  UPDATE public.debate_cross_exchanges
     SET answer = v_answer, answered_at = now(), updated_at = now()
   WHERE id = p_exchange_id;

  -- Phase 4B: direct-response event targeting the original asker. Only
  -- reached for a genuinely new answer -- see this section's own module
  -- comment for why a retry can never reach this statement.
  PERFORM public.emit_debate_notification_event_v2(
    p_debate_id,
    p_debate_id::text || ':cross_answer:' || p_exchange_id::text,
    'direct_response_answer',
    v_user_id,
    v_exchange_asker_id,
    v_active_round_id,
    NULL,
    p_exchange_id,
    'debate_v2_direct_response',
    public.debate_display_name_v2(v_user_id) || ' answered your cross-examination question.',
    '/debates/' || p_debate_id::text
  );

  RETURN jsonb_build_object(
    'exchange_id', p_exchange_id,
    'debate_id', p_debate_id,
    'already_answered', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_cross_examination_answer_v2(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_cross_examination_answer_v2(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.submit_cross_examination_answer_v2(uuid, uuid, text) IS
  'Phase 4A, extended Phase 4B: authenticated cross-examination answer submission. Only the exchange''s target_id may answer; an already-answered exchange short-circuits to { already_answered: true } before any new write. Phase 4B addition: a genuinely new answer emits one direct_response_answer event targeting the original asker (now also selected under the same exchange-row lock); a retry never reaches that statement at all. Answer immutability is additionally enforced by a table trigger (see 20260721000002, section A).';

-- =============================================================================
-- 16. Delivery worker: process_debate_notification_events_v2 (service_role only)
-- =============================================================================
-- Mirrors advance_due_debate_rounds_v2's batch/locking/error-isolation shape
-- exactly (20260718000003, section J): bound the batch (1-200, default 50),
-- claim rows with FOR UPDATE SKIP LOCKED so two overlapping workers can never
-- process the same event twice, wrap each event's work in its own
-- BEGIN/EXCEPTION block (an implicit savepoint) so one malformed event can
-- never abort the batch, and never hold a lock across an external network
-- call -- there is none here: "delivery" is exactly one INSERT (or a small
-- loop of INSERTs, for a broadcast event) into public.notifications, the
-- existing in-app inbox. No email/push/external provider exists in this
-- repository, so per the task's own instruction ("if the repository has no
-- external notification provider, delivery means inserting into the
-- existing in-app notifications table only"), that INSERT is the entire
-- delivery mechanism.
--
-- Recipient resolution happens here, at delivery time, never at emission
-- time: a direct event (target_user_id IS NOT NULL) delivers to exactly that
-- one user, gated on their own is_subscribed + the relevant notify_*
-- preference; a broadcast event (target_user_id IS NULL) delivers to every
-- subscriber of the debate with is_subscribed = true and the relevant
-- notify_* preference, excluding the event's own actor (nobody needs to be
-- told about the round they just advanced, or is notified of their own
-- question/answer/reaction -- though for direct events this is already
-- structurally impossible, see each emission call site's own comment).
-- Evaluating preferences here, at the moment of delivery, rather than baking
-- them into the event at emission time, is what makes "preferences are
-- evaluated consistently" hold even if a subscriber changes a preference (or
-- unsubscribes entirely) in the window between an event being emitted and
-- this worker later processing it.
--
-- Retry model: a 'pending' event, or a 'failed' event with attempts below
-- v_max_attempts, is eligible every run. A 'failed' event that has exhausted
-- its attempts is permanently excluded from every future SELECT here (dead-
-- lettered) -- its last_error remains inspectable directly in the table for
-- any future admin tooling, but automatic delivery gives up on it. A row
-- reaching 'delivered' is never revisited.
CREATE OR REPLACE FUNCTION public.process_debate_notification_events_v2(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_max_attempts CONSTANT integer := 5;
  v_event record;
  v_recipient record;
  v_notified_count integer;
  v_processed integer := 0;
  v_delivered integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  FOR v_event IN
    SELECT *
      FROM public.debate_notification_events
     WHERE status = 'pending'
        OR (status = 'failed' AND attempts < v_max_attempts)
     ORDER BY created_at
     LIMIT v_limit
       FOR UPDATE SKIP LOCKED
  LOOP
    v_processed := v_processed + 1;

    BEGIN
      v_notified_count := 0;

      IF v_event.target_user_id IS NOT NULL THEN
        -- Direct event: exactly one intended recipient, still gated on their
        -- own subscription state and preference -- an explicit unsubscribe
        -- (or a disabled notify_direct_responses/notify_evidence_requests
        -- preference) is honoured uniformly, the same as a broadcast event.
        INSERT INTO public.notifications (user_id, type, message, link, actor_id, read)
        SELECT
          v_event.target_user_id,
          v_event.payload ->> 'notification_type',
          v_event.payload ->> 'message',
          v_event.payload ->> 'link',
          v_event.actor_id,
          false
         WHERE EXISTS (
           SELECT 1 FROM public.debate_subscriptions s
            WHERE s.debate_id = v_event.debate_id
              AND s.user_id = v_event.target_user_id
              AND s.is_subscribed = true
              AND (
                (v_event.event_type IN (
                  'direct_response_question', 'direct_response_answer', 'direct_response_rebuttal'
                ) AND s.notify_direct_responses)
                OR (v_event.event_type = 'evidence_requested' AND s.notify_evidence_requests)
              )
         );

        GET DIAGNOSTICS v_notified_count = ROW_COUNT;
      ELSE
        -- Broadcast event: every subscriber with the matching preference,
        -- excluding the event's own actor.
        FOR v_recipient IN
          SELECT s.user_id
            FROM public.debate_subscriptions s
           WHERE s.debate_id = v_event.debate_id
             AND s.is_subscribed = true
             AND (v_event.actor_id IS NULL OR s.user_id <> v_event.actor_id)
             AND (
               (v_event.event_type = 'round_change' AND s.notify_phase_changes)
               OR (v_event.event_type = 'final_vote_open' AND s.notify_final_vote)
             )
        LOOP
          INSERT INTO public.notifications (user_id, type, message, link, actor_id, read)
          VALUES (
            v_recipient.user_id,
            v_event.payload ->> 'notification_type',
            v_event.payload ->> 'message',
            v_event.payload ->> 'link',
            v_event.actor_id,
            false
          );
          v_notified_count := v_notified_count + 1;
        END LOOP;
      END IF;

      UPDATE public.debate_notification_events
         SET status = 'delivered', processed_at = now(), attempts = attempts + 1
       WHERE id = v_event.id;

      IF v_notified_count > 0 THEN
        v_delivered := v_delivered + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.debate_notification_events
         SET status = 'failed', attempts = attempts + 1, last_error = SQLERRM
       WHERE id = v_event.id;
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object('event_id', v_event.id, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'delivered', v_delivered,
    'skipped', v_skipped,
    'failed', v_failed,
    'errors', v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_debate_notification_events_v2(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_debate_notification_events_v2(integer) TO service_role;

COMMENT ON FUNCTION public.process_debate_notification_events_v2(integer) IS
  'Phase 4B: service_role-only batch delivery worker. Claims up to p_limit (clamped 1-200, default 50) pending/retryable-failed events with FOR UPDATE SKIP LOCKED -- two overlapping runs can never deliver the same event twice. Each event is processed in its own exception-guarded block so one failure cannot abort the batch; a failed event keeps its attempts counter and last_error and remains retryable until attempts reaches 5, after which it is permanently excluded from future runs. Recipients and their preferences are resolved fresh at delivery time from debate_subscriptions, never cached from emission time. Delivery is a plain insert into the existing public.notifications table -- no external provider exists in this repository. Called by app/api/cron/process-debate-notifications/route.ts.';

-- =============================================================================
-- 17. Function security audit (Phase 4B)
-- =============================================================================
-- This migration creates or replaces 13 functions in total (verified by
-- counting distinct `CREATE OR REPLACE FUNCTION` statements above --
-- sections 4 through 16 inclusive: debate_display_name_v2,
-- ensure_debate_subscription_default_v2, emit_debate_notification_event_v2,
-- set_debate_subscription_v2, join_debate_v2, cast_debate_ballot_v2,
-- start_debate_round_one_v2, advance_or_close_debate_round_v2,
-- submit_debate_argument_v2, toggle_debate_reaction_v2,
-- submit_cross_examination_question_v2, submit_cross_examination_answer_v2,
-- process_debate_notification_events_v2. Every other occurrence of the
-- phrase "CREATE OR REPLACE FUNCTION" in this file is inside a prose
-- comment, not a statement.
--
-- SET search_path = public: all 13.
--
-- SECURITY DEFINER: 11 of 13 -- every function that writes to a table with
-- no client policy (debate_subscriptions, debate_notification_events,
-- debate_memberships, debate_ballots, debate_reactions, debate_arguments,
-- debate_argument_sources, debate_cross_exchanges, debate_rounds, debates,
-- public.notifications) or that must run the elevated internal transition
-- logic (the two round-lifecycle functions). The 2 exceptions --
-- debate_display_name_v2 and (unchanged from Phase 2/4A) every other plain
-- SQL-language read helper this migration does not touch -- are SECURITY
-- INVOKER because they only ever read a publicly-readable table (profiles),
-- matching is_editor_or_admin''s identical precedent.
--
-- auth.uid() validation: every authenticated-facing function (
-- set_debate_subscription_v2, join_debate_v2, cast_debate_ballot_v2,
-- submit_debate_argument_v2, toggle_debate_reaction_v2,
-- submit_cross_examination_question_v2, submit_cross_examination_answer_v2)
-- rejects a null caller before doing anything else, unchanged from before
-- this migration for the six pre-existing functions and newly added for
-- set_debate_subscription_v2. The two internal round-lifecycle functions
-- take p_actor_id explicitly and re-verify it via can_manage_debate_v2 for
-- manual calls (unchanged); the worker (process_debate_notification_events_v2)
-- takes no actor parameter at all and is reachable only by service_role, so
-- there is no caller identity to validate. The three internal write helpers
-- (ensure_debate_subscription_default_v2, emit_debate_notification_event_v2,
-- debate_display_name_v2) trust their uuid parameters exactly as much as
-- log_debate_moderation_event always has -- they are reachable only by
-- composition from functions that have already independently derived those
-- ids from auth.uid() or from data already locked/validated under this
-- migration''s own checks, never from unvalidated client input.
--
-- is_suspended(): called immediately after the auth.uid() check in every
-- authenticated RPC that lets a caller create content or otherwise
-- participate -- join_debate_v2, cast_debate_ballot_v2,
-- submit_debate_argument_v2, toggle_debate_reaction_v2 (Phase 2),
-- submit_cross_examination_question_v2, submit_cross_examination_answer_v2
-- (Phase 4A) -- six functions total, all unchanged by this migration.
-- Deliberately NOT called in set_debate_subscription_v2: managing one''s own
-- notification preferences is not content creation, and gating it on
-- suspension would let the system keep notifying a suspended user while
-- refusing to let them opt out -- see that function''s own comment.
--
-- Row locking / lock order: every existing lock (debate -> membership/round
-- -> mutation) is preserved exactly as it was before this migration in all
-- six extended functions -- none of the additions above introduce, remove,
-- or reorder a single FOR UPDATE. Every new emission/auto-subscribe call is
-- placed strictly after the relevant mutation has already succeeded and
-- acquires no lock of its own (INSERT ... ON CONFLICT DO NOTHING is
-- self-atomic -- see section 5 and 6''s own comments). No function in this
-- migration acquires a new lock kind, so no new deadlock ordering risk is
-- introduced relative to Phase 2/4A.
--
-- REVOKE ALL FROM PUBLIC: all 13, immediately after each
-- CREATE OR REPLACE FUNCTION, before any GRANT.
--
-- EXECUTE grants: authenticated only -- set_debate_subscription_v2,
-- join_debate_v2 (unchanged), cast_debate_ballot_v2 (unchanged),
-- submit_debate_argument_v2 (unchanged), toggle_debate_reaction_v2
-- (unchanged), submit_cross_examination_question_v2 (unchanged),
-- submit_cross_examination_answer_v2 (unchanged). service_role only --
-- process_debate_notification_events_v2 (new). No grant at all (composition
-- only) -- debate_display_name_v2, ensure_debate_subscription_default_v2,
-- emit_debate_notification_event_v2, start_debate_round_one_v2 (unchanged),
-- advance_or_close_debate_round_v2 (unchanged).
--
-- No dynamic SQL anywhere in this migration.
--
-- Minimal return payloads: set_debate_subscription_v2 returns only the
-- caller''s own resulting row (never a subscriber count, list, or another
-- user''s row -- it cannot even see one, since it only ever touches the row
-- keyed by (p_debate_id, auth.uid())); every extended participation RPC''s
-- return shape is byte-for-byte unchanged from before this migration;
-- process_debate_notification_events_v2 returns only aggregate counts and,
-- per failed event, an event id and error message -- never a recipient list,
-- a message body, or any ballot data.
--
-- Privacy: no function in this migration ever reads debate_ballots at all,
-- so no vote, confidence, reason, or influential_argument_id can reach a
-- notification payload, an event row, or any return value -- this is
-- structural, not merely reviewed. No function exposes another user''s
-- debate_subscriptions row, a subscriber count, or a subscriber list. Every
-- notification message embeds only a display name (already public via
-- debate_memberships/debate_cross_exchanges/debate_arguments, all
-- public-read tables) and generic phase language -- never question/answer/
-- argument content itself.
--
-- RLS: debate_subscriptions'' existing self-only SELECT policy and "no
-- direct client write policy" are both unchanged -- this migration adds a
-- column to that table but no policy. debate_notification_events is created
-- with RLS enabled and zero policies -- see section 2''s own comment for why
-- that is deliberate, not an oversight.
--
-- No caller-supplied identity is ever trusted: set_debate_subscription_v2
-- derives its target row from auth.uid(), never a parameter; every
-- extended participation RPC''s auto-subscribe/event-emission call passes
-- only v_user_id (already derived from auth.uid() at the top of that same
-- function) or ids already read and validated/locked earlier in that same
-- function body (v_parent_author_id, v_author_id, p_target_user_id,
-- v_exchange_asker_id) -- never a new, unvalidated client-supplied value.
--
-- Deletion behaviour: every new foreign key in debate_notification_events
-- uses ON DELETE CASCADE (debate_id, target_user_id) or ON DELETE SET NULL
-- (actor_id, round_id, argument_id, exchange_id) -- additive/defensive only,
-- consistent with every existing V2 table, and does not weaken any existing
-- constraint or policy.
