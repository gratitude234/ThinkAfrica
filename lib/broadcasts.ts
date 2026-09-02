import {
  EMAIL_SENDER_KEYS,
  getEmailSender,
  type EmailSenderKey,
} from "@/lib/emailSenders";

/**
 * Email broadcasts: the admin-facing model behind Communications.
 *
 * This is the first version deliberately. There is no automation, no drip
 * sequence and no segmentation language here. A broadcast is one message, from
 * one approved identity, to one named audience.
 */

/**
 * "queued" is the window between claiming a draft for sending and Resend
 * accepting it. It is usually milliseconds, but a broadcast can be left there
 * by a crash, so it is a status the list and the pill have to be able to draw.
 */
export type BroadcastStatus =
  | "draft"
  | "queued"
  | "sending"
  | "sent"
  | "failed";

export const BROADCAST_STATUS_META: Record<
  BroadcastStatus,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-600" },
  queued: { label: "Queued", className: "bg-gold-tint text-gold-ink" },
  sending: { label: "Sending", className: "bg-gold-tint text-gold-ink" },
  sent: { label: "Sent", className: "bg-green-tint text-emerald-brand" },
  failed: { label: "Failed", className: "bg-red-50 text-red-700" },
};

/** Statuses whose content is frozen because a send is under way or done. */
export const IN_FLIGHT_BROADCAST_STATUSES: BroadcastStatus[] = [
  "queued",
  "sending",
  "sent",
];

export function isBroadcastEditable(status: BroadcastStatus) {
  return !IN_FLIGHT_BROADCAST_STATUSES.includes(status);
}

export type BroadcastAudienceKey =
  | "all"
  | "active"
  | "authors"
  | "verified"
  | "new"
  | "selected";

export type BroadcastAudience = {
  key: BroadcastAudienceKey;
  label: string;
  description: string;
  /**
   * True when the audience is a standing property of the membership, resolved
   * from broadcast_contacts and backed by a Resend segment the nightly sync
   * maintains. False for the hand-picked list, which belongs to one broadcast.
   */
  isStanding: boolean;
};

/**
 * Every audience is filtered by email eligibility before it is counted, so the
 * number an admin sees is already the number of people who will be written to.
 * There is no override, and no audience that ignores a member's preferences.
 *
 * The counts themselves are not here. They come from broadcast_contacts at
 * request time, because a number baked into source is a number that goes
 * quietly wrong.
 */
export const BROADCAST_AUDIENCES: BroadcastAudience[] = [
  {
    key: "all",
    label: "All eligible users",
    description:
      "Everyone with a confirmed address who still accepts platform email.",
    isStanding: true,
  },
  {
    key: "active",
    label: "Active users",
    description: "Published, commented, or read something in the last 30 days.",
    isStanding: true,
  },
  {
    key: "authors",
    label: "Authors",
    description: "Anyone who has published at least one post or article.",
    isStanding: true,
  },
  {
    key: "verified",
    label: "Verified users",
    description: "Contributors carrying a verified credential on their profile.",
    isStanding: true,
  },
  {
    key: "new",
    label: "New users",
    description: "Joined Indegenius in the last 30 days.",
    isStanding: true,
  },
  {
    key: "selected",
    label: "Selected users",
    description: "A named list you choose by hand.",
    isStanding: false,
  },
];

/** The audiences the nightly sync provisions a Resend segment for. */
export const STANDING_AUDIENCE_KEYS = BROADCAST_AUDIENCES.filter(
  (audience) => audience.isStanding
).map((audience) => audience.key);

export function getBroadcastAudience(key: BroadcastAudienceKey): BroadcastAudience {
  const audience = BROADCAST_AUDIENCES.find((item) => item.key === key);
  if (!audience) {
    throw new Error(`Unknown broadcast audience: ${key}`);
  }
  return audience;
}

