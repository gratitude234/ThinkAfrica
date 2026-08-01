import "server-only";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, sendUserEmail, type EmailSendResult } from "@/lib/email";
import {
  isAuthorSubscriptionsEnabled,
  isAuthorSubscriptionsUxV2Enabled,
  isTopicSubscriptionsEnabled,
} from "@/lib/featureFlags";
import {
  groupAuthorSubscriptions,
  groupTopicSubscriptions,
  classifyProviderDeliveryResult,
  isQualifiedPublicationRead,
  publicationChannelsForContent,
  publicationNotificationCopy,
  summarizePublicationFunnel,
  topicPublicationNotificationCopy,
  type AuthorSubscriptionRecord,
  type AuthorSubscriberGrowth,
  type AuthorSubscriptionAcquisitionRow,
  type FunnelDeliveryRecord,
  type PublicationDeliveryChannel,
  type PublicationFunnelRow,
  type TopicSubscriptionRecord,
} from "@/lib/publicationDelivery";
import { sendPushNotification, type PushSendResult } from "@/lib/push";
import { normalizeTagValue } from "@/lib/tags";

const DELIVERY_BATCH_SIZE = 50;
const MAX_DELIVERY_BATCHES_PER_EVENT = 4;
const EVENT_LEASE_SECONDS = 15 * 60;

type PublicationEventRow = {
  id: string;
  post_id: string;
  status: string;
  attempts: number;
  expires_at: string;
  created_at: string;
};

type PublicationDeliveryRow = {
  id: string;
  event_id: string;
  recipient_id: string;
  channel: PublicationDeliveryChannel;
  status: "pending" | "processing" | "sent" | "skipped" | "failed";
  attempts: number;
  tracking_token: string;
  matched_author_ids: string[];
  matched_topic_keys?: string[];
};

type PublicationPostRow = {
  id: string;
  author_id: string;
  title: string | null;
  excerpt: string | null;
  slug: string;
  type: string | null;
  content_kind: string | null;
  article_format: string | null;
  status: string;
  published_at: string | null;
  created_at: string;
  tags?: string[] | null;
  topic_keys?: string[];
};

type ProfileSummary = {
  id: string;
  full_name: string | null;
  username: string | null;
};

function displayName(profile: ProfileSummary | undefined, fallback = "An Indegenius author") {
  return profile?.full_name?.trim() || profile?.username?.trim() || fallback;
}

function trackedPath(delivery: Pick<PublicationDeliveryRow, "tracking_token">) {
  return `/r/p/${delivery.tracking_token}`;
}

function isExpired(event: PublicationEventRow) {
  return new Date(event.expires_at).getTime() <= Date.now();
}

function deliveryFailure(error: unknown) {
  return error instanceof Error ? error.message : "Unknown publication delivery failure.";
}

async function markDelivery(
  admin: ReturnType<typeof createAdminClient>,
  delivery: PublicationDeliveryRow,
  result:
    | { status: "sent" }
    | { status: "skipped"; reason: string }
    | { status: "failed"; error: string }
) {
  const exhausted = result.status === "failed" && delivery.attempts >= 5;
  const now = new Date().toISOString();
  const { error } = await admin
    .from("publication_deliveries")
    .update({
      status: result.status,
      locked_at: null,
      processed_at: result.status === "failed" && !exhausted ? null : now,
      skipped_reason: result.status === "skipped" ? result.reason : null,
      last_error: result.status === "failed" ? result.error.slice(0, 1000) : null,
      updated_at: now,
    })
    .eq("id", delivery.id);

  if (error) throw new Error(error.message);
}

