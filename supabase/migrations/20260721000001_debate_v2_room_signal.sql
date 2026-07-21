-- Debate V2 Phase 3 hardening: a single, privacy-safe polling signal RPC.
--
-- Additive only -- adds exactly one new function, does not touch either
-- existing Debate V2 migration (20260718000002_debate_v2_foundation.sql,
-- 20260718000003_debate_v2_lifecycle_permissions.sql), no RLS policy on any
-- table is changed, no existing function is redefined.
--
-- Why this exists: the Phase 3 UI polls a "has anything in this room
-- changed" signal every ~15s so it can avoid a full, much more expensive
-- room reload on every tick (see app/(main)/debates/[id]/v2/loadRoomSignal.ts
-- and DebateV2Room.tsx). That signal was originally computed client-side as
-- 7 separate ordinary (RLS-scoped) queries, then as an earlier revision of
-- this same function. Review caught three problems, all addressed in this
-- revision:
--   1. debate_ballots is self-only SELECT under RLS (see its Phase 1 table
--      comment) -- an ordinary client-scoped query can only ever see the
--      current viewer's own ballots, so a naive signal never reflected
--      anyone else's vote. SECURITY DEFINER is what lets this function's
--      ballot counts see every participant's ballots.
--   2. An earlier revision of this function exposed a global ballot count/
--      timestamp to every caller regardless of whether they're actually
--      allowed to see that stage's results yet (per
--      get_debate_ballot_results_v2's own visibility rule). Even though no
--      vote/confidence/reason was ever exposed, a bare count changing is
--      itself a side-channel leak of turnout/voting-activity information a
--      caller isn't supposed to have yet. Fixed by gating each stage's
--      ballot_count/ballot_latest_updated_at behind that exact same
--      visibility rule, per stage, mirrored inline below (see that
--      section's comment for why it's duplicated rather than composed).
--      A caller who can't see a stage's results gets NULL for that stage's
--      fields -- which is fine, since their UI can't display anything for
--      that stage regardless, so there's nothing for them to be notified
--      about changing.
--   3. Moderator reassignment (or an editor/admin role change) was
--      undetectable: total membership count doesn't move when one
--      membership row is deleted and another inserted. Fixed by including
--      a caller-specific can_manage boolean, computed live via the same
--      can_manage_debate_v2 helper every V2 lifecycle RPC already uses --
--      composed directly (not duplicated), since it is a simple, already-
--      SECURITY-DEFINER-composable boolean function with no side effects,
--      unlike the ballot-visibility rule below.
--   4. 7 round-tripped queries per viewer per poll tick doesn't scale.
--      Consolidating them into one SECURITY DEFINER function cuts that to 1.
--
-- No local PostgreSQL/Supabase harness is configured in this repo (see
-- CLAUDE.md), so -- consistent with both prior Debate V2 migrations -- this
-- has been verified by static review only, not by execution. Apply to a
-- staging environment and verify there before considering it deployable,
-- same as the two migrations before it.

