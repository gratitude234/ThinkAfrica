"use server";

/**
 * Debate V2 Phase 3: the single data-loading path for a V2 room, used both
 * for the initial Server Component render (DebateV2Page) and for
 * client-side refetch/polling (DebateV2Room) -- a Server Action can be
 * called directly from a Client Component as a plain async function, so
 * this one function is the entire "read" surface, keeping initial render
 * and refresh-after-mutation guaranteed to agree on shape.
 *
 * Query plan (no N+1): one parallel batch of independent queries (debate +
 * moderator profile, rounds, memberships, arguments + author profiles,
 * Phase 4A cross-examination exchanges + asker/target profiles, the
 * caller's own ballots, the caller's profile role, and both
 * get_debate_ballot_results_v2 aggregate calls), followed by one parallel
 * batch of the two queries that depend on the fetched argument ids (sources,
 * reactions) via a single `IN (...)` each -- never one query per argument.
 * Reaction rows (which carry reactor user_id) are aggregated into counts
 * and a per-argument "did the current user react" list entirely on the
 * server; the raw rows, and any other user's identity, never cross into the
 * value returned to the client. Cross-exchanges' target_argument_id is
 * resolved from the arguments already fetched in the same first batch (via
 * the same buildParentRef helper rebuttals use for their own parent
 * reference) -- no extra query, and asker/target profiles come from the
 * exchanges query's own aliased embeds, so exchange loading is O(1)
 * queries regardless of how many exchanges exist.
 */

import { createClient } from "@/lib/supabase/server";
import { canManageDebateV2 } from "@/lib/debateV2Lifecycle";
import type {
  DebateArgumentEntryType,
  DebateArgumentRelationType,
  DebateBallotVote,
  DebateReactionType,
  DebateRoundPhase,
  DebateRoundStatus,
  DebateStance,
} from "@/lib/debateV2";
import type {
  DebateV2ArgumentParentRef,
  DebateV2ArgumentView,
  DebateV2BallotResults,
  DebateV2ClosureKind,
  DebateV2CrossExchangeView,
  DebateV2DebaterSummary,
  DebateV2DebateSummary,
  DebateV2OwnBallot,
  DebateV2ProfileSummary,
  DebateV2RoomView,
  DebateV2RoundView,
  DebateV2SourceView,
  DebateV2Status,
  DebateV2SubscriptionView,
} from "./types";

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toProfileSummary(
  raw: { id: string; username: string | null; full_name: string | null; university: string | null; avatar_url: string | null } | null
): DebateV2ProfileSummary | null {
  if (!raw) return null;
  return {
    id: raw.id,
    username: raw.username,
    full_name: raw.full_name,
    university: raw.university,
    avatar_url: raw.avatar_url,
  };
}

/**
 * A failed query here must not be allowed to masquerade as "this debate
 * genuinely has no rounds/memberships/arguments/sources/reactions" -- that
 * silently renders a misleading "No arguments submitted yet" instead of
 * surfacing that something actually went wrong. Throwing lets the caller
 * (DebateV2Page's SSR render, or DebateV2Room's refresh/poll try/catch)
 * handle it as a real failure instead of a calm empty state. Ballot-result
 * RPC errors are deliberately exempt -- see their own comment below, that
 * "error" is an expected, normal visibility outcome, not a fetch failure.
 */
function assertNoQueryError(label: string, error: { message?: string } | null): void {
  if (error) {
    throw new Error(`loadDebateV2Room: failed to load ${label} (${error.message ?? "unknown error"})`);
  }
}

function toBallotResults(raw: unknown): DebateV2BallotResults | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const forCount = Number(row.for_count ?? 0);
  const againstCount = Number(row.against_count ?? 0);
  const undecidedCount = Number(row.undecided_count ?? 0);
  const total = Number(row.total ?? 0);
  const averageConfidence =
    row.average_confidence === null || row.average_confidence === undefined
      ? null
      : Number(row.average_confidence);

  return { forCount, againstCount, undecidedCount, total, averageConfidence };
}

