import type { BroadcastAudienceKey } from "@/lib/broadcasts";

/**
 * What the nightly sync should do, worked out before anything is called.
 *
 * The expensive half of syncing is Resend: there is no bulk contact write, so
 * every change is its own HTTP call. Deciding here which contacts actually
 * changed is what keeps a nightly run at a few hundred calls instead of twelve
 * thousand, and it is the part worth testing, so it is pure.
 */

export type ContactSnapshot = {
  profileId: string;
  email: string;
  isEligible: boolean;
  /** Standing audiences this contact belongs to. Empty when not eligible. */
  segmentKeys: BroadcastAudienceKey[];
  lastActivityAt: string | null;
  publishedCount: number;
  isVerified: boolean;
  profileCreatedAt: string | null;
  unsubscribed: boolean;
  /**
   * Set on a contact who turned email_announcements back on inside Indegenius
   * after an opt-out. Carried through the plan so the push can lift Resend's
   * own unsubscribed flag, which nothing else is allowed to touch.
   */
  resubscribe?: boolean;
};

export type StoredContact = ContactSnapshot & {
  syncedAt: string | null;
  resubscribedAt: string | null;
};

export type ContactSyncPlan = {
  /** Rows whose derived state changed and need writing back to Supabase. */
  upserts: ContactSnapshot[];
  /** Contacts whose membership at Resend no longer matches, most stale first. */
  resendPushes: ContactSnapshot[];
};

function sameSegments(a: readonly string[], b: readonly string[]) {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

function derivedStateChanged(next: ContactSnapshot, stored: StoredContact) {
  return (
    next.email !== stored.email ||
    next.isEligible !== stored.isEligible ||
    next.publishedCount !== stored.publishedCount ||
    next.isVerified !== stored.isVerified ||
    next.lastActivityAt !== stored.lastActivityAt ||
    next.profileCreatedAt !== stored.profileCreatedAt ||
    !sameSegments(next.segmentKeys, stored.segmentKeys)
  );
}

/**
 * A push is needed when Resend's copy of this contact would be wrong: it has
 * never been pushed, the address moved, or the audiences they belong to
 * changed. Someone who has become ineligible is pushed with no segments, which
 * is how they leave every audience.
 */
function pushNeeded(next: ContactSnapshot, stored: StoredContact | undefined) {
  if (!stored) return true;
  if (!stored.syncedAt) return true;
  if (next.email !== stored.email) return true;
  return !sameSegments(next.segmentKeys, stored.segmentKeys);
}

/**
 * The trigger on profiles clears broadcast_contacts.synced_at and stamps
 * resubscribed_at when somebody turns the category back on, so a pending
 * re-opt-in is exactly "resubscribed but not yet pushed". Only that state
 * earns the right to lift Resend's own unsubscribed flag.
 */
function pendingResubscribe(stored: StoredContact | undefined) {
  if (!stored?.resubscribedAt) return false;
  if (!stored.syncedAt) return true;
  return stored.syncedAt < stored.resubscribedAt;
}

export function planContactSync(
  candidates: readonly ContactSnapshot[],
  stored: ReadonlyMap<string, StoredContact>
): ContactSyncPlan {
  const upserts: ContactSnapshot[] = [];
  const resendPushes: { snapshot: ContactSnapshot; syncedAt: string | null }[] =
    [];

  for (const candidate of candidates) {
    const previous = stored.get(candidate.profileId);
    const resubscribe = pendingResubscribe(previous);
    const snapshot = resubscribe ? { ...candidate, resubscribe } : candidate;

    if (!previous || derivedStateChanged(candidate, previous)) {
      upserts.push(snapshot);
    }

    if (resubscribe || pushNeeded(candidate, previous)) {
      resendPushes.push({
        snapshot,
        syncedAt: previous?.syncedAt ?? null,
      });
    }
  }

  // Oldest first, so a run that exhausts its time budget leaves the freshest
  // contacts waiting rather than starving the ones that have waited longest.
  resendPushes.sort((a, b) => {
    if (a.syncedAt === b.syncedAt) return 0;
    if (a.syncedAt === null) return -1;
    if (b.syncedAt === null) return 1;
    return a.syncedAt < b.syncedAt ? -1 : 1;
  });

  return {
    upserts,
    resendPushes: resendPushes.map((entry) => entry.snapshot),
  };
}

/** Contacts per standing audience, for the counts stored against each segment. */
export function countSegmentMembership(
  candidates: readonly ContactSnapshot[]
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const candidate of candidates) {
    for (const key of candidate.segmentKeys) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }

  return counts;
}
