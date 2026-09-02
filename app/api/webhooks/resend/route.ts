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
 * On idempotency: Resend retries a webhook until it gets a 2xx, so the same
 * event arrives more than once as a matter of course. Nothing here counts
 * anything; record_broadcast_delivery_event writes the event first and moves
 * the aggregate only when that write was genuinely new. A replay is a no-op
 * that still answers 200, because answering anything else asks for another.
 *
 * Events to subscribe in the Resend dashboard:
 *   email.delivered, email.bounced, email.complained, email.failed,
 *   email.suppressed, contact.updated
 * email.sent is not needed: it says Resend accepted the message, which is
 * what our own dispatch already recorded.
 */

const DELIVERED_EVENTS = new Set(["email.delivered"]);
const FAILED_EVENTS = new Set([
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
]);

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

  const broadcastId = readString(data, "broadcast_id");
  const emailId = readString(data, "email_id");

  // Events with no broadcast_id are transactional email, which this endpoint
  // has no counters for.
  if (!broadcastId || !emailId) {
    return NextResponse.json({ ok: true, ignored: "not_a_broadcast" });
  }

  const delivered = DELIVERED_EVENTS.has(event.type) ? 1 : 0;
  const failed = FAILED_EVENTS.has(event.type) ? 1 : 0;

  if (delivered === 0 && failed === 0) {
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  const { data: counted, error } = await admin.rpc(
    "record_broadcast_delivery_event",
    {
      p_resend_broadcast_id: broadcastId,
      p_email_id: emailId,
      p_event_type: event.type,
      p_delivered: delivered,
      p_failed: failed,
    }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, type: event.type, counted: counted === true });
}
