import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAuthorSubscriptionsEnabled } from "@/lib/featureFlags";
import {
  isQualifiedPublicationRead,
  qualifiedReadThresholds,
} from "@/lib/publicationDelivery";
import {
  verifyFeedExposureMetadata,
  type FeedExposure,
} from "@/lib/feedExposure";
import { verifyPostEngagementToken } from "@/lib/postEngagementToken";

export type PostEngagementType = "impression" | "view" | "read";

const ANON_COOKIE = "ta_anon_id";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const MAX_ROUTE_LENGTH = 512;
const MAX_METADATA_STRING_LENGTH = 96;
const MAX_CLIENT_METADATA_JSON_LENGTH = 768;
const MAX_READ_SECONDS = 60 * 60 * 6;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

// Every current surface emitted by HomeFeedCardImpression and
// PostCardImpression. Keeping this finite prevents callers from manufacturing
// arbitrary per-surface impression uniqueness keys.
const ENGAGEMENT_SURFACES = new Set([
  "unknown",
  "home",
  "home_featured",
  "following",
  "subscriptions",
  "topics",
  "latest",
  "feed",
  "bookmarks",
  "explore-for-you",
  "explore-trending",
  "explore-citable",
  "responses",
  "topic",
]);

// Generic client metadata is diagnostic context, never an authority boundary.
// Feed-placement fields from this list are accepted only after HMAC
// verification; nested objects such as server-owned distribution attribution
// are always excluded.
const CLIENT_METADATA_KEYS = [
  "exposureId",
  "postId",
  "slug",
  "feedSessionId",
  "requestId",
  "algorithmVersion",
  "experimentVariant",
  "candidateSource",
  "position",
  "page",
  "servedAt",
  "surface",
  "module",
  "placement",
] as const;

const VERIFIED_FEED_METADATA_KEYS = new Set<string>([
  "exposureId",
  "postId",
  "slug",
  "feedSessionId",
  "requestId",
  "algorithmVersion",
  "experimentVariant",
  "candidateSource",
  "position",
  "page",
  "servedAt",
  "surface",
]);

function getAnonymousId(request: NextRequest) {
  const existing = request.cookies.get(ANON_COOKIE)?.value;
  if (existing && /^[a-f0-9-]{36}$/i.test(existing)) {
    return { anonymousId: existing, created: false };
  }

  return { anonymousId: crypto.randomUUID(), created: true };
}

function cleanBoundedString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(CONTROL_CHARACTERS, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function cleanIntegerInRange(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  return normalized >= minimum && normalized <= maximum ? normalized : null;
}

function normalizeEngagementSurface(value: unknown) {
  const normalized = cleanBoundedString(value, 64)?.toLowerCase() ?? "unknown";
  return ENGAGEMENT_SURFACES.has(normalized) ? normalized : "unknown";
}

function sanitizeClientMetadata(
  value: unknown,
  verifiedExposure: FeedExposure | null
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, string | number | boolean>;
  }

  const source = value as Record<string, unknown>;
  const verifiedSource = verifiedExposure as unknown as Record<string, unknown> | null;
  const sanitized: Record<string, string | number | boolean> = {};

  for (const key of CLIENT_METADATA_KEYS) {
    // Placement/experiment fields only become authoritative after the server
    // verifies the HMAC created when that exact feed row was served. Generic
    // module labels remain bounded diagnostics.
    const candidate = VERIFIED_FEED_METADATA_KEYS.has(key)
      ? verifiedSource?.[key]
      : source[key];
    let primitive: string | number | boolean | null = null;

    if (typeof candidate === "string") {
      primitive = cleanBoundedString(candidate, MAX_METADATA_STRING_LENGTH);
    } else if (
      typeof candidate === "number" &&
      Number.isFinite(candidate) &&
      Math.abs(candidate) <= 1_000_000
    ) {
      primitive = candidate;
    } else if (typeof candidate === "boolean") {
      primitive = candidate;
    }

    if (primitive === null) continue;

    const next = { ...sanitized, [key]: primitive };
    if (JSON.stringify(next).length <= MAX_CLIENT_METADATA_JSON_LENGTH) {
      sanitized[key] = primitive;
    }
  }

  return sanitized;
}