/**
 * get_debate_ballot_results_v2 RAISE EXCEPTIONs (SQLSTATE P0001, the same
 * convention sanitizeRpcErrorMessage in lib/debateV2Ui.ts relies on
 * elsewhere) whenever results simply aren't visible to this caller yet --
 * that is an expected, normal outcome, not a failure. Anything else (a
 * genuine connection/timeout error, or an unexpected server error with a
 * different or absent code) must not be silently folded into the same
 * "unavailable" state -- it's thrown instead, same as every other query
 * above.
 */
function resolveBallotResults(
  data: unknown,
  error: { code?: string | null; message?: string | null } | null,
  label: string
): DebateV2BallotResults | null {
  if (error) {
    if (error.code === "P0001") return null;
    throw new Error(`loadDebateV2Room: failed to load ${label} ballot results (${error.message ?? "unknown error"})`);
  }
  return toBallotResults(data);
}

export async function loadDebateV2Room(debateId: string): Promise<DebateV2RoomView | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    debateRes,
    roundsRes,
    membershipsRes,
    argumentsRes,
    crossExchangesRes,
    ballotsRes,
    profileRoleRes,
    initialResultsRes,
    finalResultsRes,
    subscriptionRes,
  ] = await Promise.all([
      supabase
        .from("debates")
        .select(
          "id, title, description, status, format_version, moderator_id, round_duration_minutes, tags, created_at, ends_at, closure_kind, profiles!debates_moderator_id_fkey(id, username, full_name, university, avatar_url)"
        )
        .eq("id", debateId)
        .maybeSingle(),
      supabase
        .from("debate_rounds")
        .select("id, sequence_number, phase, status, starts_at, ends_at, duration_minutes, started_at, completed_at")
        .eq("debate_id", debateId)
        .order("sequence_number", { ascending: true }),
      supabase
        .from("debate_memberships")
        .select(
          "user_id, role, stance, profiles!debate_memberships_user_id_fkey(id, username, full_name, university, avatar_url)"
        )
        .eq("debate_id", debateId),
      supabase
        .from("debate_arguments")
        .select(
          "id, author_id, stance, entry_type, claim, content, round_id, parent_argument_id, relation_type, created_at, edited_at, profiles!debate_arguments_author_id_fkey(id, username, full_name, university, avatar_url)"
        )
        .eq("debate_id", debateId)
        .order("created_at", { ascending: true }),
      supabase
        .from("debate_cross_exchanges")
        .select(
          "id, round_id, asker_id, target_id, target_argument_id, question, answer, answered_at, created_at, updated_at, asker:profiles!debate_cross_exchanges_asker_id_fkey(id, username, full_name, university, avatar_url), target:profiles!debate_cross_exchanges_target_id_fkey(id, username, full_name, university, avatar_url)"
        )
        .eq("debate_id", debateId)
        .order("created_at", { ascending: true }),
      user
        ? supabase
            .from("debate_ballots")
            .select("stage, vote, confidence, reason, influential_argument_id, updated_at")
            .eq("debate_id", debateId)
            .eq("user_id", user.id)
        : Promise.resolve({ data: [], error: null }),
      user
        ? supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.rpc("get_debate_ballot_results_v2", { p_debate_id: debateId, p_stage: "initial" }),
      supabase.rpc("get_debate_ballot_results_v2", { p_debate_id: debateId, p_stage: "final" }),
      // Phase 4B: the caller's own debate_subscriptions row only -- the
      // table's self-only SELECT RLS policy already scopes this to
      // auth.uid(), so a plain query (no RPC) is enough, mirroring every
      // other self-only read in this loader (e.g. the ballots query above).
      user
        ? supabase
            .from("debate_subscriptions")
            .select(
              "is_subscribed, notify_phase_changes, notify_direct_responses, notify_evidence_requests, notify_final_vote, notify_recap"
            )
            .eq("debate_id", debateId)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  // A failed debate query must not be treated the same as "genuinely
  // doesn't exist" -- the former should surface as an error, the latter as
  // notFound().
  assertNoQueryError("debate", debateRes.error);
  if (!debateRes.data) return null;

  const debateRow = debateRes.data;

  // Defense in depth: page.tsx already gates entry into the V2 experience
  // on format_version, but this loader is the sole read path for that
  // experience and must not silently serve V1 debate content if it were
  // ever reached directly (a bug elsewhere, a stale link, a direct call).
  if (debateRow.format_version !== 2) return null;

  assertNoQueryError("rounds", roundsRes.error);
  assertNoQueryError("memberships", membershipsRes.error);
  assertNoQueryError("arguments", argumentsRes.error);
  assertNoQueryError("cross-examination exchanges", crossExchangesRes.error);
  assertNoQueryError("ballots", ballotsRes.error);
  // profileRoleRes failing would otherwise silently degrade an editor/admin
  // into losing their moderator controls with no indication why -- fail
  // loudly instead, consistent with every other query here (the moderator/
  // membership-based paths to canManage are unaffected by this specific
  // query regardless, but a real query failure should never be mistaken
  // for "definitely not an editor or admin").
  assertNoQueryError("profile role", profileRoleRes.error);
  assertNoQueryError("subscription", subscriptionRes.error);

  const rounds = roundsRes.data ?? [];
  const memberships = membershipsRes.data ?? [];
  const rawArguments = argumentsRes.data ?? [];
  const argumentIds = rawArguments.map((row) => row.id);

  const [sourcesRes, reactionsRes] = await Promise.all([
    argumentIds.length > 0
      ? supabase
          .from("debate_argument_sources")
          .select("id, argument_id, url, title, publisher, published_at, quoted_text")
          .in("argument_id", argumentIds)
      : Promise.resolve({ data: [], error: null }),
    argumentIds.length > 0
      ? supabase.from("debate_reactions").select("argument_id, user_id, reaction_type").in("argument_id", argumentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  assertNoQueryError("sources", sourcesRes.error);
  assertNoQueryError("reactions", reactionsRes.error);

  // --- Rounds -----------------------------------------------------------
  const roundViews: DebateV2RoundView[] = rounds.map((round) => ({
    id: round.id,
    sequenceNumber: round.sequence_number,
    phase: round.phase as DebateRoundPhase,
    status: round.status as DebateRoundStatus,
    startsAt: round.starts_at,
    endsAt: round.ends_at,
    durationMinutes: round.duration_minutes,
    startedAt: round.started_at,
    completedAt: round.completed_at,
  }));
  const roundSequenceById = new Map(roundViews.map((round) => [round.id, round.sequenceNumber]));
  const activeRound = roundViews.find((round) => round.status === "active") ?? null;

  // --- Memberships --------------------------------------------------------
  let debatersFor = 0;
  let debatersAgainst = 0;
  let jurors = 0;
  let currentUserDebaterStance: DebateStance | null = null;
  let currentUserIsJuror = false;
  let currentUserIsModeratorMember = false;

  for (const membership of memberships) {
    if (membership.role === "debater") {
      if (membership.stance === "for") debatersFor += 1;
      else if (membership.stance === "against") debatersAgainst += 1;
      if (user && membership.user_id === user.id) {
        currentUserDebaterStance = (membership.stance as DebateStance | null) ?? null;
      }
    } else if (membership.role === "juror") {
      jurors += 1;
      if (user && membership.user_id === user.id) currentUserIsJuror = true;
    } else if (membership.role === "moderator") {
      if (user && membership.user_id === user.id) currentUserIsModeratorMember = true;
    }
  }

  // Public debater identities (id/profile/stance) -- used by the
  // cross-examination target selector (Phase 4A). Deliberately built from
  // the same already-fetched memberships list, not a second query.
  const debaters: DebateV2DebaterSummary[] = memberships
    .filter((membership) => membership.role === "debater" && membership.stance !== null)
    .map((membership) => ({
      userId: membership.user_id,
      profile: toProfileSummary(firstOrNull(membership.profiles)),
      stance: membership.stance as DebateStance,
    }));

  // --- Sources and reactions, keyed by argument id ------------------------
  const sourcesByArgument = new Map<string, DebateV2SourceView[]>();
  for (const source of sourcesRes.data ?? []) {
    const list = sourcesByArgument.get(source.argument_id) ?? [];
    list.push({
      id: source.id,
      url: source.url,
      title: source.title,
      publisher: source.publisher,
      publishedAt: source.published_at,
      quotedText: source.quoted_text,
    });
    sourcesByArgument.set(source.argument_id, list);
  }

  const reactionCountsByArgument = new Map<string, Partial<Record<DebateReactionType, number>>>();
  const currentUserReactionsByArgument = new Map<string, DebateReactionType[]>();
  for (const reaction of reactionsRes.data ?? []) {
    const reactionType = reaction.reaction_type as DebateReactionType;
    const counts = reactionCountsByArgument.get(reaction.argument_id) ?? {};
    counts[reactionType] = (counts[reactionType] ?? 0) + 1;
    reactionCountsByArgument.set(reaction.argument_id, counts);

    if (user && reaction.user_id === user.id) {
      const own = currentUserReactionsByArgument.get(reaction.argument_id) ?? [];
      own.push(reactionType);
      currentUserReactionsByArgument.set(reaction.argument_id, own);
    }
  }
  // Reaction rows themselves (and every other user's reactor identity) go
  // out of scope here -- only the aggregated maps above are used below.

  // --- Arguments, including parent references -----------------------------
  const argumentById = new Map(rawArguments.map((row) => [row.id, row]));

  function buildParentRef(parentId: string | null): DebateV2ArgumentParentRef | null {
    if (!parentId) return null;
    const parent = argumentById.get(parentId);
    if (!parent) return null;
    const parentAuthor = toProfileSummary(firstOrNull(parent.profiles));
    return {
      id: parent.id,
      claim: parent.claim,
      authorName: parentAuthor?.full_name ?? parentAuthor?.username ?? "Unknown",
      stance: parent.stance as DebateStance,
    };
  }

  const argumentViews: DebateV2ArgumentView[] = rawArguments.map((row) => ({
    id: row.id,
    authorId: row.author_id,
    author: toProfileSummary(firstOrNull(row.profiles)),
    stance: row.stance as DebateStance,
    entryType: (row.entry_type as DebateArgumentEntryType | null) ?? null,
    claim: row.claim,
    content: row.content,
    roundId: row.round_id,
    roundSequence: row.round_id ? (roundSequenceById.get(row.round_id) ?? null) : null,
    parentArgumentId: row.parent_argument_id,
    relationType: (row.relation_type as DebateArgumentRelationType | null) ?? null,
    parent: buildParentRef(row.parent_argument_id),
    sources: sourcesByArgument.get(row.id) ?? [],
    reactionCounts: reactionCountsByArgument.get(row.id) ?? {},
    currentUserReactions: currentUserReactionsByArgument.get(row.id) ?? [],
    createdAt: row.created_at,
    editedAt: row.edited_at,
  }));

  // --- Phase 4A: cross-examination exchanges -------------------------------
  // Reuses buildParentRef (defined above for rebuttal targets) for
  // target_argument_id -- same "minimal reference into the already-fetched
  // arguments list" shape, no extra query. asker/target profiles come from
  // the single cross-exchanges query itself (aliased embeds), so this is
  // O(1) queries regardless of exchange count -- no N+1.
  const crossExchangeViews: DebateV2CrossExchangeView[] = (crossExchangesRes.data ?? []).map((row) => ({
    id: row.id,
    roundId: row.round_id,
    askerId: row.asker_id,
    asker: toProfileSummary(firstOrNull(row.asker)),
    targetId: row.target_id,
    target: toProfileSummary(firstOrNull(row.target)),
    targetArgumentId: row.target_argument_id,
    targetArgument: buildParentRef(row.target_argument_id),
    question: row.question,
    answer: row.answer,
    answeredAt: row.answered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  // --- Current user's own ballots -----------------------------------------
  let initialBallot: DebateV2OwnBallot | null = null;
  let finalBallot: DebateV2OwnBallot | null = null;
  for (const ballot of ballotsRes.data ?? []) {
    const view: DebateV2OwnBallot = {
      vote: ballot.vote as DebateBallotVote,
      confidence: ballot.confidence,
      reason: ballot.reason,
      influentialArgumentId: ballot.influential_argument_id,
      updatedAt: ballot.updated_at,
    };
    if (ballot.stage === "initial") initialBallot = view;
    else if (ballot.stage === "final") finalBallot = view;
  }

  // --- Phase 4B: current user's own subscription ---------------------------
  // null means "no row exists yet" -- either anonymous, or authenticated but
  // never subscribed -- distinct from an existing row with is_subscribed:
  // false (an explicit opt-out), which is returned as-is.
  const subscriptionRow = subscriptionRes.data;
  const subscription: DebateV2SubscriptionView | null = subscriptionRow
    ? {
        isSubscribed: subscriptionRow.is_subscribed,
        notifyPhaseChanges: subscriptionRow.notify_phase_changes,
        notifyDirectResponses: subscriptionRow.notify_direct_responses,
        notifyEvidenceRequests: subscriptionRow.notify_evidence_requests,
        notifyFinalVote: subscriptionRow.notify_final_vote,
        notifyRecap: subscriptionRow.notify_recap,
      }
    : null;

  // --- Manager capability, consistent with can_manage_debate_v2 ----------
  const canManage = canManageDebateV2({
    actorId: user?.id ?? null,
    isDebateModeratorId: Boolean(user && debateRow.moderator_id === user.id),
    hasModeratorMembership: currentUserIsModeratorMember,
    isEditorOrAdmin: profileRoleRes.data?.role === "editor" || profileRoleRes.data?.role === "admin",
  });

  // --- Debate summary -------------------------------------------------------
  const debate: DebateV2DebateSummary = {
    id: debateRow.id,
    title: debateRow.title,
    description: debateRow.description,
    status: debateRow.status as DebateV2Status,
    closureKind: (debateRow.closure_kind as DebateV2ClosureKind) ?? null,
    moderator: toProfileSummary(firstOrNull(debateRow.profiles)),
    moderatorId: debateRow.moderator_id,
    roundDurationMinutes: debateRow.round_duration_minutes,
    tags: debateRow.tags ?? [],
    createdAt: debateRow.created_at,
    endsAt: debateRow.ends_at,
  };

  // Aggregate ballot results are treated as a normal "unavailable" state
  // only for the RPC's own deliberate P0001 rejection (not yet visible to
  // this caller per get_debate_ballot_results_v2's own visibility rules) --
  // see resolveBallotResults' comment. A genuine query failure is thrown,
  // same as every other query above.
  const ballotResults = {
    initial: resolveBallotResults(initialResultsRes.data, initialResultsRes.error, "initial"),
    final: resolveBallotResults(finalResultsRes.data, finalResultsRes.error, "final"),
  };

  return {
    debate,
    rounds: roundViews,
    activeRound,
    membershipCounts: { debatersFor, debatersAgainst, jurors },
    debaters,
    currentUser: {
      id: user?.id ?? null,
      isAuthenticated: Boolean(user),
      canManage,
      membership: {
        debaterStance: currentUserDebaterStance,
        isJuror: currentUserIsJuror,
        isModeratorMember: currentUserIsModeratorMember,
      },
      ballots: { initial: initialBallot, final: finalBallot },
      subscription,
    },
    arguments: argumentViews,
    crossExchanges: crossExchangeViews,
    ballotResults,
  };
}
