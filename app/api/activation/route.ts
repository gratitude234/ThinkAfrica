import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivationEvent, type ActivationEventName } from "@/lib/activationEvents";

const ALLOWED_EVENTS = new Set<ActivationEventName>([
  "signup_completed",
  "onboarding_started",
  "onboarding_completed",
  "interest_selected",
  "writer_followed",
  "draft_started",
  "post_submitted",
  "debate_joined",
]);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    event?: ActivationEventName;
    metadata?: Record<string, string | number | boolean | null>;
  } | null;

  if (!body?.event || !ALLOWED_EVENTS.has(body.event)) {
    return NextResponse.json({ error: "Unknown activation event." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  logActivationEvent(body.event, {
    ...(body.metadata ?? {}),
    userId: user?.id ?? null,
  });

  return NextResponse.json({ ok: true });
}
