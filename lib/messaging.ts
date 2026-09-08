import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Starting a conversation.
 *
 * `getMessageEligibility` used to live here and now lives in
 * `lib/messagingEligibility.ts`: it reads the database through the adapter, so
 * it is `server-only`, and this module is imported by two client components.
 * Keeping them together pulled the server repository graph into the browser
 * bundle.
 */
export async function findOrCreateConversation(
  supabase: SupabaseClient,
  userA: string,
  userB: string
): Promise<string | null> {
  if (!userA || !userB || userA === userB) {
    return null;
  }

  const { data, error } = await supabase.rpc("find_or_create_conversation", {
    target_user_id: userB,
  });

  if (error) {
    throw new Error(error.message);
  }

  return typeof data === "string" ? data : null;
}
