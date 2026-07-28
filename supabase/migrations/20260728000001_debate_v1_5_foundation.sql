-- Debate V1.5 foundation.
--
-- This migration deliberately coexists with both catalog states seen in this
-- repository: the dormant V2 foundation may or may not already be deployed.
-- The policy rebuilds below therefore add the optional format_version = 1
-- predicate only when that column exists.

ALTER TABLE public.debates
  ADD COLUMN IF NOT EXISTS debate_variant text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS recruiting_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS opening_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS rebuttal_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS voting_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS recap_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recap_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recap_error text,
  ADD COLUMN IF NOT EXISTS last_voter_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS recap_key_disagreement text,
  ADD COLUMN IF NOT EXISTS recap_agreement text,
  ADD COLUMN IF NOT EXISTS recap_strongest_for text,
  ADD COLUMN IF NOT EXISTS recap_strongest_against text;

ALTER TABLE public.debates
  DROP CONSTRAINT IF EXISTS debates_debate_variant_check;
ALTER TABLE public.debates
  ADD CONSTRAINT debates_debate_variant_check
  CHECK (debate_variant IN ('legacy', 'v1_5'));

ALTER TABLE public.debates
  DROP CONSTRAINT IF EXISTS debates_recap_status_check;
ALTER TABLE public.debates
  ADD CONSTRAINT debates_recap_status_check
  CHECK (recap_status IN ('none', 'pending', 'generating', 'ready', 'failed'));

ALTER TABLE public.debates
  DROP CONSTRAINT IF EXISTS debates_recap_attempts_check;
ALTER TABLE public.debates
  ADD CONSTRAINT debates_recap_attempts_check
  CHECK (recap_attempts >= 0);

ALTER TABLE public.debates
  DROP CONSTRAINT IF EXISTS debates_status_check;
ALTER TABLE public.debates
  ADD CONSTRAINT debates_status_check
  CHECK (status IN ('open', 'active', 'closed', 'cancelled'));

ALTER TABLE public.debates
  DROP CONSTRAINT IF EXISTS debates_current_phase_check;
ALTER TABLE public.debates
  ADD CONSTRAINT debates_current_phase_check
  CHECK (current_phase IN (
    'recruiting', 'opening', 'rebuttal', 'closing', 'voting', 'completed'
  ));

ALTER TABLE public.debates
  DROP CONSTRAINT IF EXISTS debates_v1_5_deadline_order_check;
ALTER TABLE public.debates
  ADD CONSTRAINT debates_v1_5_deadline_order_check
  CHECK (
    debate_variant <> 'v1_5'
    OR (
      recruiting_deadline IS NOT NULL
      AND opening_deadline IS NOT NULL
      AND rebuttal_deadline IS NOT NULL
      AND voting_deadline IS NOT NULL
      AND recruiting_deadline < opening_deadline
      AND opening_deadline < rebuttal_deadline
      AND rebuttal_deadline < voting_deadline
    )
  );

ALTER TABLE public.debates
  DROP CONSTRAINT IF EXISTS debates_v1_5_state_check;
ALTER TABLE public.debates
  ADD CONSTRAINT debates_v1_5_state_check
  CHECK (
    debate_variant <> 'v1_5'
    OR status = 'cancelled'
    OR (status = 'open' AND current_phase = 'recruiting')
    OR (
      status = 'active'
      AND current_phase IN ('opening', 'rebuttal', 'voting')
    )
    OR (status = 'closed' AND current_phase = 'completed')
  );

CREATE TABLE IF NOT EXISTS public.debate_slots_v1_5 (
  debate_id uuid NOT NULL REFERENCES public.debates(id) ON DELETE CASCADE,
  stance text NOT NULL CHECK (stance IN ('for', 'against')),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'accepted', 'declined')),
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  PRIMARY KEY (debate_id, stance),
  UNIQUE (debate_id, user_id)
);

CREATE INDEX IF NOT EXISTS debate_slots_v1_5_user_idx
  ON public.debate_slots_v1_5(user_id, status);

ALTER TABLE public.debate_slots_v1_5 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Debate V1.5 slots are viewable by everyone"
  ON public.debate_slots_v1_5;
