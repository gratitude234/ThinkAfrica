import { describeNotificationType } from "./notificationCatalog";

/**
 * In-app notification preferences.
 *
 * Settings had 18 email toggles and 10 push toggles and nothing at all for the
 * inbox itself, so a reader buried in likes could silence the email and the push
 * but not the thing they actually look at.
 *
 * Two deliberate constraints:
 *
 * 1. Only *non-actionable* types can be muted. You can turn down likes, follows,
 *    and collaboration replies, but never something that asks you
 *    to act and never a moderation or account notice. `assertMutableTypes()`
 *    holds the line in the test suite.
 *
 * 2. Groups, not one switch per type. There are 34 notification types; a settings
 *    page with 34 toggles is not a preference, it is a chore.
 *
 * Muting filters the inbox at read time rather than suppressing the write. Nothing
 * is lost: turning a group back on brings its history back, because the rows were
 * always there. It also means one filter covers both surfaces instead of thirteen
 * insert call sites and a handful of SQL triggers needing to agree.
 */
export interface InAppNotificationPrefs {
  inapp_likes: boolean;
  inapp_comments: boolean;
  inapp_follows: boolean;
  /** LEGACY COMPATIBILITY — existing co-authored publications. Still stored in
   *  notification_prefs, but no setting offers it: nothing it muted is sent. */
  inapp_collaboration: boolean;
}

export interface InAppPrefGroup {
  key: keyof InAppNotificationPrefs;
  label: string;
  description: string;
  types: string[];
}

export const IN_APP_PREF_GROUPS: InAppPrefGroup[] = [
  {
    key: "inapp_likes",
    label: "Likes",
    description: "When someone likes your work",
    types: ["like"],
  },
  {
    key: "inapp_comments",
    label: "Comments and replies",
    description: "When someone comments on your work or replies to your comment",
    types: ["comment"],
  },
  {
    key: "inapp_follows",
    label: "Followers",
    description: "When someone follows you",
    // author_subscribed is retired; its existing rows read as follows.
    types: ["follow", "author_subscribed"],
  },
];

export const IN_APP_PREF_DEFAULTS: InAppNotificationPrefs = {
  inapp_likes: true,
  inapp_comments: true,
  inapp_follows: true,
  inapp_collaboration: true,
};

/**
 * Throws if any group contains a type that asks something of the reader. Called
 * from the test suite rather than at runtime — the point is to fail the build, not
 * the request.
 */
export function assertMutableTypes(): void {
  for (const group of IN_APP_PREF_GROUPS) {
    for (const type of group.types) {
      const descriptor = describeNotificationType(type);
      if (descriptor.actionable) {
        throw new Error(
          `${group.key} would mute "${type}", which is actionable. Actionable ` +
            `notifications must always reach the inbox.`
        );
      }
    }
  }
}

/**
 * The notification types this reader has switched off.
 *
 * Anything absent from the stored preferences counts as on, so a reader who has
 * never opened Settings — and every notification type added after this shipped —
 * keeps being delivered by default.
 */
export function mutedNotificationTypes(prefs: unknown): string[] {
  const stored =
    prefs && typeof prefs === "object" ? (prefs as Record<string, unknown>) : {};

  return IN_APP_PREF_GROUPS.flatMap((group) =>
    stored[group.key] === false ? group.types : []
  );
}
