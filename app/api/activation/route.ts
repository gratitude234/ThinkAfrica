import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { type ActivationEventName } from "@/lib/activationEvents";
import { recordActivationEvent } from "@/lib/activationServer";

/**
 * What a browser may record. Since the server-recorded topic suggestion events
 * went with /api/topic-suggestions in Phase 2G, this is the whole vocabulary.
 */
const ALLOWED_EVENTS = new Set<ActivationEventName>([
  "signup_completed",
  "onboarding_started",
  "onboarding_completed",
  "onboarding_step_completed",
  "interest_selected",
  "home_viewed",
  "post_opened",
  "post_submitted",
  "comment_submitted",
  "writer_followed",
  "search_performed",
  "discover_viewed",
  "discover_tab_changed",
  "discover_item_clicked",
  "notification_opened",
  "landing_viewed",
  "landing_read_clicked",
  "landing_signup_clicked",
  "profile_viewed",
  "profile_work_opened",
  "profile_follow_completed",
  "profile_section_saved",
  "push_permission_resolved",
  "push_device_operation",
]);

const ANONYMOUS_VIEW_EVENTS = new Set<ActivationEventName>([
  "profile_viewed",
  "profile_work_opened",
  "post_opened",
  "discover_viewed",
  "home_viewed",
  "landing_viewed",
]);

function hasSupabaseAuthCookie(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  return /\bsb-[^=;]+-auth-token(?:\.\d+)?=/.test(cookie);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    event?: ActivationEventName;
    metadata?: Record<string, string | number | boolean | null>;
    source?: string;
    route?: string;
  } | null;

  if (!body?.event || !ALLOWED_EVENTS.has(body.event)) {
    return NextResponse.json({ error: "Unknown activation event." }, { status: 400 });
  }

  if (ANONYMOUS_VIEW_EVENTS.has(body.event) && !hasSupabaseAuthCookie(request)) {
    return NextResponse.json({ ok: true, persisted: false });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && ANONYMOUS_VIEW_EVENTS.has(body.event)) {
    return NextResponse.json({ ok: true, persisted: false });
  }

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required for this activation event." },
      { status: 401 }
    );
  }

  await recordActivationEvent({
    supabase,
    event: body.event,
    userId: user.id,
    metadata: body.metadata ?? {},
    source: body.source ?? "client",
    route: body.route ?? null,
  });

  return NextResponse.json({ ok: true });
}
