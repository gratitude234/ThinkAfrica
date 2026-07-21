-- Phase 2 of the Debate V2 redesign (see docs/debate-v2-phase2-lifecycle.md
-- and docs/debate-v2-product-contract.md). Builds enforcement on top of
-- Phase 1's additive data foundation
-- (20260718000002_debate_v2_foundation.sql, NOT edited by this migration):
-- lifecycle transitions, permissions, atomic participation RPCs, and
-- server-side limits. Still no Debate V2 UI ships in this phase.
--
-- V1 debates (format_version = 1) keep working through their existing RPCs
-- and RLS policies, with three narrow additions, each called out separately
-- below and in the doc as V1 security corrections, not V2 behaviour: every
-- V1 RPC now rejects a format_version = 2 debate with a clear error;
-- toggle_debate_vote gets a closed-debate check it was missing; and all six
-- V1 RPCs get an explicit EXECUTE grant (previously the Postgres default of
-- PUBLIC, undone by nobody until now) restricting them to `authenticated`.
--
-- No local PostgreSQL/Supabase harness is configured in this repo (see
-- CLAUDE.md), so this migration has been verified by static review and by
-- the pure-JS contract ports in lib/debateV2Lifecycle.test.ts, not by
-- execution. Phase 1 has likewise never been executed against a real
-- Postgres/Supabase environment -- both migrations must be applied, in
-- order, to a staging environment and verified there before either is
-- considered deployable.

-- =============================================================================
-- A. Mandatory membership catch-up (repeats Phase 1's backfill)
-- =============================================================================
-- Phase 1 backfilled debate_memberships once, then added sync triggers to
-- keep it current for new debate_participants/debates writes going forward.
-- Between Phase 1 landing and this migration, further V1 activity could have
-- occurred through those same triggers (expected to already be caught) or,
-- in principle, through any path the triggers don't cover (see Phase 1's
-- "mandatory Phase 2 catch-up backfill" note). This re-runs the identical,
-- conflict-safe reconciliation before any Phase 2 function is allowed to
-- treat debate_memberships as authoritative. It is safe to run again even
-- if nothing has drifted: ON CONFLICT DO NOTHING makes it a no-op for rows
-- already present, and it never deletes or modifies debate_participants or
-- debates.moderator_id.

INSERT INTO public.debate_memberships (debate_id, user_id, role, stance, joined_at)
SELECT debate_id, user_id, 'debater', stance, joined_at
FROM public.debate_participants
ON CONFLICT (debate_id, user_id, role) DO NOTHING;

INSERT INTO public.debate_memberships (debate_id, user_id, role, stance, joined_at)
SELECT id, moderator_id, 'moderator', NULL, created_at
FROM public.debates
WHERE moderator_id IS NOT NULL
ON CONFLICT (debate_id, user_id, role) DO NOTHING;

