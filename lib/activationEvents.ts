export type ActivationEventName =
  | "signup_completed"
  | "onboarding_started"
  | "onboarding_completed"
  | "interest_selected"
  | "writer_followed"
  | "draft_started"
  | "post_submitted"
  | "debate_joined";

interface ActivationEventPayload {
  event: ActivationEventName;
  metadata?: Record<string, string | number | boolean | null>;
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

  const body = JSON.stringify(payload);

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
