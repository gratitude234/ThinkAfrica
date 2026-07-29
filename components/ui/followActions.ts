"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorSubscriptionsEnabled } from "@/lib/featureFlags";
import type { AuthorRelationshipState } from "@/lib/publicationDelivery";
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

type RelationshipRpcRow = {
  following: boolean;
  subscribed: boolean;
  follow_created: boolean;
};

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

export async function toggleFollow(input: ToggleFollowInput): Promise<{
  error: string | null;
  following: boolean;
  subscribed: boolean;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "You must be signed in to follow people.",
      following: false,
      subscribed: false,
    };
  }

  if (user.id === input.followingId) {
    return {
      error: "You cannot follow yourself.",
      following: false,
      subscribed: false,
    };
  }

  if (isAuthorSubscriptionsEnabled()) {
    const { data, error } = await supabase
      .rpc("set_author_relationship", {
        p_author_id: input.followingId,
        p_following: input.follow,
        p_subscribed: null,
      })
      .single<RelationshipRpcRow>();

    if (error || !data) {
      return {
        error: error?.message ?? "Unable to update this relationship.",
        following: !input.follow,
        subscribed: false,
      };
    }

    safeRevalidate(input.pathname);
    if (data.follow_created) {
      after(() => notifyFollowed(user.id, input.followingId));
    }
    return {
      error: null,
      following: data.following,
      subscribed: data.subscribed,
    };
  }

  if (!input.follow) {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("following_id", input.followingId);

    if (error) {
      return { error: error.message, following: true, subscribed: false };
    }

    safeRevalidate(input.pathname);
    return { error: null, following: false, subscribed: false };
  }

  const { data: existingFollow, error: existingError } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", user.id)
    .eq("following_id", input.followingId)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message, following: false, subscribed: false };
  }

  if (existingFollow) {
    safeRevalidate(input.pathname);
    return { error: null, following: true, subscribed: false };
  }

  const { error: followError } = await supabase.from("follows").insert({
    follower_id: user.id,
    following_id: input.followingId,
  });

  if (followError) {
    return { error: followError.message, following: false, subscribed: false };
  }

  safeRevalidate(input.pathname);

  // Notifying the followed user (profile lookup, notifications insert, push
  // send) has no bearing on whether the follow itself succeeded, so it runs
  // after the response is sent instead of adding its round trips to the
  // click-to-"Following" latency the user is waiting on.
  after(() => notifyFollowed(user.id, input.followingId));

  return { error: null, following: true, subscribed: false };
}

export async function setAuthorSubscription(input: {
  authorId: string;
  subscribed: boolean;
  pathname?: string | null;
}): Promise<{ error: string | null } & AuthorRelationshipState> {
  if (!isAuthorSubscriptionsEnabled()) {
    return {
      error: "Author subscriptions are not available yet.",
      following: false,
      subscribed: false,
      followCreated: false,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: "You must be signed in to subscribe to authors.",
      following: false,
      subscribed: false,
      followCreated: false,
    };
  }
  if (user.id === input.authorId) {
    return {
      error: "You cannot subscribe to yourself.",
      following: false,
      subscribed: false,
      followCreated: false,
    };
  }

  const { data, error } = await supabase
    .rpc("set_author_relationship", {
      p_author_id: input.authorId,
      p_following: input.subscribed ? true : null,
      p_subscribed: input.subscribed,
    })
    .single<RelationshipRpcRow>();

  if (error || !data) {
    return {
      error: error?.message ?? "Unable to update this subscription.",
      following: input.subscribed,
      subscribed: !input.subscribed,
      followCreated: false,
    };
  }

  safeRevalidate(input.pathname);
  revalidatePath("/settings");
  if (data.follow_created) {
    after(() => notifyFollowed(user.id, input.authorId));
  }

  return {
    error: null,
    following: data.following,
    subscribed: data.subscribed,
    followCreated: data.follow_created,
  };
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
