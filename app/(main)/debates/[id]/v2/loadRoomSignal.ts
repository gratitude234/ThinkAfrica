"use server";

/**
 * Debate V2 Phase 3 hardening: a cheap "has anything changed" check for
 * polling. loadDebateV2Room (loadRoomData.ts) is a correct but relatively
 * expensive read -- full argument/author/source/reaction rows, membership
 * rows, and two ballot-aggregate RPCs -- fine for an initial render or a
 * genuine refresh, but wasteful to repeat on every 15s poll tick for a
 * viewer who is just reading. This calls a single consolidated RPC
 * (get_debate_room_signal_v2, supabase/migrations/20260721000001_debate_v2_room_signal.sql,
 * extended in 20260721000002_debate_v2_cross_examination.sql with
 * cross_exchange_count/cross_exchange_latest_updated_at) instead of several
 * separate queries: that function is SECURITY DEFINER,
 * which is required for its per-stage ballot counts to be accurate --
 * debate_ballots is self-only SELECT under RLS, so an ordinary client-scoped
 * query here could only ever see the caller's own ballots. Each stage's
 * ballot fields are also null unless the caller can already see that
 * stage's results, mirroring get_debate_ballot_results_v2's own visibility
 * rule -- see the migration for why. It returns only aggregate counts,
 * timestamps, and a caller-specific can_manage boolean, never individual
 * rows or identities. DebateV2Room polls this on every tick and only calls
 * loadDebateV2Room when roomSignalsDiffer() says something actually changed.
 */

import { createClient } from "@/lib/supabase/server";
import type { DebateRoundStatus } from "@/lib/debateV2";
import type { DebateV2ClosureKind, DebateV2RoomSignal, DebateV2Status } from "./types";

interface RoomSignalRpcRow {
  debate_status: string;
  closure_kind: string | null;
  rounds: { id: string; status: string; ends_at: string | null }[];
  argument_count: number;
  reaction_count: number;
  reaction_latest_created_at: string | null;
  cross_exchange_count: number;
  cross_exchange_latest_updated_at: string | null;
  membership_count: number;
  can_manage: boolean;
  initial_ballot_count: number | null;
  initial_ballot_latest_updated_at: string | null;
  final_ballot_count: number | null;
  final_ballot_latest_updated_at: string | null;
}

export async function loadDebateV2RoomSignal(debateId: string): Promise<DebateV2RoomSignal | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_debate_room_signal_v2", { p_debate_id: debateId });

  if (error) {
    throw new Error(`loadDebateV2RoomSignal: failed to load room signal (${error.message ?? "unknown error"})`);
  }
  // get_debate_room_signal_v2 returns SQL NULL (not a raised exception) for
  // "not found" / "not a V2 debate" -- see that function's own comment for
  // why this deliberately differs from get_debate_ballot_results_v2's
  // RAISE EXCEPTION convention.
  if (!data) return null;

  const row = data as RoomSignalRpcRow;

  return {
    debateStatus: row.debate_status as DebateV2Status,
    closureKind: (row.closure_kind as DebateV2ClosureKind) ?? null,
    rounds: (row.rounds ?? []).map((round) => ({
      id: round.id,
      status: round.status as DebateRoundStatus,
      endsAt: round.ends_at,
    })),
    argumentCount: row.argument_count,
    reactionCount: row.reaction_count,
    reactionLatestCreatedAt: row.reaction_latest_created_at,
    crossExchangeCount: row.cross_exchange_count,
    crossExchangeLatestUpdatedAt: row.cross_exchange_latest_updated_at,
    membershipCount: row.membership_count,
    canManage: row.can_manage,
    initialBallotCount: row.initial_ballot_count,
    initialBallotLatestUpdatedAt: row.initial_ballot_latest_updated_at,
    finalBallotCount: row.final_ballot_count,
    finalBallotLatestUpdatedAt: row.final_ballot_latest_updated_at,
  };
}
