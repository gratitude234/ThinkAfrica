/**
 * Debate V2 Phase 3: pure UI-layer logic shared by the V2 room components
 * and server actions. Nothing here calls Supabase -- it is exercised
 * directly by lib/debateV2Ui.test.ts, following the same pure-function
 * convention as lib/debateV2.ts and lib/debateV2Lifecycle.ts.
 *
 * This module intentionally does NOT re-derive rules Phase 2 already
 * expresses as pure functions (word limits, submission limits, ballot
 * windows, rebuttal validation, join eligibility, etc.) -- components import
 * those directly from lib/debateV2Lifecycle.ts. This file only adds the
 * handful of genuinely new concerns Phase 3 introduces: format_version
 * routing, interpreting an RPC's JSON result into a UI-friendly outcome,
 * safe link rendering, and RPC error sanitization.
 */

import type { DebateFormatVersion } from "@/lib/debateV2";

// ---------------------------------------------------------------------------
// V1/V2 routing
// ---------------------------------------------------------------------------

export type DebateExperienceVersion = "v1" | "v2";

/**
 * The single point of truth for app/(main)/debates/[id]/page.tsx's routing
 * decision. format_version is nullable at the type level only because a
 * hand-written query result could technically omit it -- the column itself
 * is NOT NULL with a default of 1 (Phase 1), so null/undefined here means
 * "treat as V1" rather than "unknown".
 */
export function resolveDebateExperienceVersion(
  formatVersion: DebateFormatVersion | null | undefined
): DebateExperienceVersion {
  return formatVersion === 2 ? "v2" : "v1";
}

// ---------------------------------------------------------------------------
// RPC error sanitization
// ---------------------------------------------------------------------------

const GENERIC_RPC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/**
 * Postgres's default SQLSTATE for a plain `RAISE EXCEPTION 'message'` (no
 * explicit error code) is P0001 ("raise_exception"). Every V2 RPC in
 * supabase/migrations/20260718000003_debate_v2_lifecycle_permissions.sql
 * raises this way with a deliberately human-readable message (see that
 * migration's section 16 note: "Use stable, documented error messages
 * suitable for mapping in Phase 3"). Checking the SQLSTATE code, not the
 * message text, is what makes this reliable: an unexpected error (a real
 * constraint violation, a connection failure, anything not from one of our
 * own RAISE EXCEPTION calls) carries a different code -- or none, for a
 * network error -- and falls back to a generic message instead of leaking
 * internal detail.
 */
const RAISED_EXCEPTION_SQLSTATE = "P0001";

export interface RpcErrorLike {
  message?: string | null;
  code?: string | null;
}

export function sanitizeRpcErrorMessage(error: RpcErrorLike | null | undefined): string {
  if (!error) return GENERIC_RPC_ERROR_MESSAGE;
  if (error.code === RAISED_EXCEPTION_SQLSTATE && error.message) {
    return error.message;
  }
  return GENERIC_RPC_ERROR_MESSAGE;
}

// ---------------------------------------------------------------------------
// Round-transition RPC result interpretation
// ---------------------------------------------------------------------------

export type RoundTransitionOutcome =
  | "advanced"
  | "completed"
  | "started"
  | "already_started"
  | "closed"
  | "already_closed"
  | "extended"
  | "stale"
  | "not_due"
  | "unknown";

/**
 * advance_debate_round_v2 / start_debate_v2 / extend_debate_round_v2 /
 * close_debate_v2 all return a JSON object (never raise for a concurrency
 * no-op) whose shape varies slightly by function -- see
 * lib/debateV2Lifecycle.ts's decideRoundAdvance/decideStartRoundOne for the
 * server-side decision this mirrors. This maps that raw shape into one
 * small set of outcomes the UI can switch on without every call site
 * re-deriving the same "which field means what" logic.
 */
export function interpretRoundTransitionResult(
  result: Record<string, unknown> | null | undefined
): RoundTransitionOutcome {
  if (!result) return "unknown";

  if (typeof result.result === "string") {
    switch (result.result) {
      case "round_advanced":
        return "advanced";
      case "debate_completed":
        return "completed";
      case "stale_no_op":
        return "stale";
      case "not_due":
        return "not_due";
      case "extended":
        return "extended";
      default:
        return "unknown";
    }
  }

  if (typeof result.already_started === "boolean") {
    return result.already_started ? "already_started" : "started";
  }

  if (typeof result.already_closed === "boolean") {
    return result.already_closed ? "already_closed" : "closed";
  }

  return "unknown";
}

/** True for outcomes that represent a concurrency no-op, not a failure. */
export function isStaleTransitionOutcome(outcome: RoundTransitionOutcome): boolean {
  return outcome === "stale" || outcome === "not_due";
}

// ---------------------------------------------------------------------------
// Safe link rendering
// ---------------------------------------------------------------------------

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Argument sources carry a client-authored url (validated non-empty and
 * length-bounded server-side by submit_debate_argument_v2, but not
 * protocol-restricted there -- see that function's source validation loop).
 * This is the render-time guard: only http/https may become a clickable
 * `href`. A malformed URL (anything `new URL()` rejects) is also unsafe to
 * link.
 */
export function isSafeSourceLinkUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return SAFE_LINK_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Lightweight polling: room-signal change detection
// ---------------------------------------------------------------------------

/**
 * Structural, not imported from app/.../v2/types.ts's DebateV2RoomSignal --
 * this module stays independent of route-specific types (it only imports
 * from lib/debateV2 elsewhere), and any object shaped like this satisfies
 * it regardless.
 */
export interface RoomSignalLike {
  debateStatus: string;
  closureKind: string | null;
  rounds: { id: string; status: string; endsAt: string | null }[];
  argumentCount: number;
  reactionCount: number;
  reactionLatestCreatedAt: string | null;
  crossExchangeCount: number;
  crossExchangeLatestUpdatedAt: string | null;
  membershipCount: number;
  canManage: boolean;
  initialBallotCount: number | null;
  initialBallotLatestUpdatedAt: string | null;
  finalBallotCount: number | null;
  finalBallotLatestUpdatedAt: string | null;
}

/**
 * True if anything a viewer could see has plausibly changed between two
 * loadDebateV2RoomSignal snapshots -- the cue DebateV2Room's polling loop
 * uses to decide whether a full (expensive) loadDebateV2Room reload is
 * worth paying for on this tick.
 */
export function roomSignalsDiffer(a: RoomSignalLike, b: RoomSignalLike): boolean {
  if (
    a.debateStatus !== b.debateStatus ||
    a.closureKind !== b.closureKind ||
    a.argumentCount !== b.argumentCount ||
    a.reactionCount !== b.reactionCount ||
    a.reactionLatestCreatedAt !== b.reactionLatestCreatedAt ||
    a.crossExchangeCount !== b.crossExchangeCount ||
    a.crossExchangeLatestUpdatedAt !== b.crossExchangeLatestUpdatedAt ||
    a.membershipCount !== b.membershipCount ||
    a.canManage !== b.canManage ||
    a.initialBallotCount !== b.initialBallotCount ||
    a.initialBallotLatestUpdatedAt !== b.initialBallotLatestUpdatedAt ||
    a.finalBallotCount !== b.finalBallotCount ||
    a.finalBallotLatestUpdatedAt !== b.finalBallotLatestUpdatedAt ||
    a.rounds.length !== b.rounds.length
  ) {
    return true;
  }

  return a.rounds.some((round, i) => {
    const other = b.rounds[i];
    return round.id !== other.id || round.status !== other.status || round.endsAt !== other.endsAt;
  });
}
