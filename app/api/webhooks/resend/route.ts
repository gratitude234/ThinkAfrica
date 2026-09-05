import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/resendClient";

/**
 * Delivery reporting and opt-out mirroring for broadcasts.
 *
 * Two jobs, both of which only Resend can tell us about:
 *
 *   1. Delivery. Resend has no aggregate counter to poll; it reports each
 *      message separately, and only the webhook payload carries the
 *      broadcast_id that ties a delivery back to a record of ours.
 *
 *   2. Unsubscribes. Resend owns the unsubscribe link in every broadcast, so
 *      it learns about an opt-out before we do. Hearing it here rather than
 *      waiting for the nightly sync is what closes the window in which a sync
 *      could put somebody back into the segment they just left.
 *
 *   3. Deliverability. email.suppressed says the provider declined to attempt
 *      this address at all. That is recorded against the contact so future
 *      audiences stop including them, and it never touches their preferences.
 *
 * On idempotency: Resend retries a webhook until it gets a 2xx, so the same
 * event arrives more than once as a matter of course. Nothing here counts
 * anything; record_broadcast_delivery_outcome writes the event first and moves
 * the aggregate only when that write was genuinely new, and at most one event
 * per message ever counts, so a message cannot land in two buckets. A replay
 * is a no-op that still answers 200, because anything else asks for another.
 *
 * Events to subscribe in the Resend dashboard:
 *   email.delivered, email.bounced, email.complained, email.failed,
 *   email.suppressed, contact.updated
 * email.sent is not needed: it says Resend accepted the message, which is
 * what our own dispatch already recorded.
 */

/**
 * Three mutually exclusive outcomes, and suppression is its own.
 *
 * Resend suppresses a send because the destination is already on its
 * suppression list, so nothing was attempted and nothing bounced. Counting it
 * as a failure told the first production broadcast's readers that 24 messages
 * had failed to deliver, which sends somebody looking for a delivery problem
 * that does not exist, and it also stopped the campaign ever completing: 222
 * delivered plus 0 failed never reaches 253.
 */
const EVENT_OUTCOMES: Record<string, "delivered" | "suppressed" | "failed"> = {
  "email.delivered": "delivered",
  "email.suppressed": "suppressed",
  "email.bounced": "failed",
  "email.complained": "failed",
  "email.failed": "failed",
};

/**
 * The suppression payload is `data.suppressed: { message, type }` alongside the
 * ordinary email event fields, with the address in `data.to`. Read off the
 * installed SDK's EmailSuppressedEvent rather than guessed at.
 */
function readSuppressionReason(data: Record<string, unknown>) {
  const suppressed = data.suppressed;
  if (!isRecord(suppressed)) return "Suppressed by the mail provider.";
  const type = readString(suppressed, "type");
  const message = readString(suppressed, "message");
  return [type, message].filter(Boolean).join(": ") || "Suppressed by the mail provider.";
}

/** `to` is an array on every email event. A broadcast message has one. */
function readRecipient(data: Record<string, unknown>) {
  const to = data.to;
  if (Array.isArray(to)) {
    const first = to.find((value) => typeof value === "string" && value.length > 0);
    return typeof first === "string" ? first : null;
  }
  return typeof to === "string" && to.length > 0 ? to : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(source: Record<string, unknown>, key: string) {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook secret is not configured." },
      { status: 503 }
    );
  }

  const resend = getResendClient();
  if (!resend) {
    return NextResponse.json(
      { error: "Resend is not configured." },
      { status: 503 }
    );
  }

  const payload = await request.text();

  // Resend signs with Svix, and the SDK wants the three header values by name
  // rather than a Headers object. Passing the object itself silently yields
  // three undefined values and fails every signature.
  const signatureHeaders = {
    id: request.headers.get("svix-id") ?? "",
    timestamp: request.headers.get("svix-timestamp") ?? "",
    signature: request.headers.get("svix-signature") ?? "",
  };

  if (
    !signatureHeaders.id ||
    !signatureHeaders.timestamp ||
    !signatureHeaders.signature
  ) {
    return NextResponse.json(
      { error: "Missing signature headers." },
      { status: 401 }
    );
  }

  let event;
  try {
    // Signature verification is the only authentication this endpoint has, so
    // an unverifiable payload is rejected rather than parsed.
    event = resend.webhooks.verify({
      payload,
      headers: signatureHeaders,
      webhookSecret: secret,
    });
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const data: Record<string, unknown> = isRecord(event.data) ? event.data : {};
  const admin = createAdminClient();

  // A contact whose unsubscribed flag has gone true left through the footer of
  // a broadcast. Mirror it now so no sync can undo it.
  if (event.type === "contact.updated" || event.type === "contact.created") {
    const email = readString(data, "email");
    if (!email || data.unsubscribed !== true) {
      return NextResponse.json({ ok: true, ignored: event.type });
    }

    const { error } = await admin.rpc("mirror_broadcast_unsubscribe", {
      p_email: email.trim().toLowerCase(),
      p_resend_contact_id: readString(data, "id"),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, type: event.type });
  }

  const outcome = EVENT_OUTCOMES[event.type];
  if (!outcome) {
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  // A suppression is a fact about the address, not about this one campaign, so
  // it is recorded even when the message was transactional. It says the
  // provider will not deliver here, which is a different thing from the member
  // having opted out: notification_prefs is deliberately not touched, and the
  // sync reads the two separately.
  let suppressionRecorded = false;
  if (outcome === "suppressed") {
    const recipient = readRecipient(data);
    if (recipient) {
      const { data: applied, error: suppressionError } = await admin.rpc(
        "record_broadcast_suppression",
        {
          p_email: recipient.trim().toLowerCase(),
          p_reason: readSuppressionReason(data),
        }
      );

      if (suppressionError) {
        return NextResponse.json(
          { error: suppressionError.message },
          { status: 500 }
        );
      }
      suppressionRecorded = applied === true;
    }
  }

  const broadcastId = readString(data, "broadcast_id");
  const emailId = readString(data, "email_id");

  // Events with no broadcast_id are transactional email, which this endpoint
  // has no counters for.
  if (!broadcastId || !emailId) {
    return NextResponse.json({
      ok: true,
      ignored: "not_a_broadcast",
      suppressionRecorded,
    });
  }

  const { data: counted, error } = await admin.rpc(
    "record_broadcast_delivery_outcome",
    {
      p_resend_broadcast_id: broadcastId,
      p_email_id: emailId,
      p_event_type: event.type,
      p_outcome: outcome,
    }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    type: event.type,
    outcome,
    counted: counted === true,
    suppressionRecorded,
  });
}
