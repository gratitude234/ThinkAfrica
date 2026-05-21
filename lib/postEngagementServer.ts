import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
    const { data, error } = await admin.rpc("record_post_engagement", {
      post_slug: slug,
      engagement_type: eventType,
      actor_user_id: user?.id ?? null,
      actor_anonymous_id: anonymous.anonymousId,
      engagement_surface: cleanString(body.surface),
      engagement_route: cleanString(body.route),
      engagement_read_seconds: cleanNumber(body.readSeconds),
      engagement_scroll_depth: cleanNumber(body.scrollDepth),
      engagement_metadata:
        body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    });

    if (error) {
      console.error(`[post-engagement] ${eventType} failed`, error);
      return NextResponse.json({ error: "Unable to record engagement." }, { status: 500 });
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
