"use server";

/**
 * A cheap "has anything changed" probe for the V1.5 room's polling loop.
 *
 * Postgres realtime is not a usable live-update mechanism here: migration
 * 20260521000001_disable_realtime_for_launch_stability.sql dropped
 * debate_arguments from the supabase_realtime publication, and
 * shouldUseRealtime() additionally gates subscriptions behind
 * NEXT_PUBLIC_ENABLE_REALTIME. V2 reached the same conclusion and polls
 * instead (see DebateV2Room's module comment), so V1.5 follows that pattern.
 *
 * loadDebateV15Room is a correct but relatively expensive read -- full
 * argument/profile/source rows plus related-debate lookups -- and is wasteful
 * to repeat every tick for someone who is just reading. This reads only the
 * handful of columns whose change is actually visible in the room, so a tick
 * that finds nothing new costs three small queries and no re-render.
 *
 * Everything returned here is already visible to any viewer who can load the
 * room: no per-user state (their vote, their upvotes) is included, so the
 * signal is identical for every viewer and never leaks anything the room
 * itself would not show.
 */

import { createClient } from "@/lib/supabase/server";
import type { DebateV15RoomSignal } from "./roomSignal";

export async function loadDebateV15RoomSignal(
  debateId: string
): Promise<DebateV15RoomSignal | null> {
  const supabase = await createClient();

  const [debateResult, argumentsResult, slotsResult] = await Promise.all([
    supabase
      .from("debates")
      .select(
        "status, current_phase, recruiting_deadline, opening_deadline, rebuttal_deadline, voting_deadline, motion_for_count, motion_against_count, recap_status, cancelled_at"
      )
      .eq("id", debateId)
      .eq("debate_variant", "v1_5")
      .maybeSingle(),
    supabase
      .from("debate_arguments")
      .select("id, upvotes")
      .eq("debate_id", debateId)
      .order("id", { ascending: true }),
    supabase
      .from("debate_slots_v1_5")
      .select("stance, status")
      .eq("debate_id", debateId)
      .order("stance", { ascending: false }),
  ]);

  const debate = debateResult.data;
  if (debateResult.error || !debate) return null;

  // A failed sub-query must not read as "no arguments"/"no slots" -- that
  // would look like a change on this tick and like a change again on the
  // next one. Bail instead and let the caller keep its existing baseline.
  if (argumentsResult.error || slotsResult.error) return null;

  return {
    status: String(debate.status),
    phase: String(debate.current_phase),
    recruitingDeadline: debate.recruiting_deadline ?? null,
    openingDeadline: debate.opening_deadline ?? null,
    rebuttalDeadline: debate.rebuttal_deadline ?? null,
    votingDeadline: debate.voting_deadline ?? null,
    forVotes: Number(debate.motion_for_count ?? 0),
    againstVotes: Number(debate.motion_against_count ?? 0),
    recapStatus: debate.recap_status ?? null,
    cancelledAt: debate.cancelled_at ?? null,
    // Sorted in JS rather than trusting query order: the baseline this is
    // compared against is derived client-side from already-loaded room data
    // (debateV15SignalFromRoom), and the two must order identically or every
    // tick would look like a change.
    argumentFingerprint: (argumentsResult.data ?? [])
      .map((row) => `${row.id}:${Number(row.upvotes ?? 0)}`)
      .sort()
      .join(","),
    slotFingerprint: (slotsResult.data ?? [])
      .map((row) => `${row.stance}:${row.status}`)
      .sort()
      .join(","),
  };
}
