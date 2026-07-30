import {
  describeNotificationType,
  type NotificationIconName,
  type NotificationTone,
} from "@/lib/notificationCatalog";

/**
 * Notification iconography.
 *
 * Replaces the ASCII placeholder glyphs the inbox used to render inside a grey
 * circle -- "<3" for a like, "NEW" for a publication, "+" for a follow, "OK" for
 * three unrelated types. They looked like unstyled placeholder content, several
 * types shared a glyph, and a screen reader announced a like as "less than three".
 *
 * They also only ever appeared *instead of* the actor's avatar, so on any row that
 * had an avatar the notification's type was invisible: a like and a follow from the
 * same person were indistinguishable at a glance. The type is now a badge over the
 * avatar rather than a replacement for it.
 *
 * 24x24 outline paths at strokeWidth 2, matching the nav and bell icons.
 */
const ICON_PATHS: Record<NotificationIconName, string[]> = {
  "arrow-right": ["M14 5l7 7m0 0l-7 7m7-7H3"],
  "badge-check": [
    "M9 12l2 2 4-4",
    "M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  ],
  ban: ["M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"],
  bell: [
    "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  ],
  briefcase: [
    "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  ],
  chat: [
    "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.9 9.9 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  ],
  "check-circle": ["M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"],
  clipboard: [
    "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    "M9 14l2 2 4-4",
  ],
  clock: ["M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"],
  document: [
    "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  ],
  hashtag: ["M7 20l4-16m2 16l4-16M6 9h14M4 15h14"],
  heart: [
    "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  ],
  pencil: [
    "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  ],
  question: [
    "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  ],
  reply: ["M3 10h10a5 5 0 015 5v5M3 10l5-5M3 10l5 5"],
  scale: [
    "M12 3v18",
    "M8 21h8",
    "M4 7h16",
    "M4 7l-2 6h4l-2-6",
    "M20 7l-2 6h4l-2-6",
  ],
  "shield-alert": [
    "M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    "M12 9v2m0 4h.01",
  ],
  star: [
    "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.98 10.1c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.518-4.674z",
  ],
  trophy: [
    "M8 21h8",
    "M12 17v4",
    "M6 4h12v4a6 6 0 01-12 0V4z",
    "M6 6H4a2 2 0 000 4h2",
    "M18 6h2a2 2 0 010 4h-2",
  ],
  "user-plus": [
    "M8 12a4 4 0 100-8 4 4 0 000 8z",
    "M2 20v-1a6 6 0 0112 0v1",
    "M18 8v6",
    "M21 11h-6",
  ],
  users: [
    "M17 20h5v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0zM2 20v-1a6 6 0 0112 0v1H2z",
  ],
  "x-circle": ["M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"],
};

/**
 * Tint per tone. Uses the -100 tints deliberately: unread rows sit on
 * `bg-emerald-50`, and a -50 chip would disappear into that background.
 */
const TONE_CLASSES: Record<NotificationTone, string> = {
  critical: "bg-rose-100 text-rose-700",
  attention: "bg-amber-100 text-amber-700",
  positive: "bg-emerald-100 text-emerald-700",
  neutral: "bg-gray-100 text-gray-600",
};

export function NotificationTypeIcon({
  name,
  className = "h-4 w-4",
}: {
  name: NotificationIconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name].map((path) => (
        <path key={path} strokeLinecap="round" strokeLinejoin="round" d={path} />
      ))}
    </svg>
  );
}

/**
 * The actor's avatar with the notification's type badged onto it. Falls back to a
 * tinted icon chip when there is no avatar to badge.
 *
 * Entirely decorative: the row's text already names the actor and says what
 * happened, so announcing the avatar and the badge would just repeat it. The
 * wrapper is aria-hidden rather than given a redundant label.
 */
export default function NotificationAvatar({
  type,
  avatarUrl,
}: {
  type: string;
  avatarUrl?: string | null;
}) {
  const descriptor = describeNotificationType(type);
  const tone = TONE_CLASSES[descriptor.tone];

  if (!avatarUrl) {
    return (
      <span
        aria-hidden="true"
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${tone}`}
      >
        <NotificationTypeIcon name={descriptor.icon} className="h-4 w-4" />
      </span>
    );
  }

  return (
    <span aria-hidden="true" className="relative block h-8 w-8 flex-shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarUrl}
        alt=""
        className="h-8 w-8 rounded-full object-cover"
      />
      <span
        className={`absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-2 ring-white ${tone}`}
        title={descriptor.label}
      >
        <NotificationTypeIcon name={descriptor.icon} className="h-2.5 w-2.5" />
      </span>
    </span>
  );
}
