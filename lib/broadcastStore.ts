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
  type ClaimOutcome,
  type ProviderBroadcastStatus,
  type SegmentResolution,
  type SendBroadcastDeps,
  type SendPrecondition,
} from "@/lib/broadcastSend";
import {
  DUPLICATE_CAMPAIGN_WINDOW_HOURS,
  campaignFingerprint,
} from "@/lib/broadcastFingerprint";
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
  suppressed_count: number | null;
  failed_count: number;
  status_note: string | null;
  campaign_fingerprint: string | null;
  superseded_by: string | null;
  superseded_at: string | null;
  created_by: string | null;
  sent_by: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

/** The shape claim_broadcast_for_campaign answers with. */
type ClaimRowDb = {
  outcome: "claimed" | "duplicate" | "unclaimable";
  duplicate_broadcast_id: string | null;
  duplicate_subject: string | null;
  duplicate_status: string | null;
  duplicate_sent_at: string | null;
  broadcast: BroadcastRowDb | null;
};

const BROADCAST_COLUMNS =
  "id, subject, preview_text, body_html, sender_key, audience_key, selected_profile_ids, selected_segment_id, status, resend_broadcast_id, dispatch_started_at, recipient_count, delivered_count, suppressed_count, failed_count, status_note, campaign_fingerprint, superseded_by, superseded_at, created_by, sent_by, sent_at, created_at, updated_at";

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
    suppressed: row.suppressed_count ?? 0,
    failed: row.failed_count,
    sentBy:
      senderNameById.get(row.sent_by ?? "") ??
      senderNameById.get(row.created_by ?? "") ??
      "Indegenius",
    statusNote: row.status_note ?? undefined,
    supersededBy: row.superseded_by ?? undefined,
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

/**
 * Eligible means the same thing here as it does in the sync: opted in, valid
 * address, account in good standing, and deliverable.
 *
 * is_eligible is the sync's stored answer and already carries the first three.
 * Deliverability is checked again rather than left to it, because a
 * suppression arrives on a webhook between syncs and the number an admin reads
 * before pressing send should not be a day out of date. Showing 253 while
 * knowing 24 of them will not be attempted is the kind of number that gets
 * quoted in a meeting.
 */
function eligibleContacts(admin: AdminClient) {
  return admin
    .from("broadcast_contacts")
    .select("profile_id", { count: "exact", head: true })
    .eq("is_eligible", true)
    .is("suppressed_at", null);
}

export async function countAudience(
  audienceKey: BroadcastAudienceKey,
  selectedProfileIds: readonly string[] = []
): Promise<number> {
  const admin = createAdminClient();

  if (audienceKey === "selected") {
    if (selectedProfileIds.length === 0) return 0;
    const { count, error } = await eligibleContacts(admin).in(
      "profile_id",
      selectedProfileIds as string[]
    );
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  let query = eligibleContacts(admin);

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
    .is("suppressed_at", null)
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
    // A suppressed address is never pushed into a send segment, hand-picked
    // or not. Naming somebody by hand cannot make them deliverable.
    .is("suppressed_at", null)
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
 * The claim, and with it the duplicate question.
 *
 * claim_broadcast_for_campaign takes an advisory lock on the fingerprint,
 * looks for an equivalent campaign that is already irreversible, and only then
 * runs the same conditional update the old claim ran. Two tabs racing the same
 * campaign serialise on that lock: the second one wakes to find the first
 * one's row sitting in 'queued' and is refused. Asking the question from here,
 * before calling a claim that does not know about it, is exactly the shape
 * that lets both through.
 */
export async function claimForCampaign(input: {
  id: string;
  actorId: string;
  fingerprint: string;
  windowHours: number;
  override: boolean;
}): Promise<ClaimOutcome> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_broadcast_for_campaign", {
    p_broadcast_id: input.id,
    p_actor_id: input.actorId,
    p_fingerprint: input.fingerprint,
    p_window_hours: input.windowHours,
    p_override: input.override,
  });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ClaimRowDb[];
  const row = rows[0];
  if (!row) return { outcome: "unclaimable" };

  if (row.outcome === "duplicate") {
    return {
      outcome: "duplicate",
      duplicate: {
        broadcastId: row.duplicate_broadcast_id ?? "",
        subject: row.duplicate_subject ?? "",
        status: (row.duplicate_status ?? "sent") as BroadcastStatus,
        sentAt: row.duplicate_sent_at,
      },
    };
  }

  if (row.outcome === "claimed" && row.broadcast) {
    return { outcome: "claimed", row: toSendRow(row.broadcast) };
  }

  return { outcome: "unclaimable" };
}

/**
 * Editable drafts that carry the same campaign as the one just sent.
 *
 * Matched in the application rather than in SQL because a draft written before
 * fingerprints existed carries none, and the only way to know whether it is
 * equivalent is to normalise it the way the sender did. The list is capped: a
 * cleanup pass is not worth walking an unbounded table for.
 */
