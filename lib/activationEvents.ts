export type ActivationEventName =
  | "signup_completed"
  | "onboarding_started"
  | "onboarding_completed"
  | "onboarding_step_completed"
  | "interest_selected"
  | "writer_followed"
  | "post_opened"
  | "search_performed"
  | "discover_viewed"
  | "discover_tab_changed"
  | "discover_item_clicked"
  | "draft_started"
  | "publish_drawer_opened"
  | "post_submitted"
  | "debate_joined"
  | "home_viewed"
  | "dashboard_viewed"
  | "next_action_clicked"
  | "notification_opened"
  | "weekly_digest_previewed"
  | "quality_check_viewed"
  | "quality_check_completed"
  | "reference_added"
  | "comment_submitted"
  | "response_started"
  | "landing_viewed"
  | "landing_read_clicked"
  | "landing_signup_clicked"
  | "opportunity_profile_viewed"
  | "opportunity_profile_updated"
  | "opportunity_readiness_viewed"
  | "opportunity_filter_used"
  | "opportunity_inquiry_started"
  | "opportunity_inquiry_submitted"
  | "opportunity_inquiry_status_updated"
  | "opportunity_listing_opened"
  | "opportunity_apply_started"
  | "opportunity_apply_submitted"
  | "opportunity_saved"
  | "opportunity_unsaved"
  | "opportunity_profile_setup_cta_clicked"
  | "fellowship_opened"
  | "fellowship_application_submitted"
  | "collaboration_panel_viewed"
  | "collaboration_cta_clicked"
  | "coauthor_search_performed"
  | "coauthor_invite_sent"
  | "coauthor_invite_accepted"
  | "coauthor_invite_declined"
  | "message_started"
  | "message_sent"
  | "response_thread_opened"
  | "push_nudge_shown"
  | "push_nudge_action"
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
  "post_opened",
  "discover_viewed",
  "home_viewed",
  "dashboard_viewed",
  "landing_viewed",
  "opportunity_profile_viewed",
  "opportunity_readiness_viewed",
  "opportunity_listing_opened",
  "fellowship_opened",
  "collaboration_panel_viewed",
  "response_thread_opened",
  "weekly_digest_previewed",
  "quality_check_viewed",
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
