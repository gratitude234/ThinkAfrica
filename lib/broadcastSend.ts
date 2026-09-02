import type { EmailSenderKey } from "@/lib/emailSenders";
import type { BroadcastAudienceKey, BroadcastStatus } from "@/lib/broadcasts";

/**
 * The send state machine.
 *
 * Everything that decides whether a broadcast goes out lives here, behind
 * injected dependencies, so the rules can be tested without Supabase or Resend
 * in the room. Four properties worth stating plainly:
 *
 *   1. A second click cannot start a second send. Claiming is a conditional
 *      update that only matches a row still in draft or failed and never
 *      dispatched; the loser of the race matches no row and is told the send is
 *      already under way.
 *
 *   2. Nothing is created at Resend before the claim. Cheap preconditions run
 *      first, the claim runs next, and only the winner spends a Resend call.
 *      That is what stops a double click leaving an orphan segment behind.
 *
 *   3. A broadcast reaches Resend at most once. The draft is created at Resend
 *      first and its id written to our row second, so a retry after a timeout
 *      dispatches the draft that already exists instead of making another.
 *
 *   4. Once broadcasts.send has been called we cannot prove nothing left. From
 *      that instant the row is never re-claimable, whatever happens next, and
 *      a later failure is recorded as needing reconciliation rather than as a
 *      retryable error. Sending twice is the one failure with no undo.
 */

/** A segment synced longer ago than this is not trusted to address a send. */
export const SEGMENT_STALE_AFTER_HOURS = 36;

/**
 * A hand-picked list is pushed to Resend one contact at a time inside the send
 * request, so its size is bounded by how long a serverless function may run
 * rather than by anything about the product. The composer offers fewer than
 * this; the ceiling is here so a crafted request cannot exceed it either.
 */
export const MAX_SELECTED_RECIPIENTS = 200;

export type BroadcastSendRow = {
  id: string;
  subject: string;
  previewText: string;
  bodyHtml: string;
  senderKey: EmailSenderKey;
  audienceKey: BroadcastAudienceKey;
  selectedProfileIds: string[];
  status: BroadcastStatus;
  resendBroadcastId: string | null;
  selectedSegmentId: string | null;
  dispatchStartedAt: string | null;
  recipientCount: number;
};

export type SegmentResolution =
  | { ok: true; segmentId: string; recipientCount: number }
  | { ok: false; reason: SendFailureReason; message: string };

export type SendPrecondition =
  | { ok: true; recipientCount: number }
  | { ok: false; reason: SendFailureReason; message: string };

export type SendFailureReason =
  | "not_found"
  | "empty_subject"
  | "empty_body"
  | "no_recipients"
  | "too_many_recipients"
  | "segment_missing"
  | "segment_stale"
  | "already_dispatched"
  | "resend_failed"
  | "needs_reconciliation";

export type SendBroadcastResult =
  | {
      ok: true;
      outcome: "dispatched" | "already_in_progress";
      status: BroadcastStatus;
      recipientCount: number;
      resendBroadcastId: string | null;
    }
  | { ok: false; reason: SendFailureReason; message: string };

export type BuiltBroadcastEmail = {
  name: string;
  from: string;
  replyTo?: string;
  subject: string;
  previewText: string;
  html: string;
  text: string;
};

export type SendBroadcastDeps = {
  loadBroadcast(id: string): Promise<BroadcastSendRow | null>;
  /**
   * The cheap half of addressing, run before anything is claimed: does this
   * audience exist, is it fresh enough to trust, and does anyone fall into it.
   * Must not create anything at Resend.
   */
  checkSendPrecondition(
    row: BroadcastSendRow,
    now: Date
  ): Promise<SendPrecondition>;
  /**
   * The expensive half, run only by the caller that won the claim. For a
   * standing audience this is a lookup; for a hand-picked list it provisions
   * the broadcast's own segment, reusing selectedSegmentId when one is already
   * recorded so a retry cannot make a second.
   */
  resolveSendSegment(row: BroadcastSendRow, now: Date): Promise<SegmentResolution>;
  /**
   * Must be a single conditional update matching only 'draft' or 'failed' with
   * no dispatch recorded, returning the row it claimed or null when another
   * caller got there first.
   */
  claimForSend(
    id: string,
    actorId: string,
    at: Date
  ): Promise<BroadcastSendRow | null>;
  attachResendBroadcastId(id: string, resendBroadcastId: string): Promise<void>;
  /** Stamped before the dispatch call, and the point of no return. */
  markDispatchStarted(input: {
    id: string;
    recipientCount: number;
    at: Date;
  }): Promise<void>;
  markSending(input: {
    id: string;
    recipientCount: number;
    at: Date;
  }): Promise<void>;
  /** Records why a send stopped. `retryable` false leaves the row un-claimable. */
  markFailed(id: string, note: string): Promise<void>;
  /** Puts an un-dispatched broadcast back where it was so it can be edited. */
  releaseClaim(id: string, status: BroadcastStatus): Promise<void>;
  buildEmail(row: BroadcastSendRow, recipientCount: number): BuiltBroadcastEmail;
  createResendBroadcast(input: {
    name: string;
    segmentId: string;
    from: string;
    replyTo?: string;
    subject: string;
    previewText?: string;
    html: string;
    text: string;
  }): Promise<{ id: string }>;
  sendResendBroadcast(resendBroadcastId: string): Promise<void>;
  now(): Date;
};

export function isSegmentStale(lastSyncedAt: string | null, now: Date) {
  if (!lastSyncedAt) return true;
  const synced = new Date(lastSyncedAt).getTime();
  if (Number.isNaN(synced)) return true;
  return now.getTime() - synced > SEGMENT_STALE_AFTER_HOURS * 60 * 60 * 1000;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown Resend failure.";
}