export async function findEquivalentDraftIds(input: {
  fingerprint: string;
  excludeId: string;
  limit?: number;
}): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("broadcasts")
    .select("id, subject, body_html, audience_key, selected_profile_ids")
    .in("status", ["draft", "failed"])
    .is("dispatch_started_at", null)
    .neq("id", input.excludeId)
    .order("updated_at", { ascending: false })
    .limit(input.limit ?? 200);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter(
      (row) =>
        campaignFingerprint({
          subject: row.subject as string,
          bodyHtml: row.body_html as string,
          audienceKey: row.audience_key as BroadcastAudienceKey,
          selectedProfileIds: (row.selected_profile_ids ?? []) as string[],
        }) === input.fingerprint
    )
    .map((row) => row.id as string);
}

/**
 * Moves those drafts to 'superseded'. Nothing is deleted and nothing sent is
 * touched: the statement's own guard only matches an editable, never
 * dispatched row that is not the one which just sent.
 */
export async function supersedeEquivalentDrafts(input: {
  sentBroadcastId: string;
  fingerprint: string;
}): Promise<string[]> {
  const ids = await findEquivalentDraftIds({
    fingerprint: input.fingerprint,
    excludeId: input.sentBroadcastId,
  });

  if (ids.length === 0) return [];

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("supersede_broadcast_drafts", {
    p_broadcast_ids: ids,
    p_superseded_by: input.sentBroadcastId,
    p_fingerprint: input.fingerprint,
  });

  if (error) throw new Error(error.message);
  return ((data ?? []) as { id?: string }[] | string[]).map((row) =>
    typeof row === "string" ? row : (row.id ?? "")
  );
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
function toProviderStatus(
  status: string | null | undefined
): ProviderBroadcastStatus {
  if (status === "draft") return "draft";
  if (status === "queued") return "queued";
  if (status === "sent") return "sent";
  return "unknown";
}

export async function readProviderBroadcastStatus(
  resendBroadcastId: string
): Promise<ProviderBroadcastStatus> {
  const remote = await getResendBroadcast(resendBroadcastId);
  return toProviderStatus(remote?.status);
}

/**
 * The one path that clears a dispatch stamp, and the only place in the product
 * where a broadcast becomes retryable after broadcasts.send has been called.
 *
 * It goes through release_broadcast_after_provider_draft rather than a
 * PostgREST update for the same reason claim_broadcast_for_send does: the
 * guard is a conditional update over a nullable column, and assembled from
 * separate PostgREST filters its failure is silent. The first version of this
 * was a PostgREST update, and in production it left a row locked while
 * reporting no error.
 *
 * The caller must already have been told by Resend that the broadcast is still
 * a draft there. The statement enforces the rest: the row was dispatched, it
 * is not recorded as sent, and it still carries the Resend id whose status was
 * the evidence. Answers false when it matched nothing, which is a real answer
 * and not an error.
 *
 * resend_broadcast_id is deliberately left in place. The Resend draft already
 * exists and re-sending it is what the retry does, so keeping the id is what
 * stops a second broadcast being created beside the first.
 */
export async function releaseAfterRejection(input: {
  id: string;
  resendBroadcastId: string;
  note: string;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "release_broadcast_after_provider_draft",
    {
      p_broadcast_id: input.id,
      p_resend_broadcast_id: input.resendBroadcastId,
      p_status_note: input.note,
    }
  );

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).length > 0;
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

/**
 * Finalises a campaign against the provider's own view of it.
 *
 * Resend's broadcast status is the campaign's status: 'sent' there means the
 * provider finished dispatching, which is a fact about the campaign and not
 * about any one recipient. Recipient outcomes go on arriving afterwards and
 * are counted afterwards. Waiting for delivered + failed to reach the
 * recipient count is what left two finished campaigns saying "Sending"
 * forever, because 24 suppressed messages are never going to be delivered and
 * were never going to fail either.
 */
export async function settleAgainstProvider(
  row: BroadcastSendRow
): Promise<BroadcastStatus | null> {
  if (!row.resendBroadcastId) return null;
  if (row.status !== "queued" && row.status !== "sending" && row.status !== "failed") {
    return null;
  }

  const remote = await getResendBroadcast(row.resendBroadcastId);
  if (!remote || remote.status !== "sent") return null;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("mark_broadcast_provider_sent", {
    p_broadcast_id: row.id,
    p_resend_broadcast_id: row.resendBroadcastId,
    p_sent_at: remote.sent_at ?? null,
  });

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).length > 0 ? "sent" : null;
}

/**
 * The same finalisation, run when an admin opens a broadcast that has not
 * settled. Reconciliation is nightly, and a campaign that finished an hour ago
 * should not have to wait until morning to say so on the one screen somebody
 * is actually looking at. One provider call, on a page that already talks to
 * the server, and it is a no-op for anything already terminal.
 */
export async function settleBroadcastOnView(id: string) {
  const row = await loadSendRow(id);
  if (!row) return null;
  try {
    return await settleAgainstProvider(row);
  } catch {
    // A provider that cannot be reached must not stop the page rendering. The
    // nightly reconciler will settle it.
    return null;
  }
}

