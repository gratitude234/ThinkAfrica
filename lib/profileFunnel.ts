import {
  trackActivationEvent,
  type ActivationEventName,
} from "@/lib/activationEvents";

/**
 * The profile conversion funnel.
 *
 * profile view -> work opened -> follow completed or opportunity inquiry
 * submitted. It rides the existing activation-event pipeline rather than a
 * third-party analytics dependency: same POST to /api/activation, same
 * server-side allowlist, same authenticated-caller trust boundary.
 *
 * Payloads carry identifiers and state only. No display name, no email, no
 * biography, no positioning statement, nothing an author wrote.
 */
export const PROFILE_FUNNEL_EVENTS = [
  "profile_viewed",
  "profile_work_opened",
  "profile_follow_completed",
  "profile_inquiry_opened",
  "profile_inquiry_submitted",
  // Phase 3: recognition and briefs are new places the same funnel starts.
  "profile_recognition_opened",
  "profile_recognition_source_opened",
  "profile_expertise_topic_opened",
  "profile_brief_viewed",
  "profile_brief_work_opened",
  "profile_brief_contact_started",
] as const;

export type ProfileFunnelEvent = (typeof PROFILE_FUNNEL_EVENTS)[number];

/**
 * Where on the profile the action happened. Kept to the surfaces that can
 * actually start or advance the funnel, so a value is always answerable from
 * the page rather than guessed.
 */
export const PROFILE_FUNNEL_SURFACES = [
  "profile_header",
  "featured_work",
  "latest_record",
  "full_record",
  "sticky_bar",
  "recognition",
  "demonstrated_expertise",
  "profile_brief",
] as const;

export type ProfileFunnelSurface = (typeof PROFILE_FUNNEL_SURFACES)[number];

/**
 * Three states, because the funnel means something different in each: an owner
 * looking at their own page is not a visit, and an anonymous reader cannot
 * complete a follow without signing in first.
 */
export type ProfileViewerState = "anonymous" | "authenticated" | "owner";

/** The kinds of entry a reader can open from a profile. */
export type ProfileWorkKind = "publication" | "response" | "research" | "debate";

export function getProfileViewerState({
  viewerId,
  profileId,
}: {
  viewerId: string | null | undefined;
  profileId: string;
}): ProfileViewerState {
  if (!viewerId) return "anonymous";
  return viewerId === profileId ? "owner" : "authenticated";
}

export interface ProfileFunnelPayload {
  event: ProfileFunnelEvent;
  profileId: string;
  viewerState: ProfileViewerState;
  surface?: ProfileFunnelSurface;
  workId?: string | null;
  workKind?: ProfileWorkKind | null;
}

export interface ProfileFunnelMetadata {
  profileId: string;
  viewerState: ProfileViewerState;
  surface?: ProfileFunnelSurface;
  workId?: string;
  workKind?: ProfileWorkKind;
}

/**
 * Builds the metadata for one funnel event. Split out from the transport so
 * the property contract is testable without a DOM, and so an absent optional
 * property is simply absent rather than a null taking up room in the row.
 *
 * `created_at` on activation_events is the timestamp; nothing here duplicates
 * it.
 */
export function buildProfileFunnelMetadata(
  payload: ProfileFunnelPayload
): ProfileFunnelMetadata {
  const metadata: ProfileFunnelMetadata = {
    profileId: payload.profileId,
    viewerState: payload.viewerState,
  };
  if (payload.surface) metadata.surface = payload.surface;
  if (payload.workId) metadata.workId = payload.workId;
  if (payload.workKind) metadata.workKind = payload.workKind;
  return metadata;
}

export function trackProfileFunnelEvent(payload: ProfileFunnelPayload) {
  trackActivationEvent({
    event: payload.event satisfies ActivationEventName,
    source: payload.surface,
    metadata: { ...buildProfileFunnelMetadata(payload) },
  });
}
