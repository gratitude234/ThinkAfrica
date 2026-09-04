import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailSender } from "@/lib/emailSenders";
import {
  buildBroadcastEmailHtml,
  unsubscribeFooterText,
} from "@/lib/broadcastEmail";
import { broadcastPlainText } from "@/lib/broadcastText";
import {
  ACTIVE_WINDOW_DAYS,
  NEW_USER_WINDOW_DAYS,
} from "@/lib/broadcastEligibility";
import {
  MAX_SELECTED_RECIPIENTS,
  isSegmentStale,
  type BroadcastSendRow,
  type ProviderBroadcastStatus,
  type SegmentResolution,
  type SendBroadcastDeps,
  type SendPrecondition,
} from "@/lib/broadcastSend";
import { isResendDefinitiveRejection } from "@/lib/resendClient";
import {
  createResendBroadcast,
  ensureNamedSegment,
  getResendBroadcast,
  selectedSegmentName,
  sendResendBroadcast,
  syncContactSegments,
} from "@/lib/resendBroadcasts";
import {
  STANDING_AUDIENCE_KEYS,
  type BroadcastAudienceKey,
  type BroadcastRecord,
  type BroadcastStatus,
} from "@/lib/broadcasts";
import type { EmailSenderKey } from "@/lib/emailSenders";

type AdminClient = ReturnType<typeof createAdminClient>;

