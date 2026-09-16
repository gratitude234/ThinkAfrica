/** Events emitted by live actions in the focused publishing product. */
export type ActivationEventName =
  // Signup and onboarding.
  | "signup_completed"
  | "onboarding_started"
  | "onboarding_completed"
  | "onboarding_step_completed"
  | "interest_selected"
  // The publishing loop: open Home, read, write, publish, comment, follow, search.
  | "home_viewed"
  | "post_opened"
  | "post_submitted"
  | "comment_submitted"
  | "writer_followed"
  | "search_performed"
  // Explore.
  | "discover_viewed"
  | "discover_tab_changed"
  | "discover_item_clicked"
  // Notifications, and the call to action on a notification or a published toast.
  | "notification_opened"
  // The signed-out landing page.
  | "landing_viewed"
  | "landing_read_clicked"
  | "landing_signup_clicked"
  // The public profile funnel (lib/profileFunnel.ts).
  | "profile_viewed"
  | "profile_work_opened"
  | "profile_follow_completed"
  // One section of Edit profile saved (app/(main)/settings/profile/useSectionSave.ts).
  | "profile_section_saved"
  // Push delivery on this device, from Settings.
  | "push_permission_resolved"
  | "push_device_operation";

interface ActivationEventPayload {
  event: ActivationEventName;
  metadata?: Record<string, string | number | boolean | null>;
  source?: string;
  route?: string;
}

const VIEW_EVENT_DEDUPE_MS = 10 * 60 * 1000;
const VIEW_EVENTS = new Set<ActivationEventName>([
  "profile_viewed",
  "post_opened",
  "discover_viewed",
  "home_viewed",
  "landing_viewed",
]);

function hashActivationKey(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function shouldSkipDuplicateViewEvent(
  payload: ActivationEventPayload,
  route: string
) {
  if (!VIEW_EVENTS.has(payload.event)) return false;

  try {
    const keySuffix = hashActivationKey(
      JSON.stringify({
        event: payload.event,
        route,
        metadata: payload.metadata ?? {},
      })
    );
    const storageKey = `indegenius:activation:${keySuffix}`;
    const legacyStorageKey = `thinkafrica:activation:${keySuffix}`;
    const now = Date.now();
    // Dual-read: check the new key first, then fall back to the pre-rebrand
    // key so an in-flight session's dedupe window isn't silently reset.
    const previous = Number(
      window.sessionStorage.getItem(storageKey) ??
        window.sessionStorage.getItem(legacyStorageKey) ??
        0
    );

    if (previous && now - previous < VIEW_EVENT_DEDUPE_MS) {
      return true;
    }

    window.sessionStorage.setItem(storageKey, String(now));
  } catch {
    return false;
  }

  return false;
}

export function logActivationEvent(
  event: ActivationEventName,
  metadata: Record<string, string | number | boolean | null> = {}
) {
  console.info("[activation]", {
    event,
    metadata,
    at: new Date().toISOString(),
  });
}

export function trackActivationEvent(payload: ActivationEventPayload) {
  if (typeof window === "undefined") return;

  const route =
    payload.route ?? `${window.location.pathname}${window.location.search}`;

  if (shouldSkipDuplicateViewEvent(payload, route)) return;

  const body = JSON.stringify({
    source: "client",
    route,
    ...payload,
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/activation", new Blob([body], { type: "application/json" }));
    return;
  }

  void fetch("/api/activation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  });
}