/**
 * Writing to the community as a named person is a different privilege from
 * running the platform's own announcements, so the executive identities sit
 * behind their own capability.
 */
export const EXECUTIVE_SENDER_KEYS: EmailSenderKey[] = ["ceo", "cto"];

export function isExecutiveSender(key: EmailSenderKey) {
  return EXECUTIVE_SENDER_KEYS.includes(key);
}

export function allowedBroadcastSenderKeys(
  capabilities: readonly string[]
): EmailSenderKey[] {
  const isFullAdmin = capabilities.includes("admin.full");
  const canSendAsExecutive =
    isFullAdmin || capabilities.includes("communications.send_as_executive");

  const institutional: EmailSenderKey[] = ["platform", "socials", "partnership"];
  if (!isFullAdmin && !capabilities.includes("communications.manage")) {
    return [];
  }

  return canSendAsExecutive
    ? [...institutional, ...EXECUTIVE_SENDER_KEYS]
    : institutional;
}

/** Most inboxes truncate a subject somewhere near 60 characters. */
export const SUBJECT_IDEAL_MAX = 60;

export function subjectGuidance(subject: string): {
  length: number;
  note: string;
  isLong: boolean;
} {
  const length = subject.trim().length;
  const isLong = length > SUBJECT_IDEAL_MAX;

  if (length === 0) {
    return { length, note: "Most inboxes show about 60 characters.", isLong: false };
  }

  return {
    length,
    note: isLong
      ? "Longer than most inboxes display. The end may be cut off."
      : "Most inboxes show about 60 characters.",
    isLong,
  };
}

export function formatRecipientCount(count: number) {
  return count.toLocaleString("en-US");
}

// Spelled out rather than delegated to toLocaleDateString: en-GB now abbreviates
// September as "Sept", which is one character wider than every other month and
// makes a column of dates look ragged.
const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Editorial date form, for example: 2 Sep 2026 */
export function formatBroadcastDate(value: string) {
  const date = new Date(value);
  return `${date.getDate()} ${MONTH_ABBREVIATIONS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatBroadcastDateTime(value: string) {
  const date = new Date(value);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${formatBroadcastDate(value)} at ${hours}:${minutes}`;
}

export type BroadcastRecord = {
  id: string;
  subject: string;
  previewText: string;
  bodyHtml: string;
  senderKey: EmailSenderKey;
  audienceKey: BroadcastAudienceKey;
  selectedProfileIds: string[];
  recipientCount: number;
  status: BroadcastStatus;
  sentAt: string | null;
  updatedAt: string;
  delivered: number;
  failed: number;
  sentBy: string;
  /** Present when something went wrong, shown on the detail page. */
  statusNote?: string;
};

/**
 * A sender as the composer needs it: resolved on the server, where the sending
 * domain is known, and carrying whether this admin may actually use it. Locked
 * identities are still listed, because knowing the founder address exists and
 * is not yours to use is clearer than a dropdown that quietly omits it.
 */
export type BroadcastSenderOption = {
  key: EmailSenderKey;
  name: string;
  address: string;
  replyable: boolean;
  allowed: boolean;
};

export function buildBroadcastSenderOptions(
  capabilities: readonly string[]
): BroadcastSenderOption[] {
  const allowed = new Set(allowedBroadcastSenderKeys(capabilities));

  return EMAIL_SENDER_KEYS.map((key) => {
    const sender = getEmailSender(key);
    return {
      key,
      name: sender.name,
      address: sender.address,
      replyable: sender.replyable,
      allowed: allowed.has(key),
    };
  });
}

export function findSenderOption(
  options: BroadcastSenderOption[],
  key: EmailSenderKey
) {
  return options.find((option) => option.key === key) ?? null;
}

/** The first identity this admin is actually allowed to write as. */
export function defaultSenderKey(
  options: BroadcastSenderOption[]
): EmailSenderKey | null {
  return options.find((option) => option.allowed)?.key ?? null;
}
