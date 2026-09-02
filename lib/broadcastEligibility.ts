import type { BroadcastAudienceKey } from "@/lib/broadcasts";

/**
 * Who may receive a broadcast, and which audiences they fall into.
 *
 * Kept pure and free of Supabase and Resend so the rule that decides whether a
 * person is written to can be read in one place and tested without a network.
 * Both the nightly sync and the send path call these, so there is exactly one
 * definition of eligible rather than one per caller.
 */

/**
 * Broadcasts are their own opt-out category. Muting the weekly digest must not
 * silently mute founder correspondence, and leaving broadcasts must not cost
 * someone their comment or review email.
 */
export const BROADCAST_PREFERENCE_KEY = "email_announcements";

export const ACTIVE_WINDOW_DAYS = 30;
export const NEW_USER_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type BroadcastCandidate = {
  profileId: string;
  email: string | null;
  suspendedAt: string | null;
  notificationPrefs: unknown;
  /** Resend owns the unsubscribe link, so this is the authoritative opt-out. */
  unsubscribed: boolean;
  lastActivityAt: string | null;
  publishedCount: number;
  isVerified: boolean;
  profileCreatedAt: string | null;
};

export type BroadcastIneligibleReason =
  | "no_email"
  | "suspended"
  | "preference_disabled"
  | "unsubscribed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function hasUsableEmail(email: string | null | undefined) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * An absent key means the member has never touched the setting, and the column
 * default says the category is on. Only an explicit false is an opt-out, which
 * matches how every other email preference in the product is read.
 */
export function wantsBroadcastEmail(notificationPrefs: unknown) {
  if (!isRecord(notificationPrefs)) return true;
  return notificationPrefs[BROADCAST_PREFERENCE_KEY] !== false;
}

export function broadcastIneligibleReason(
  candidate: BroadcastCandidate
): BroadcastIneligibleReason | null {
  if (!hasUsableEmail(candidate.email)) return "no_email";
  if (candidate.suspendedAt) return "suspended";
  if (candidate.unsubscribed) return "unsubscribed";
  if (!wantsBroadcastEmail(candidate.notificationPrefs)) {
    return "preference_disabled";
  }
  return null;
}

export function isEligibleForBroadcast(candidate: BroadcastCandidate) {
  return broadcastIneligibleReason(candidate) === null;
}

function isWithinDays(value: string | null, days: number, now: Date) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  return now.getTime() - timestamp <= days * DAY_MS;
}

/**
 * The audiences this person belongs to, ignoring "selected", which is a list
 * chosen by hand rather than a property of the member.
 */
export function audienceMembership(
  candidate: BroadcastCandidate,
  now: Date = new Date()
): BroadcastAudienceKey[] {
  if (!isEligibleForBroadcast(candidate)) return [];

  const memberships: BroadcastAudienceKey[] = ["all"];

  if (isWithinDays(candidate.lastActivityAt, ACTIVE_WINDOW_DAYS, now)) {
    memberships.push("active");
  }
  if (candidate.publishedCount > 0) {
    memberships.push("authors");
  }
  if (candidate.isVerified) {
    memberships.push("verified");
  }
  if (isWithinDays(candidate.profileCreatedAt, NEW_USER_WINDOW_DAYS, now)) {
    memberships.push("new");
  }

  return memberships;
}

export function matchesAudience(
  candidate: BroadcastCandidate,
  audienceKey: BroadcastAudienceKey,
  selectedProfileIds: readonly string[] = [],
  now: Date = new Date()
) {
  // Eligibility is checked first for every audience including "selected", so
  // naming somebody explicitly can never send past their opt-out.
  if (!isEligibleForBroadcast(candidate)) return false;

  if (audienceKey === "selected") {
    return selectedProfileIds.includes(candidate.profileId);
  }

  return audienceMembership(candidate, now).includes(audienceKey);
}