type BroadcastRowDb = {
  id: string;
  subject: string;
  preview_text: string;
  body_html: string;
  sender_key: string;
  audience_key: string;
  selected_profile_ids: string[] | null;
  selected_segment_id: string | null;
  status: string;
  resend_broadcast_id: string | null;
  dispatch_started_at: string | null;
  recipient_count: number;
  delivered_count: number;
  failed_count: number;
  status_note: string | null;
  created_by: string | null;
  sent_by: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

const BROADCAST_COLUMNS =
  "id, subject, preview_text, body_html, sender_key, audience_key, selected_profile_ids, selected_segment_id, status, resend_broadcast_id, dispatch_started_at, recipient_count, delivered_count, failed_count, status_note, created_by, sent_by, sent_at, created_at, updated_at";

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function toSendRow(row: BroadcastRowDb): BroadcastSendRow {
  return {
    id: row.id,
    subject: row.subject,
    previewText: row.preview_text,
    bodyHtml: row.body_html,
    senderKey: row.sender_key as EmailSenderKey,
    audienceKey: row.audience_key as BroadcastAudienceKey,
    selectedProfileIds: row.selected_profile_ids ?? [],
    status: row.status as BroadcastStatus,
    resendBroadcastId: row.resend_broadcast_id,
    selectedSegmentId: row.selected_segment_id,
    dispatchStartedAt: row.dispatch_started_at,
    recipientCount: row.recipient_count,
  };
}

export function toBroadcastRecord(
  row: BroadcastRowDb,
  senderNameById: Map<string, string>
): BroadcastRecord {
  return {
    id: row.id,
    subject: row.subject,
    previewText: row.preview_text,
    bodyHtml: row.body_html,
    senderKey: row.sender_key as EmailSenderKey,
    audienceKey: row.audience_key as BroadcastAudienceKey,
    selectedProfileIds: row.selected_profile_ids ?? [],
    recipientCount: row.recipient_count,
    status: row.status as BroadcastStatus,
    sentAt: row.sent_at,
    updatedAt: row.updated_at,
    delivered: row.delivered_count,
    failed: row.failed_count,
    sentBy:
      senderNameById.get(row.sent_by ?? "") ??
      senderNameById.get(row.created_by ?? "") ??
      "Indegenius",
    statusNote: row.status_note ?? undefined,
  };
}

async function attachActorNames(admin: AdminClient, rows: BroadcastRowDb[]) {
  const ids = Array.from(
    new Set(
      rows.flatMap((row) => [row.sent_by, row.created_by].filter(Boolean))
    )
  ) as string[];

  const names = new Map<string, string>();
  if (ids.length === 0) return names;

  const { data } = await admin
    .from("profiles")
    .select("id, full_name, username")
    .in("id", ids);

  for (const profile of data ?? []) {
    names.set(
      profile.id,
      profile.full_name?.trim() || profile.username?.trim() || "Indegenius"
    );
  }

  return names;
}

export async function listBroadcasts(): Promise<BroadcastRecord[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("broadcasts")
    .select(BROADCAST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as BroadcastRowDb[];
  const names = await attachActorNames(admin, rows);
  return rows.map((row) => toBroadcastRecord(row, names));
}

export async function getBroadcastRecord(
  id: string
): Promise<BroadcastRecord | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("broadcasts")
    .select(BROADCAST_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as BroadcastRowDb;
  const names = await attachActorNames(admin, [row]);
  return toBroadcastRecord(row, names);
}

export async function loadSendRow(id: string): Promise<BroadcastSendRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("broadcasts")
    .select(BROADCAST_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toSendRow(data as BroadcastRowDb) : null;
}

export type DraftInput = {
  subject: string;
  previewText: string;
  bodyHtml: string;
  senderKey: EmailSenderKey;
  audienceKey: BroadcastAudienceKey;
  selectedProfileIds: string[];
};

export async function createDraft(input: DraftInput, actorId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("broadcasts")
    .insert({
      subject: input.subject,
      preview_text: input.previewText,
      body_html: input.bodyHtml,
      sender_key: input.senderKey,
      audience_key: input.audienceKey,
      selected_profile_ids: input.selectedProfileIds,
      created_by: actorId,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

/**
 * Saving only ever touches a broadcast that has never been handed to Resend.
 * Once a send is claimed the copy that went out is the copy of record, and a
 * row that failed after dispatch stays frozen too, because it may still be
 * delivering while we reconcile it.
 */
export async function saveDraft(
  id: string,
  input: DraftInput
): Promise<"saved" | "locked"> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("broadcasts")
    .update({
      subject: input.subject,
      preview_text: input.previewText,
      body_html: input.bodyHtml,
      sender_key: input.senderKey,
      audience_key: input.audienceKey,
      selected_profile_ids: input.selectedProfileIds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", ["draft", "failed"])
    .is("dispatch_started_at", null)
    .select("id");

  if (error) throw new Error(error.message);
  return (data ?? []).length > 0 ? "saved" : "locked";
}

export async function countAudience(
  audienceKey: BroadcastAudienceKey,
  selectedProfileIds: readonly string[] = []
): Promise<number> {
  const admin = createAdminClient();

  if (audienceKey === "selected") {
    if (selectedProfileIds.length === 0) return 0;
    const { count, error } = await admin
      .from("broadcast_contacts")
      .select("profile_id", { count: "exact", head: true })
      .eq("is_eligible", true)
      .in("profile_id", selectedProfileIds as string[]);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  let query = admin
    .from("broadcast_contacts")
    .select("profile_id", { count: "exact", head: true })
    .eq("is_eligible", true);

  if (audienceKey === "active") {
    query = query.gte("last_activity_at", daysAgoIso(ACTIVE_WINDOW_DAYS));
  } else if (audienceKey === "authors") {
    query = query.gt("published_count", 0);
  } else if (audienceKey === "verified") {
    query = query.eq("is_verified", true);
  } else if (audienceKey === "new") {
    query = query.gte("profile_created_at", daysAgoIso(NEW_USER_WINDOW_DAYS));
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getAudienceCounts(): Promise<
  Record<BroadcastAudienceKey, number>
> {
  const counts = await Promise.all(
    STANDING_AUDIENCE_KEYS.map(async (key) => [key, await countAudience(key)] as const)
  );

  return {
    ...(Object.fromEntries(counts) as Record<BroadcastAudienceKey, number>),
    // A hand-picked list has no standing size. The composer counts what has
    // actually been ticked.
    selected: 0,
  };
}

export type SelectableRecipient = {
  id: string;
  name: string;
  handle: string;
  detail: string;
};

/**
 * The people a hand-picked send can choose from. Only eligible contacts appear,
 * so somebody who has opted out cannot be selected by name in the first place.
 */
export async function listSelectableRecipients(
  limit = 60
): Promise<SelectableRecipient[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("broadcast_contacts")
    .select(
      "profile_id, published_count, is_verified, profiles!broadcast_contacts_profile_id_fkey(full_name, username)"
    )
    .eq("is_eligible", true)
    .order("published_count", { ascending: false })
    .limit(Math.min(limit, MAX_SELECTED_RECIPIENTS));

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const username = profile?.username?.trim() ?? "";
    const publications =
      row.published_count === 1
        ? "1 publication"
        : `${row.published_count} publications`;

    return {
      id: row.profile_id as string,
      name: profile?.full_name?.trim() || username || "Indegenius member",
      handle: username,
      detail: `${row.is_verified ? "Verified" : "Member"} · ${publications}`,
    };
  });
}

export type SegmentStateRow = {
  audience_key: string;
  resend_segment_id: string | null;
  contact_count: number;
  last_synced_at: string | null;
  last_sync_error: string | null;
};

const SEGMENT_COLUMNS =
  "audience_key, resend_segment_id, contact_count, last_synced_at, last_sync_error";

export async function getSegmentState(audienceKey: BroadcastAudienceKey) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("broadcast_segments")
    .select(SEGMENT_COLUMNS)
    .eq("audience_key", audienceKey)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data ?? null) as SegmentStateRow | null;
}

export async function listSegmentStates() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("broadcast_segments")
    .select(SEGMENT_COLUMNS);

  if (error) throw new Error(error.message);
  return (data ?? []) as SegmentStateRow[];
}

/**
 * Freshest common view of the standing audiences. Any segment that has never
 * synced makes the whole set stale, because "the oldest date we have" would
 * otherwise silently skip the audience that was never built at all.
 */
export function standingSegmentsStale(
  segments: readonly SegmentStateRow[],
  now: Date
) {
  if (segments.length < STANDING_AUDIENCE_KEYS.length) return true;
  return segments.some(
    (segment) =>
      !segment.resend_segment_id || isSegmentStale(segment.last_synced_at, now)
  );
}

/**
 * The cheap pre-send check. Reads only our own tables, creates nothing, and
 * runs while the broadcast is still an editable draft, so an unusable audience
 * leaves the row where the admin can fix it.
 */
export async function checkSendPrecondition(
  row: BroadcastSendRow,
  now: Date
): Promise<SendPrecondition> {
  if (row.audienceKey === "selected") {
    const count = await countAudience("selected", row.selectedProfileIds);
    return { ok: true, recipientCount: count };
  }

  const state = await getSegmentState(row.audienceKey);
  if (!state?.resend_segment_id) {
    return {
      ok: false,
      reason: "segment_missing",
      message:
        "This audience has no Resend segment yet. Run the recipient sync before sending.",
    };
  }

  if (isSegmentStale(state.last_synced_at, now)) {
    return {
      ok: false,
      reason: "segment_stale",
      message:
        "Recipient sync has not run recently enough to trust this audience. Run the sync, then send.",
    };
  }

  return { ok: true, recipientCount: await countAudience(row.audienceKey) };
}

async function attachSelectedSegmentId(id: string, segmentId: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("broadcasts")
    .update({ selected_segment_id: segmentId, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

/**
 * A hand-picked list is not a standing audience, so it gets a segment of its
 * own, named deterministically after the broadcast. Three things make it safe
 * to call twice: it only runs after the send claim, so a double click never
 * reaches it twice at once; it reuses the id already on the row; and the name
 * is derived from the broadcast id, so even a lost id finds the same segment
 * rather than making a second.
 */
async function resolveSelectedSegment(
  row: BroadcastSendRow
): Promise<SegmentResolution> {
  const admin = createAdminClient();

  if (row.selectedProfileIds.length === 0) {
    return {
      ok: false,
      reason: "no_recipients",
      message: "Choose at least one recipient before sending.",
    };
  }

  const { data, error } = await admin
    .from("broadcast_contacts")
    .select("email")
    .eq("is_eligible", true)
    .in("profile_id", row.selectedProfileIds);

  if (error) throw new Error(error.message);

  const emails = (data ?? []).map((contact) => contact.email as string);
  if (emails.length === 0) {
    return {
      ok: false,
      reason: "no_recipients",
      message:
        "None of the selected people are currently eligible for broadcast email.",
    };
  }

  const segmentId =
    row.selectedSegmentId ??
    (await ensureNamedSegment(selectedSegmentName(row.id))).id;

  if (!row.selectedSegmentId) {
    await attachSelectedSegmentId(row.id, segmentId);
  }

  for (const email of emails) {
    await syncContactSegments({
      email,
      segmentIds: [segmentId],
      managedSegmentIds: [segmentId],
    });
  }

  return { ok: true, segmentId, recipientCount: emails.length };
}

export async function resolveSendSegment(
  row: BroadcastSendRow,
  now: Date
): Promise<SegmentResolution> {
  if (row.audienceKey === "selected") {
    return resolveSelectedSegment(row);
  }

  // Re-read rather than trusting the precondition: the claim is the first
  // point at which this caller is the only one acting on the row.
  const precondition = await checkSendPrecondition(row, now);
  if (!precondition.ok) return precondition;

  const state = await getSegmentState(row.audienceKey);
  if (!state?.resend_segment_id) {
    return {
      ok: false,
      reason: "segment_missing",
      message:
        "This audience has no Resend segment yet. Run the recipient sync before sending.",
    };
  }

  return {
    ok: true,
    segmentId: state.resend_segment_id,
    recipientCount: precondition.recipientCount,
  };
}

/**
 * The claim is a single statement in Postgres, behind claim_broadcast_for_send,
 * so two racing callers cannot both win it and a row that has ever been
 * dispatched can never be claimed again.
 */
export async function claimForSend(
  id: string,
  actorId: string
): Promise<BroadcastSendRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_broadcast_for_send", {
    p_broadcast_id: id,
    p_actor_id: actorId,
  });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as BroadcastRowDb[];
  return rows.length > 0 ? toSendRow(rows[0]) : null;
}

export async function attachResendBroadcastId(
  id: string,
  resendBroadcastId: string
) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("broadcasts")
    .update({
      resend_broadcast_id: resendBroadcastId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

/**
 * The point of no return. Written before broadcasts.send is called, because a
 * crash between the write and the call must leave the row un-retryable rather
 * than retryable, and recipient_count is stamped here so the webhook has
 * something to measure completion against even if markSending never lands.
 */
export async function markDispatchStarted(input: {
  id: string;
  recipientCount: number;
  at: Date;
}) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("broadcasts")
    .update({
      dispatch_started_at: input.at.toISOString(),
      recipient_count: input.recipientCount,
      updated_at: input.at.toISOString(),
    })
    .eq("id", input.id);

  if (error) throw new Error(error.message);
}

export async function markSending(input: {
  id: string;
  recipientCount: number;
  at: Date;
}) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("broadcasts")
    .update({
      status: "sending",
      recipient_count: input.recipientCount,
      sent_at: input.at.toISOString(),
      updated_at: input.at.toISOString(),
    })
    .eq("id", input.id)
    .in("status", ["queued", "sending"]);

  if (error) throw new Error(error.message);
}

export async function markFailed(id: string, note: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("broadcasts")
    .update({
      status: "failed",
      status_note: note.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

/**
 * Undoes a claim that turned out not to be sendable. Only ever called before
 * anything reached Resend, so the broadcast goes back to being an ordinary
 * draft the admin can fix rather than a failure they have to explain.
 */
export async function releaseClaim(id: string, status: BroadcastStatus) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("broadcasts")
    .update({
      status,
      send_claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "queued")
    .is("dispatch_started_at", null);

  if (error) throw new Error(error.message);
}

/**
 * Resend's status word for a broadcast, narrowed to the three we act on.
 * Everything else, including a broadcast Resend cannot find, is "unknown",
 * which is the answer that keeps a locked row locked.
 */
export async function readProviderBroadcastStatus(
  resendBroadcastId: string
): Promise<ProviderBroadcastStatus> {
  const remote = await getResendBroadcast(resendBroadcastId);
  if (!remote) return "unknown";
  if (remote.status === "draft") return "draft";
  if (remote.status === "queued") return "queued";
  if (remote.status === "sent") return "sent";
  return "unknown";
}

/**
 * The one path that clears a dispatch stamp, and the only place in the product
 * where a broadcast becomes retryable after broadcasts.send has been called.
 *
 * Three things have to hold before this runs at all, and all three are checked
 * elsewhere: Resend rejected the request on its own terms, Resend confirms the
 * broadcast is still a draft on its side, and this caller is the one that
 * claimed the row. The last of those is enforced here, by the update matching
 * only a row still queued with the dispatch stamp on it, so a row that has
 * moved on in the meantime is left exactly where it is.
 *
 * resend_broadcast_id is deliberately left in place. The Resend draft already
 * exists and re-sending it is what the retry does, so keeping the id is what
 * stops a second broadcast being created beside the first.
 */
export async function releaseAfterRejection(input: {
  id: string;
  note: string;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("broadcasts")
    .update({
      status: "draft",
      send_claimed_at: null,
      dispatch_started_at: null,
      sent_at: null,
      status_note: input.note.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("status", "queued")
    .not("dispatch_started_at", "is", null)
    .select("id");

  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export function buildBroadcastEmail(row: BroadcastSendRow) {
  const sender = getEmailSender(row.senderKey);
  const html = buildBroadcastEmailHtml({
    subject: row.subject,
    previewText: row.previewText,
    bodyHtml: row.bodyHtml,
    senderKey: row.senderKey,
    unsubscribe: "broadcast",
  });

  return {
    name: row.subject.slice(0, 200),
    from: `${sender.name} <${sender.address}>`,
    replyTo: sender.replyable ? sender.address : undefined,
    subject: row.subject,
    previewText: row.previewText,
    html,
    text: broadcastPlainText({
      subject: row.subject,
      bodyHtml: row.bodyHtml,
      footerNote: sender.footerNote,
      unsubscribeLine: unsubscribeFooterText("broadcast"),
    }),
  };
}

/** The production wiring of the send state machine. */
export function createSendDeps(): SendBroadcastDeps {
  return {
    loadBroadcast: loadSendRow,
    checkSendPrecondition,
    resolveSendSegment,
    claimForSend: (id, actorId) => claimForSend(id, actorId),
    attachResendBroadcastId,
    markDispatchStarted,
    markSending,
    markFailed,
    releaseClaim,
    isDefinitiveRejection: isResendDefinitiveRejection,
    readProviderBroadcastStatus,
    releaseAfterRejection,
    buildEmail: buildBroadcastEmail,
    createResendBroadcast,
    sendResendBroadcast,
    now: () => new Date(),
  };
}

// ==========================================================================
// Reconciliation
// ==========================================================================

/** A broadcast still queued or sending after this long is asked about. */
export const RECONCILE_AFTER_MINUTES = 15;

/** Left on the row so the admin can see why it went back to being a draft. */
export const PROVIDER_DRAFT_RELEASE_NOTE =
  "The provider never accepted this send and still holds the broadcast as a draft, so nobody was emailed. It has been unlocked. Check the audience, then send it again.";

export type ReconcileOutcome = {
  broadcastId: string;
  from: BroadcastStatus;
  to: BroadcastStatus;
};

/**
 * Settles broadcasts that never reached a terminal state.
 *
 * Two things strand a send. A crash between claiming and dispatching leaves a
 * row queued with nothing at Resend, and a failure after the dispatch call
 * leaves a row whose real state only Resend knows. Neither can be resolved by
 * guessing, so both are resolved by asking, and a row that has never been
 * dispatched is simply released back to draft.
 *
 * Resend's own broadcast status is draft, queued or sent. It never says
 * "sending", so a sent broadcast whose per message webhooks are still arriving
 * is left as sending here and finished by the webhook's own completion check.
 *
 * "draft" at Resend is the definite answer that nothing was accepted and
 * nobody was emailed, so the dispatch stamp comes off and the broadcast goes
 * back to being an editable draft. Leaving it locked, which is what this used
 * to do, protected nothing and cost the admin the message. Only "draft"
 * unlocks: queued and sent stay locked, and so does a broadcast Resend cannot
 * account for, because getResendBroadcast answers null and the row is skipped.
 */
export async function reconcileStuckBroadcasts(
  limit = 25
): Promise<ReconcileOutcome[]> {
  const admin = createAdminClient();
  const cutoff = new Date(
    Date.now() - RECONCILE_AFTER_MINUTES * 60 * 1000
  ).toISOString();

  const { data, error } = await admin
    .from("broadcasts")
    .select(BROADCAST_COLUMNS)
    .in("status", ["queued", "sending", "failed"])
    .not("dispatch_started_at", "is", null)
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  const outcomes: ReconcileOutcome[] = [];

  for (const raw of (data ?? []) as BroadcastRowDb[]) {
    const row = toSendRow(raw);
    if (!row.resendBroadcastId) continue;

    const remote = await getResendBroadcast(row.resendBroadcastId);
    if (!remote) continue;

    if (remote.status === "draft") {
      // No send was ever accepted. Clearing the dispatch stamp is what makes
      // the broadcast claimable again, and it is safe here for the same reason
      // it is safe nowhere else: Resend has just said it holds a draft.
      const { data: released, error: releaseFailure } = await admin
        .from("broadcasts")
        .update({
          status: "draft",
          send_claimed_at: null,
          dispatch_started_at: null,
          sent_at: null,
          status_note: PROVIDER_DRAFT_RELEASE_NOTE,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("status", row.status)
        .not("dispatch_started_at", "is", null)
        .select("id");

      if (releaseFailure) throw new Error(releaseFailure.message);
      if ((released ?? []).length > 0) {
        outcomes.push({ broadcastId: row.id, from: row.status, to: "draft" });
      }
      continue;
    }

    // Resend accepted and dispatched it. Delivery counts keep arriving over
    // the webhook; the status stops being a lie in the meantime.
    const next: BroadcastStatus | null =
      remote.status === "sent" && row.status !== "sent" ? "sending" : null;

    if (!next || next === row.status) continue;

    const { error: updateError } = await admin
      .from("broadcasts")
      .update({
        status: next,
        status_note: null,
        sent_at: remote.sent_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (updateError) throw new Error(updateError.message);
    outcomes.push({ broadcastId: row.id, from: row.status, to: next });
  }

  // A claim that never got as far as Resend is not a failure. Put it back.
  const { data: released, error: releaseError } = await admin
    .from("broadcasts")
    .update({
      status: "draft",
      send_claimed_at: null,
      status_note: null,
      updated_at: new Date().toISOString(),
    })
    .eq("status", "queued")
    .is("dispatch_started_at", null)
    .lt("updated_at", cutoff)
    .select("id");

  if (releaseError) throw new Error(releaseError.message);

  for (const row of released ?? []) {
    outcomes.push({
      broadcastId: row.id as string,
      from: "queued",
      to: "draft",
    });
  }

  return outcomes;
}
