import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  logActivationEvent,
  type ActivationEventName,
} from "@/lib/activationEvents";

interface RecordActivationEventInput {
  supabase: {
    from: (table: string) => any;
  };
  event: ActivationEventName;
  userId: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  source?: string | null;
  route?: string | null;
}

export async function recordActivationEvent({
  supabase,
  event,
  userId,
  metadata = {},
  source = "server",
  route = null,
}: RecordActivationEventInput) {
  logActivationEvent(event, {
    ...metadata,
    userId,
  });

  try {
    const writer = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createAdminClient()
      : supabase;

    const { error } = await writer.from("activation_events").insert({
      user_id: userId,
      event_name: event,
      metadata,
      source,
      route,
    });

    if (error) {
      console.warn("[activation] persistence skipped", error.message);
    }
  } catch (error) {
    console.warn(
      "[activation] persistence unavailable",
      error instanceof Error ? error.message : error
    );
  }
}
