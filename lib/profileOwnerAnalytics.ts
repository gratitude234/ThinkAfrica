import { trackActivationEvent } from "@/lib/activationEvents";
import type { ProfileSectionKey } from "@/lib/profileCommandCenter";
import type { ProfileActionKey } from "@/lib/profileNextAction";

/**
 * Owner-experience analytics for the Profile Command Center.
 *
 * Same pipeline as the Phase 1 conversion funnel: `trackActivationEvent` to
 * `/api/activation`, same server allowlist, same authenticated-caller
 * boundary. What is different is the subject. Phase 1 measures whether a
 * visitor converts; this measures whether an owner can find and finish the
 * work of describing themselves.
 *
 * Payloads carry keys and states only. Never a name, a biography, a
 * positioning statement, a research description, an opportunity description,
 * an email, or the text of a feature note. The point of measuring a save is
 * to learn that a section was completed, not what it now says.
 */
export type ProfileOwnerSurface = "command_center" | "dashboard" | "public_profile";

export interface SectionSavedPayload {
  section: ProfileSectionKey;
  /** Whether persistence succeeded. Failures are as informative as successes. */
  outcome: "success" | "failure";
  profileId: string;
}

export function trackCommandCenterViewed(payload: {
  profileId: string;
  section: ProfileSectionKey;
}) {
  trackActivationEvent({
    event: "profile_command_center_viewed",
    source: "command_center",
    metadata: { profileId: payload.profileId, section: payload.section },
  });
}

/**
 * Called after the server confirms the write, never on submit. A section that
 * failed to save is not a section the owner completed.
 */
export function trackSectionSaved(payload: SectionSavedPayload) {
  trackActivationEvent({
    event: "profile_section_saved",
    source: "command_center",
    metadata: {
      profileId: payload.profileId,
      section: payload.section,
      outcome: payload.outcome,
    },
  });
}

export function trackPreviewOpened(payload: {
  profileId: string;
  surface: "desktop_rail" | "mobile_sheet";
  hasUnsavedChanges: boolean;
}) {
  trackActivationEvent({
    event: "profile_preview_opened",
    source: "command_center",
    metadata: {
      profileId: payload.profileId,
      surface: payload.surface,
      hasUnsavedChanges: payload.hasUnsavedChanges,
    },
  });
}

export function trackNextActionClicked(payload: {
  profileId: string;
  actionKey: ProfileActionKey;
  surface: ProfileOwnerSurface;
  /** Primary or one of the two secondary suggestions. */
  rank: "primary" | "secondary";
}) {
  trackActivationEvent({
    event: "profile_next_action_clicked",
    source: payload.surface,
    metadata: {
      profileId: payload.profileId,
      actionKey: payload.actionKey,
      surface: payload.surface,
      rank: payload.rank,
    },
  });
}

/**
 * How many of the saved selections carry an explanation, not what any of them
 * says. The count answers whether the feature is used; the text is the
 * author's.
 */
export function trackFeatureNoteSaved(payload: {
  profileId: string;
  selectionCount: number;
  noteCount: number;
}) {
  trackActivationEvent({
    event: "profile_feature_note_saved",
    source: "command_center",
    metadata: {
      profileId: payload.profileId,
      selectionCount: payload.selectionCount,
      noteCount: payload.noteCount,
    },
  });
}
