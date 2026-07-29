import { resolveContentKind } from "@/lib/contentModel";

export interface AuthorRelationshipState {
  following: boolean;
  subscribed: boolean;
  followCreated: boolean;
}

export interface TopicSubscriptionState {
  topicKey: string;
  displayLabel: string;
  subscribed: boolean;
}

export interface TopicSubscriptionRecord {
  subscriber_id: string;
  topic_key: string;
  created_at?: string;
}

export type PublicationDeliveryChannel = "in_app" | "email" | "push";

export type PublicationDeliveryStatus =
  | "pending"
  | "processing"
  | "sent"
  | "skipped"
  | "failed";

export interface PublicationFunnelSegment {
  deliveredRecipients: number;
  opens: number;
  qualifiedReads: number;
  qualifiedReadConversionRate: number;
}

export interface PublicationFunnelRow {
  postId: string;
  slug: string;
  title: string;
  publishedAt: string | null;
  overall: PublicationFunnelSegment;
  authorSource: PublicationFunnelSegment;
  topicSource: PublicationFunnelSegment;
}

export interface PublicationContentRecord {
  type?: string | null;
  content_kind?: string | null;
  article_format?: string | null;
}

export interface AuthorSubscriptionRecord {
  subscriber_id: string;
  author_id: string;
}

export interface FunnelDeliveryRecord {
  recipient_id: string;
  channel: PublicationDeliveryChannel;
  status: PublicationDeliveryStatus;
  matched_author_ids: string[];
  matched_topic_keys: string[];
  opened_at: string | null;
  qualified_read_at: string | null;
}

export type DeliveryProviderResult =
  | { ok: true; sent?: number }
  | { skipped: true; reason: string }
  | { ok: false; error: string };

export type DeliveryProcessingOutcome =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

export function publicationChannelsForContent(
  post: PublicationContentRecord
): PublicationDeliveryChannel[] {
  const contentKind = resolveContentKind(post);
  return contentKind === "article" || contentKind === "research"
    ? ["in_app", "email", "push"]
    : ["in_app"];
}

/**
 * Builds the recipient union while retaining which subscribed author(s)
 * matched. This is the key to both delivery deduplication and co-author-safe
 * reporting.
 */
export function groupAuthorSubscriptions(
  subscriptions: AuthorSubscriptionRecord[],
  creditedAuthorIds: string[]
): Map<string, string[]> {
  const credited = new Set(creditedAuthorIds);
  const grouped = new Map<string, Set<string>>();

  for (const row of subscriptions) {
    if (!credited.has(row.author_id) || credited.has(row.subscriber_id)) continue;
    const matched = grouped.get(row.subscriber_id) ?? new Set<string>();
    matched.add(row.author_id);
    grouped.set(row.subscriber_id, matched);
  }

  return new Map(
    [...grouped.entries()].map(([recipientId, authorIds]) => [
      recipientId,
      [...authorIds].sort(),
    ])
  );
}

export function groupTopicSubscriptions(
  subscriptions: TopicSubscriptionRecord[],
  postTopicKeys: string[],
  creditedAuthorIds: string[],
  eventCreatedAt: string
): Map<string, string[]> {
  const availableTopics = new Set(postTopicKeys);
  const creditedAuthors = new Set(creditedAuthorIds);
  const eventTime = new Date(eventCreatedAt).getTime();
  const grouped = new Map<string, Set<string>>();

  for (const row of subscriptions) {
    if (
      !availableTopics.has(row.topic_key) ||
      creditedAuthors.has(row.subscriber_id) ||
      (row.created_at &&
        new Date(row.created_at).getTime() > eventTime)
    ) {
      continue;
    }

    const matched = grouped.get(row.subscriber_id) ?? new Set<string>();
    matched.add(row.topic_key);
    grouped.set(row.subscriber_id, matched);
  }

  return new Map(
    [...grouped.entries()].map(([recipientId, topicKeys]) => [
      recipientId,
      postTopicKeys.filter((key) => topicKeys.has(key)),
    ])
  );
}

export function publicationNotificationCopy(input: {
  authorName: string;
  title?: string | null;
  content: PublicationContentRecord;
}) {
  const kind = resolveContentKind(input.content);
  const label = kind === "research" ? "Research" : kind === "article" ? "Article" : "Post";
  const cleanTitle = input.title?.trim();
  return cleanTitle
    ? `${input.authorName} published a new ${label}: ${cleanTitle}`
    : `${input.authorName} published a new ${label}.`;
}

