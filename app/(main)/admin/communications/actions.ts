"use server";

import { revalidatePath } from "next/cache";
import { requireCapability, recordAdminAuditEvent } from "@/lib/adminAccess";
import { AdminAccessError } from "@/lib/supabase/admin";
import { logEmailResult, sendDirectEmail } from "@/lib/email";
import {
  renderBroadcastBodyHtml,
  unsubscribeFooterText,
} from "@/lib/broadcastEmail";
import { htmlToPlainText } from "@/lib/broadcastText";
import {
  BROADCAST_AUDIENCES,
  allowedBroadcastSenderKeys,
  type BroadcastAudienceKey,
} from "@/lib/broadcasts";
import {
  EMAIL_SENDER_KEYS,
  getEmailSender,
  type EmailSenderKey,
} from "@/lib/emailSenders";
import { MAX_SELECTED_RECIPIENTS, sendBroadcast } from "@/lib/broadcastSend";
import {
  countAudience,
  createDraft,
  createSendDeps,
  loadSendRow,
  saveDraft,
} from "@/lib/broadcastStore";

export type ComposerInput = {
  broadcastId: string | null;
  subject: string;
  previewText: string;
  bodyHtml: string;
  senderKey: string;
  audienceKey: string;
  selectedProfileIds: string[];
};

type ActionFailure = { ok: false; error: string };

function failure(error: string): ActionFailure {
  return { ok: false, error };
}

function isSenderKey(value: string): value is EmailSenderKey {
  return (EMAIL_SENDER_KEYS as readonly string[]).includes(value);
}

function isAudienceKey(value: string): value is BroadcastAudienceKey {
  return BROADCAST_AUDIENCES.some((audience) => audience.key === value);
}

/**
 * Every action re-derives the actor's capabilities from the session and
 * re-checks the sender against them. The composer filters the dropdown too,
 * but that is a courtesy: nothing here trusts the client's word about which
 * identity it is entitled to write as.
 */
async function authorize(senderKey: string) {
  const context = await requireCapability("communications.manage");

  if (!isSenderKey(senderKey)) {
    throw new AdminAccessError("Unknown sending identity.", 403);
  }

  if (!allowedBroadcastSenderKeys(context.capabilities).includes(senderKey)) {
    throw new AdminAccessError(
      "You are not permitted to send as that identity.",
      403
    );
  }

  return { context, senderKey };
}

function handleAccessError(error: unknown): ActionFailure {
  if (error instanceof AdminAccessError) {
    return failure(error.message);
  }
  return failure(
    error instanceof Error ? error.message : "Something went wrong."
  );
}

export async function saveBroadcastDraft(input: ComposerInput) {
  try {
    const { context, senderKey } = await authorize(input.senderKey);

    if (!isAudienceKey(input.audienceKey)) {
      return failure("Unknown audience.");
    }

    const draft = {
      subject: input.subject.slice(0, 300),
      previewText: input.previewText.slice(0, 300),
      bodyHtml: input.bodyHtml,
      senderKey,
      audienceKey: input.audienceKey,
      selectedProfileIds: input.selectedProfileIds.slice(
        0,
        MAX_SELECTED_RECIPIENTS
      ),
    };

    if (!input.broadcastId) {
      const id = await createDraft(draft, context.userId);
      revalidatePath("/admin/communications");
      return { ok: true as const, broadcastId: id, locked: false };
    }

    const result = await saveDraft(input.broadcastId, draft);
    revalidatePath("/admin/communications");
    return {
      ok: true as const,
      broadcastId: input.broadcastId,
      locked: result === "locked",
    };
  } catch (error) {
    return handleAccessError(error);
  }
}

export async function sendBroadcastTest(input: {
  broadcastId: string | null;
  recipient: string;
  subject: string;
  previewText: string;
  bodyHtml: string;
  senderKey: string;
}) {
  try {
    const { senderKey } = await authorize(input.senderKey);

    const recipient = input.recipient.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return failure("Add a valid email address.");
    }

    if (!input.subject.trim()) {
      return failure("Add a subject before sending a test.");
    }

    // A test is transactional: one message, one recipient, straight through
    // Resend's send API. It never touches a segment, so it cannot reach the
    // audience even if the audience is wrong. The unsubscribe line is written
    // inert, because the transactional API does not resolve the merge tag a
    // real broadcast carries and would post the raw braces to the inbox.
    const result = await sendDirectEmail({
      to: recipient,
      subject: input.subject,
      preview: input.previewText.trim() || input.subject,
      title: input.subject,
      bodyHtml: renderBroadcastBodyHtml(input.bodyHtml),
      bodyTextLines: htmlToPlainText(input.bodyHtml).split("\n"),
      footerNote: `${getEmailSender(senderKey).footerNote} ${unsubscribeFooterText("test")}`,
      idempotencyKey: `broadcast-test:${input.broadcastId ?? "unsaved"}:${recipient}:${Date.now()}`,
      sender: senderKey,
    });

    logEmailResult(`broadcast_test:${recipient}`, result);

    if ("ok" in result && result.ok) {
      return { ok: true as const, recipient };
    }
    if ("skipped" in result) {
      return failure("Email delivery is not configured in this environment.");
    }
    return failure(result.error);
  } catch (error) {
    return handleAccessError(error);
  }
}

export async function dispatchBroadcast(broadcastId: string) {
  try {
    const row = await loadSendRow(broadcastId);
    if (!row) return failure("Broadcast not found.");

    // Authorized against the identity stored on the row, not one supplied by
    // the caller, so a draft cannot be re-pointed at a restricted sender by
    // whoever presses send.
    const { context } = await authorize(row.senderKey);

    const result = await sendBroadcast(
      broadcastId,
      context.userId,
      createSendDeps()
    );

    if (!result.ok) {
      return failure(result.message);
    }

    if (result.outcome === "dispatched") {
      await recordAdminAuditEvent({
        action: "broadcast_sent",
        targetTable: "broadcasts",
        targetId: broadcastId,
        metadata: {
          sender_key: row.senderKey,
          audience_key: row.audienceKey,
          recipient_count: result.recipientCount,
          resend_broadcast_id: result.resendBroadcastId,
        },
        context,
      });
    }

    revalidatePath("/admin/communications");
    revalidatePath(`/admin/communications/${broadcastId}`);

    return {
      ok: true as const,
      outcome: result.outcome,
      status: result.status,
      recipientCount: result.recipientCount,
      broadcastId,
    };
  } catch (error) {
    return handleAccessError(error);
  }
}

/**
 * Live count for the audience currently chosen in the composer. Standing
 * audiences are counted on the server; a hand-picked list is counted against
 * the ids that are actually ticked, so somebody who has become ineligible
 * since the page loaded stops being counted.
 */
export async function refreshAudienceCount(
  audienceKey: string,
  selectedProfileIds: string[] = []
) {
  try {
    await requireCapability("communications.manage");
    if (!isAudienceKey(audienceKey)) return failure("Unknown audience.");

    const count = await countAudience(
      audienceKey,
      selectedProfileIds.slice(0, MAX_SELECTED_RECIPIENTS)
    );
    return { ok: true as const, count };
  } catch (error) {
    return handleAccessError(error);
  }
}
