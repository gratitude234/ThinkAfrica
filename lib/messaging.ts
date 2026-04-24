import type { SupabaseClient } from "@supabase/supabase-js";

interface ProfileVerifiedRow {
  verified: boolean;
}

export async function getMessageEligibility(
  supabase: SupabaseClient,
  currentUserId: string,
  targetUserId: string
): Promise<{ eligible: boolean; reason: string | null }> {
  if (currentUserId === targetUserId) {
    return { eligible: false, reason: null };
  }

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("verified")
    .eq("id", currentUserId)
    .maybeSingle<ProfileVerifiedRow>();

  if (!myProfile?.verified) {
    return {
      eligible: false,
      reason: "Verify your account to send messages",
    };
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
