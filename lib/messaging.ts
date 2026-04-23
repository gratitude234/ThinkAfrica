import type { SupabaseClient } from "@supabase/supabase-js";

interface FollowRow {
  follower_id: string;
}

interface DebateRow {
  debate_id: string;
}

interface ProfileUniversityRow {
  id: string;
  university: string | null;
}

interface TalentRow {
  open_to_opportunities: boolean;
  visibility: string;
}

export async function getMessageEligibility(
  supabase: SupabaseClient,
  currentUserId: string,
  targetUserId: string
): Promise<{ eligible: boolean; reason: string | null }> {
  if (currentUserId === targetUserId) {
    return { eligible: false, reason: null };
  }

  const [{ data: iFollow }, { data: theyFollow }] = await Promise.all([
    supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", currentUserId)
      .eq("following_id", targetUserId)
      .maybeSingle<FollowRow>(),
    supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", targetUserId)
      .eq("following_id", currentUserId)
      .maybeSingle<FollowRow>(),
  ]);

  if (iFollow && theyFollow) {
    return { eligible: true, reason: "You follow each other" };
  }

  const { data: myDebates } = await supabase
    .from("debate_arguments")
    .select("debate_id")
    .eq("author_id", currentUserId);

  const myDebateIds = ((myDebates ?? []) as DebateRow[]).map((row) => row.debate_id);

  if (myDebateIds.length > 0) {
    const { data: sharedDebate } = await supabase
      .from("debate_arguments")
      .select("debate_id")
      .eq("author_id", targetUserId)
      .in("debate_id", myDebateIds)
      .limit(1)
      .maybeSingle<DebateRow>();

    if (sharedDebate) {
      return { eligible: true, reason: "You debated together" };
    }
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, university")
    .in("id", [currentUserId, targetUserId]);

  const profileRows = (profiles ?? []) as ProfileUniversityRow[];
  const currentProfile = profileRows.find((profile) => profile.id === currentUserId);
  const targetProfile = profileRows.find((profile) => profile.id === targetUserId);

  if (
    currentProfile?.university &&
    targetProfile?.university &&
    currentProfile.university === targetProfile.university
  ) {
    return { eligible: true, reason: "You attend the same institution" };
  }

  const { data: talent } = await supabase
    .from("talent_profiles")
    .select("open_to_opportunities, visibility")
    .eq("user_id", targetUserId)
    .maybeSingle<TalentRow>();

  if (talent?.open_to_opportunities && talent.visibility === "public") {
    return { eligible: true, reason: "Open to opportunities" };
  }

  return { eligible: false, reason: null };
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
    return null;
  }

  return typeof data === "string" ? data : null;
}
