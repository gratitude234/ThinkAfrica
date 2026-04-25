export type ActivationEventName =
  | "signup_completed"
  | "onboarding_started"
  | "onboarding_completed"
  | "onboarding_step_completed"
  | "interest_selected"
  | "writer_followed"
  | "post_opened"
  | "search_performed"
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
  | "landing_signup_clicked";

interface ActivationEventPayload {
  event: ActivationEventName;
  metadata?: Record<string, string | number | boolean | null>;
  source?: string;
  route?: string;
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

  const body = JSON.stringify({
    source: "client",
    route: `${window.location.pathname}${window.location.search}`,
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