async function processDelivery(
  admin: ReturnType<typeof createAdminClient>,
  delivery: PublicationDeliveryRow,
  post: PublicationPostRow,
  authorName: string
) {
  const matchedTopicKeys = delivery.matched_topic_keys ?? [];
  const isAuthorDelivery = delivery.matched_author_ids.length > 0;
  const topicKeySet = new Set(matchedTopicKeys);
  const topicLabel =
    (post.tags ?? []).find((tag) => topicKeySet.has(normalizeTagValue(tag)))?.trim() ||
    matchedTopicKeys[0] ||
    "this topic";
  const copy = isAuthorDelivery
    ? publicationNotificationCopy({
        authorName,
        title: post.title,
        content: post,
      })
    : topicPublicationNotificationCopy({
        topicLabel,
        authorName,
        title: post.title,
        content: post,
      });
  const path = trackedPath(delivery);

  try {
    await admin.rpc("renew_publication_delivery_lease", {
      p_delivery_id: delivery.id,
    });

    if (delivery.channel === "in_app") {
      const { error } = await admin.from("notifications").insert({
        id: delivery.id,
        user_id: delivery.recipient_id,
        type: isAuthorDelivery ? "author_published" : "topic_published",
        message: copy,
        link: path,
        actor_id: post.author_id,
        post_id: post.id,
        read: false,
      });
      if (error && error.code !== "23505") throw new Error(error.message);
      await markDelivery(admin, delivery, { status: "sent" });
      return;
    }

    if (delivery.channel === "email") {
      const result = await sendUserEmail({
        recipientId: delivery.recipient_id,
        subject: copy,
        preview: copy,
        title: copy,
        bodyHtml: `<p>${escapeHtml(
          post.excerpt?.trim() || "Read the latest publication on Indegenius."
        )}</p>`,
        bodyTextLines: [
          post.excerpt?.trim() || "Read the latest publication on Indegenius.",
        ],
        ctaLabel: "Read publication",
        ctaPath: path,
        preferenceKey: "email_author_publications",
        idempotencyKey: `author-publication:${delivery.id}`,
        footerNote:
          "You are receiving this because you subscribed to this author. Manage author publication delivery in notification settings.",
      });
      await markDelivery(
        admin,
        delivery,
        classifyProviderDeliveryResult("email", result as EmailSendResult)
      );
      return;
    }

    // Resolve terminal user policy before provider configuration. The shared
    // push sender checks VAPID first, but for durable deliveries a disabled
    // preference or absent device must be a terminal skip even when the
    // provider is temporarily unconfigured.
    const { data: recipientProfile, error: profileError } = await admin
      .from("profiles")
      .select("notification_prefs")
      .eq("id", delivery.recipient_id)
      .maybeSingle<{ notification_prefs: Record<string, unknown> | null }>();
    if (profileError) throw new Error(profileError.message);
    if (recipientProfile?.notification_prefs?.push_author_publications === false) {
      await markDelivery(admin, delivery, {
        status: "skipped",
        reason: "recipient_preference_disabled",
      });
      return;
    }

    const { data: activeDevice, error: deviceError } = await admin
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", delivery.recipient_id)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (deviceError) throw new Error(deviceError.message);
    if (!activeDevice) {
      await markDelivery(admin, delivery, {
        status: "skipped",
        reason: "no_push_subscription",
      });
      return;
    }

    const result = await sendPushNotification({
      recipientId: delivery.recipient_id,
      title: `${authorName} published`,
      body: post.title?.trim() || copy,
      path,
      preferenceKey: "push_author_publications",
    });
    await markDelivery(
      admin,
      delivery,
      classifyProviderDeliveryResult("push", result as PushSendResult)
    );
  } catch (error) {
    await markDelivery(admin, delivery, {
      status: "failed",
      error: deliveryFailure(error),
    });
  }
}

async function getCreditedAuthorIds(
  admin: ReturnType<typeof createAdminClient>,
  post: PublicationPostRow
) {
  const { data, error } = await admin
    .from("post_authors")
    .select("user_id")
    .eq("post_id", post.id)
    .not("accepted_at", "is", null);
  if (error) throw new Error(error.message);
  return [...new Set([post.author_id, ...(data ?? []).map((row) => row.user_id as string)])];
}

async function removeBlockedMatches(
  admin: ReturnType<typeof createAdminClient>,
  grouped: Map<string, string[]>
) {
  const recipients = [...grouped.keys()];
  const authors = [...new Set([...grouped.values()].flat())];
  if (recipients.length === 0 || authors.length === 0) return grouped;

  const [{ data: outbound, error: outboundError }, { data: inbound, error: inboundError }] =
    await Promise.all([
      admin
        .from("user_blocks")
        .select("blocker_id, blocked_id")
        .in("blocker_id", recipients)
        .in("blocked_id", authors),
      admin
        .from("user_blocks")
        .select("blocker_id, blocked_id")
        .in("blocker_id", authors)
        .in("blocked_id", recipients),
    ]);
  if (outboundError || inboundError) {
    throw new Error(outboundError?.message ?? inboundError?.message ?? "Unable to check blocks.");
  }

  const blockedPairs = new Set<string>();
  for (const row of outbound ?? []) blockedPairs.add(`${row.blocker_id}:${row.blocked_id}`);
  for (const row of inbound ?? []) blockedPairs.add(`${row.blocked_id}:${row.blocker_id}`);

  const filtered = new Map<string, string[]>();
  for (const [recipientId, matchedAuthors] of grouped) {
    const allowed = matchedAuthors.filter(
      (authorId) => !blockedPairs.has(`${recipientId}:${authorId}`)
    );
    if (allowed.length > 0) filtered.set(recipientId, allowed);
  }
  return filtered;
}

