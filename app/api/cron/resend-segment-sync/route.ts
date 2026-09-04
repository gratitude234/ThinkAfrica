import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCronAuthorizationError } from "@/lib/cronAuth";
import {
  ACTIVE_WINDOW_DAYS,
  audienceMembership,
  isEligibleForBroadcast,
  type BroadcastCandidate,
} from "@/lib/broadcastEligibility";
import {
  countSegmentMembership,
  planContactSync,
  type ContactSnapshot,
  type StoredContact,
} from "@/lib/broadcastSyncPlan";
import {
  ensureSegment,
  listSegmentContactsPage,
  syncContactSegments,
} from "@/lib/resendBroadcasts";
import { isResendRateLimited } from "@/lib/resendClient";
import { loadBroadcastContactEmails } from "@/lib/broadcastAuthEmails";
import { reconcileStuckBroadcasts } from "@/lib/broadcastStore";
import {
  STANDING_AUDIENCE_KEYS,
  type BroadcastAudienceKey,
} from "@/lib/broadcasts";

export const maxDuration = 300;

/**
 * The recipient sync.
 *
 * Resend has no bulk contact write, so every change to a contact is its own
 * HTTP call. On a first run that is one call per member and cannot possibly
 * finish inside a single function invocation, which shapes the whole design:
 *
 *   - Work is ordered oldest-first and stops at a time budget. Whatever is
 *     left is simply the front of the next run's queue.
 *   - last_synced_at is stamped only when a pass genuinely finished. A
 *     half-populated segment must never look fresh, because freshness is what
 *     the send path trusts when it decides an audience is safe to address.
 *   - A rate limit stops the run rather than failing contacts one at a time.
 *     Recording twelve thousand sync_errors because the account hit its
 *     per-second ceiling would bury the failures that actually mean something.
 *   - Unsubscribes are mirrored back from Resend before anything is planned,
 *     so a person who has just left cannot be pushed back into a segment by
 *     the same run that learned they left.
 */

/** Leaves room to write results back before the platform stops the function. */
const TIME_BUDGET_MS = 225_000;

/** Roughly Resend's documented general limit, with headroom. */
const MIN_MS_BETWEEN_RESEND_WRITES = 120;

const SUPABASE_PAGE_SIZE = 1000;

type AdminClient = ReturnType<typeof createAdminClient>;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * PostgREST caps a response at a page, so anything that reads a whole table
 * has to walk it. The builder is thenable rather than a Promise, which is why
 * the callback is awaited here rather than typed as returning one.
 */
