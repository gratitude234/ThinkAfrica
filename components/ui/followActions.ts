"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ENGAGEMENT_PUSH_COOLDOWN_MS, logPushResult, sendPushNotification } from "@/lib/push";

type ToggleFollowInput = {
  followingId: string;
  follow: boolean;
  pathname?: string | null;
};

type ProfileSummary = {
  username: string | null;
  full_name: string | null;
};

function displayName(profile: ProfileSummary | null) {
  return profile?.full_name?.trim() || profile?.username?.trim() || "An Indegenius reader";
}

export async function toggleFollow(input: ToggleFollowInput): Promise<{
  error: string | null;
  following: boolean;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to follow people.", following: false };
  }

  if (user.id === input.followingId) {
    return { error: "You cannot follow yourself.", following: false };
  }

  if (!input.follow) {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("following_id", input.followingId);

    if (error) return { error: error.message, following: true };

    if (input.pathname) revalidatePath(input.pathname);
    return { error: null, following: false };
  }

  const { data: existingFollow, error: existingError } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", user.id)
    .eq("following_id", input.followingId)
    .maybeSingle();

  if (existingError) return { error: existingError.message, following: false };

  if (existingFollow) {
    if (input.pathname) revalidatePath(input.pathname);
    return { error: null, following: true };
  }

  const { error: followError } = await supabase.from("follows").insert({
    follower_id: user.id,
    following_id: input.followingId,
  });

  if (followError) return { error: followError.message, following: false };

  if (input.pathname) revalidatePath(input.pathname);

  // Notifying the followed user (profile lookup, notifications insert, push
  // send) has no bearing on whether the follow itself succeeded, so it runs
  // after the response is sent instead of adding its round trips to the
  // click-to-"Following" latency the user is waiting on.
  after(() => notifyFollowed(user.id, input.followingId));

  return { error: null, following: true };
}

async function notifyFollowed(followerId: string, followingId: string) {
  const admin = createAdminClient();

  const { data: actorProfile } = await admin
    .from("profiles")
    .select("username, full_name")
    .eq("id", followerId)
    .maybeSingle<ProfileSummary>();

  const actorName = displayName(actorProfile);
  const ctaPath = actorProfile?.username ? `/${actorProfile.username}` : "/notifications";

  const { error: notificationError } = await admin.from("notifications").insert({
    user_id: followingId,
    type: "follow",
    message: `${actorName} started following you on Indegenius.`,
    link: ctaPath,
    actor_id: followerId,
    read: false,
  });

  if (notificationError) {
    console.error(`Failed to create follow notification: ${notificationError.message}`);
    return;
  }

  const pushResult = await sendPushNotification({
    recipientId: followingId,
    title: "You have a new follower",
    body: `${actorName} started following you on Indegenius.`,
    path: ctaPath,
    preferenceKey: "push_follows",
    cooldownMs: ENGAGEMENT_PUSH_COOLDOWN_MS,
  });
  logPushResult(`follow:${followerId}:${followingId}`, pushResult);
}
