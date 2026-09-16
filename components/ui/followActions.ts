"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { isBlockedPair } from "@/lib/blocking";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ENGAGEMENT_PUSH_COOLDOWN_MS, logPushResult, sendPushNotification } from "@/lib/push";

/**
 * Follow is the one relationship between two members. It is a row in
 * `follows` and nothing else: the publishing reset, Phase 2H, removed author
 * subscriptions, the relationship RPCs that wrote both tables, and every
 * delivery setting that hung off them.
 */

type ToggleFollowInput = {
  followingId: string;
  follow: boolean;
  pathname?: string | null;
};

export type ToggleFollowResult = {
  error: string | null;
  following: boolean;
};

type ProfileSummary = {
  username: string | null;
  full_name: string | null;
};

const UNIQUE_VIOLATION = "23505";

function displayName(profile: ProfileSummary | null) {
  return profile?.full_name?.trim() || profile?.username?.trim() || "An Indegenius reader";
}

function safeRevalidate(pathname?: string | null) {
  if (
    pathname &&
    pathname.startsWith("/") &&
    !pathname.startsWith("//") &&
    pathname.length <= 2048
  ) {
    revalidatePath(pathname);
  }
}

/**
 * Follows or unfollows one member, in this order: signed in, not yourself,
 * no block between the two of you, then the write. RLS refuses the same
 * insert for a blocked pair; the check here is so the refusal is a sentence
 * rather than a policy error, and so the rule does not live only in RLS.
 */
export async function toggleFollow(input: ToggleFollowInput): Promise<ToggleFollowResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to follow people.", following: false };
  }

  if (!input.followingId || user.id === input.followingId) {
    return { error: "You cannot follow yourself.", following: false };
  }

  if (!input.follow) {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("following_id", input.followingId);

    if (error) {
      return { error: error.message, following: true };
    }

    safeRevalidate(input.pathname);
    return { error: null, following: false };
  }

  if (await isBlockedPair(user.id, input.followingId)) {
    return { error: "You cannot follow this member.", following: false };
  }

  const { data: existingFollow, error: existingError } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", user.id)
    .eq("following_id", input.followingId)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message, following: false };
  }

  if (existingFollow) {
    safeRevalidate(input.pathname);
    return { error: null, following: true };
  }

  const { error: followError } = await supabase.from("follows").insert({
    follower_id: user.id,
    following_id: input.followingId,
  });

  // A second tab that followed in between leaves the same relationship this
  // click asked for, and has already notified.
  if (followError?.code === UNIQUE_VIOLATION) {
    safeRevalidate(input.pathname);
    return { error: null, following: true };
  }

  if (followError) {
    return { error: followError.message, following: false };
  }

  safeRevalidate(input.pathname);

  // Notifying the followed member (profile lookup, notifications insert, push
  // send) has no bearing on whether the follow itself succeeded, so it runs
  // after the response is sent instead of adding its round trips to the
  // click-to-"Following" latency the reader is waiting on.
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
  const message = `${actorName} started following you on Indegenius.`;

  const { error: notificationError } = await admin.from("notifications").insert({
    user_id: followingId,
    type: "follow",
    message,
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
    body: message,
    path: ctaPath,
    preferenceKey: "push_follows",
    cooldownMs: ENGAGEMENT_PUSH_COOLDOWN_MS,
  });
  logPushResult(`follow:${followerId}:${followingId}`, pushResult);
}
