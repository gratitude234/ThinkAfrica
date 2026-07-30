import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAuthorSubscriptionsEnabled } from "@/lib/featureFlags";
import { isQualifiedPublicationRead } from "@/lib/publicationDelivery";

export type PostEngagementType = "impression" | "view" | "read";

const ANON_COOKIE = "ta_anon_id";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function getAnonymousId(request: NextRequest) {
  const existing = request.cookies.get(ANON_COOKIE)?.value;
  if (existing && /^[a-f0-9-]{36}$/i.test(existing)) {
    return { anonymousId: existing, created: false };
  }

  return { anonymousId: crypto.randomUUID(), created: true };
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value);
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

async function validateAttributedDelivery(
  admin: ReturnType<typeof createAdminClient>,
  token: unknown,
  slug: string
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

  const { data: post } = await admin
    .from("posts")
    .select("id, slug, status, content")
    .eq("id", event.post_id)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle<{ id: string; slug: string; status: string; content: string | null }>();
  if (!post) return null;

  const wordCount = (post.content ?? "")
    .replace(/<[^>]*>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return {
    id: delivery.id,
    channel: delivery.channel,
    source:
      delivery.matched_author_ids.length > 0
        ? "author_subscription"
        : "topic_subscription",
    postId: post.id,
    wordCount,
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
    const attributedDelivery = await validateAttributedDelivery(
      admin,
      body.deliveryToken,
      slug
    );
    const readSeconds = cleanNumber(body.readSeconds);
    const scrollDepth = cleanNumber(body.scrollDepth);
    const clientMetadata =
      body.metadata && typeof body.metadata === "object"
        ? (body.metadata as Record<string, unknown>)
        : {};
    const { data, error } = await admin.rpc("record_post_engagement", {
      post_slug: slug,
      engagement_type: eventType,
      actor_user_id: user?.id ?? null,
      actor_anonymous_id: anonymous.anonymousId,
      engagement_surface: cleanString(body.surface),
      engagement_route: cleanString(body.route),
      engagement_read_seconds: readSeconds,
      engagement_scroll_depth: scrollDepth,
      engagement_metadata: attributedDelivery
        ? {
            ...clientMetadata,
            distribution: {
              source: attributedDelivery.source,
              deliveryId: attributedDelivery.id,
              channel: attributedDelivery.channel,
            },
          }
        : clientMetadata,
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
