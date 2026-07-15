import { createClient } from "@/lib/supabase/client";
import type { PushPermissionState } from "@/lib/pushPromptPolicy";

const PUSH_OPERATION_TIMEOUT_MS = 10_000;

export type PushOperationErrorCode =
  | "unsupported"
  | "missing_vapid_key"
  | "permission_not_granted"
  | "service_worker_timeout"
  | "subscription_failed"
  | "persistence_failed"
  | "unsubscribe_failed"
  | "database_cleanup_failed";

export type PushDeviceState =
  | { supported: false; permission: "unsupported"; subscription: null; errorCode: null }
  | {
      supported: true;
      permission: PushPermissionState;
      subscription: PushSubscription | null;
      errorCode: PushOperationErrorCode | null;
    };

export type PushSubscribeResult =
  | { ok: true; subscription: PushSubscription; endpoint: string; created: boolean }
  | { ok: false; code: PushOperationErrorCode };

export type PushUnsubscribeResult =
  | { ok: true; endpoint: string | null }
  | { ok: false; code: PushOperationErrorCode; localUnsubscribed: boolean };

const PUSH_ERROR_MESSAGES: Record<PushOperationErrorCode, string> = {
  unsupported: "This browser does not support push notifications.",
  missing_vapid_key: "Push notifications are not configured right now.",
  permission_not_granted: "Notification permission has not been granted.",
  service_worker_timeout: "Notification setup is taking too long. Please try again.",
  subscription_failed: "This device could not be subscribed. Please try again.",
  persistence_failed: "The device subscribed, but we could not save it. Please try again.",
  unsubscribe_failed: "This device could not be disabled. Please try again.",
  database_cleanup_failed: "Notifications are off on this device, but cleanup is still pending.",
};

export function getPushOperationErrorMessage(code: PushOperationErrorCode) {
  return PUSH_ERROR_MESSAGES[code];
}

class PushClientError extends Error {
  constructor(readonly code: PushOperationErrorCode) {
    super(code);
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function withTimeout<T>(promise: Promise<T>, code: PushOperationErrorCode): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new PushClientError(code)),
      PUSH_OPERATION_TIMEOUT_MS
    );
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function errorCode(error: unknown, fallback: PushOperationErrorCode) {
  return error instanceof PushClientError ? error.code : fallback;
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function getReadyRegistration() {
  return withTimeout(
    navigator.serviceWorker.ready,
    "service_worker_timeout"
  );
}

export async function getCurrentPushDeviceState(): Promise<PushDeviceState> {
  if (!isPushSupported()) {
    return { supported: false, permission: "unsupported", subscription: null, errorCode: null };
  }

  const permission = Notification.permission;
  try {
    const registration = await getReadyRegistration();
    const subscription = await withTimeout(
      registration.pushManager.getSubscription(),
      "service_worker_timeout"
    );
    return { supported: true, permission, subscription, errorCode: null };
  } catch (error) {
    return {
      supported: true,
      permission,
      subscription: null,
      errorCode: errorCode(error, "subscription_failed"),
    };
  }
}

export async function requestPushPermission(): Promise<PushPermissionState> {
  if (!isPushSupported()) return "denied";
  return Notification.requestPermission();
}

export async function subscribeCurrentDevice(userId: string): Promise<PushSubscribeResult> {
  if (!isPushSupported()) return { ok: false, code: "unsupported" };
  if (Notification.permission !== "granted") {
    return { ok: false, code: "permission_not_granted" };
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return { ok: false, code: "missing_vapid_key" };

  try {
    const registration = await getReadyRegistration();
    let subscription = await withTimeout(
      registration.pushManager.getSubscription(),
      "service_worker_timeout"
    );
    const created = !subscription;
    if (!subscription) {
      subscription = await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }),
        "service_worker_timeout"
      );
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, code: "subscription_failed" };
    }

    const supabase = createClient();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: "endpoint" }
    );

    if (error) return { ok: false, code: "persistence_failed" };
    return { ok: true, subscription, endpoint: json.endpoint, created };
  } catch (error) {
    return { ok: false, code: errorCode(error, "subscription_failed") };
  }
}

export async function unsubscribeCurrentDevice(userId: string): Promise<PushUnsubscribeResult> {
  if (!isPushSupported()) {
    return { ok: false, code: "unsupported", localUnsubscribed: false };
  }

  try {
    const registration = await getReadyRegistration();
    const subscription = await withTimeout(
      registration.pushManager.getSubscription(),
      "service_worker_timeout"
    );
    if (!subscription) return { ok: true, endpoint: null };

    const endpoint = subscription.endpoint;
    const unsubscribed = await withTimeout(
      subscription.unsubscribe(),
      "service_worker_timeout"
    );
    if (!unsubscribed) {
      return { ok: false, code: "unsubscribe_failed", localUnsubscribed: false };
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint);

    if (error) {
      return { ok: false, code: "database_cleanup_failed", localUnsubscribed: true };
    }
    return { ok: true, endpoint };
  } catch (error) {
    return {
      ok: false,
      code: errorCode(error, "unsubscribe_failed"),
      localUnsubscribed: false,
    };
  }
}

// Compatibility wrapper for callers outside the nudge/settings surfaces.
export async function subscribeToPush(userId: string): Promise<boolean> {
  return (await subscribeCurrentDevice(userId)).ok;
}