/** The production wiring of the send state machine. */
export function createSendDeps(): SendBroadcastDeps {
  return {
    loadBroadcast: loadSendRow,
    checkSendPrecondition,
    resolveSendSegment,
    claimForCampaign,
    fingerprint: campaignFingerprint,
    duplicateWindowHours: DUPLICATE_CAMPAIGN_WINDOW_HOURS,
    supersedeEquivalentDrafts,
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

/**
 * Why a stranded broadcast was or was not settled.
 *
 * Recorded for every row examined, including the ones nothing happened to. The
 * previous version simply skipped those, which meant a reconciler that settled
 * nothing and a reconciler that never looked produced the same empty answer,
 * and working out which had happened meant reading the provider's HTTP logs.
 */
export type ReconcileReason =
  | "released_provider_draft"
  | "release_matched_nothing"
  | "marked_sent"
  | "provider_queued"
  | "provider_sent_already_recorded"
  | "provider_unreadable"
  | "no_resend_id";

export type ReconcileOutcome = {
  broadcastId: string;
  from: BroadcastStatus;
  /** Null when nothing changed. */
  to: BroadcastStatus | null;
  providerStatus: ProviderBroadcastStatus | null;
  reason: ReconcileReason;
};

/** The subset that actually moved, which is what callers usually report. */
export function settledBroadcasts(outcomes: readonly ReconcileOutcome[]) {
  return outcomes.filter((outcome) => outcome.to !== null);
}

/**
 * Settles broadcasts that never reached a terminal state.
 *
 * Two things strand a send. A crash between claiming and dispatching leaves a
 * row queued with nothing at Resend, and a failure after the dispatch call
 * leaves a row whose real state only Resend knows. Neither can be resolved by
 * guessing, so both are resolved by asking, and a row that has never been
 * dispatched is simply released back to draft.
 *
 * Resend's own broadcast status is draft, queued or sent, and "sent" is the
 * end of the campaign whatever the individual messages are still doing. A
 * broadcast whose per-message webhooks are still arriving is marked sent here
 * and goes on counting outcomes afterwards.
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

    if (!row.resendBroadcastId) {
      outcomes.push({
        broadcastId: row.id,
        from: row.status,
        to: null,
        providerStatus: null,
        reason: "no_resend_id",
      });
      continue;
    }

    // One unreadable broadcast must not abandon the rest of the batch, and it
    // must never be read as permission to unlock. It is recorded and skipped.
    let providerStatus: ProviderBroadcastStatus;
    let remoteSentAt: string | null = null;
    try {
      const remote = await getResendBroadcast(row.resendBroadcastId);
      providerStatus = toProviderStatus(remote?.status);
      remoteSentAt = remote?.sent_at ?? null;
    } catch {
      providerStatus = "unknown";
    }

    if (providerStatus === "draft") {
      // No send was ever accepted. Clearing the dispatch stamp is what makes
      // the broadcast claimable again, and it is safe here for the same reason
      // it is safe nowhere else: Resend has just said it holds a draft.
      const released = await releaseAfterRejection({
        id: row.id,
        resendBroadcastId: row.resendBroadcastId,
        note: PROVIDER_DRAFT_RELEASE_NOTE,
      });

      outcomes.push({
        broadcastId: row.id,
        from: row.status,
        to: released ? "draft" : null,
        providerStatus,
        reason: released
          ? "released_provider_draft"
          : "release_matched_nothing",
      });
      continue;
    }

    if (providerStatus === "sent") {
      // The provider finished dispatching the campaign, which is the whole
      // question. Recipient outcomes are a separate dimension and go on
      // arriving afterwards: a message that was suppressed will never be
      // delivered and will never fail, so waiting for the buckets to add up
      // to the recipient count is waiting for something that cannot happen.
      const { data: finalised, error: finaliseError } = await admin.rpc(
        "mark_broadcast_provider_sent",
        {
          p_broadcast_id: row.id,
          p_resend_broadcast_id: row.resendBroadcastId,
          p_sent_at: remoteSentAt,
        }
      );

      if (finaliseError) throw new Error(finaliseError.message);

      const moved = ((finalised ?? []) as unknown[]).length > 0;
      outcomes.push({
        broadcastId: row.id,
        from: row.status,
        to: moved ? "sent" : null,
        providerStatus,
        reason: moved ? "marked_sent" : "provider_sent_already_recorded",
      });
      continue;
    }

    outcomes.push({
      broadcastId: row.id,
      from: row.status,
      to: null,
      providerStatus,
      // Only 'queued' and 'unknown' reach here: 'draft' and 'sent' both
      // returned above.
      reason:
        providerStatus === "queued" ? "provider_queued" : "provider_unreadable",
    });
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
      // Nothing was ever created at Resend, so there was no status to read.
      providerStatus: null,
      reason: "released_provider_draft",
    });
  }

  return outcomes;
}