async function removeBlockedTopicRecipients(
  admin: ReturnType<typeof createAdminClient>,
  grouped: Map<string, string[]>,
  creditedAuthorIds: string[]
) {
  const recipients = [...grouped.keys()];
  if (recipients.length === 0 || creditedAuthorIds.length === 0) return grouped;

  const [{ data: outbound, error: outboundError }, { data: inbound, error: inboundError }] =
    await Promise.all([
      admin
        .from("user_blocks")
        .select("blocker_id, blocked_id")
        .in("blocker_id", recipients)
        .in("blocked_id", creditedAuthorIds),
      admin
        .from("user_blocks")
        .select("blocker_id, blocked_id")
        .in("blocker_id", creditedAuthorIds)
        .in("blocked_id", recipients),
    ]);
  if (outboundError || inboundError) {
    throw new Error(outboundError?.message ?? inboundError?.message ?? "Unable to check blocks.");
  }

  const blockedRecipients = new Set<string>();
  for (const row of outbound ?? []) blockedRecipients.add(row.blocker_id as string);
  for (const row of inbound ?? []) blockedRecipients.add(row.blocked_id as string);

  return new Map(
    [...grouped.entries()].filter(([recipientId]) => !blockedRecipients.has(recipientId))
  );
}

async function prepareDeliveries(
  admin: ReturnType<typeof createAdminClient>,
  event: PublicationEventRow,
  post: PublicationPostRow
) {
  if (post.status !== "published" || isExpired(event)) {
    const now = new Date().toISOString();
    await admin
      .from("publication_deliveries")
      .update({
        status: "skipped",
        skipped_reason: isExpired(event) ? "event_expired" : "post_unavailable",
        processed_at: now,
        locked_at: null,
        updated_at: now,
      })
      .eq("event_id", event.id)
      .in("status", ["pending", "processing", "failed"]);
    return;
  }

  const creditedAuthorIds = await getCreditedAuthorIds(admin, post);
  const { data: subscriptions, error } = await admin
    .from("author_subscriptions")
    .select("subscriber_id, author_id")
    .in("author_id", creditedAuthorIds);
  if (error) throw new Error(error.message);

  const groupedAuthors = await removeBlockedMatches(
    admin,
    groupAuthorSubscriptions(
      (subscriptions ?? []) as AuthorSubscriptionRecord[],
      creditedAuthorIds
    )
  );

  let groupedTopics = new Map<string, string[]>();
  const topicKeys = post.topic_keys ?? [];
  const topicSubscriptionsEnabled = isTopicSubscriptionsEnabled();
  if (topicSubscriptionsEnabled && topicKeys.length > 0) {
    const { data: topicSubscriptions, error: topicError } = await admin
      .from("topic_subscriptions")
      .select("subscriber_id, topic_key, created_at")
      .in("topic_key", topicKeys)
      .lte("created_at", event.created_at);
    if (topicError) throw new Error(topicError.message);

    groupedTopics = await removeBlockedTopicRecipients(
      admin,
      groupTopicSubscriptions(
        (topicSubscriptions ?? []) as TopicSubscriptionRecord[],
        topicKeys,
        creditedAuthorIds,
        event.created_at
      ),
      creditedAuthorIds
    );
  }

  const recipients = new Set([
    ...groupedAuthors.keys(),
    ...groupedTopics.keys(),
  ]);
  const authorChannels = publicationChannelsForContent(post);
  const rows = [...recipients].flatMap((recipientId) => {
    const matchedAuthorIds = groupedAuthors.get(recipientId) ?? [];
    const matchedTopicKeys = groupedTopics.get(recipientId) ?? [];
    const channels = new Set<PublicationDeliveryChannel>(
      matchedAuthorIds.length > 0 ? authorChannels : []
    );
    if (matchedTopicKeys.length > 0) channels.add("in_app");

    return [...channels].map((channel) => ({
      event_id: event.id,
      recipient_id: recipientId,
      channel,
      matched_author_ids: matchedAuthorIds,
      ...(topicSubscriptionsEnabled
        ? { matched_topic_keys: channel === "in_app" ? matchedTopicKeys : [] }
        : {}),
    }));
  });

  if (rows.length === 0) return;
  const { error: insertError } = await admin
    .from("publication_deliveries")
    .upsert(rows, {
      onConflict: "event_id,recipient_id,channel",
      ignoreDuplicates: true,
    });
  if (insertError) throw new Error(insertError.message);
}