CREATE POLICY "Debate V1.5 slots are viewable by everyone"
  ON public.debate_slots_v1_5 FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.debate_argument_sources_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  argument_id uuid NOT NULL REFERENCES public.debate_arguments(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (
    length(url) BETWEEN 1 AND 2048
    AND url ~* '^https?://[^[:space:]]+$'
  ),
  title text CHECK (length(title) <= 300),
  added_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS debate_argument_sources_v1_argument_idx
  ON public.debate_argument_sources_v1(argument_id);

ALTER TABLE public.debate_argument_sources_v1 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Debate V1 argument sources are viewable by everyone"
  ON public.debate_argument_sources_v1;
CREATE POLICY "Debate V1 argument sources are viewable by everyone"
  ON public.debate_argument_sources_v1 FOR SELECT USING (true);

-- debate_variant is immutable for every caller. Lifecycle fields are blocked
-- only for direct anon/authenticated table UPDATEs. SECURITY DEFINER RPCs run
-- their statements as the function owner (`current_user`), so they pass this
-- trigger after performing their own auth/manager/deadline checks. Service
-- role recap updates also remain possible.
CREATE OR REPLACE FUNCTION public.guard_debate_v1_5_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.debate_variant IS DISTINCT FROM OLD.debate_variant THEN
    RAISE EXCEPTION 'debate_variant is immutable.';
  END IF;

  -- Direct browser updates have an explicit allowlist. Comparing the whole
  -- row minus these three editable fields protects current and future
  -- lifecycle/security columns without relying on somebody remembering to
  -- extend an enumerated trigger every time the table grows.
  IF current_user IN ('anon', 'authenticated')
     AND (
       to_jsonb(NEW) - ARRAY['title', 'description', 'tags']::text[]
     ) IS DISTINCT FROM (
       to_jsonb(OLD) - ARRAY['title', 'description', 'tags']::text[]
     ) THEN
    RAISE EXCEPTION 'Protected debate fields must be changed through an RPC.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_debate_v1_5_protected_fields() FROM PUBLIC;

DROP TRIGGER IF EXISTS guard_debate_v1_5_protected_fields
  ON public.debates;
CREATE TRIGGER guard_debate_v1_5_protected_fields
  BEFORE UPDATE ON public.debates
  FOR EACH ROW EXECUTE FUNCTION public.guard_debate_v1_5_protected_fields();

-- Close every direct-write bypass while retaining the exact live V1
-- conditions. If V2 exists, keep its format_version = 1 isolation too.
DO $$
DECLARE
  v_version_guard text := '';
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'debates'
      AND column_name = 'format_version'
  ) THEN
    v_version_guard := ' AND COALESCE(d.format_version, 1) = 1';
  END IF;

  DROP POLICY IF EXISTS "Authenticated users can create debates" ON public.debates;
  DROP POLICY IF EXISTS "Verified users and editors can create debates" ON public.debates;
  DROP POLICY IF EXISTS "Verified users can create legacy debates" ON public.debates;
  EXECUTE format($policy$
    CREATE POLICY "Verified users can create legacy debates"
      ON public.debates FOR INSERT
      WITH CHECK (
        auth.role() = 'authenticated'
        AND auth.uid() = moderator_id
        AND debate_variant = 'legacy'
        %s
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND (p.verified = true OR p.role IN ('editor', 'admin'))
        )
      )
  $policy$, replace(v_version_guard, 'd.', ''));

  DROP POLICY IF EXISTS "Moderators can update their debates" ON public.debates;
  DROP POLICY IF EXISTS "V1 moderators can update their own V1 debates" ON public.debates;
  DROP POLICY IF EXISTS "Legacy moderators can update their debates" ON public.debates;
  EXECUTE format($policy$
    CREATE POLICY "Legacy moderators can update their debates"
      ON public.debates FOR UPDATE
      USING (
        auth.uid() = moderator_id
        AND debate_variant = 'legacy'
        %s
      )
      WITH CHECK (
        auth.uid() = moderator_id
        AND debate_variant = 'legacy'
        %s
      )
  $policy$,
    replace(v_version_guard, 'd.', ''),
    replace(v_version_guard, 'd.', '')
  );

  DROP POLICY IF EXISTS "Authenticated users can submit arguments"
    ON public.debate_arguments;
  DROP POLICY IF EXISTS "Authenticated users can submit legacy arguments"
    ON public.debate_arguments;
  EXECUTE format($policy$
    CREATE POLICY "Authenticated users can submit legacy arguments"
      ON public.debate_arguments FOR INSERT
      WITH CHECK (
        auth.role() = 'authenticated'
        AND auth.uid() = author_id
        AND NOT public.is_suspended()
        AND stance IN ('for', 'against')
        AND EXISTS (
          SELECT 1 FROM public.debates d
          WHERE d.id = debate_id
            AND d.status = 'active'
            AND d.debate_variant = 'legacy'
            %s
        )
        AND EXISTS (
          SELECT 1 FROM public.debate_participants dp
          WHERE dp.debate_id = public.debate_arguments.debate_id
            AND dp.user_id = public.debate_arguments.author_id
            AND dp.stance = public.debate_arguments.stance
        )
      )
  $policy$, v_version_guard);

  DROP POLICY IF EXISTS "Authenticated users can join a debate once"
    ON public.debate_participants;
  DROP POLICY IF EXISTS "Authenticated users can join a legacy debate once"
    ON public.debate_participants;
  EXECUTE format($policy$
    CREATE POLICY "Authenticated users can join a legacy debate once"
      ON public.debate_participants FOR INSERT
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1 FROM public.debates d
          WHERE d.id = debate_id
            AND d.status NOT IN ('closed', 'cancelled')
            AND d.debate_variant = 'legacy'
            %s
        )
      )
  $policy$, v_version_guard);

  DROP POLICY IF EXISTS "Authenticated users can vote on a motion"
    ON public.debate_motion_votes;
  DROP POLICY IF EXISTS "Authenticated users can vote on a legacy motion"
    ON public.debate_motion_votes;
  EXECUTE format($policy$
    CREATE POLICY "Authenticated users can vote on a legacy motion"
      ON public.debate_motion_votes FOR INSERT
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1 FROM public.debates d
          WHERE d.id = debate_id
            AND d.status NOT IN ('closed', 'cancelled')
            AND d.debate_variant = 'legacy'
            %s
        )
      )
  $policy$, v_version_guard);

  -- Direct debate_votes writes would bypass toggle_debate_vote's row lock
  -- and denormalised counter reconciliation. V1.5 is RPC-only.
  DROP POLICY IF EXISTS "Authenticated users can vote" ON public.debate_votes;
  DROP POLICY IF EXISTS "Authenticated users can upvote legacy arguments"
    ON public.debate_votes;
  EXECUTE format($policy$
    CREATE POLICY "Authenticated users can upvote legacy arguments"
      ON public.debate_votes FOR INSERT
      WITH CHECK (
        auth.role() = 'authenticated'
        AND auth.uid() = user_id
        AND EXISTS (
          SELECT 1
          FROM public.debate_arguments da
          JOIN public.debates d ON d.id = da.debate_id
          WHERE da.id = argument_id
            AND d.debate_variant = 'legacy'
            %s
        )
      )
  $policy$, v_version_guard);

  DROP POLICY IF EXISTS "Users can remove their own votes" ON public.debate_votes;
  DROP POLICY IF EXISTS "Users can remove their own legacy argument votes"
    ON public.debate_votes;
  EXECUTE format($policy$
    CREATE POLICY "Users can remove their own legacy argument votes"
      ON public.debate_votes FOR DELETE
      USING (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1
          FROM public.debate_arguments da
          JOIN public.debates d ON d.id = da.debate_id
          WHERE da.id = argument_id
            AND d.debate_variant = 'legacy'
            %s
        )
      )
  $policy$, v_version_guard);
END
$$;

-- Safe superset of the latest known V1 list, the optionally deployed V2
-- list, and the four V1.5 event types.
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
    'debate_v2_direct_response', 'debate_v2_evidence_requested',
    'debate_invitation', 'debate_invitation_response',
    'debate_phase_advanced', 'debate_cancelled'
  ]));

COMMENT ON FUNCTION public.guard_debate_v1_5_protected_fields() IS
  'Direct authenticated UPDATEs run as current_user=authenticated and are rejected. SECURITY DEFINER V1.5 RPC statements run as the function owner and pass this trigger only after their own authorization and lifecycle checks.';