const DELIVERY_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AttributedDelivery = {
  id: string;
  channel: "in_app" | "email" | "push";
  source: "author_subscription" | "topic_subscription";
  postId: string;
  wordCount: number;
};

type PublishedPost = {
  id: string;
  wordCount: number;
};

function countPublicationWords(content: string | null) {
  return (content ?? "")
    .replace(/<[^>]*>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

async function loadPublishedPost(
  admin: ReturnType<typeof createAdminClient>,
  slug: string,
  expectedPostId?: string
): Promise<PublishedPost | null> {
  let query = admin
    .from("posts")
    .select("id, slug, status, content")
    .eq("slug", slug)
    .eq("status", "published");

  if (expectedPostId) {
    query = query.eq("id", expectedPostId);
  }

  const { data: post, error } = await query.maybeSingle<{
    id: string;
    slug: string;
    status: string;
    content: string | null;
  }>();
  if (error) throw error;
  if (!post) return null;

  return {
    id: post.id,
    wordCount: countPublicationWords(post.content),
  };
}

async function validateAttributedDelivery(
  admin: ReturnType<typeof createAdminClient>,
  token: unknown,
  slug: string,
  knownPost: PublishedPost | null = null
): Promise<AttributedDelivery | null> {
  if (
    !isAuthorSubscriptionsEnabled() ||
    typeof token !== "string" ||
    !DELIVERY_TOKEN_PATTERN.test(token)
  ) {
    return null;
  }

  const { data: delivery } = await admin
    .from("publication_deliveries")
    .select("id, event_id, channel, status, matched_author_ids")
    .eq("tracking_token", token)
    .eq("status", "sent")
    .maybeSingle<{
      id: string;
      event_id: string;
      channel: "in_app" | "email" | "push";
      status: string;
      matched_author_ids: string[];
    }>();
  if (!delivery) return null;

  const { data: event } = await admin
    .from("publication_events")
    .select("post_id")
    .eq("id", delivery.event_id)
    .maybeSingle<{ post_id: string }>();
  if (!event) return null;

  const post =
    knownPost?.id === event.post_id
      ? knownPost
      : knownPost
        ? null
        : await loadPublishedPost(admin, slug, event.post_id);
  if (!post) return null;

  return {
    id: delivery.id,
    channel: delivery.channel,
    source:
      delivery.matched_author_ids.length > 0
        ? "author_subscription"
        : "topic_subscription",
    postId: post.id,
    wordCount: post.wordCount,
  };
}

function qualifiesAttributedRead(
  delivery: AttributedDelivery,
  readSeconds: number | null,
  scrollDepth: number | null
) {
  return isQualifiedPublicationRead({
    wordCount: delivery.wordCount,
    activeSeconds: readSeconds,
    scrollDepth,
  });
}

function invalidReadResponse() {
  return NextResponse.json(
    { error: "Read engagement did not meet qualification requirements." },
    { status: 400 }
  );
}

function invalidTrackingTokenResponse() {
  return NextResponse.json(
    { error: "Engagement token is invalid or expired." },
    { status: 400 }
  );
}

export async function handlePostEngagement(
  request: NextRequest,
  params: Promise<{ slug: string }>,
  eventType: PostEngagementType
) {
  const { slug } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const anonymous = user ? { anonymousId: null, created: false } : getAnonymousId(request);

  try {
    const admin = createAdminClient();
    const readSeconds =
      eventType === "read"
        ? cleanIntegerInRange(body.readSeconds, 0, MAX_READ_SECONDS)
        : null;
    const scrollDepth =
      eventType === "read"
        ? cleanIntegerInRange(body.scrollDepth, 0, 100)
        : null;
    let readPost: PublishedPost | null = null;
    const verifiedExposure = verifyFeedExposureMetadata(body.metadata, slug);

    if (eventType === "impression" && !verifiedExposure) {
      return invalidTrackingTokenResponse();
    }

    if (eventType === "read") {
      // Reject missing, malformed, and obviously under-threshold reads before
      // any engagement mutation. The exact short/long threshold is then
      // derived from authoritative published content, never from the client.
      if (readSeconds === null || scrollDepth === null) {
        return invalidReadResponse();
      }

      readPost = await loadPublishedPost(admin, slug);
      if (
        !readPost ||
        !isQualifiedPublicationRead({
          wordCount: readPost.wordCount,
          activeSeconds: readSeconds,
          scrollDepth,
        })
      ) {
        return invalidReadResponse();
      }
    }

    const engagementToken =
      eventType === "impression"
        ? null
        : verifyPostEngagementToken(
            body.engagementToken,
            slug,
            readPost?.id
          );
    if (eventType !== "impression" && !engagementToken) {
      return invalidTrackingTokenResponse();
    }

    if (eventType === "read" && readPost && engagementToken) {
      const { activeSeconds: requiredSeconds } = qualifiedReadThresholds(
        readPost.wordCount
      );
      const elapsedSeconds = Math.floor(
        (Date.now() - Date.parse(engagementToken.issuedAt)) / 1000
      );
      if (
        elapsedSeconds < requiredSeconds ||
        (readSeconds !== null && readSeconds > elapsedSeconds + 5)
      ) {
        return invalidReadResponse();
      }
    }

    const attributedDelivery = await validateAttributedDelivery(
      admin,
      body.deliveryToken,
      slug,
      readPost
    );
    const clientMetadata = sanitizeClientMetadata(
      body.metadata,
      verifiedExposure
    );
    const verifiedMetadata = engagementToken
      ? {
          ...clientMetadata,
          engagementTokenId: engagementToken.tokenId,
        }
      : clientMetadata;
    const { data, error } = await admin.rpc("record_post_engagement", {
      post_slug: slug,
      engagement_type: eventType,
      actor_user_id: user?.id ?? null,
      actor_anonymous_id: anonymous.anonymousId,
      engagement_surface:
        verifiedExposure?.surface ?? normalizeEngagementSurface(body.surface),
      engagement_route: cleanBoundedString(body.route, MAX_ROUTE_LENGTH),
      engagement_read_seconds: readSeconds,
      engagement_scroll_depth: scrollDepth,
      engagement_metadata: attributedDelivery
        ? {
            ...verifiedMetadata,
            distribution: {
              source: attributedDelivery.source,
              deliveryId: attributedDelivery.id,
              channel: attributedDelivery.channel,
            },
          }
        : verifiedMetadata,
    });

    if (error) {
      console.error(`[post-engagement] ${eventType} failed`, error);
      return NextResponse.json({ error: "Unable to record engagement." }, { status: 500 });
    }

    if (attributedDelivery && (eventType === "view" || eventType === "read")) {
      const now = new Date().toISOString();
      const update: { viewed_at: string; qualified_read_at?: string } = {
        viewed_at: now,
      };
      if (
        eventType === "read" &&
        qualifiesAttributedRead(attributedDelivery, readSeconds, scrollDepth)
      ) {
        update.qualified_read_at = now;
      }

      let deliveryUpdate = admin
        .from("publication_deliveries")
        .update(update)
        .eq("id", attributedDelivery.id)
        .is("viewed_at", null);

      if (update.qualified_read_at) {
        // A reader may have produced a prior attributed view. Qualified-read
        // attribution is independently first-write-wins.
        deliveryUpdate = admin
          .from("publication_deliveries")
          .update(update)
          .eq("id", attributedDelivery.id)
          .is("qualified_read_at", null);
      }
      const { error: attributionError } = await deliveryUpdate;
      if (attributionError) {
        console.error("[post-engagement] delivery attribution failed", attributionError);
      }
    }

    const response = NextResponse.json({ counted: Boolean(data) });
    if (anonymous.created && anonymous.anonymousId) {
      response.cookies.set(ANON_COOKIE, anonymous.anonymousId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: ONE_YEAR_SECONDS,
      });
    }

    return response;
  } catch (error) {
    console.error(`[post-engagement] ${eventType} route failed`, error);
    return NextResponse.json({ error: "Post engagement is not configured." }, { status: 503 });
  }
}