async function finishEvent(
  admin: ReturnType<typeof createAdminClient>,
  event: PublicationEventRow
) {
  const { data, error } = await admin
    .from("publication_deliveries")
    .select("status, attempts")
    .eq("event_id", event.id);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const retryable = rows.some(
    (row) =>
      row.status === "pending" ||
      row.status === "processing" ||
      (row.status === "failed" && Number(row.attempts) < 5)
  );
  const exhausted = rows.some(
    (row) => row.status === "failed" && Number(row.attempts) >= 5
  );
  const now = new Date().toISOString();

  await admin
    .from("publication_events")
    .update({
      status: retryable ? "pending" : exhausted ? "partial_failure" : "completed",
      // Event attempts protect repeated fan-out/preparation failures. A
      // successful bounded pass that simply left more delivery rows must not
      // consume that budget; each delivery keeps its own five-attempt limit.
      attempts: retryable ? 0 : event.attempts,
      locked_at: null,
      processed_at: retryable ? null : now,
      last_error: exhausted ? "One or more deliveries exhausted retry attempts." : null,
      updated_at: now,
    })
    .eq("id", event.id);
}

async function processClaimedEvent(
  admin: ReturnType<typeof createAdminClient>,
  event: PublicationEventRow
) {
  const postSelect = isTopicSubscriptionsEnabled()
    ? "id, author_id, title, excerpt, slug, type, content_kind, article_format, status, published_at, created_at, tags, topic_keys"
    : "id, author_id, title, excerpt, slug, type, content_kind, article_format, status, published_at, created_at";
  const { data: post, error } = await admin
    .from("posts")
    .select(postSelect)
    .eq("id", event.post_id)
    .maybeSingle<PublicationPostRow>();
  if (error) throw new Error(error.message);

  if (!post) {
    await finishEvent(admin, event);
    return;
  }

  await prepareDeliveries(admin, event, post);
  if (post.status !== "published" || isExpired(event)) {
    await finishEvent(admin, event);
    return;
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, username")
    .eq("id", post.author_id)
    .returns<ProfileSummary[]>();
  const authorName = displayName(profiles?.[0]);

  for (let batch = 0; batch < MAX_DELIVERY_BATCHES_PER_EVENT; batch += 1) {
    await admin.rpc("renew_publication_event_lease", { p_event_id: event.id });
    const { data, error: claimError } = await admin.rpc(
      "claim_publication_deliveries",
      {
        p_event_id: event.id,
        p_limit: DELIVERY_BATCH_SIZE,
        p_lease_seconds: EVENT_LEASE_SECONDS,
      }
    );
    if (claimError) throw new Error(claimError.message);
    const deliveries = (data ?? []) as PublicationDeliveryRow[];
    if (deliveries.length === 0) break;
    await Promise.all(
      deliveries.map((delivery) => processDelivery(admin, delivery, post, authorName))
    );
    if (deliveries.length < DELIVERY_BATCH_SIZE) break;
  }

  await finishEvent(admin, event);
}

async function failClaimedEvent(
  admin: ReturnType<typeof createAdminClient>,
  event: PublicationEventRow,
  error: unknown
) {
  const exhausted = event.attempts >= 5;
  await admin
    .from("publication_events")
    .update({
      status: exhausted ? "partial_failure" : "pending",
      locked_at: null,
      processed_at: exhausted ? new Date().toISOString() : null,
      last_error: deliveryFailure(error).slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", event.id);
}

export async function processPublicationEvent(postId: string) {
  if (!isAuthorSubscriptionsEnabled()) {
    return { enabled: false, processed: 0, failed: 0 };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_publication_event_for_post", {
    p_post_id: postId,
    p_lease_seconds: EVENT_LEASE_SECONDS,
  });
  if (error) throw new Error(error.message);
  const event = ((data ?? []) as PublicationEventRow[])[0];
  if (!event) return { enabled: true, processed: 0, failed: 0 };

  try {
    await processClaimedEvent(admin, event);
    return { enabled: true, processed: 1, failed: 0 };
  } catch (error) {
    await failClaimedEvent(admin, event, error);
    console.error(`[publication-delivery] post ${postId} failed`, error);
    return { enabled: true, processed: 0, failed: 1 };
  }
}

/**
 * Register immediate processing without allowing request-context or worker
 * failures to change the already-committed publication result. The durable
 * event remains pending for daily recovery if scheduling is unavailable.
 */
export function schedulePublicationDistribution(postId: string, source: string) {
  try {
    after(() =>
      processPublicationEvent(postId).catch((error) => {
        console.error(
          `[publication-delivery] immediate ${source} processing failed for ${postId}`,
          error
        );
      })
    );
  } catch (error) {
    console.error(
      `[publication-delivery] could not schedule ${source} processing for ${postId}; recovery will retry`,
      error
    );
  }
}

export async function processPendingPublicationEvents(limit = 10) {
  if (!isAuthorSubscriptionsEnabled()) {
    return { enabled: false, claimed: 0, processed: 0, failed: 0 };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_publication_events", {
    p_limit: Math.max(1, Math.min(limit, 25)),
    p_lease_seconds: EVENT_LEASE_SECONDS,
  });
  if (error) throw new Error(error.message);
  const events = (data ?? []) as PublicationEventRow[];
  let processed = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await processClaimedEvent(admin, event);
      processed += 1;
    } catch (eventError) {
      failed += 1;
      await failClaimedEvent(admin, event, eventError);
      console.error(`[publication-delivery] event ${event.id} failed`, eventError);
    }
  }

  return { enabled: true, claimed: events.length, processed, failed };
}