function alreadyInProgress(row: BroadcastSendRow): SendBroadcastResult {
  return {
    ok: true,
    outcome: "already_in_progress",
    status: row.status,
    recipientCount: row.recipientCount,
    resendBroadcastId: row.resendBroadcastId,
  };
}

export async function sendBroadcast(
  broadcastId: string,
  actorId: string,
  deps: SendBroadcastDeps
): Promise<SendBroadcastResult> {
  const row = await deps.loadBroadcast(broadcastId);
  if (!row) {
    return { ok: false, reason: "not_found", message: "Broadcast not found." };
  }

  // Already on its way or already gone. Answering with the existing state
  // rather than an error is what makes a repeated click harmless.
  if (row.status === "queued" || row.status === "sending" || row.status === "sent") {
    return alreadyInProgress(row);
  }

  // A row that failed after the dispatch call cannot be retried: we do not
  // know whether Resend started sending, and finding out by sending again is
  // not an option. The nightly reconciler asks Resend and settles the status.
  if (row.dispatchStartedAt) {
    return {
      ok: false,
      reason: "already_dispatched",
      message:
        "This broadcast was already handed to the mail provider. Its delivery state is being reconciled, so it cannot be sent again.",
    };
  }

  if (!row.subject.trim()) {
    return {
      ok: false,
      reason: "empty_subject",
      message: "Add a subject before sending.",
    };
  }

  if (!row.bodyHtml.replace(/<[^>]*>/g, "").trim()) {
    return {
      ok: false,
      reason: "empty_body",
      message: "Write a message before sending.",
    };
  }

  if (
    row.audienceKey === "selected" &&
    row.selectedProfileIds.length > MAX_SELECTED_RECIPIENTS
  ) {
    return {
      ok: false,
      reason: "too_many_recipients",
      message: `A hand-picked list is limited to ${MAX_SELECTED_RECIPIENTS} people. Use a standing audience for anything larger.`,
    };
  }

  // Preconditions first, while the row is still a draft, so a stale segment or
  // an empty audience leaves the broadcast editable rather than marked failed.
  const precondition = await deps.checkSendPrecondition(row, deps.now());
  if (!precondition.ok) return precondition;

  if (precondition.recipientCount <= 0) {
    return {
      ok: false,
      reason: "no_recipients",
      message:
        "This audience currently has no eligible recipients. Nobody would receive it.",
    };
  }

  const claimed = await deps.claimForSend(row.id, actorId, deps.now());
  if (!claimed) {
    // Lost the race, or the row became un-claimable between the load and the
    // claim. Report what the winner left behind rather than failing.
    const current = await deps.loadBroadcast(row.id);
    return {
      ok: true,
      outcome: "already_in_progress",
      status: current?.status ?? "queued",
      recipientCount: current?.recipientCount ?? precondition.recipientCount,
      resendBroadcastId: current?.resendBroadcastId ?? null,
    };
  }

  // Everything from here spends Resend calls, and only the winner gets here.
  let segment: SegmentResolution;
  try {
    segment = await deps.resolveSendSegment(claimed, deps.now());
  } catch (error) {
    const message = errorMessage(error);
    await deps.markFailed(claimed.id, message);
    return { ok: false, reason: "resend_failed", message };
  }

  if (!segment.ok) {
    await deps.releaseClaim(claimed.id, row.status);
    return segment;
  }

  let resendBroadcastId = claimed.resendBroadcastId;

  try {
    if (!resendBroadcastId) {
      const email = deps.buildEmail(claimed, segment.recipientCount);
      const created = await deps.createResendBroadcast({
        name: email.name,
        segmentId: segment.segmentId,
        from: email.from,
        replyTo: email.replyTo,
        subject: email.subject,
        previewText: email.previewText,
        html: email.html,
        text: email.text,
      });

      resendBroadcastId = created.id;
      // Written before the dispatch, so a failure past this point retries the
      // same Resend draft rather than creating a second broadcast.
      await deps.attachResendBroadcastId(claimed.id, resendBroadcastId);
    }
  } catch (error) {
    const message = errorMessage(error);
    await deps.markFailed(claimed.id, message);
    return { ok: false, reason: "resend_failed", message };
  }

  // The point of no return, stamped before the call rather than after it: a
  // crash between the two must leave the row un-retryable, not retryable.
  await deps.markDispatchStarted({
    id: claimed.id,
    recipientCount: segment.recipientCount,
    at: deps.now(),
  });

  try {
    await deps.sendResendBroadcast(resendBroadcastId);
  } catch (error) {
    const message = errorMessage(error);
    // Resend answered with an error, but the request may still have been
    // accepted. markFailed does not restore claimability, because
    // dispatch_started_at is set; the reconciler settles it against Resend.
    await deps.markFailed(
      claimed.id,
      `${message} The provider was already asked to send, so this is awaiting reconciliation rather than retry.`
    );
    return { ok: false, reason: "needs_reconciliation", message };
  }

  try {
    await deps.markSending({
      id: claimed.id,
      recipientCount: segment.recipientCount,
      at: deps.now(),
    });
  } catch {
    // Resend has it. Losing our own status write is a reporting problem, not a
    // delivery one, and the reconciler will correct the row. Saying "failed"
    // here would be a lie to the admin about mail that is going out.
  }

  return {
    ok: true,
    outcome: "dispatched",
    status: "sending",
    recipientCount: segment.recipientCount,
    resendBroadcastId,
  };
}
