import "server-only";

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { absoluteUrl } from "@/lib/email";

export type PushPreferenceKey =
  | "push_published"
  | "push_messages"
  | "push_comments"
  | "push_likes"
  | "push_follows"
  | "push_daily_brief";

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

  if (input.cooldownMs && sent > 0) {
    await admin
      .from("profiles")
      .update({ last_engagement_push_notified_at: new Date().toISOString() })
      .eq("id", input.recipientId);
  }

  return { ok: true, sent };
}

type DailyBriefRecipientRow = {
  id: string;
  notification_prefs: unknown;
  push_subscriptions: { count: number }[] | { count: number } | null;
};

/**
 * Every profile with push_daily_brief not explicitly disabled (opt-out by
 * absence, same convention as preferenceEnabled()) and at least one live
 * push subscription. Paginated in batches of 1000, same shape as
 * getDigestRecipientIds() in admin/digest/actions.ts. Requires an admin
 * client — RLS on push_subscriptions restricts users to their own rows.
 */
export async function getDailyBriefPushRecipients(
  admin: ReturnType<typeof createAdminClient>
): Promise<string[]> {
  const recipientIds: string[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, notification_prefs, push_subscriptions(count)")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as DailyBriefRecipientRow[];
    recipientIds.push(
      ...rows
        .filter((profile) => {
          const prefs = isRecord(profile.notification_prefs) ? profile.notification_prefs : {};
          if (!preferenceEnabled(prefs, "push_daily_brief")) return false;
          const subscriptionCount = Array.isArray(profile.push_subscriptions)
            ? (profile.push_subscriptions[0]?.count ?? 0)
            : (profile.push_subscriptions?.count ?? 0);
          return subscriptionCount > 0;
        })
        .map((profile) => profile.id)
    );

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return recipientIds;
}

const DEFAULT_BROADCAST_BATCH_SIZE = 25;
const DEFAULT_BROADCAST_BATCH_DELAY_MS = 250;

type BroadcastPushInput = {
  recipientIds: string[];
  title: string;
  body: string;
  path?: string;
  preferenceKey?: PushPreferenceKey;
  batchSize?: number;
  batchDelayMs?: number;
};

export type BroadcastPushResult = {
  total: number;
  sent: number;
  skipped: number;
  failed: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends the same payload to many recipients, in small concurrent batches
 * with a delay between batches, so a broadcast doesn't fire thousands of
 * web-push calls at once. Reuses sendPushNotification() per recipient so
 * the preference check and 404/410 subscription cleanup stay in one place.
 */
export async function broadcastPushNotification(
  input: BroadcastPushInput
): Promise<BroadcastPushResult> {
  const batchSize = input.batchSize ?? DEFAULT_BROADCAST_BATCH_SIZE;
  const batchDelayMs = input.batchDelayMs ?? DEFAULT_BROADCAST_BATCH_DELAY_MS;

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < input.recipientIds.length; i += batchSize) {
    const batch = input.recipientIds.slice(i, i + batchSize);

    const results = await Promise.all(
      batch.map((recipientId) =>
        sendPushNotification({
          recipientId,
          title: input.title,
          body: input.body,
          path: input.path,
          preferenceKey: input.preferenceKey,
        })
      )
    );

    results.forEach((result, index) => {
      logPushResult(`daily_brief:${batch[index]}`, result);
      if ("ok" in result && result.ok) {
        // sent === 0 means subscriptions existed but every delivery attempt
        // failed — not a success (logPushResult already logs this case).
        if (result.sent > 0) sent += 1;
        else failed += 1;
      } else if ("skipped" in result) {
        skipped += 1;
      } else {
        failed += 1;
      }
    });

    if (i + batchSize < input.recipientIds.length) {
      await sleep(batchDelayMs);
    }
  }

  return { total: input.recipientIds.length, sent, skipped, failed };
}

export function logPushResult(context: string, result: PushSendResult) {
  if ("ok" in result && result.ok) {
    // Reaching here means subscriptions existed (the "no_push_subscription"
    // skip already returned above) — sent === 0 means every send attempt
    // failed, not that there was nothing to send to.
    if (result.sent === 0) {
      console.error(`Push send failed for all subscriptions for ${context}`);
    }
    return;
  }
  if ("skipped" in result) {
    console.info(`Push skipped for ${context}: ${result.reason}`);
    return;
  }
  console.error(`Push failed for ${context}: ${result.error}`);
}
