import "server-only";

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { absoluteUrl } from "@/lib/email";

export type PushPreferenceKey =
  | "push_published"
  | "push_messages"
  | "push_comments"
  | "push_likes"
  | "push_follows";

export type PushSendResult =
  | { ok: true; sent: number }
  | { skipped: true; reason: string }
  | { ok: false; error: string };

// Shared cooldown for bursty, many-senders-to-one-recipient events (comments,
// likes, follows) so a recipient can't be buzzed repeatedly within a short
// window regardless of which event type triggered it. Not used by DMs or
// editorial decisions, which are already low-frequency or per-conversation.
export const ENGAGEMENT_PUSH_COOLDOWN_MS = 30 * 60 * 1000;

type PushSendInput = {
  recipientId: string;
  title: string;
  body: string;
  path?: string;
  preferenceKey?: PushPreferenceKey;
  cooldownMs?: number;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function preferenceEnabled(
  prefs: Record<string, unknown>,
  preferenceKey?: PushPreferenceKey
) {
  if (!preferenceKey) return true;
  return prefs[preferenceKey] !== false;
}

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const mailto = process.env.VAPID_MAILTO;

  if (!publicKey || !privateKey || !mailto) return false;

  webpush.setVapidDetails(mailto, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

function isGoneStatus(error: unknown): boolean {
  const statusCode = (error as { statusCode?: number } | null)?.statusCode;
  return statusCode === 404 || statusCode === 410;
}

export async function sendPushNotification(input: PushSendInput): Promise<PushSendResult> {
  if (!ensureVapidConfigured()) {
    return { skipped: true, reason: "missing_vapid_configuration" };
  }

  const admin = createAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("notification_prefs, last_engagement_push_notified_at")
    .eq("id", input.recipientId)
    .maybeSingle();

  if (profileError) {
    return { ok: false, error: profileError.message };
  }

  const prefs = isRecord(profile?.notification_prefs) ? profile.notification_prefs : {};
  if (!preferenceEnabled(prefs, input.preferenceKey)) {
    return { skipped: true, reason: "recipient_preference_disabled" };
  }

  if (input.cooldownMs) {
    const lastNotifiedAt = profile?.last_engagement_push_notified_at as string | null;
    if (lastNotifiedAt) {
      const elapsed = Date.now() - new Date(lastNotifiedAt).getTime();
      if (!Number.isNaN(elapsed) && elapsed < input.cooldownMs) {
        return { skipped: true, reason: "cooldown_active" };
      }
    }
  }

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", input.recipientId)
    .returns<SubscriptionRow[]>();

  if (subscriptionsError) {
    return { ok: false, error: subscriptionsError.message };
  }

  if (!subscriptions || subscriptions.length === 0) {
    return { skipped: true, reason: "no_push_subscription" };
  }

  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.path ? absoluteUrl(input.path) : absoluteUrl("/"),
  });

  let sent = 0;
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload
        );
        sent += 1;
      } catch (error) {
        if (isGoneStatus(error)) {
          await admin.from("push_subscriptions").delete().eq("id", subscription.id);
        } else {
          console.error(
            `Push send failed for subscription ${subscription.id}: ${
              error instanceof Error ? error.message : "Unknown push error"
            }`
          );
        }
      }
    })
  );

  if (input.cooldownMs) {
    await admin
      .from("profiles")
      .update({ last_engagement_push_notified_at: new Date().toISOString() })
      .eq("id", input.recipientId);
  }

  return { ok: true, sent };
}

export function logPushResult(context: string, result: PushSendResult) {
  if ("ok" in result && result.ok) return;
  if ("skipped" in result) {
    console.info(`Push skipped for ${context}: ${result.reason}`);
    return;
  }
  console.error(`Push failed for ${context}: ${result.error}`);
}
