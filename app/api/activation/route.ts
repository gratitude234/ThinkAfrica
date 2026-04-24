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
  "draft_started",
  "publish_drawer_opened",
  "post_submitted",
  "debate_joined",
]);

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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
