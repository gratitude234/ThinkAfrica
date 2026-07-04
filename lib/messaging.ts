import type { SupabaseClient } from "@supabase/supabase-js";

export async function getMessageEligibility(
  supabase: SupabaseClient,
  currentUserId: string,
  targetUserId: string
): Promise<{ eligible: boolean; reason: string | null }> {
  if (currentUserId === targetUserId) {
    return { eligible: false, reason: null };
  }

  const { data: blocked } = await supabase.rpc("is_blocked_pair", {
    user_a: currentUserId,
    user_b: targetUserId,
  });

  if (blocked === true) {
    // Deliberately no reason: blocking is never disclosed to the blocked side.
    return { eligible: false, reason: null };
  }

  return { eligible: true, reason: null };
}

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
