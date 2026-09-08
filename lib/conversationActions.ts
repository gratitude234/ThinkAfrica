"use server";

import { getCurrentUser } from "@/lib/serverAuth";
import { createClient } from "@/lib/supabase/server";

/**
 * Opening a conversation with somebody, on the server.
 *
 * Two client components called `find_or_create_conversation` directly, passing
 * both people. The RPC is `SECURITY DEFINER` and derives the caller from
 * `auth.uid()`, so it was safe, and it is one of the functions that answers
 * nothing once `auth.uid()` is null.
 *
 * The browser now names only the person it wants to talk to. Who is asking
 * comes from the session, which is the shape every other migrated write uses
 * and the one that survives the provider change.
 */

export type ConversationResult =
  | { ok: true; conversationId: string }
  | { ok: false; reason: "unauthorized" | "invalid" | "unavailable" };

export async function openConversationWith(
  targetUserId: string
): Promise<ConversationResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "unauthorized" };

  // Messaging yourself is not a conversation. The old helper returned null for
  // this; the caller then showed a generic failure, which is unchanged.
  if (!targetUserId || targetUserId === user.id) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("find_or_create_conversation", {
      target_user_id: targetUserId,
    });

    if (error) {
      console.error("[conversations] open failed", error);
      return { ok: false, reason: "unavailable" };
    }
    if (typeof data !== "string") {
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, conversationId: data };
  } catch (error) {
    console.error("[conversations] open threw", error);
    return { ok: false, reason: "unavailable" };
  }
}
