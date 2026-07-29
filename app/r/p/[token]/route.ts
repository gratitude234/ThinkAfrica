import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorSubscriptionsEnabled } from "@/lib/featureFlags";

const TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const fallback = new URL("/", request.url);

  if (!isAuthorSubscriptionsEnabled() || !TOKEN_PATTERN.test(token)) {
    return NextResponse.redirect(fallback, 307);
  }

  try {
    const admin = createAdminClient();
    const { data: delivery, error } = await admin
      .from("publication_deliveries")
      .select("id, event_id, channel, status")
      .eq("tracking_token", token)
      .eq("status", "sent")
      .maybeSingle<{
        id: string;
        event_id: string;
        channel: "in_app" | "email" | "push";
        status: string;
      }>();
    if (error || !delivery) return NextResponse.redirect(fallback, 307);

    const { data: event } = await admin
      .from("publication_events")
      .select("post_id")
      .eq("id", delivery.event_id)
      .maybeSingle<{ post_id: string }>();
    if (!event) return NextResponse.redirect(fallback, 307);

    const { data: post } = await admin
      .from("posts")
      .select("slug, status")
      .eq("id", event.post_id)
      .eq("status", "published")
      .maybeSingle<{ slug: string; status: string }>();
    if (!post) return NextResponse.redirect(fallback, 307);

    await admin
      .from("publication_deliveries")
      .update({ opened_at: new Date().toISOString() })
      .eq("id", delivery.id)
      .is("opened_at", null);

    const destination = new URL(`/post/${encodeURIComponent(post.slug)}`, request.url);
    destination.searchParams.set("src", "author_subscription");
    destination.searchParams.set("channel", delivery.channel);
    destination.searchParams.set("delivery", token);
    return NextResponse.redirect(destination, 307);
  } catch (error) {
    console.error("[publication-delivery] tracked redirect failed", error);
    return NextResponse.redirect(fallback, 307);
  }
}

