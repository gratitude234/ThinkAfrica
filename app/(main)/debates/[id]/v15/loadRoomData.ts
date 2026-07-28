import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  DebateV15Argument,
  DebateV15Phase,
  DebateV15Profile,
  DebateV15RoomData,
  DebateV15Slot,
  DebateV15Stance,
} from "./types";

interface ProfileRow {
  id: string;
  username: string | null;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
}

function toProfile(row: ProfileRow | undefined): DebateV15Profile | null {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    university: row.university,
    avatarUrl: row.avatar_url,
  };
}

function asPhase(value: unknown): DebateV15Phase {
  if (
    value === "recruiting" ||
    value === "opening" ||
    value === "rebuttal" ||
    value === "voting" ||
    value === "completed"
  ) {
    return value;
  }
  return "recruiting";
}

export async function loadDebateV15Room(
  debateId: string
): Promise<DebateV15RoomData | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: debate, error: debateError } = await supabase
    .from("debates")
    .select("*")
    .eq("id", debateId)
    .eq("debate_variant", "v1_5")
    .maybeSingle();

  if (debateError || !debate) return null;

  const [
    argumentsResult,
    slotsResult,
    currentProfileResult,
    motionVoteResult,
  ] = await Promise.all([
    supabase
      .from("debate_arguments")
      .select("*")
      .eq("debate_id", debateId)
      .order("round_number", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("debate_slots_v1_5")
      .select("*")
      .eq("debate_id", debateId)
      .order("stance", { ascending: false }),
    user
      ? supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    user
      ? supabase
          .from("debate_motion_votes")
          .select("vote")
          .eq("debate_id", debateId)
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const argumentRows = argumentsResult.data ?? [];
  const slotRows = slotsResult.data ?? [];
  const argumentIds = argumentRows.map((row) => row.id as string);
  const profileIds = Array.from(
    new Set(
      [
        debate.moderator_id,
        ...argumentRows.map((row) => row.author_id),
        ...slotRows.map((row) => row.user_id),
      ].filter((id): id is string => typeof id === "string")
    )
  );

  const [profilesResult, sourcesResult, upvotesResult, relatedResult] =
    await Promise.all([
      profileIds.length
        ? supabase
            .from("profiles")
            .select("id, username, full_name, university, avatar_url")
            .in("id", profileIds)
        : Promise.resolve({ data: [], error: null }),
      argumentIds.length
        ? supabase
            .from("debate_argument_sources_v1")
            .select("id, argument_id, url, title")
            .in("argument_id", argumentIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      user && argumentIds.length
        ? supabase
            .from("debate_votes")
            .select("argument_id")
            .eq("user_id", user.id)
            .in("argument_id", argumentIds)
        : Promise.resolve({ data: [], error: null }),
      Array.isArray(debate.tags) && debate.tags.length
        ? supabase
            .from("debates")
            .select("id, title, motion_for_count, motion_against_count")
            .eq("debate_variant", "v1_5")
            .eq("status", "closed")
            .neq("id", debateId)
            .overlaps("tags", debate.tags)
            .order("created_at", { ascending: false })
            .limit(3)
        : Promise.resolve({ data: [], error: null }),
    ]);

  const profiles = new Map(
    ((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [
      profile.id,
      profile,
    ])
  );
  const sourceRows = sourcesResult.data ?? [];

  const slots: DebateV15Slot[] = slotRows.map((slot) => ({
    userId: slot.user_id as string,
    stance: slot.stance as DebateV15Stance,
    status: slot.status as DebateV15Slot["status"],
    invitedAt: slot.invited_at as string,
    respondedAt: (slot.responded_at as string | null) ?? null,
    profile: toProfile(profiles.get(slot.user_id as string)),
  }));

  const argumentsForRoom: DebateV15Argument[] = argumentRows.map((argument) => ({
    id: argument.id as string,
    authorId: argument.author_id as string,
    stance: argument.stance as DebateV15Stance,
    phase: Number(argument.round_number) === 2 ? "rebuttal" : "opening",
    content: argument.content as string,
    upvotes: Number(argument.upvotes ?? 0),
    createdAt: argument.created_at as string,
    author: toProfile(profiles.get(argument.author_id as string)),
    sources: sourceRows
      .filter((source) => source.argument_id === argument.id)
      .map((source) => ({
        id: source.id as string,
        url: source.url as string,
        title: (source.title as string | null) ?? null,
      })),
  }));

  const role = (currentProfileResult.data as { role?: string } | null)?.role;

  return {
    loadedAt: Date.now(),
    debate: {
      id: debate.id,
      title: debate.title,
      description: debate.description ?? null,
      tags: Array.isArray(debate.tags) ? debate.tags : [],
      status: debate.status,
      phase: asPhase(debate.current_phase),
      moderatorId: debate.moderator_id ?? null,
      moderator: toProfile(
        debate.moderator_id
          ? profiles.get(debate.moderator_id as string)
          : undefined
      ),
      recruitingDeadline: debate.recruiting_deadline ?? null,
      openingDeadline: debate.opening_deadline ?? null,
      rebuttalDeadline: debate.rebuttal_deadline ?? null,
      votingDeadline: debate.voting_deadline ?? null,
      cancellationReason: debate.cancellation_reason ?? null,
      cancelledAt: debate.cancelled_at ?? null,
      forVotes: Number(debate.motion_for_count ?? 0),
      againstVotes: Number(debate.motion_against_count ?? 0),
      recapStatus: debate.recap_status ?? null,
      recapText: debate.recap_text ?? null,
      recapKeyDisagreement: debate.recap_key_disagreement ?? null,
      recapAgreement: debate.recap_agreement ?? null,
      recapStrongestFor: debate.recap_strongest_for ?? null,
      recapStrongestAgainst: debate.recap_strongest_against ?? null,
      recapError: debate.recap_error ?? null,
    },
    currentUserId: user?.id ?? null,
    isManager:
      Boolean(user?.id && user.id === debate.moderator_id) ||
      role === "editor" ||
      role === "admin",
    slots,
    arguments: argumentsForRoom,
    userUpvotedArgumentIds: (upvotesResult.data ?? []).map(
      (vote) => vote.argument_id as string
    ),
    userFinalVote:
      ((motionVoteResult.data as { vote?: DebateV15Stance } | null)?.vote ??
        null),
    relatedDebates: (relatedResult.data ?? []).map((related) => ({
      id: related.id as string,
      title: related.title as string,
      forVotes: Number(related.motion_for_count ?? 0),
      againstVotes: Number(related.motion_against_count ?? 0),
    })),
  };
}
