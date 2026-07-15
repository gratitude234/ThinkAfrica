import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { type ActivationEventName } from "@/lib/activationEvents";
import { recordActivationEvent } from "@/lib/activationServer";

const ALLOWED_EVENTS = new Set<ActivationEventName>([
  "signup_completed",
  "onboarding_started",
  "onboarding_completed",
  "onboarding_step_completed",
  "interest_selected",
  "writer_followed",
  "post_opened",
  "search_performed",
  "discover_viewed",
  "discover_tab_changed",
  "discover_item_clicked",
  "draft_started",
  "publish_drawer_opened",
  "post_submitted",
  "debate_joined",
  "home_viewed",
  "dashboard_viewed",
  "next_action_clicked",
  "notification_opened",
  "weekly_digest_previewed",
  "quality_check_viewed",
  "quality_check_completed",
  "reference_added",
  "comment_submitted",
  "response_started",
  "landing_viewed",
  "landing_read_clicked",
  "landing_signup_clicked",
  "opportunity_profile_viewed",
  "opportunity_profile_updated",
  "opportunity_readiness_viewed",
  "opportunity_filter_used",
  "opportunity_inquiry_started",
  "opportunity_inquiry_submitted",
  "opportunity_inquiry_status_updated",
  "opportunity_listing_opened",
  "opportunity_apply_started",
  "opportunity_apply_submitted",
  "opportunity_saved",
  "opportunity_unsaved",
  "opportunity_profile_setup_cta_clicked",
  "fellowship_opened",
  "fellowship_application_submitted",
  "collaboration_panel_viewed",
  "collaboration_cta_clicked",
  "coauthor_search_performed",
  "coauthor_invite_sent",
  "coauthor_invite_accepted",
  "coauthor_invite_declined",
  "message_started",
  "message_sent",
  "response_thread_opened",
  "push_nudge_shown",
  "push_nudge_action",
  "push_permission_resolved",
  "push_device_operation",
]);

const ANONYMOUS_VIEW_EVENTS = new Set<ActivationEventName>([
  "post_opened",
  "discover_viewed",
  "home_viewed",
  "dashboard_viewed",
  "landing_viewed",
  "opportunity_profile_viewed",
  "opportunity_readiness_viewed",
  "opportunity_listing_opened",
  "fellowship_opened",
  "collaboration_panel_viewed",
  "response_thread_opened",
  "weekly_digest_previewed",
  "quality_check_viewed",
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

  await recordActivationEvent({
    supabase,
    event: body.event,
    userId: user?.id ?? null,
    metadata: body.metadata ?? {},
    source: body.source ?? "client",
    route: body.route ?? null,
  });

  return NextResponse.json({ ok: true });
}