export async function getAuthorPublicationFunnel(authorId: string): Promise<{
  activeSubscriberCount: number;
  rows: PublicationFunnelRow[];
}> {
  if (!isAuthorSubscriptionsEnabled()) {
    return { activeSubscriberCount: 0, rows: [] };
  }

  const admin = createAdminClient();
  const [{ count: activeSubscriberCount }, { data: ownPosts }, { data: coauthorRows }] =
    await Promise.all([
      admin
        .from("author_subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("author_id", authorId),
      admin
        .from("posts")
        .select(
          "id, author_id, title, excerpt, slug, type, content_kind, article_format, status, published_at, created_at"
        )
        .eq("author_id", authorId)
        .eq("status", "published"),
      admin
        .from("post_authors")
        .select("post_id")
        .eq("user_id", authorId)
        .not("accepted_at", "is", null),
    ]);

  const coauthorPostIds = [
    ...new Set((coauthorRows ?? []).map((row) => row.post_id as string)),
  ];
  const { data: coauthoredPosts } =
    coauthorPostIds.length > 0
      ? await admin
          .from("posts")
          .select(
            "id, author_id, title, excerpt, slug, type, content_kind, article_format, status, published_at, created_at"
          )
          .in("id", coauthorPostIds)
          .eq("status", "published")
      : { data: [] };

  const postsById = new Map<string, PublicationPostRow>();
  for (const post of [...(ownPosts ?? []), ...(coauthoredPosts ?? [])] as PublicationPostRow[]) {
    postsById.set(post.id, post);
  }
  const postIds = [...postsById.keys()];
  if (postIds.length === 0) {
    return { activeSubscriberCount: activeSubscriberCount ?? 0, rows: [] };
  }

  const { data: events, error: eventError } = await admin
    .from("publication_events")
    .select("id, post_id")
    .in("post_id", postIds);
  if (eventError) throw new Error(eventError.message);
  const eventToPost = new Map((events ?? []).map((event) => [event.id as string, event.post_id as string]));
  const eventIds = [...eventToPost.keys()];
  const deliverySelect = isTopicSubscriptionsEnabled()
    ? "event_id, recipient_id, channel, status, matched_author_ids, matched_topic_keys, opened_at, qualified_read_at"
    : "event_id, recipient_id, channel, status, matched_author_ids, opened_at, qualified_read_at";
  // The selected shape deliberately changes with the release flag so code
  // deployed before the topic migration never asks PostgREST for a column
  // that is not present yet.
  const publicationDeliveriesTable = admin.from(
    "publication_deliveries"
  ) as unknown as { select: (columns: string) => any };
  const { data: deliveries, error: deliveryError } =
    eventIds.length > 0
      ? await publicationDeliveriesTable
          .select(deliverySelect)
          .in("event_id", eventIds)
      : { data: [], error: null };
  if (deliveryError) throw new Error(deliveryError.message);

  const deliveriesByPost = new Map<string, FunnelDeliveryRecord[]>();
  for (const row of deliveries ?? []) {
    const postId = eventToPost.get((row as { event_id: string }).event_id);
    if (!postId) continue;
    const list = deliveriesByPost.get(postId) ?? [];
    list.push({
      ...(row as unknown as Omit<FunnelDeliveryRecord, "matched_topic_keys">),
      matched_topic_keys:
        ((row as { matched_topic_keys?: string[] }).matched_topic_keys ?? []),
    });
    deliveriesByPost.set(postId, list);
  }

  const rows = [...postsById.values()]
    .map((post) => ({
      postId: post.id,
      slug: post.slug,
      title: post.title?.trim() || post.excerpt?.trim() || "Untitled Post",
      publishedAt: post.published_at ?? post.created_at,
      ...summarizePublicationFunnel(deliveriesByPost.get(post.id) ?? [], authorId),
    }))
    .sort(
      (left, right) =>
        new Date(right.publishedAt ?? 0).getTime() -
        new Date(left.publishedAt ?? 0).getTime()
    );

  return { activeSubscriberCount: activeSubscriberCount ?? 0, rows };
}

export async function getAuthorSubscriberGrowth(authorId: string): Promise<{
  growth: AuthorSubscriberGrowth;
  acquisition: AuthorSubscriptionAcquisitionRow[];
}> {
  const empty: AuthorSubscriberGrowth = {
    activeSubscribers: 0,
    gained7d: 0,
    lost7d: 0,
    net7d: 0,
    gained30d: 0,
    lost30d: 0,
    net30d: 0,
    trackingSince: null,
    daily: [],
  };
  if (!isAuthorSubscriptionsUxV2Enabled()) {
    return { growth: empty, acquisition: [] };
  }

  const admin = createAdminClient();
  const now = new Date();
  const thirtyDaysAgo = new Date(
    now.getTime() - 29 * 24 * 60 * 60 * 1000
  );
  thirtyDaysAgo.setUTCHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const [{ count }, eventsResult, firstEventResult] = await Promise.all([
    admin
      .from("author_subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("author_id", authorId),
    admin
      .from("author_subscription_events")
      .select("event_type, source_post_id, created_at")
      .eq("author_id", authorId)
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: true }),
    admin
      .from("author_subscription_events")
      .select("created_at")
      .eq("author_id", authorId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (eventsResult.error || firstEventResult.error) {
    return {
      growth: { ...empty, activeSubscribers: count ?? 0 },
      acquisition: [],
    };
  }

  const events = (eventsResult.data ?? []) as Array<{
    event_type: "subscribed" | "unsubscribed";
    source_post_id: string | null;
    created_at: string;
  }>;
  const daily = new Map<
    string,
    { date: string; gained: number; lost: number; net: number }
  >();
  for (let offset = 0; offset < 30; offset += 1) {
    const date = new Date(thirtyDaysAgo.getTime() + offset * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    daily.set(date, { date, gained: 0, lost: 0, net: 0 });
  }

  const acquisitionMap = new Map<string, number>();
  for (const event of events) {
    const date = event.created_at.slice(0, 10);
    const bucket = daily.get(date);
    if (bucket) {
      if (event.event_type === "subscribed") bucket.gained += 1;
      else bucket.lost += 1;
      bucket.net = bucket.gained - bucket.lost;
    }
    if (event.event_type === "subscribed" && event.source_post_id) {
      acquisitionMap.set(
        event.source_post_id,
        (acquisitionMap.get(event.source_post_id) ?? 0) + 1
      );
    }
  }

  const gained30d = events.filter(
    (event) => event.event_type === "subscribed"
  ).length;
  const lost30d = events.length - gained30d;
  const recent = events.filter((event) => event.created_at >= sevenDaysAgo);
  const gained7d = recent.filter(
    (event) => event.event_type === "subscribed"
  ).length;
  const lost7d = recent.length - gained7d;

  return {
    growth: {
      activeSubscribers: count ?? 0,
      gained7d,
      lost7d,
      net7d: gained7d - lost7d,
      gained30d,
      lost30d,
      net30d: gained30d - lost30d,
      trackingSince:
        (firstEventResult.data?.created_at as string | undefined) ?? null,
      daily: [...daily.values()].filter(
        (row) =>
          !firstEventResult.data?.created_at ||
          row.date >= String(firstEventResult.data.created_at).slice(0, 10)
      ),
    },
    acquisition: [...acquisitionMap.entries()].map(
      ([postId, subscribersGained]) => ({ postId, subscribersGained })
    ),
  };
}