CREATE OR REPLACE FUNCTION public.get_debate_room_signal_v2(p_debate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_format_version smallint;
  v_status text;
  v_closure_kind text;
  v_rounds jsonb;
  v_argument_count integer;
  v_reaction_count integer;
  v_reaction_latest timestamptz;
  v_membership_count integer;
  v_can_manage boolean;
  v_initial_stage_ended boolean;
  v_initial_user_has_ballot boolean := false;
  v_initial_visible boolean;
  v_initial_ballot_count integer;
  v_initial_ballot_latest timestamptz;
  v_final_stage_ended boolean;
  v_final_user_has_ballot boolean := false;
  v_final_visible boolean;
  v_final_ballot_count integer;
  v_final_ballot_latest timestamptz;
BEGIN
  SELECT format_version, status, closure_kind
    INTO v_format_version, v_status, v_closure_kind
    FROM public.debates
   WHERE id = p_debate_id;

  -- Unlike get_debate_ballot_results_v2, this deliberately returns NULL
  -- rather than RAISE EXCEPTION for "not found"/"not a V2 debate" -- this
  -- function exists purely to be polled cheaply and frequently, and a plain
  -- NULL is a simpler, less brittle signal for the caller than matching a
  -- RAISE EXCEPTION message on every tick.
  IF v_format_version IS NULL OR v_format_version <> 2 THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object('id', id, 'status', status, 'ends_at', ends_at)
             ORDER BY sequence_number
           ),
           '[]'::jsonb
         )
    INTO v_rounds
    FROM public.debate_rounds
   WHERE debate_id = p_debate_id;

  SELECT count(*)
    INTO v_argument_count
    FROM public.debate_arguments
   WHERE debate_id = p_debate_id;

  -- debate_reactions has no debate_id column of its own (only
  -- argument_id) -- join through debate_arguments to scope it, in one
  -- query, rather than a separate "fetch argument ids, then filter
  -- reactions" round trip. max(r.created_at) is included alongside the
  -- count specifically so a same-tick "one reaction removed, a different
  -- one added" (net-zero count change) still moves the signal -- the
  -- added row always carries a fresh created_at even when the total count
  -- doesn't change.
  SELECT count(*), max(r.created_at)
    INTO v_reaction_count, v_reaction_latest
    FROM public.debate_reactions r
    JOIN public.debate_arguments a ON a.id = r.argument_id
   WHERE a.debate_id = p_debate_id;

  SELECT count(*)
    INTO v_membership_count
    FROM public.debate_memberships
   WHERE debate_id = p_debate_id;

  -- can_manage_debate_v2 is already SECURITY INVOKER-safe to compose from
  -- inside a SECURITY DEFINER function (see its own comment in
  -- 20260718000003 -- "reachable only by composition from within the other
  -- SECURITY DEFINER functions"), so this calls it directly rather than
  -- re-deriving moderator/membership/editor/admin logic a third time.
  -- auth.uid() is unaffected by SECURITY DEFINER (it reflects the actual
  -- calling session, not the function owner), so v_user_id here is still
  -- the real caller. This is what lets the signal notice a moderator
  -- reassignment or an editor/admin role change even though neither moves
  -- v_membership_count (one row deleted, one inserted -- net zero).
  v_can_manage := public.can_manage_debate_v2(p_debate_id, v_user_id);

  -- Per-stage ballot visibility, mirroring get_debate_ballot_results_v2's
  -- own v_stage_ended / v_user_has_ballot / visibility computation exactly
  -- (see that function, section K of 20260718000003). Duplicated rather
  -- than composed into: composing would mean calling a SECURITY DEFINER
  -- function purely to observe whether it raises, via a BEGIN/EXCEPTION
  -- block, for each of two stages, on every poll tick -- more expensive and
  -- less transparent than mirroring roughly a dozen lines of boolean logic.
  -- If that function's visibility rule ever changes, this must change with
  -- it -- both are in migrations named for the phase that introduced them,
  -- so a future reviewer diffing get_debate_ballot_results_v2 should grep
  -- for this comment.
  --
  -- Each stage's ballot_count/ballot_latest_updated_at is populated ONLY
  -- when v_*_visible is true for that stage; otherwise it stays NULL. A
  -- caller who cannot yet see a stage's results has no UI to update for
  -- that stage regardless, so withholding the count/timestamp costs them
  -- nothing -- and prevents them from inferring turnout/voting-activity
  -- (a side channel get_debate_ballot_results_v2 itself was designed to
  -- prevent) purely by polling this signal.
  v_initial_stage_ended := v_status <> 'open';
  v_final_stage_ended := v_status = 'closed'
    OR EXISTS (
      SELECT 1 FROM public.debate_rounds
       WHERE debate_id = p_debate_id
         AND phase = 'final_vote'
         AND status IN ('completed', 'cancelled')
    );

  IF v_user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.debate_ballots
       WHERE debate_id = p_debate_id AND user_id = v_user_id AND stage = 'initial'
    ) INTO v_initial_user_has_ballot;
    SELECT EXISTS(
      SELECT 1 FROM public.debate_ballots
       WHERE debate_id = p_debate_id AND user_id = v_user_id AND stage = 'final'
    ) INTO v_final_user_has_ballot;
  END IF;

  IF v_user_id IS NULL THEN
    v_initial_visible := false;
    v_final_visible := (v_status = 'closed');
  ELSE
    v_initial_visible := v_initial_user_has_ballot OR v_initial_stage_ended;
    v_final_visible := v_final_user_has_ballot OR v_final_stage_ended;
  END IF;

  IF v_initial_visible THEN
    SELECT count(*), max(updated_at)
      INTO v_initial_ballot_count, v_initial_ballot_latest
      FROM public.debate_ballots
     WHERE debate_id = p_debate_id AND stage = 'initial';
  END IF;

  IF v_final_visible THEN
    SELECT count(*), max(updated_at)
      INTO v_final_ballot_count, v_final_ballot_latest
      FROM public.debate_ballots
     WHERE debate_id = p_debate_id AND stage = 'final';
  END IF;

  RETURN jsonb_build_object(
    'debate_status', v_status,
    'closure_kind', v_closure_kind,
    'rounds', v_rounds,
    'argument_count', coalesce(v_argument_count, 0),
    'reaction_count', coalesce(v_reaction_count, 0),
    'reaction_latest_created_at', v_reaction_latest,
    'membership_count', coalesce(v_membership_count, 0),
    'can_manage', v_can_manage,
    'initial_ballot_count', v_initial_ballot_count,
    'initial_ballot_latest_updated_at', v_initial_ballot_latest,
    'final_ballot_count', v_final_ballot_count,
    'final_ballot_latest_updated_at', v_final_ballot_latest
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_debate_room_signal_v2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_debate_room_signal_v2(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_debate_room_signal_v2(uuid) IS
  'Phase 3 hardening: consolidated, privacy-safe polling signal for the V2 room UI (replaces 7 separate client-side queries with 1). Returns only aggregate counts/timestamps, per-round id/status/ends_at, and a caller-specific can_manage boolean -- never individual ballot/reaction/membership rows, never a reactor or voter identity, never vote/confidence/reason content. Each stage''s ballot_count/ballot_latest_updated_at is NULL unless the caller satisfies get_debate_ballot_results_v2''s own visibility rule for that stage (mirrored inline, not bypassed). Consumed by DebateV2Room purely to decide whether a full data reload (loadDebateV2Room, which still enforces every existing visibility rule itself) is worth its cost -- this function is not a substitute for get_debate_ballot_results_v2 and never reveals a result.';

-- ---------------------------------------------------------------------------
-- Function security audit (mirrors the checklist at the end of
-- 20260718000003_debate_v2_lifecycle_permissions.sql, applied to this one
-- new function)
-- ---------------------------------------------------------------------------
-- SET search_path = public: yes. auth.uid(): used, to compute can_manage
-- and per-stage ballot visibility for the actual calling session (see the
-- comment above on why SECURITY DEFINER doesn't affect what auth.uid()
-- returns). Row locking: none -- pure read, no mutation. REVOKE ALL FROM
-- PUBLIC: yes, immediately after CREATE OR REPLACE FUNCTION, before the
-- GRANT. EXECUTE grant: anon, authenticated (matches
-- get_debate_ballot_results_v2's grant -- anonymous viewers need to poll an
-- open/active/closed V2 room same as authenticated ones; their can_manage
-- is always false and their ballot visibility follows the same anonymous
-- branch as get_debate_ballot_results_v2). No dynamic SQL. Minimal return
-- payload: verified above -- counts, timestamps, and one boolean, no row
-- content, no identities, no per-stage data beyond what that stage's own
-- visibility rule already permits.