async function pageAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await fetchPage(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

async function loadCandidates(admin: AdminClient): Promise<ContactSnapshot[]> {
  const activityCutoff = daysAgoIso(ACTIVE_WINDOW_DAYS);

  const [authEmails, profiles, publishedRows, recentPosts, recentComments] =
    await Promise.all([
      loadBroadcastContactEmails(admin),
      pageAll<{
        id: string;
        signup_email: string | null;
        suspended_at: string | null;
        notification_prefs: unknown;
        verified: boolean | null;
        created_at: string;
      }>((from, to) =>
        admin
          .from("profiles")
          .select(
            "id, signup_email, suspended_at, notification_prefs, verified, created_at"
          )
          .range(from, to)
      ),
      pageAll<{ author_id: string }>((from, to) =>
        admin
          .from("posts")
          .select("author_id")
          .eq("status", "published")
          .range(from, to)
      ),
      pageAll<{ author_id: string; created_at: string }>((from, to) =>
        admin
          .from("posts")
          .select("author_id, created_at")
          .gte("created_at", activityCutoff)
          .range(from, to)
      ),
      pageAll<{ author_id: string; created_at: string }>((from, to) =>
        admin
          .from("comments")
          .select("author_id, created_at")
          .gte("created_at", activityCutoff)
          .range(from, to)
      ),
    ]);

  const publishedCounts = new Map<string, number>();
  for (const row of publishedRows) {
    publishedCounts.set(row.author_id, (publishedCounts.get(row.author_id) ?? 0) + 1);
  }

  const lastActivity = new Map<string, string>();
  for (const row of [...recentPosts, ...recentComments]) {
    const current = lastActivity.get(row.author_id);
    if (!current || current < row.created_at) {
      lastActivity.set(row.author_id, row.created_at);
    }
  }

  // Read after the mirror pass, so an opt-out Resend told us about minutes ago
  // is already reflected here and cannot be planned back into a segment.
  const knownUnsubscribed = await pageAll<{ profile_id: string }>((from, to) =>
    admin
      .from("broadcast_contacts")
      .select("profile_id")
      .eq("unsubscribed", true)
      .range(from, to)
  );
  const unsubscribed = new Set(
    knownUnsubscribed.map((row) => row.profile_id)
  );

  return profiles.map((profile) => {
    const candidate: BroadcastCandidate = {
      profileId: profile.id,
      email: authEmails.get(profile.id) ?? profile.signup_email,
      suspendedAt: profile.suspended_at,
      notificationPrefs: profile.notification_prefs,
      unsubscribed: unsubscribed.has(profile.id),
      lastActivityAt: lastActivity.get(profile.id) ?? null,
      publishedCount: publishedCounts.get(profile.id) ?? 0,
      isVerified: profile.verified === true,
      profileCreatedAt: profile.created_at,
    };

    const eligible = isEligibleForBroadcast(candidate);

    return {
      profileId: candidate.profileId,
      email: (candidate.email ?? "").trim().toLowerCase(),
      isEligible: eligible,
      segmentKeys: audienceMembership(candidate),
      lastActivityAt: candidate.lastActivityAt,
      publishedCount: candidate.publishedCount,
      isVerified: candidate.isVerified,
      profileCreatedAt: candidate.profileCreatedAt,
      unsubscribed: candidate.unsubscribed,
    } satisfies ContactSnapshot;
  });
}

async function loadStoredContacts(admin: AdminClient) {
  const rows = await pageAll<{
    profile_id: string;
    email: string;
    is_eligible: boolean;
    segment_keys: string[] | null;
    last_activity_at: string | null;
    published_count: number;
    is_verified: boolean;
    profile_created_at: string | null;
    unsubscribed: boolean;
    resubscribed_at: string | null;
    synced_at: string | null;
  }>((from, to) =>
    admin
      .from("broadcast_contacts")
      .select(
        "profile_id, email, is_eligible, segment_keys, last_activity_at, published_count, is_verified, profile_created_at, unsubscribed, resubscribed_at, synced_at"
      )
      .range(from, to)
  );

  const stored = new Map<string, StoredContact>();
  for (const row of rows) {
    stored.set(row.profile_id, {
      profileId: row.profile_id,
      email: row.email,
      isEligible: row.is_eligible,
      segmentKeys: (row.segment_keys ?? []) as BroadcastAudienceKey[],
      lastActivityAt: row.last_activity_at,
      publishedCount: row.published_count,
      isVerified: row.is_verified,
      profileCreatedAt: row.profile_created_at,
      unsubscribed: row.unsubscribed,
      syncedAt: row.synced_at,
      resubscribedAt: row.resubscribed_at,
    });
  }

  return stored;
}

type MirrorResult = {
  mirrored: number;
  scanned: number;
  complete: boolean;
  cursor: string | null;
};

/**
 * Resend owns the unsubscribe link in every broadcast, so it learns about an
 * opt-out first. The contact.updated webhook usually brings that back within
 * seconds; this pass is the safety net for anything the webhook missed, and it
 * runs before the plan so a fresh opt-out cannot be undone by the same run.
 *
 * A full pass is one Resend call per hundred contacts, which on a large
 * account does not fit inside one invocation. The cursor is persisted so the
 * next run resumes rather than re-reading the first pages forever.
 */
async function mirrorUnsubscribes(
  admin: AdminClient,
  segmentId: string,
  deadline: number
): Promise<MirrorResult> {
  const { data: state } = await admin
    .from("broadcast_sync_state")
    .select("mirror_cursor")
    .eq("id", true)
    .maybeSingle();

  let cursor: string | undefined = (state?.mirror_cursor as string | null) ?? undefined;
  let mirrored = 0;
  let scanned = 0;
  let complete = false;

  for (;;) {
    if (Date.now() > deadline) break;

    const page = await listSegmentContactsPage(segmentId, cursor);
    scanned += page.contacts.length;

    for (const contact of page.contacts) {
      if (!contact.unsubscribed) continue;

      const { data: applied } = await admin.rpc("mirror_broadcast_unsubscribe", {
        p_email: contact.email.trim().toLowerCase(),
        p_resend_contact_id: contact.id,
      });

      if (applied) mirrored += 1;
    }

    cursor = page.nextCursor ?? undefined;
    if (!page.nextCursor) {
      complete = true;
      break;
    }
  }

  await admin
    .from("broadcast_sync_state")
    .update({
      // A finished pass starts again from the beginning next time.
      mirror_cursor: complete ? null : (cursor ?? null),
      // Stamped only on a finished pass, so this reads as "when the segment was
      // last fully examined" rather than "when we last looked at some of it".
      ...(complete ? { mirror_started_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  return { mirrored, scanned, complete, cursor: cursor ?? null };
}

export async function GET(request: NextRequest) {
  const authorizationError = getCronAuthorizationError(request);
  if (authorizationError) return authorizationError;

  const admin = createAdminClient();
  const deadline = Date.now() + TIME_BUDGET_MS;

  const { data: run } = await admin
    .from("broadcast_sync_runs")
    .insert({})
    .select("id")
    .single();
  const runId = run?.id as string | undefined;

  async function finish(patch: Record<string, unknown>) {
    if (!runId) return;
    await admin
      .from("broadcast_sync_runs")
      .update({ finished_at: new Date().toISOString(), ...patch })
      .eq("id", runId);
  }

  try {
    // 1. Settle any send that never reached a terminal state. Cheap, and it
    //    runs first so a stranded broadcast is not left waiting on a long sync.
    const reconciled = await reconcileStuckBroadcasts();

    // 2. Provision the standing segments. ensureSegment trusts the id we
    //    already hold and only searches by name when that id is gone, so a
    //    segment renamed in the Resend dashboard is still recognised rather
    //    than duplicated.
    const existingSegments = await admin
      .from("broadcast_segments")
      .select("audience_key, resend_segment_id");

    if (existingSegments.error) throw new Error(existingSegments.error.message);

    const knownIds = new Map(
      (existingSegments.data ?? []).map((row) => [
        row.audience_key as BroadcastAudienceKey,
        row.resend_segment_id as string | null,
      ])
    );

    const segmentIds = new Map<BroadcastAudienceKey, string>();
    let provisioned = 0;

    for (const audienceKey of STANDING_AUDIENCE_KEYS) {
      const segment = await ensureSegment(
        audienceKey,
        knownIds.get(audienceKey) ?? null
      );
      segmentIds.set(audienceKey, segment.id);
      if (segment.created) provisioned += 1;

      await admin
        .from("broadcast_segments")
        .update({
          resend_segment_id: segment.id,
          updated_at: new Date().toISOString(),
        })
        .eq("audience_key", audienceKey);
    }

    const managedSegmentIds = Array.from(segmentIds.values());

    // 3. Pull unsubscribes back before planning anything, so this run cannot
    //    re-add somebody it is about to learn has left.
    const allSegmentId = segmentIds.get("all");
    const mirror = allSegmentId
      ? await mirrorUnsubscribes(admin, allSegmentId, deadline)
      : { mirrored: 0, scanned: 0, complete: true, cursor: null };

    // 4. Work out the current truth and diff it against what we last stored.
    const candidates = await loadCandidates(admin);
    const stored = await loadStoredContacts(admin);
    const plan = planContactSync(candidates, stored);

    // 5. The cheap half: write changed derived state back to Supabase.
    //    synced_at is deliberately absent from the payload, so a new row keeps
    //    its null and stays at the front of the push queue until it is pushed.
    for (let index = 0; index < plan.upserts.length; index += 500) {
      const batch = plan.upserts.slice(index, index + 500);
      const { error } = await admin.from("broadcast_contacts").upsert(
        batch.map((snapshot) => ({
          profile_id: snapshot.profileId,
          email: snapshot.email,
          is_eligible: snapshot.isEligible,
          segment_keys: snapshot.segmentKeys,
          last_activity_at: snapshot.lastActivityAt,
          published_count: snapshot.publishedCount,
          is_verified: snapshot.isVerified,
          profile_created_at: snapshot.profileCreatedAt,
          unsubscribed: snapshot.unsubscribed,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "profile_id" }
      );
      if (error) throw new Error(error.message);
    }

    // 6. The expensive half: one Resend call per changed contact, oldest
    //    first, stopping at the budget. Anything left waits for the next run.
    let written = 0;
    let attempted = 0;
    let pushBudgetExhausted = false;
    let rateLimited = false;
    let lastWriteAt = 0;

    for (const snapshot of plan.resendPushes) {
      if (Date.now() > deadline) {
        pushBudgetExhausted = true;
        break;
      }
      if (!snapshot.email) continue;

      const sinceLastWrite = Date.now() - lastWriteAt;
      if (sinceLastWrite < MIN_MS_BETWEEN_RESEND_WRITES) {
        await sleep(MIN_MS_BETWEEN_RESEND_WRITES - sinceLastWrite);
      }
      lastWriteAt = Date.now();
      attempted += 1;

      try {
        const contact = await syncContactSegments({
          email: snapshot.email,
          segmentIds: snapshot.segmentKeys
            .map((key) => segmentIds.get(key))
            .filter((id): id is string => Boolean(id)),
          managedSegmentIds,
          // Only somebody who turned the category back on themselves gets
          // Resend's unsubscribed flag lifted. Nothing else may do it.
          resubscribe: snapshot.resubscribe,
        });

        await admin
          .from("broadcast_contacts")
          .update({
            resend_contact_id: contact.id,
            synced_at: new Date().toISOString(),
            sync_error: null,
          })
          .eq("profile_id", snapshot.profileId);

        written += 1;
      } catch (error) {
        if (isResendRateLimited(error)) {
          // Not this contact's fault. Stop, leave synced_at alone so they stay
          // at the front of the queue, and let the next run continue.
          rateLimited = true;
          pushBudgetExhausted = true;
          break;
        }

        await admin
          .from("broadcast_contacts")
          .update({
            sync_error:
              error instanceof Error ? error.message.slice(0, 300) : "Unknown",
          })
          .eq("profile_id", snapshot.profileId);
      }
    }

    // 7. Stamp freshness only on a complete pass. A half-finished run must not
    //    make a stale segment look sendable, and the mirror counts as part of
    //    the pass: an unfinished mirror means opt-outs we have not seen yet.
    const complete = !pushBudgetExhausted && mirror.complete;
    const counts = countSegmentMembership(candidates);
    const completedAt = new Date().toISOString();
    const incompleteNote = rateLimited
      ? "Stopped at the provider's rate limit before every contact was pushed. Sync again."
      : !mirror.complete
        ? "Ran out of time before every unsubscribe was mirrored. Sync again."
        : "Ran out of time before every contact was pushed. Sync again.";

    for (const audienceKey of STANDING_AUDIENCE_KEYS) {
      await admin
        .from("broadcast_segments")
        .update({
          contact_count: counts[audienceKey] ?? 0,
          // Omitted rather than nulled on an incomplete run: the previous
          // freshness stays as it was, so a partial run neither promotes nor
          // demotes an audience that was already trustworthy.
          ...(complete ? { last_synced_at: completedAt } : {}),
          last_sync_error: complete ? null : incompleteNote,
          updated_at: completedAt,
        })
        .eq("audience_key", audienceKey);
    }

    await finish({
      contacts_examined: candidates.length,
      contacts_written: written,
      contacts_pending: plan.resendPushes.length - written,
      unsubscribes_mirrored: mirror.mirrored,
      segments_provisioned: provisioned,
      complete,
      error: complete ? null : incompleteNote,
    });

    return NextResponse.json({
      ok: true,
      complete,
      examined: candidates.length,
      attempted,
      written,
      pending: plan.resendPushes.length - written,
      rateLimited,
      mirror: {
        scanned: mirror.scanned,
        mirrored: mirror.mirrored,
        complete: mirror.complete,
      },
      provisioned,
      reconciled: reconciled.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed.";
    await finish({ error: message.slice(0, 500), complete: false });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
