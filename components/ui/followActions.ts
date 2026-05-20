"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logEmailResult, sendUserEmail } from "@/lib/email";

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
  return profile?.full_name?.trim() || profile?.username?.trim() || "A ThinkAfrica reader";
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

  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("username, full_name")
    .eq("id", user.id)
    .maybeSingle<ProfileSummary>();

  const actorName = displayName(actorProfile);
  const ctaPath = actorProfile?.username ? `/${actorProfile.username}` : "/notifications";

  const { error: notificationError } = await supabase.from("notifications").insert({
    user_id: input.followingId,
    type: "follow",
    message: `${actorName} started following you on ThinkAfrica.`,
    link: ctaPath,
    actor_id: user.id,
    read: false,
  });

  if (notificationError) {
    console.error(`Failed to create follow notification: ${notificationError.message}`);
  } else {
    const emailResult = await sendUserEmail({
      recipientId: input.followingId,
      subject: `${actorName} followed you on ThinkAfrica`,
      preview: `${actorName} started following you.`,
      title: "You have a new follower",
      intro: `${actorName} started following you on ThinkAfrica.`,
      ctaLabel: "View profile",
      ctaPath,
      idempotencyKey: `follow:${user.id}:${input.followingId}`,
      preferenceKey: "email_follows",
    });
    logEmailResult(`follow:${user.id}:${input.followingId}`, emailResult);
  }

  if (input.pathname) revalidatePath(input.pathname);
  return { error: null, following: true };
}
