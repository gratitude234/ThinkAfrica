import { createClient } from "@/lib/supabase/client";
import { PUSH_PROMPT_TERMINAL_COUNT } from "@/lib/pushPromptPolicy";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function subscribeToPush(userId: string): Promise<boolean> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

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

  return !error;
}

export async function markPushPromptShown(userId: string) {
  const supabase = createClient();
  await supabase
    .from("profiles")
    .update({ push_prompt_shown_at: new Date().toISOString() })
    .eq("id", userId)
    .is("push_prompt_shown_at", null);
}

// Home-page retry banner only (see lib/pushPromptPolicy.ts) — distinct from
// markPushPromptShown, which is onboarding's separate one-shot stamp.
export async function recordPushPromptDismissed(userId: string, nextAttemptCount: number) {
  const supabase = createClient();
  await supabase
    .from("profiles")
    .update({
      push_prompt_attempt_count: nextAttemptCount,
      push_prompt_last_shown_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

export async function recordPushPromptTerminal(userId: string) {
  const supabase = createClient();
  await supabase
    .from("profiles")
    .update({ push_prompt_attempt_count: PUSH_PROMPT_TERMINAL_COUNT })
    .eq("id", userId);
}