-- The Phase 1 sync triggers (sync_debate_participant_membership,
-- sync_debate_moderator_membership) are KEPT, not replaced wholesale. They
-- still cover every current V1 write path (join_debate and the direct
-- debates insert), which Phase 2 does not change. They can be retired only
-- once Phase 2 (or later) removes every V1 write path they mirror -- i.e.
-- not before V1 itself is retired, since V1 debates can be created and
-- joined indefinitely alongside V2 ones. Until then, removing them would
-- silently reintroduce the membership drift Phase 1 identified.
--
-- Correction: sync_debate_moderator_membership() itself IS extended below --
-- Phase 1 only ever fired it AFTER INSERT, on the assumption moderator_id is
-- immutable once a debate is created (true for every existing V1 code path).
-- can_manage_debate_v2() below checks debate_memberships for a 'moderator'
-- row as an independent path alongside debates.moderator_id -- explicitly
-- required so a future co-moderator (someone other than the single
-- moderator_id) can be granted management rights via debate_memberships
-- directly. But that same independent path means a moderator's membership
-- row can go stale: if moderator_id is ever reassigned by any means (direct
-- SQL, a future admin action -- no current code path does this, but nothing
-- prevents it either), the FORMER moderator's row would remain forever, and
-- they would keep passing can_manage_debate_v2 through it even though
-- debates.moderator_id (the live, correct source) no longer names them.
--
-- Explicit semantics for this phase: **single moderator**.
-- debates.moderator_id is authoritative; a debate_memberships 'moderator'
-- row exists solely as a synchronized mirror of it, kept to exactly the
-- rows that match the CURRENT moderator_id. A future phase that wants
-- genuine multi-moderator support must decide how additional moderator
-- memberships are explicitly granted/revoked (a dedicated RPC, presumably)
-- -- that is out of scope here; this phase only guarantees the mirror never
-- goes stale.
CREATE OR REPLACE FUNCTION public.sync_debate_moderator_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On a moderator_id change, remove the FORMER moderator's membership row
  -- first, so they never keep manage rights through a stale mirror.
  IF TG_OP = 'UPDATE'
     AND OLD.moderator_id IS NOT NULL
     AND OLD.moderator_id IS DISTINCT FROM NEW.moderator_id THEN
    DELETE FROM public.debate_memberships
     WHERE debate_id = NEW.id
       AND user_id = OLD.moderator_id
       AND role = 'moderator';
  END IF;

  IF NEW.moderator_id IS NOT NULL THEN
    INSERT INTO public.debate_memberships (debate_id, user_id, role, stance, joined_at)
    VALUES (NEW.id, NEW.moderator_id, 'moderator', NULL, COALESCE(NEW.created_at, now()))
    ON CONFLICT (debate_id, user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS debates_sync_moderator_membership ON public.debates;
CREATE TRIGGER debates_sync_moderator_membership
AFTER INSERT OR UPDATE OF moderator_id ON public.debates
FOR EACH ROW
EXECUTE FUNCTION public.sync_debate_moderator_membership();

-- Security-audit cleanup: a trigger function's RETURNS trigger already
-- makes it uncallable via a direct RPC (Postgres rejects calling a trigger
-- function outside of trigger context), but this closes the default
-- PUBLIC execute grant explicitly anyway, for the same reason and the same
-- consistency every other function in this migration follows.
REVOKE ALL ON FUNCTION public.sync_debate_moderator_membership() FROM PUBLIC;

COMMENT ON FUNCTION public.sync_debate_moderator_membership() IS
  'Phase 1 original, extended in Phase 2 to also fire on UPDATE OF moderator_id and remove the former moderator''s membership row -- keeps debate_memberships a correct mirror of debates.moderator_id under the single-moderator semantics documented above, instead of only ever adding rows.';

-- One-time cleanup: remove any moderator membership row that does not match
-- its debate''s CURRENT moderator_id. No existing V1 code path has ever
-- changed moderator_id, so this is expected to affect zero rows in
-- practice -- it exists to close the gap for any drift from before the
-- trigger above existed (direct SQL, a restored backup, etc.), and is safe
-- and idempotent to run again.
DELETE FROM public.debate_memberships dm
 WHERE dm.role = 'moderator'
   AND NOT EXISTS (
     SELECT 1 FROM public.debates d
      WHERE d.id = dm.debate_id
        AND d.moderator_id = dm.user_id
   );

-- =============================================================================
-- B. Internal helpers: authorization and audit logging
-- =============================================================================
-- Centralizes "can this user manage this V2 debate" so every V2 lifecycle
-- RPC below calls one reviewed function instead of re-deriving slightly
-- different checks. Neither helper is SECURITY DEFINER: profiles, debates,
-- and debate_memberships are all already publicly SELECT-able (Phase 1 RLS),
-- so there is no privilege gap to bridge, and per-section-16's "use
-- SECURITY DEFINER only where required," none is used here. Both are
-- revoked from PUBLIC and not granted to authenticated/service_role either
-- -- they are only ever called from inside the SECURITY DEFINER functions
-- below, which run under their owner's privileges regardless of who invoked
-- the outer RPC, so no separate grant is needed for that composition to
-- work. This intentionally keeps them uncallable as direct client RPCs.

CREATE OR REPLACE FUNCTION public.is_editor_or_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id
      AND role IN ('editor', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_editor_or_admin(uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.is_editor_or_admin(uuid) IS
  'Phase 2 internal helper: true if p_user_id is an editor or admin. Not SECURITY DEFINER (profiles is publicly readable) and not granted to any client role -- composed only from inside other SECURITY DEFINER functions in this migration.';

-- A user may manage a V2 debate if they are debates.moderator_id, a
-- debate_memberships moderator, an editor, or an admin (per the task's
-- authorization-helper requirement). p_actor_id is never trusted blindly:
-- every caller of this function either derives p_actor_id from auth.uid()
-- itself (the authenticated RPCs below) or is activate_debate_v2, which is
-- service-role-only and still passes an explicit actor id that this
-- function verifies against the debate's actual moderator/membership/role
-- data -- it is never assumed correct just because it was supplied.
CREATE OR REPLACE FUNCTION public.can_manage_debate_v2(p_debate_id uuid, p_actor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    p_actor_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.debates d
      WHERE d.id = p_debate_id
        AND (
          d.moderator_id = p_actor_id
          OR EXISTS (
            SELECT 1 FROM public.debate_memberships dm
            WHERE dm.debate_id = d.id
              AND dm.user_id = p_actor_id
              AND dm.role = 'moderator'
          )
          OR public.is_editor_or_admin(p_actor_id)
        )
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_debate_v2(uuid, uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.can_manage_debate_v2(uuid, uuid) IS
  'Phase 2 authorization helper: true if p_actor_id may manage debate p_debate_id (its moderator_id, a debate_memberships moderator, an editor, or an admin). Every V2 lifecycle RPC in this migration calls this instead of re-deriving its own check. Not SECURITY DEFINER, not granted to any client role -- see is_editor_or_admin() for why.';

-- Append-only audit logging, centralized so every privileged action writes
-- through one reviewed path with a consistent shape. SECURITY DEFINER is
-- required here: debate_moderation_events has no client INSERT policy at
-- all (Phase 1), so this must run as the owner to write to it regardless of
-- which authenticated RPC called it. Not granted to authenticated/
-- service_role directly, for the same reason as the two helpers above --
-- "do not allow clients to insert audit rows directly" (section 15) means
-- this must only ever be reachable through the reviewed RPCs that call it,
-- never as a standalone RPC a client could invoke with an arbitrary action
-- string.
CREATE OR REPLACE FUNCTION public.log_debate_moderation_event(
  p_debate_id uuid,
  p_actor_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_action text,
  p_reason text,
  p_metadata jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.debate_moderation_events (
    debate_id, actor_id, target_type, target_id, action, reason, metadata
  )
  VALUES (
    p_debate_id, p_actor_id, p_target_type, p_target_id, p_action, p_reason,
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_debate_moderation_event(uuid, uuid, text, uuid, text, text, jsonb) FROM PUBLIC;

COMMENT ON FUNCTION public.log_debate_moderation_event(uuid, uuid, text, uuid, text, text, jsonb) IS
  'Phase 2 internal helper: the only write path into debate_moderation_events. actor_id may be NULL for automatic/service transitions. Never logs ballot choices, reasons for ordinary actions, or other individual-level private data -- callers pass only lifecycle metadata (old/new phase, timestamps, round ids).';

-- =============================================================================
-- C. V1 RPC hardening: reject Debate V2 debates
-- =============================================================================
-- Each function below is reproduced in full from its current definition
-- (traced through every migration that has ever redefined it -- see
-- docs/debate-v2-phase2-lifecycle.md's "V1/V2 separation" section for the
-- exact provenance of each) with one addition: a check, immediately after
-- resolving the debate's format_version, that raises a clear exception
-- directing callers at the V2 equivalent. Every other line of V1 behaviour
-- (error ordering, moderator/editor/admin checks, phase transitions, motion
-- vote tallying) is preserved exactly. None of these functions silently
-- routes a V1 call into V2 logic -- they only ever reject.

-- join_debate: latest version is 20260423000012_debate_participants.sql,
-- never redefined since.
CREATE OR REPLACE FUNCTION public.join_debate(
  p_debate_id uuid,
  p_stance text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_status text;
  v_format_version smallint;
  v_existing_stance text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_stance NOT IN ('for', 'against') THEN
    RAISE EXCEPTION 'Invalid stance.';
  END IF;

  SELECT status, format_version
    INTO v_status, v_format_version
    FROM public.debates
   WHERE id = p_debate_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;

  IF v_format_version = 2 THEN
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

-- cast_motion_vote: latest version is 20260423000013_debate_motion_votes.sql,
-- never redefined since.
CREATE OR REPLACE FUNCTION public.cast_motion_vote(
  p_debate_id uuid,
  p_vote text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing text;
  v_status text;
  v_format_version smallint;
  v_for_count integer;
  v_against_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_vote NOT IN ('for', 'against') THEN
    RAISE EXCEPTION 'Invalid vote.';
  END IF;

  SELECT status, format_version
    INTO v_status, v_format_version
    FROM public.debates
   WHERE id = p_debate_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;

  IF v_format_version = 2 THEN
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
    COUNT(*) FILTER (WHERE vote = 'for'),
    COUNT(*) FILTER (WHERE vote = 'against')
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

-- toggle_debate_vote: latest version is 20260402000000_phase2_schema.sql,
-- never redefined since. Two additions here, kept distinct per section 14:
--   1. Debate V2 rejection (this section's stated purpose).
--   2. A V1 security correction: the original never checked the argument's
--      debate status at all, so a closed V1 debate's arguments could still
--      be upvoted through a direct RPC call after the UI's button disables
--      itself. Both checks require resolving the argument's debate first,
--      which the original function never did either (it also never
--      confirmed the argument existed). This function already returns JSON
--      error objects rather than raising (see the original body) -- that
--      existing convention is preserved rather than switched to RAISE, so
--      the client-facing contract does not change shape.
CREATE OR REPLACE FUNCTION public.toggle_debate_vote(p_argument_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_voted boolean;
  v_debate_id uuid;
  v_status text;
  v_format_version smallint;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  SELECT da.debate_id, d.status, d.format_version
    INTO v_debate_id, v_status, v_format_version
    FROM public.debate_arguments da
    JOIN public.debates d ON d.id = da.debate_id
   WHERE da.id = p_argument_id;

  IF v_debate_id IS NULL THEN
    RETURN json_build_object('error', 'Argument not found');
  END IF;

  IF v_format_version = 2 THEN
    RETURN json_build_object('error', 'This debate uses Debate V2. Use toggle_debate_reaction_v2 instead.');
  END IF;

  IF v_status = 'closed' THEN
    RETURN json_build_object('error', 'This debate is closed.');
  END IF;

  SELECT exists(
    SELECT 1 FROM public.debate_votes
    WHERE user_id = v_user_id AND argument_id = p_argument_id
  ) INTO v_voted;

  IF v_voted THEN
    DELETE FROM public.debate_votes
    WHERE user_id = v_user_id AND argument_id = p_argument_id;

    UPDATE public.debate_arguments
    SET upvotes = greatest(upvotes - 1, 0)
    WHERE id = p_argument_id;

    RETURN json_build_object('voted', false);
  END IF;

  INSERT INTO public.debate_votes (user_id, argument_id)
  VALUES (v_user_id, p_argument_id);

  UPDATE public.debate_arguments
  SET upvotes = upvotes + 1
  WHERE id = p_argument_id;

  RETURN json_build_object('voted', true);
END;
$$;

-- start_debate: latest version is 20260501000001_debate_v1_polish.sql,
-- never redefined since.
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
  v_format_version smallint;
  v_round_duration integer;
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT moderator_id, status, format_version, round_duration_minutes
    INTO v_moderator_id, v_status, v_format_version, v_round_duration
    FROM public.debates
   WHERE id = p_debate_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;

  IF v_format_version = 2 THEN
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
           now() + make_interval(mins => GREATEST(COALESCE(v_round_duration, 5), 1) * 3)
         )
   WHERE id = p_debate_id;
END;
$$;

-- advance_debate_phase: latest version is
-- 20260501000001_debate_v1_polish.sql, never redefined since.
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
  v_format_version smallint;
  v_role text;
BEGIN
  SELECT moderator_id, current_phase, status, format_version
    INTO v_moderator_id, v_current_phase, v_status, v_format_version
    FROM public.debates
   WHERE id = p_debate_id;

  IF v_current_phase IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;

  IF v_format_version = 2 THEN
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

-- close_debate: latest version is 20260501000001_debate_v1_polish.sql,
-- never redefined since.
CREATE OR REPLACE FUNCTION public.close_debate(p_debate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_moderator_id uuid;
  v_format_version smallint;
  v_role text;
BEGIN
  SELECT moderator_id, format_version
    INTO v_moderator_id, v_format_version
    FROM public.debates
   WHERE id = p_debate_id;

  IF v_moderator_id IS NULL AND v_format_version IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;

  IF v_format_version = 2 THEN
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

-- Note: close_debate's original "debate not found" check was
-- `IF v_moderator_id IS NULL THEN RAISE 'Debate not found.'`, which is
-- actually a pre-existing latent bug (moderator_id is nullable via its own
-- ON DELETE SET NULL, so a real debate whose moderator's profile was
-- deleted would be misreported as "not found"). Reproducing that exact
-- check would make it impossible to distinguish from a v_format_version
-- lookup that also legitimately returns NULL for a nonexistent debate. The
-- check above adds `AND v_format_version IS NULL` so a real debate with a
-- null moderator_id is no longer misreported -- a narrow, additive
-- correctness fix bundled with the V2 guard it was touched for anyway,
-- not a behavioural change for any debate that still has a moderator.

-- V1 security correction, separate from V2 behaviour: none of these six
-- functions was ever given an explicit REVOKE/GRANT in any prior migration
-- (traced through every migration that touches them), so all six have
-- carried Postgres's default EXECUTE-to-PUBLIC grant since the day each was
-- created -- literally anon, not just authenticated, could call them. Each
-- function already rejects an unauthenticated caller internally
-- (`auth.uid() IS NULL` / an equivalent), so this was not an exploitable
-- gap, but it is exactly the default-privilege audit section 16 calls for,
-- and these six functions are already being replaced in this migration
-- regardless. CREATE OR REPLACE FUNCTION preserves a function's existing
-- ACL when its signature is unchanged (all six keep theirs), so without
-- this explicit REVOKE/GRANT pair the PUBLIC grant would have silently
-- carried forward.
REVOKE ALL ON FUNCTION public.join_debate(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_debate(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.cast_motion_vote(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cast_motion_vote(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.toggle_debate_vote(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_debate_vote(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.start_debate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_debate(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.advance_debate_phase(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_debate_phase(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.close_debate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_debate(uuid) TO authenticated;

-- =============================================================================
-- D. RLS policy replacement: debates UPDATE, debate_arguments INSERT
-- =============================================================================
-- "Moderators can update their debates" (20260402000000_phase2_schema.sql)
-- is `USING (auth.uid() = moderator_id)` with no WITH CHECK -- too broad for
-- V2, which must never be directly updatable by a client at all. Replaced
-- with a version scoped to format_version = 1 in both USING and WITH CHECK:
-- a V1 moderator's direct update behaves exactly as before, and no
-- authenticated update -- moderator or otherwise -- can touch a
-- format_version = 2 row through this policy. Every V2 lifecycle change
-- happens through the SECURITY DEFINER functions below, which bypass RLS as
-- their owner after performing their own can_manage_debate_v2() check --
-- exactly the split section 4 calls for. The only direct `.update()` call on
-- debates anywhere in this codebase (app/api/debate-recap/route.ts) already
-- goes through the service-role admin client, which bypasses RLS entirely
-- and is unaffected by this policy either way.
DROP POLICY IF EXISTS "Moderators can update their debates" ON public.debates;
CREATE POLICY "V1 moderators can update their own V1 debates"
  ON public.debates FOR UPDATE
  USING (auth.uid() = moderator_id AND format_version = 1)
  WITH CHECK (auth.uid() = moderator_id AND format_version = 1);

-- "Authenticated users can submit arguments" has been redefined twice since
-- Phase 1's migration comment attributed it to 20260501000001 -- its true
-- latest version is 20260704000001_trust_safety_v1.sql, which added a
-- suspension check. Reproduced here with every existing condition
-- preserved exactly, plus `AND format_version = 1` added to the debates
-- existence check: a V2 debate can never satisfy that subquery, so this
-- policy can no longer insert a V2 argument under any circumstance.
-- submit_debate_argument_v2 (section M) is the only path for a V2 argument,
-- and being SECURITY DEFINER it bypasses this policy entirely.
DROP POLICY IF EXISTS "Authenticated users can submit arguments" ON public.debate_arguments;
CREATE POLICY "Authenticated users can submit arguments"
  ON public.debate_arguments FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND auth.uid() = author_id
    AND NOT public.is_suspended()
    AND stance IN ('for', 'against')
    AND EXISTS (
      SELECT 1
      FROM public.debates
      WHERE id = debate_id
        AND status = 'active'
        AND format_version = 1
    )
    AND EXISTS (
      SELECT 1
      FROM public.debate_participants
      WHERE debate_id = public.debate_arguments.debate_id
        AND user_id = public.debate_arguments.author_id
        AND stance = public.debate_arguments.stance
    )
  );

-- No policy changes are made to debate_memberships, debate_rounds,
-- debate_argument_sources, debate_reactions, debate_ballots,
-- debate_subscriptions, or debate_moderation_events: Phase 1 already left
-- every one of them with no INSERT/UPDATE/DELETE policy at all, so direct
-- client writes to any of them are already fully blocked by RLS's
-- default-deny. This migration does not weaken that in any way -- every new
-- write path below is a SECURITY DEFINER function that performs its own
-- validation before bypassing RLS as the function owner.

-- =============================================================================
-- E. Additive schema: distinguish forced from completed V2 closure
-- =============================================================================

ALTER TABLE public.debates
  ADD COLUMN IF NOT EXISTS closure_kind text;

ALTER TABLE public.debates
  DROP CONSTRAINT IF EXISTS debates_closure_kind_check;
ALTER TABLE public.debates
  ADD CONSTRAINT debates_closure_kind_check
  CHECK (closure_kind IS NULL OR closure_kind IN ('completed', 'forced'));

COMMENT ON COLUMN public.debates.closure_kind IS
  'Debate V2 Phase 2 (additive): distinguishes a normal final_vote completion (''completed'') from a moderator-forced early closure (''forced''). NULL for every V1 debate and for any V2 debate not yet closed -- close_debate() (V1) never sets this column; only close_debate_v2() and the automatic final_vote-expiry path do.';

-- =============================================================================
-- F. Word counting
-- =============================================================================
-- One shared helper, mirrored exactly in TypeScript by countWordsV2() in
-- lib/debateV2Lifecycle.ts (see that file's tests for the paired contract
-- test). Whitespace semantics, stated plainly: trims leading/trailing
-- whitespace, then splits the remainder on runs of whitespace and counts the
-- resulting pieces. An empty (or all-whitespace) string counts as zero
-- words. This is a consistent, documented word-count *contract*, not a
-- claim of correct natural-language tokenization -- e.g. "well-supported"
-- counts as one word, and "word." counts as one word including the period.
CREATE OR REPLACE FUNCTION public.count_words_v2(p_text text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_trimmed text := btrim(COALESCE(p_text, ''));
BEGIN
  IF v_trimmed = '' THEN
    RETURN 0;
  END IF;
  RETURN array_length(regexp_split_to_array(v_trimmed, '\s+'), 1);
END;
$$;

-- Security-audit cleanup: revoked from PUBLIC like every other function in
-- this migration, even though this one is pure/stateless and taking no
-- data-access risk either way. No client grant is needed -- it is only
-- ever called from within submit_debate_argument_v2 (SECURITY DEFINER),
-- which reaches it via owner-composition the same way the other internal
-- helpers (is_editor_or_admin, can_manage_debate_v2, etc.) do.
REVOKE ALL ON FUNCTION public.count_words_v2(text) FROM PUBLIC;

COMMENT ON FUNCTION public.count_words_v2(text) IS
  'Phase 2: word-count contract shared by submit_debate_argument_v2()''s server-side limit enforcement and lib/debateV2Lifecycle.ts''s countWordsV2() (kept identical -- see that module''s tests). Not a natural-language tokenizer; a documented whitespace-splitting contract.';

-- =============================================================================
-- G. Controlled V2 activation
-- =============================================================================
-- service_role only. Never exposed to a client-side activation path in
-- Phase 2 -- there is deliberately no equivalent authenticated wrapper the
-- way start_debate_v2/join_debate_v2/etc. have one.
CREATE OR REPLACE FUNCTION public.activate_debate_v2(
  p_debate_id uuid,
  p_actor_id uuid,
  p_opening_starts_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_format_version smallint;
  v_round_duration integer;
  v_existing_round_count integer;
  v_existing_argument_count integer;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'p_actor_id is required.';
  END IF;

  SELECT status, format_version, round_duration_minutes
    INTO v_status, v_format_version, v_round_duration
    FROM public.debates
   WHERE id = p_debate_id
   FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;

  -- Authorization is checked before every other business-rule rejection,
  -- including the idempotency short-circuit below, so a caller who cannot
  -- manage this debate never learns its activation state (already V2 or
  -- not) via this function's return value or error text either.
  IF NOT public.can_manage_debate_v2(p_debate_id, p_actor_id) THEN
    RAISE EXCEPTION 'You do not have permission to activate this debate for Debate V2.';
  END IF;

  -- Idempotent: a debate already converted to V2 returns its current state
  -- rather than re-processing or erroring.
  IF v_format_version = 2 THEN
    SELECT count(*) INTO v_existing_round_count
      FROM public.debate_rounds WHERE debate_id = p_debate_id;

    RETURN jsonb_build_object(
      'already_activated', true,
      'debate_id', p_debate_id,
      'status', v_status,
      'round_count', v_existing_round_count
    );
  END IF;

  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Only an open debate can be converted to Debate V2 (current status: %). An already-active or closed debate cannot be safely converted.', v_status;
  END IF;

  -- Existing lobby participants (debate_participants) and V1 motion votes
  -- (debate_motion_votes) ARE permitted and do not block activation -- both
  -- are pure "who's here / what did they think so far" signals that carry
  -- over cleanly. Participants are reconciled into debate_memberships below.
  -- Motion votes are deliberately NOT converted into debate_ballots, for the
  -- same reason Phase 1 never backfilled them: debate_motion_votes has no
  -- stage or confidence to infer a V2 ballot from. A debater/juror who wants
  -- their opinion tracked in the V2 model casts a fresh V2 ballot.
  --
  -- Existing debate_arguments DO block activation: they are V1-shaped
  -- (round_number 1/2/3, no round_id) with no sound way to infer which V2
  -- round they belong to, so activating a debate that already has arguments
  -- would make lifecycle inference unsafe.
  SELECT count(*) INTO v_existing_argument_count
    FROM public.debate_arguments
   WHERE debate_id = p_debate_id;

  IF v_existing_argument_count > 0 THEN
    RAISE EXCEPTION 'This debate already has % argument(s); activation would make lifecycle inference unsafe.', v_existing_argument_count;
  END IF;

  SELECT count(*) INTO v_existing_round_count
    FROM public.debate_rounds
   WHERE debate_id = p_debate_id;

  IF v_existing_round_count > 0 THEN
    RAISE EXCEPTION 'This debate already has debate_rounds rows; refusing to reseed.';
  END IF;

  -- Reconcile memberships for this debate specifically, on top of section
  -- A's blanket catch-up (belt-and-suspenders: the Phase 1 sync triggers
  -- should already have caught these, but activation is exactly the moment
  -- debate_memberships starts being relied on, so re-confirm here too).
  INSERT INTO public.debate_memberships (debate_id, user_id, role, stance, joined_at)
  SELECT debate_id, user_id, 'debater', stance, joined_at
    FROM public.debate_participants
   WHERE debate_id = p_debate_id
  ON CONFLICT (debate_id, user_id, role) DO NOTHING;

  INSERT INTO public.debate_memberships (debate_id, user_id, role, stance, joined_at)
  SELECT id, moderator_id, 'moderator', NULL, created_at
    FROM public.debates
   WHERE id = p_debate_id
     AND moderator_id IS NOT NULL
  ON CONFLICT (debate_id, user_id, role) DO NOTHING;

  -- Seed exactly these five ordered rounds. duration_minutes for every
  -- seeded round defaults to debates.round_duration_minutes (the product
  -- contract does not document a different value); only the opening round
  -- gets an explicit starts_at, if the caller supplied one.
  v_round_duration := GREATEST(COALESCE(v_round_duration, 5), 1);

  INSERT INTO public.debate_rounds (debate_id, sequence_number, phase, status, starts_at, duration_minutes)
  VALUES
    (p_debate_id, 1, 'opening', 'scheduled', p_opening_starts_at, v_round_duration),
    (p_debate_id, 2, 'rebuttal', 'scheduled', NULL, v_round_duration),
    (p_debate_id, 3, 'cross_examination', 'scheduled', NULL, v_round_duration),
    (p_debate_id, 4, 'closing', 'scheduled', NULL, v_round_duration),
    (p_debate_id, 5, 'final_vote', 'scheduled', NULL, v_round_duration);

  -- Set format_version = 2 through this service-role-only function, which
  -- is exactly the intentional bypass debates_guard_format_version()
  -- (Phase 1) documents: auth.role() here is 'service_role' (this function
  -- is only ever invoked via the admin client), not 'authenticated', so the
  -- guard trigger's condition never fires.
  UPDATE public.debates
     SET format_version = 2
   WHERE id = p_debate_id;
  -- debates.status is deliberately left as 'open': the debate stays in its
  -- open lobby after activation. Starting the opening round is a distinct,
  -- explicit step (start_debate_v2 or the automatic due-round path), never
  -- implied by activation itself -- even when p_opening_starts_at is
  -- already in the past, activation alone does not start it.

  PERFORM public.log_debate_moderation_event(
    p_debate_id, p_actor_id, 'debate', p_debate_id, 'v2_activated', NULL,
    jsonb_build_object('opening_starts_at', p_opening_starts_at)
  );

  RETURN jsonb_build_object(
    'already_activated', false,
    'debate_id', p_debate_id,
    'status', 'open',
    'round_count', 5
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_debate_v2(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_debate_v2(uuid, uuid, timestamptz) TO service_role;

COMMENT ON FUNCTION public.activate_debate_v2(uuid, uuid, timestamptz) IS
  'Phase 2: service-role-only, idempotent V1->V2 conversion. Locks the debate row, verifies p_actor_id can manage it, requires an open debate with no existing arguments/rounds, reconciles memberships, seeds the five V2 rounds, and sets format_version = 2. Leaves the debate in its open lobby. Not exposed to any client-invocable RPC.';

-- =============================================================================
-- H. V2 membership RPC
-- =============================================================================

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

  -- Correction: this is a SECURITY DEFINER insert, so it bypasses the
  -- client RLS policies that already gate V1 participation on
  -- is_suspended() (posts, comments, debate_arguments, follows -- see
  -- 20260704000001_trust_safety_v1.sql). Without this check, a suspended
  -- user's V2 join would silently regress a protection that already exists
  -- for equivalent V1 actions.
  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Your account is currently suspended.';
  END IF;

  -- Moderator is never a self-selectable role here -- only debater or juror.
  IF p_role NOT IN ('debater', 'juror') THEN
    RAISE EXCEPTION 'You cannot self-assign this role. Allowed roles are debater and juror.';
  END IF;

  -- Correction: locked, where the original was a plain unlocked SELECT.
  -- Without this lock, a debater's join could interleave between this read
  -- and the INSERT below such that it succeeds even though a concurrent
  -- start_debate_v2 (which also locks this row first) has, by the time
  -- either transaction actually commits, already moved the debate out of
  -- its open lobby -- i.e. a debater could join "after" the lobby closed
  -- from the room's perspective. Locking here forces the two to serialize:
  -- whichever transaction commits first is fully reflected in what the
  -- other sees once it acquires the lock.
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

  IF p_role = 'debater' THEN
    IF p_stance NOT IN ('for', 'against') THEN
      RAISE EXCEPTION 'A debater must select for or against.';
    END IF;

    IF v_status <> 'open' THEN
      RAISE EXCEPTION 'Debaters may only join while the debate is in its open lobby.';
    END IF;

    -- Atomic INSERT ... ON CONFLICT: a debater who already joined gets back
    -- their existing (permanently locked) stance, never a changed one, even
    -- if they call this again with a different p_stance. GET DIAGNOSTICS
    -- (not a pre-insert SELECT-then-branch) is what makes this race-safe:
    -- if two concurrent calls for the same new user both attempt the
    -- insert, exactly one affects a row and the other is skipped by
    -- ON CONFLICT DO NOTHING -- each call's own ROW_COUNT correctly
    -- reflects which happened to it, and the SELECT immediately after
    -- always returns the one persisted (winning) stance, never a stance
    -- that a losing concurrent call merely asked for.
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

    -- Consistency fix: same GET DIAGNOSTICS pattern as the debater branch
    -- above, for the same reason -- a pre-insert SELECT EXISTS here could
    -- race two concurrent first-time joins from the same user into both
    -- reporting already_joined = false. A juror row carries no stance, so
    -- the earlier version of this branch could never return incorrect
    -- DATA the way the debater branch's race could (there is no stance to
    -- get wrong), only a possibly-inaccurate already_joined flag -- fixed
    -- anyway for consistency and because it costs nothing.
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
  'Phase 2: authenticated debater/juror self-join for a V2 debate. A debater''s stance locks permanently on first join; calling again returns the existing stance unchanged. Deliberately not logged to debate_moderation_events (ordinary high-volume activity, not a privileged/moderation action).';

-- =============================================================================
-- I. Round lifecycle RPCs
-- =============================================================================
-- start_debate_round_one_v2 and advance_or_close_debate_round_v2 are the
-- shared internal transitions: both the authenticated manual wrappers
-- (start_debate_v2, advance_debate_round_v2) and the automatic batch
-- function (section J) call the SAME two functions, so "manual" and
-- "automatic" never diverge into two implementations of the same state
-- machine. p_actor_id is NULL for automatic calls; p_is_automatic records
-- which audit action name to use (round_advanced vs round_auto_advanced).
-- Neither internal function is granted to authenticated/service_role --
-- same owner-composition pattern as section B.

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

  -- Correction: authoritative authorization re-check, now that the debate
  -- row is locked. start_debate_v2's own check happens before this
  -- function is even called -- i.e. before any lock is held -- so it can
  -- go stale: a manager could pass that check, then have their management
  -- rights revoked (moderator reassignment) before they actually reach
  -- this lock, and without this re-check their call would still succeed.
  -- Skipped entirely for automatic calls (p_is_automatic), which are
  -- trusted via service_role and never carry a real actor to check.
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

  -- Idempotent: checked BEFORE the "debate must be open" business rule
  -- below. Correction: the original ordering checked v_status <> 'open'
  -- first, which meant a repeated start call made *after* the debate had
  -- already progressed to 'active' raised "Debate must be open" instead of
  -- ever reaching this branch -- the function was not actually idempotent
  -- despite its own comment claiming it was. Checking the round's own
  -- status first fixes that: a call that finds the round already
  -- non-scheduled returns the existing state regardless of what
  -- debates.status has since become.
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
  -- debates.current_phase is left as-is: debate_rounds is authoritative for
  -- V2 lifecycle from this point on. It is not dual-written here because
  -- current_phase's own CHECK constraint only allows
  -- opening/rebuttal/closing -- it has no cross_examination or final_vote
  -- value to represent V2's five phases, so writing to it would either
  -- violate that constraint or misrepresent the round. Any future reader
  -- that needs a V2 debate's phase must read debate_rounds, never
  -- current_phase.

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

  RETURN jsonb_build_object(
    'already_started', false, 'debate_id', p_debate_id,
    'round_id', v_round_id, 'status', 'active'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_debate_round_one_v2(uuid, uuid, boolean) FROM PUBLIC;

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

  -- Correction: authoritative authorization re-check under lock -- see the
  -- identical comment in start_debate_round_one_v2. advance_debate_round_v2's
  -- own check runs before this function is called, i.e. before any lock is
  -- held, so it cannot be trusted as the final word once management rights
  -- could have changed in between.
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

  -- Correction: without this check, two concurrent callers (a moderator
  -- double-click, or a manual call racing the automatic batch job) could
  -- both reach this point in sequence -- the first advances opening ->
  -- rebuttal and commits; the second, having been blocked on the debates
  -- lock above, then wakes up, finds THIS round now active (rebuttal), and
  -- advances it again (rebuttal -> cross_examination) -- silently skipping
  -- rebuttal entirely. p_expected_round_id is the round the caller observed
  -- as active before attempting this transition; if it no longer matches
  -- the round actually active once the lock is held, someone else already
  -- moved the debate on, and this call is stale -- return a no-op result
  -- instead of blindly advancing whatever happens to be active now.
  IF p_expected_round_id IS NOT NULL AND p_expected_round_id <> v_active_round_id THEN
    RETURN jsonb_build_object(
      'result', 'stale_no_op',
      'debate_id', p_debate_id,
      'expected_round_id', p_expected_round_id,
      'actual_active_round_id', v_active_round_id
    );
  END IF;

  -- Correction: automatic calls select "due" rounds (ends_at <= now()) in
  -- advance_due_debate_rounds_v2's outer query, but that selection is a
  -- separate, unlocked read -- a concurrent extend_debate_round_v2 could
  -- push ends_at into the future between that outer read and this lock
  -- being acquired. Re-checking ends_at here, now that the round is
  -- actually locked, is what prevents cron from overriding a just-applied
  -- extension. Manual calls never set p_require_due, so a moderator can
  -- still advance early regardless of remaining time, unchanged from
  -- before.
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
    -- Moving from final_vote closes the debate atomically instead of
    -- creating another round -- there is no round after final_vote.
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

  RETURN jsonb_build_object(
    'result', 'round_advanced', 'debate_id', p_debate_id,
    'old_phase', v_active_phase, 'new_phase', v_next_phase
  );
END;
$$;

REVOKE ALL ON FUNCTION public.advance_or_close_debate_round_v2(uuid, uuid, boolean, uuid, boolean) FROM PUBLIC;

COMMENT ON FUNCTION public.advance_or_close_debate_round_v2(uuid, uuid, boolean, uuid, boolean) IS
  'Phase 2 internal helper: the single shared round-advance/close transition used by both advance_debate_round_v2 (manual) and advance_due_debate_rounds_v2 (automatic), so the two never diverge. Locks the debate and its active round before transitioning. p_expected_round_id (compare-and-swap against a stale caller) and p_require_due (re-verify ends_at after locking, for automatic callers) close a double-advance/round-skip race -- see the comments inside the function body. Not granted to any client role.';

-- start_debate_v2: authenticated manager wrapper around
-- start_debate_round_one_v2.
CREATE OR REPLACE FUNCTION public.start_debate_v2(p_debate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF NOT public.can_manage_debate_v2(p_debate_id, v_actor_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage this debate.';
  END IF;

  RETURN public.start_debate_round_one_v2(p_debate_id, v_actor_id, false);
END;
$$;

REVOKE ALL ON FUNCTION public.start_debate_v2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_debate_v2(uuid) TO authenticated;

-- advance_debate_round_v2: authenticated manager wrapper around
-- advance_or_close_debate_round_v2. p_expected_round_id is REQUIRED
-- (correction: not defaulted) -- the caller must pass the round id it
-- rendered/observed as active, giving this a compare-and-swap contract: if
-- someone else already advanced the debate by the time this call's lock is
-- granted, it returns a stale no-op instead of skipping straight past the
-- round the caller never saw. A Phase 3 UI gets this id from whatever it
-- used to render "advance" in the first place (its own fetch or realtime
-- subscription of debate_rounds).
CREATE OR REPLACE FUNCTION public.advance_debate_round_v2(
  p_debate_id uuid,
  p_expected_round_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF NOT public.can_manage_debate_v2(p_debate_id, v_actor_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage this debate.';
  END IF;
  IF p_expected_round_id IS NULL THEN
    RAISE EXCEPTION 'p_expected_round_id is required.';
  END IF;

  RETURN public.advance_or_close_debate_round_v2(p_debate_id, v_actor_id, false, p_expected_round_id, false);
END;
$$;

REVOKE ALL ON FUNCTION public.advance_debate_round_v2(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_debate_round_v2(uuid, uuid) TO authenticated;

-- extend_debate_round_v2: bounded extension, 60 minutes maximum per call
-- (chosen and documented here and in docs/debate-v2-phase2-lifecycle.md --
-- long enough to meaningfully help a slow room, short enough that a
-- mis-click or repeated call cannot silently freeze a debate for hours).
--
-- Correction: now locks public.debates FIRST (consistent debate -> round
-- lock ordering with every other lifecycle function), where the original
-- only locked the round. Without the debates lock, this could interleave
-- with a concurrent advance_or_close_debate_round_v2/close_debate_v2 in a
-- way that let it silently extend whatever round happened to become active
-- by the time it got the round lock -- not necessarily the round the
-- moderator actually meant to extend. p_expected_round_id closes that the
-- same way advance_debate_round_v2's does: a stale caller gets a no-op
-- instead of extending the wrong round.
CREATE OR REPLACE FUNCTION public.extend_debate_round_v2(
  p_debate_id uuid,
  p_expected_round_id uuid,
  p_expected_ends_at timestamptz,
  p_minutes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_format_version smallint;
  v_round_id uuid;
  v_old_ends_at timestamptz;
  v_new_ends_at timestamptz;
  v_max_extension_minutes CONSTANT integer := 60;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  -- Early, non-authoritative check: fast rejection before taking any lock.
  -- The authoritative re-check, below, runs after the debate row is locked.
  IF NOT public.can_manage_debate_v2(p_debate_id, v_actor_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage this debate.';
  END IF;
  IF p_expected_round_id IS NULL THEN
    RAISE EXCEPTION 'p_expected_round_id is required.';
  END IF;

  IF p_minutes IS NULL OR p_minutes <= 0 THEN
    RAISE EXCEPTION 'p_minutes must be a positive number of minutes.';
  END IF;
  IF p_minutes > v_max_extension_minutes THEN
    RAISE EXCEPTION 'A single extension cannot exceed % minutes.', v_max_extension_minutes;
  END IF;

  SELECT format_version INTO v_format_version
    FROM public.debates WHERE id = p_debate_id
   FOR UPDATE;

  IF v_format_version IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;
  IF v_format_version <> 2 THEN
    RAISE EXCEPTION 'This debate is not a Debate V2 debate.';
  END IF;

  -- Correction: authoritative re-check now that the debate is locked --
  -- see the identical comment in advance_or_close_debate_round_v2. This is
  -- what actually closes the "management rights revoked mid-flight" gap;
  -- the check above is only a fast-fail convenience.
  IF NOT public.can_manage_debate_v2(p_debate_id, v_actor_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage this debate.';
  END IF;

  SELECT id, ends_at INTO v_round_id, v_old_ends_at
    FROM public.debate_rounds
   WHERE debate_id = p_debate_id AND status = 'active'
   FOR UPDATE;

  IF v_round_id IS NULL THEN
    RAISE EXCEPTION 'No active round to extend.';
  END IF;

  -- Correction: the round-id compare-and-swap alone does not stop a
  -- duplicate request (a double-click, or a client retry after a dropped
  -- response) from stacking, because extending a round never changes its
  -- id -- both the original and the duplicate call would see the same
  -- "expected" round still active. p_expected_ends_at closes that: the
  -- caller passes the ends_at it last observed, and only a call whose
  -- expectation still matches the round's CURRENT ends_at is allowed to
  -- proceed. The first of two duplicate calls advances ends_at and
  -- succeeds; the second's expectation is now stale (it still names the
  -- pre-extension value) and is rejected as a no-op rather than adding a
  -- second, unintended extension on top of the first.
  IF p_expected_round_id <> v_round_id OR p_expected_ends_at IS DISTINCT FROM v_old_ends_at THEN
    RETURN jsonb_build_object(
      'result', 'stale_no_op',
      'debate_id', p_debate_id,
      'expected_round_id', p_expected_round_id,
      'actual_active_round_id', v_round_id,
      'expected_ends_at', p_expected_ends_at,
      'actual_ends_at', v_old_ends_at
    );
  END IF;

  v_new_ends_at := COALESCE(v_old_ends_at, now()) + make_interval(mins => p_minutes);

  UPDATE public.debate_rounds
     SET ends_at = v_new_ends_at, updated_at = now()
   WHERE id = v_round_id;

  PERFORM public.log_debate_moderation_event(
    p_debate_id, v_actor_id, 'round', v_round_id, 'round_extended', NULL,
    jsonb_build_object('old_ends_at', v_old_ends_at, 'new_ends_at', v_new_ends_at, 'minutes', p_minutes)
  );

  RETURN jsonb_build_object(
    'result', 'extended',
    'round_id', v_round_id, 'old_ends_at', v_old_ends_at, 'new_ends_at', v_new_ends_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.extend_debate_round_v2(uuid, uuid, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extend_debate_round_v2(uuid, uuid, timestamptz, integer) TO authenticated;

-- close_debate_v2: normal close (final_vote must be active) vs forced close
-- (reason required, active round cancelled rather than completed).
CREATE OR REPLACE FUNCTION public.close_debate_v2(
  p_debate_id uuid,
  p_force boolean DEFAULT false,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_format_version smallint;
  v_status text;
  v_final_vote_status text;
  v_active_round_id uuid;
  v_now timestamptz := now();
  v_closure_kind text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  -- Early, non-authoritative check: fast rejection before taking any lock.
  IF NOT public.can_manage_debate_v2(p_debate_id, v_actor_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage this debate.';
  END IF;

  SELECT format_version, status INTO v_format_version, v_status
    FROM public.debates WHERE id = p_debate_id FOR UPDATE;

  IF v_format_version IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;
  IF v_format_version <> 2 THEN
    RAISE EXCEPTION 'This debate is not a Debate V2 debate.';
  END IF;

  -- Correction: authoritative re-check now that the debate is locked, run
  -- before the idempotency short-circuit below for the same reason
  -- activate_debate_v2 checks authorization before its own idempotent
  -- branch -- a caller who cannot manage this debate should not learn its
  -- closed/open state via this function either.
  IF NOT public.can_manage_debate_v2(p_debate_id, v_actor_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage this debate.';
  END IF;

  IF v_status = 'closed' THEN
    RETURN jsonb_build_object('already_closed', true, 'debate_id', p_debate_id);
  END IF;

  IF p_force THEN
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
      RAISE EXCEPTION 'A reason is required to force-close a debate.';
    END IF;
    v_closure_kind := 'forced';
  ELSE
    SELECT status INTO v_final_vote_status
      FROM public.debate_rounds
     WHERE debate_id = p_debate_id AND phase = 'final_vote'
     FOR UPDATE;

    IF v_final_vote_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'A normal close requires the final_vote round to be active (current: %). Pass p_force with a reason to close early.', COALESCE(v_final_vote_status, 'none');
    END IF;
    v_closure_kind := 'completed';
  END IF;

  SELECT id INTO v_active_round_id
    FROM public.debate_rounds
   WHERE debate_id = p_debate_id AND status = 'active'
   FOR UPDATE;

  IF v_active_round_id IS NOT NULL THEN
    -- Forced closure cancels the active round; a normal close completes it
    -- (it can only be the already-verified-active final_vote round).
    UPDATE public.debate_rounds
       SET status = CASE WHEN p_force THEN 'cancelled' ELSE 'completed' END,
           completed_at = v_now,
           updated_at = v_now
     WHERE id = v_active_round_id;
  END IF;

  UPDATE public.debates
     SET status = 'closed', ends_at = v_now, closure_kind = v_closure_kind
   WHERE id = p_debate_id;

  -- Distinct audit action names -- a forced closure is never logged as a
  -- normal completion.
  PERFORM public.log_debate_moderation_event(
    p_debate_id, v_actor_id, 'debate', p_debate_id,
    CASE WHEN p_force THEN 'debate_force_closed' ELSE 'debate_completed' END,
    p_reason,
    jsonb_build_object(
      'closure_kind', v_closure_kind,
      'cancelled_round_id', CASE WHEN p_force THEN v_active_round_id ELSE NULL END
    )
  );

  RETURN jsonb_build_object('already_closed', false, 'debate_id', p_debate_id, 'closure_kind', v_closure_kind);
END;
$$;

REVOKE ALL ON FUNCTION public.close_debate_v2(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_debate_v2(uuid, boolean, text) TO authenticated;

-- =============================================================================
-- J. Automatic round advancement
-- =============================================================================
-- service_role only. Reuses start_debate_round_one_v2 and
-- advance_or_close_debate_round_v2 (section I) rather than duplicating
-- transition logic. FOR UPDATE ... SKIP LOCKED on the outer debate-selection
-- loop deduplicates concurrent batch runs (a second overlapping invocation
-- skips debates the first is already processing); the inner shared
-- functions provide the actual transition safety, including against a
-- concurrent manual start/advance/extend call, via their own row locks.
CREATE OR REPLACE FUNCTION public.advance_due_debate_rounds_v2(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_debate_id uuid;
  v_round_id uuid;
  v_processed integer := 0;
  v_started integer := 0;
  v_advanced integer := 0;
  v_skipped integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  -- Phase A: start scheduled opening rounds whose configured starts_at is
  -- due. start_debate_round_one_v2 is already idempotent on the round's own
  -- status (fixed above), so no expected-round-id/require-due parameters
  -- are needed here the way Phase B needs them.
  --
  -- Correction: the result is now captured (SELECT ... INTO), not discarded
  -- via PERFORM. start_debate_round_one_v2 can return
  -- already_started = true (idempotent no-op) -- previously that was
  -- indistinguishable from a genuine start in v_started, silently inflating
  -- the count with no-ops.
  FOR v_debate_id IN
    SELECT d.id
      FROM public.debates d
      JOIN public.debate_rounds r
        ON r.debate_id = d.id
       AND r.sequence_number = 1
       AND r.status = 'scheduled'
     WHERE d.format_version = 2
       AND d.status = 'open'
       AND r.starts_at IS NOT NULL
       AND r.starts_at <= now()
     ORDER BY r.starts_at
     LIMIT v_limit
       FOR UPDATE OF d SKIP LOCKED
  LOOP
    BEGIN
      SELECT public.start_debate_round_one_v2(v_debate_id, NULL, true) INTO v_result;
      IF COALESCE((v_result ->> 'already_started')::boolean, false) THEN
        v_skipped := v_skipped + 1;
      ELSE
        v_started := v_started + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('debate_id', v_debate_id, 'stage', 'start', 'error', SQLERRM);
    END;
    v_processed := v_processed + 1;
  END LOOP;

  -- Phase B: advance (or close, if final_vote) active rounds whose ends_at
  -- is due. Correction: this outer query's ends_at <= now() check is an
  -- unlocked read -- a concurrent extend_debate_round_v2 could push ends_at
  -- into the future between here and advance_or_close_debate_round_v2
  -- acquiring its own lock on the same round. Passing the round id captured
  -- here as p_expected_round_id AND p_require_due = true makes that inner
  -- function re-verify, under lock, both that this is still the active
  -- round and that it is still actually due -- exactly what stops this
  -- batch job from overriding a just-applied extension.
  --
  -- Correction: as with Phase A, the result is now captured rather than
  -- discarded via PERFORM. advance_or_close_debate_round_v2 can return
  -- 'stale_no_op' (another caller already moved the round on) or 'not_due'
  -- (a concurrent extension pushed ends_at out) instead of actually
  -- transitioning -- only 'round_advanced'/'debate_completed' are counted
  -- as a real advance; anything else counts as skipped.
  FOR v_debate_id, v_round_id IN
    SELECT d.id, r.id
      FROM public.debates d
      JOIN public.debate_rounds r
        ON r.debate_id = d.id
       AND r.status = 'active'
     WHERE d.format_version = 2
       AND d.status = 'active'
       AND r.ends_at IS NOT NULL
       AND r.ends_at <= now()
     ORDER BY r.ends_at
     LIMIT v_limit
       FOR UPDATE OF d SKIP LOCKED
  LOOP
    BEGIN
      SELECT public.advance_or_close_debate_round_v2(v_debate_id, NULL, true, v_round_id, true) INTO v_result;
      IF v_result ->> 'result' IN ('round_advanced', 'debate_completed') THEN
        v_advanced := v_advanced + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('debate_id', v_debate_id, 'stage', 'advance', 'error', SQLERRM);
    END;
    v_processed := v_processed + 1;
  END LOOP;

  -- Structured counts only -- never exposes ballot data (this function
  -- never touches debate_ballots at all).
  RETURN jsonb_build_object(
    'processed', v_processed,
    'started', v_started,
    'advanced', v_advanced,
    'skipped', v_skipped,
    'errors', v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.advance_due_debate_rounds_v2(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_due_debate_rounds_v2(integer) TO service_role;

COMMENT ON FUNCTION public.advance_due_debate_rounds_v2(integer) IS
  'Phase 2: service-role-only batch job for the debate-round cron. Bounded by p_limit (1-200, default 50). Continues past a single malformed debate (caught per-iteration, reported in the errors array) rather than aborting the whole batch. See app/api/cron/advance-debate-rounds/route.ts and docs/debate-v2-phase2-lifecycle.md for the required invocation schedule.';

-- =============================================================================
-- K. V2 ballot RPCs
-- =============================================================================

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

  -- Correction: see join_debate_v2's identical comment -- this is a
  -- SECURITY DEFINER write that bypasses RLS's own suspension checks
  -- entirely, so it must perform this check itself.
  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Your account is currently suspended.';
  END IF;

  IF p_stage NOT IN ('initial', 'final') THEN
    RAISE EXCEPTION 'Invalid ballot stage.';
  END IF;
  IF p_vote NOT IN ('for', 'against', 'undecided') THEN
    RAISE EXCEPTION 'Invalid vote.';
  END IF;
  -- Confidence is required for a V2 ballot (a deliberate stricter-than-Phase-1
  -- rule; the column itself stays nullable at the schema level for any
  -- future non-V2 use).
  IF p_confidence IS NULL OR p_confidence < 1 OR p_confidence > 5 THEN
    RAISE EXCEPTION 'Confidence (1-5) is required.';
  END IF;
  IF p_influential_argument_id IS NOT NULL AND p_stage <> 'final' THEN
    RAISE EXCEPTION 'influential_argument_id is only allowed on a final ballot.';
  END IF;

  -- Correction: locked (debate first, per the consistent debate -> round
  -- lock ordering used throughout this migration). The original's unlocked
  -- read meant a ballot could still be inserted after its window
  -- concurrently closed -- e.g. an initial ballot landing just as
  -- start_debate_v2 (which also locks this row) moves the debate out of
  -- 'open'. Locking here serializes the two.
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
    -- Initial ballots: only before the opening round becomes active, i.e.
    -- while the debate is still in its open lobby.
    IF v_status <> 'open' THEN
      RAISE EXCEPTION 'Initial ballots are only accepted while the debate is in its open lobby.';
    END IF;
  ELSE
    -- Final ballots: only while final_vote is the active round. Also
    -- locked, so this can't race a concurrent advance/close of that round.
    SELECT status INTO v_final_vote_status
      FROM public.debate_rounds
     WHERE debate_id = p_debate_id AND phase = 'final_vote'
     FOR UPDATE;

    IF v_final_vote_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'Final ballots are only accepted while the final vote round is active.';
    END IF;
  END IF;

  -- Atomic upsert on (debate_id, user_id, stage); the Phase 1 same-debate
  -- trigger (debate_ballots_check_same_debate) remains the final integrity
  -- guard on influential_argument_id.
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
  'Phase 2: authenticated initial/final ballot upsert. created_at is preserved and updated_at bumped by ON CONFLICT DO UPDATE. Returns only the caller''s own ballot -- never another user''s.';

-- Aggregate results, privacy-safe by construction: never selects reason or
-- influential_argument_id, and only returns average_confidence once the
-- sample size (total ballots in that stage) meets v_min_confidence_sample.
-- Visibility: anonymous callers may see FINAL results, and only once the
-- debate is closed. Authenticated callers may see a stage's aggregate after
-- casting a ballot in that stage themselves, or after that stage has ended
-- (initial ends when the lobby closes / opening starts; final ends when the
-- debate closes or its final_vote round is no longer active).
CREATE OR REPLACE FUNCTION public.get_debate_ballot_results_v2(
  p_debate_id uuid,
  p_stage text
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
  v_stage_ended boolean;
  v_user_has_ballot boolean := false;
  v_for_count integer;
  v_against_count integer;
  v_undecided_count integer;
  v_total integer;
  v_avg_confidence numeric;
  v_min_confidence_sample CONSTANT integer := 3;
BEGIN
  IF p_stage NOT IN ('initial', 'final') THEN
    RAISE EXCEPTION 'Invalid ballot stage.';
  END IF;

  SELECT format_version, status INTO v_format_version, v_status
    FROM public.debates WHERE id = p_debate_id;

  IF v_format_version IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;
  IF v_format_version <> 2 THEN
    RAISE EXCEPTION 'This debate is not a Debate V2 debate.';
  END IF;

  IF p_stage = 'initial' THEN
    v_stage_ended := v_status <> 'open';
  ELSE
    v_stage_ended := v_status = 'closed'
      OR EXISTS (
        SELECT 1 FROM public.debate_rounds
         WHERE debate_id = p_debate_id
           AND phase = 'final_vote'
           AND status IN ('completed', 'cancelled')
      );
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.debate_ballots
       WHERE debate_id = p_debate_id AND user_id = v_user_id AND stage = p_stage
    ) INTO v_user_has_ballot;
  END IF;

  IF v_user_id IS NULL THEN
    IF NOT (p_stage = 'final' AND v_status = 'closed') THEN
      RAISE EXCEPTION 'Results are not available yet.';
    END IF;
  ELSE
    IF NOT (v_user_has_ballot OR v_stage_ended) THEN
      RAISE EXCEPTION 'Cast a ballot in this stage, or wait for it to end, to see results.';
    END IF;
  END IF;

  SELECT
    count(*) FILTER (WHERE vote = 'for'),
    count(*) FILTER (WHERE vote = 'against'),
    count(*) FILTER (WHERE vote = 'undecided'),
    count(*),
    avg(confidence)
    INTO v_for_count, v_against_count, v_undecided_count, v_total, v_avg_confidence
    FROM public.debate_ballots
   WHERE debate_id = p_debate_id AND stage = p_stage;

  RETURN jsonb_build_object(
    'debate_id', p_debate_id,
    'stage', p_stage,
    'for_count', COALESCE(v_for_count, 0),
    'against_count', COALESCE(v_against_count, 0),
    'undecided_count', COALESCE(v_undecided_count, 0),
    'total', COALESCE(v_total, 0),
    'average_confidence', CASE WHEN COALESCE(v_total, 0) >= v_min_confidence_sample
                                THEN round(v_avg_confidence, 2) ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_debate_ballot_results_v2(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_debate_ballot_results_v2(uuid, text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_debate_ballot_results_v2(uuid, text) IS
  'Phase 2: privacy-safe aggregate ballot results. Never returns reason or influential_argument_id. average_confidence is null until at least 3 ballots exist in that stage (chosen minimum sample threshold, documented in docs/debate-v2-phase2-lifecycle.md). Granted to anon for closed-debate final results only -- the function body enforces every other visibility rule itself.';

-- =============================================================================
-- L. V2 reaction RPC
-- =============================================================================

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

  -- Correction: see join_debate_v2's identical comment.
  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Your account is currently suspended.';
  END IF;

  IF p_reaction_type NOT IN (
    'well_supported', 'strong_reasoning', 'clear', 'strong_rebuttal',
    'fair_to_opposition', 'changed_my_mind', 'needs_evidence'
  ) THEN
    RAISE EXCEPTION 'Invalid reaction type.';
  END IF;

  -- Correction: locked (both the debate and the argument -- the argument
  -- lock doubles as this function's serialization point, see below). The
  -- original's unlocked read let a reaction insert after the debate
  -- concurrently closed. Locking the debate here closes that the same way
  -- as the other participation functions above.
  --
  -- The argument-row lock additionally fixes a SEPARATE problem the
  -- unlocked version had regardless of the debate check: SELECT EXISTS
  -- followed by INSERT/DELETE is not itself atomic. Two concurrent toggle
  -- calls for the very same (argument, user, reaction_type) could both read
  -- v_existing = false, both then attempt the INSERT (only one succeeds,
  -- ON CONFLICT DO NOTHING on the other) -- but a naive
  -- "row_count = 0 means pre-existing, so delete it" reading of that would
  -- have the LOSING concurrent call delete the reaction the WINNING call
  -- just added, even though both callers' intent was to turn the same
  -- reaction on. Locking debate_arguments for this argument first means
  -- every toggle call on it -- from any user -- is fully serialized: the
  -- SELECT EXISTS a call performs is guaranteed consistent with the
  -- INSERT/DELETE it then performs, because no other call on this argument
  -- can run between them.
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
    -- Calling the same reaction again toggles it off.
    DELETE FROM public.debate_reactions
     WHERE argument_id = p_argument_id AND user_id = v_user_id AND reaction_type = p_reaction_type;
  ELSE
    -- Different approved reaction types may coexist (no delete of any other
    -- reaction_type this user has already left on this argument).
    INSERT INTO public.debate_reactions (argument_id, user_id, reaction_type)
    VALUES (p_argument_id, v_user_id, p_reaction_type)
    ON CONFLICT DO NOTHING;

    -- Lowest-friction safe behaviour: reacting signals engagement with
    -- argument quality, which is exactly what a juror evaluates, so it
    -- creates a juror membership if the user does not already have one.
    -- Never grants moderator and never touches a debater's stance -- if the
    -- user already holds a debater (or moderator) membership, this simply
    -- adds a second, independent juror row alongside it (Phase 1's schema
    -- allows multiple roles per person per debate).
    INSERT INTO public.debate_memberships (debate_id, user_id, role, stance)
    VALUES (v_debate_id, v_user_id, 'juror', NULL)
    ON CONFLICT (debate_id, user_id, role) DO NOTHING;
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
  'Phase 2: atomic reaction toggle. Rejects self-reaction. Reacting creates a juror membership for the reactor if they do not already hold one (never moderator, never touches a debater''s stance). Returns per-reaction-type counts, no reactor identities.';

-- =============================================================================
-- M. V2 argument submission RPC
-- =============================================================================
-- Defense-in-depth partial unique indexes for the exactly-one-per-debater
-- limits (opening, closing). Rebuttal's "at most two" cannot be expressed as
-- a unique index, so it relies on the debate_memberships row lock inside the
-- function below (see that function's comment) -- a genuine database-level
-- serialization mechanism, not a bare pre-insert COUNT.
CREATE UNIQUE INDEX IF NOT EXISTS debate_arguments_one_opening_per_debater_v2
  ON public.debate_arguments(debate_id, author_id)
  WHERE entry_type = 'opening';

CREATE UNIQUE INDEX IF NOT EXISTS debate_arguments_one_closing_per_debater_v2
  ON public.debate_arguments(debate_id, author_id)
  WHERE entry_type = 'closing';

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

  -- Correction: see join_debate_v2's identical comment.
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

  -- Correction: lock order is now debate -> membership -> round,
  -- consistent with every other function in this migration (the original
  -- locked membership first, then read debates unlocked, then locked
  -- round -- a different order from the lifecycle functions, which is
  -- exactly the kind of inconsistency that creates deadlock risk between
  -- functions that acquire the same two locks in opposite sequences).
  --
  -- Lock 1/3: the debate. Without this, arguments could be inserted
  -- against a debate that has just closed (TOCTOU on v_status below).
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

  -- Lock 2/3: the debater's own membership row. Serializes every
  -- concurrent submission attempt by the SAME user for the SAME debate (two
  -- tabs, a double-click, a retried request), because a second concurrent
  -- call blocks here until the first's transaction commits or rolls back.
  -- By the time this SELECT returns for the second call, the first call's
  -- INSERT (if it succeeded) is already visible, so the count checks below
  -- cannot race. This is a real database-level serialization mechanism, not
  -- a bare pre-insert COUNT.
  SELECT stance INTO v_stance
    FROM public.debate_memberships
   WHERE debate_id = p_debate_id AND user_id = v_user_id AND role = 'debater'
   FOR UPDATE;

  IF v_stance IS NULL THEN
    RAISE EXCEPTION 'You must join this debate as a debater (join_debate_v2) before submitting an argument.';
  END IF;

  -- Lock 3/3: the active round. A concurrent round transition (manual
  -- advance/close or the automatic due-round job) must not change which
  -- round this submission is attributed to mid-transaction.
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

  -- Validate every source before inserting the argument, so an invalid
  -- source rejects the entire operation atomically.
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
  'Phase 2: authenticated V2 argument submission. Stance is always the caller''s locked debate_memberships stance, never a caller-supplied value. round_id/round_number are assigned server-side from the active round. Rejects cross_examination and final_vote outright (dedicated mechanics deferred). The Phase 1 debate_arguments_check_same_debate and debate_arguments_parent_relation_pairing_check remain final integrity guards on round_id/parent_argument_id/relation_type.';

-- =============================================================================
-- Function security audit (section 16)
-- =============================================================================
-- This migration creates or replaces 24 functions in total (verified by
-- counting distinct `CREATE OR REPLACE FUNCTION` statements, not by a plain
-- text search for the phrase -- two more occurrences of those words appear
-- only in prose, inside this file's own comments, discussing
-- CREATE OR REPLACE FUNCTION's ACL-preserving semantics). Every function created or replaced above was checked for: SET search_path
-- = public (all of them); auth.uid()/service-role validation (every
-- authenticated-facing function checks auth.uid() IS NOT NULL before doing
-- anything; every SECURITY DEFINER function that trusts a caller-supplied
-- id -- activate_debate_v2's p_actor_id, the internal transition
-- functions' p_actor_id -- independently re-verifies it via
-- can_manage_debate_v2 or only ever receives NULL for automatic paths); row
-- locking before every state transition (FOR UPDATE on the debate and/or
-- round row in every function that mutates lifecycle state); REVOKE ALL
-- FROM PUBLIC (every function above); minimal EXECUTE grants (see the exact
-- list in docs/debate-v2-phase2-lifecycle.md's "Function inventory and
-- EXECUTE grants" section); no dynamic SQL anywhere in this migration;
-- minimal return payloads (no function here returns another user's ballot,
-- another user's reaction identity, or moderation-event reasons beyond what
-- the caller is entitled to per the ballot-results visibility rules above).
--
-- Explicit default-privilege note: PostgreSQL grants EXECUTE on every newly
-- created function to PUBLIC by default. Every function above has an
-- explicit REVOKE ALL ... FROM PUBLIC immediately after its
-- CREATE OR REPLACE FUNCTION, closing that default before any GRANT is
-- considered. is_editor_or_admin, can_manage_debate_v2,
-- log_debate_moderation_event, start_debate_round_one_v2, and
-- advance_or_close_debate_round_v2 receive NO grant at all beyond that
-- REVOKE -- they are reachable only by composition from within the other
-- SECURITY DEFINER functions in this file, which run under their shared
-- owner's privileges regardless of the original caller's role.