export function topicPublicationNotificationCopy(input: {
  topicLabel: string;
  authorName: string;
  title?: string | null;
  content: PublicationContentRecord;
}) {
  const kind = resolveContentKind(input.content);
  const label = kind === "research" ? "Research" : kind === "article" ? "Article" : "Post";
  const topic = input.topicLabel.trim().replace(/^#/, "");
  const cleanTitle = input.title?.trim();
  return cleanTitle
    ? `New ${label} in #${topic}: ${cleanTitle}`
    : `${input.authorName} published a new ${label} in #${topic}.`;
}

export function qualifiedReadThresholds(wordCount: number) {
  return wordCount <= 600
    ? { activeSeconds: 15, scrollDepth: 50 }
    : { activeSeconds: 30, scrollDepth: 60 };
}

export function isQualifiedPublicationRead(input: {
  wordCount: number;
  activeSeconds: number | null;
  scrollDepth: number | null;
}) {
  const threshold = qualifiedReadThresholds(input.wordCount);
  return (
    input.activeSeconds !== null &&
    input.scrollDepth !== null &&
    input.activeSeconds >= threshold.activeSeconds &&
    input.scrollDepth >= threshold.scrollDepth
  );
}

export function classifyProviderDeliveryResult(
  channel: "email" | "push",
  result: DeliveryProviderResult
): DeliveryProcessingOutcome {
  if ("ok" in result && result.ok) {
    if (channel === "push" && (result.sent ?? 0) === 0) {
      return { status: "failed", error: "all_push_delivery_attempts_failed" };
    }
    return { status: "sent" };
  }

  if ("skipped" in result) {
    const terminalReasons =
      channel === "email"
        ? new Set(["recipient_preference_disabled", "recipient_has_no_email"])
        : new Set(["recipient_preference_disabled", "no_push_subscription"]);
    return terminalReasons.has(result.reason)
      ? { status: "skipped", reason: result.reason }
      : { status: "failed", error: result.reason };
  }

  return { status: "failed", error: result.error };
}

export function shouldClaimDelivery(input: {
  status: PublicationDeliveryStatus;
  attempts: number;
  lockedAt: string | null;
  now: number;
  leaseMs: number;
}) {
  if (input.attempts >= 5) return false;
  if (input.status === "pending" || input.status === "failed") return true;
  if (input.status !== "processing" || !input.lockedAt) return false;
  return new Date(input.lockedAt).getTime() < input.now - input.leaseMs;
}

function summarizeSegment(
  deliveries: FunnelDeliveryRecord[],
  include: (delivery: FunnelDeliveryRecord) => boolean
): PublicationFunnelSegment {
  const recipients = new Map<
    string,
    { delivered: boolean; opened: boolean; qualified: boolean }
  >();

  for (const delivery of deliveries) {
    if (!include(delivery)) continue;
    const current = recipients.get(delivery.recipient_id) ?? {
      delivered: false,
      opened: false,
      qualified: false,
    };
    current.delivered ||= delivery.status === "sent";
    current.opened ||= Boolean(delivery.opened_at);
    current.qualified ||= Boolean(delivery.qualified_read_at);
    recipients.set(delivery.recipient_id, current);
  }

  const deliveredRecipients = [...recipients.values()].filter((row) => row.delivered).length;
  const opens = [...recipients.values()].filter((row) => row.opened).length;
  const qualifiedReads = [...recipients.values()].filter((row) => row.qualified).length;

  return {
    deliveredRecipients,
    opens,
    qualifiedReads,
    qualifiedReadConversionRate:
      deliveredRecipients === 0
        ? 0
        : Math.round((qualifiedReads / deliveredRecipients) * 1000) / 10,
  };
}

export function summarizePublicationFunnel(
  deliveries: FunnelDeliveryRecord[],
  authorId: string
) {
  const isAuthorSource = (delivery: FunnelDeliveryRecord) =>
    delivery.matched_author_ids.includes(authorId);
  const isTopicSource = (delivery: FunnelDeliveryRecord) =>
    delivery.matched_topic_keys.length > 0;

  return {
    overall: summarizeSegment(
      deliveries,
      (delivery) => isAuthorSource(delivery) || isTopicSource(delivery)
    ),
    authorSource: summarizeSegment(deliveries, isAuthorSource),
    topicSource: summarizeSegment(deliveries, isTopicSource),
  };
}
