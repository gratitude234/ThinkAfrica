"use server";

import { getCurrentUser } from "@/lib/serverAuth";
import { createClient } from "@/lib/supabase/server";

/**
 * The push-subscription rows, written on the server.
 *
 * `lib/pushClient.ts` does two things that look alike and are not. Registering
 * a service worker and asking the browser for a `PushSubscription` is a
 * browser capability and stays there. Recording the resulting endpoint against
 * a member is a database write, and it was being made from the browser against
 * a `userId` the component passed in.
 *
 * Only the second half moves. The subscription object is produced in the
 * browser, its serialisable fields are handed here, and the row is written
 * against the session's viewer. A caller can no longer register a device
 * against somebody else's account.
 *
 * The endpoint is chosen by the browser's push service, so it is data rather
 * than authority: it says which device, never which person.
 */

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
}

export type PushPersistResult =
  | { ok: true }
  | { ok: false; reason: "unauthorized" | "persistence_failed" };

export async function persistPushSubscription(
  keys: PushSubscriptionKeys
): Promise<PushPersistResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "unauthorized" };

  if (!keys.endpoint || !keys.p256dh || !keys.auth) {
    return { ok: false, reason: "persistence_failed" };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: keys.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: keys.userAgent,
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      console.error("[push] subscription upsert failed", error);
      return { ok: false, reason: "persistence_failed" };
    }
    return { ok: true };
  } catch (error) {
    console.error("[push] subscription upsert threw", error);
    return { ok: false, reason: "persistence_failed" };
  }
}

export type PushForgetResult =
  | { ok: true }
  | { ok: false; reason: "unauthorized" | "database_cleanup_failed" };

/**
 * Removes this device's row.
 *
 * Scoped to the viewer as well as the endpoint. The endpoint alone would be
 * enough to find the row, and that is exactly why it is not enough to delete
 * it: an endpoint is not proof of who owns it.
 */
export async function forgetPushSubscription(
  endpoint: string
): Promise<PushForgetResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "unauthorized" };

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", endpoint);

    if (error) {
      console.error("[push] subscription delete failed", error);
      return { ok: false, reason: "database_cleanup_failed" };
    }
    return { ok: true };
  } catch (error) {
    console.error("[push] subscription delete threw", error);
    return { ok: false, reason: "database_cleanup_failed" };
  }
}
