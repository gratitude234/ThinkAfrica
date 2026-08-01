"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isAuthorSubscriptionsEnabled,
  isAuthorSubscriptionsUxV2Enabled,
} from "@/lib/featureFlags";
import type {
  AuthorRelationshipState,
  AuthorRelationshipSurface,
} from "@/lib/publicationDelivery";
import { ENGAGEMENT_PUSH_COOLDOWN_MS, logPushResult, sendPushNotification } from "@/lib/push";

type ToggleFollowInput = {
  followingId: string;
  follow: boolean;
  pathname?: string | null;
  surface?: AuthorRelationshipSurface;
  postId?: string | null;
};

type ProfileSummary = {
  username: string | null;
  full_name: string | null;
};

type RelationshipRpcRow = {
  following: boolean;
  subscribed: boolean;
  follow_created: boolean;
  subscription_created: boolean;
};

function relationshipRpc(input: {
  authorId: string;
  following: boolean | null;
  subscribed: boolean | null;
  surface?: AuthorRelationshipSurface;
  postId?: string | null;
}) {
  if (isAuthorSubscriptionsUxV2Enabled()) {
    return {
      name: "set_author_relationship_v2",
      args: {
        p_author_id: input.authorId,
        p_following: input.following,
        p_subscribed: input.subscribed,
        p_source: input.surface ?? "unknown",
        p_source_post_id: input.postId ?? null,
      },
    };
  }

  return {
    name: "set_author_relationship",
    args: {
      p_author_id: input.authorId,
      p_following: input.following,
      p_subscribed: input.subscribed,
    },
  };
}

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
    const rpc = relationshipRpc({
      authorId: input.followingId,
      following: input.follow,
      subscribed: null,
      surface: input.surface,
      postId: input.postId,
    });
    const { data, error } = await supabase
      .rpc(rpc.name, rpc.args)
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
  surface?: AuthorRelationshipSurface;
  postId?: string | null;
}): Promise<{ error: string | null } & AuthorRelationshipState> {
  if (!isAuthorSubscriptionsEnabled()) {
    return {
      error: "Author subscriptions are not available yet.",
      following: false,
      subscribed: false,
      followCreated: false,
      subscriptionCreated: false,
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
      subscriptionCreated: false,
    };
  }
  if (user.id === input.authorId) {
    return {
      error: "You cannot subscribe to yourself.",
      following: false,
      subscribed: false,
      followCreated: false,
      subscriptionCreated: false,
    };
  }

  const rpc = relationshipRpc({
    authorId: input.authorId,
    following: input.subscribed ? true : null,
    subscribed: input.subscribed,
    surface: input.surface,
    postId: input.postId,
  });
  const { data, error } = await supabase
    .rpc(rpc.name, rpc.args)
    .single<RelationshipRpcRow>();

  if (error || !data) {
    return {
      error: error?.message ?? "Unable to update this subscription.",
      following: input.subscribed,
      subscribed: !input.subscribed,
      followCreated: false,
      subscriptionCreated: false,
    };
  }

  safeRevalidate(input.pathname);
  revalidatePath("/settings");
  revalidatePath("/subscriptions");
  // Subscribing always creates the underlying Follow, so both flags can be true
  // for a single click. Send only the stronger notification: the author should
  // hear "subscribed", never "started following" plus a duplicate. Both flags
  // are false when nothing actually changed, so re-subscribing after an
  // unsubscribe stays silent.
  if (
    data.subscription_created &&
    input.surface !== "subscriptions_manager_undo"
  ) {
    after(() => notifyAuthorSubscribed(user.id, input.authorId));
  } else if (data.follow_created) {
    after(() => notifyFollowed(user.id, input.authorId));
  }

  return {
    error: null,
    following: data.following,
    subscribed: data.subscribed,
    followCreated: data.follow_created,
    subscriptionCreated: data.subscription_created,
  };
}

/**
 * Shared shape for the two relationship notifications. Both are triggered by
 * the same click, addressed to the same author, and link back to the reader's
 * profile, so only the wording and the log key differ.
 */
async function notifyRelationship(input: {
  actorId: string;
  recipientId: string;
  type: "follow" | "author_subscribed";
  message: (actorName: string) => string;
  pushTitle: string;
  logKey: string;
}) {
  const admin = createAdminClient();

  const { data: actorProfile } = await admin
    .from("profiles")
    .select("username, full_name")
    .eq("id", input.actorId)
    .maybeSingle<ProfileSummary>();

  const actorName = displayName(actorProfile);
  const ctaPath = actorProfile?.username ? `/${actorProfile.username}` : "/notifications";
  const message = input.message(actorName);

  const { error: notificationError } = await admin.from("notifications").insert({
    user_id: input.recipientId,
    type: input.type,
    message,
    link: ctaPath,
    actor_id: input.actorId,
    read: false,
  });

  if (notificationError) {
    console.error(
      `Failed to create ${input.type} notification: ${notificationError.message}`
    );
    return;
  }

  const pushResult = await sendPushNotification({
    recipientId: input.recipientId,
    title: input.pushTitle,
    body: message,
    path: ctaPath,
    preferenceKey: "push_follows",
    cooldownMs: ENGAGEMENT_PUSH_COOLDOWN_MS,
  });
  logPushResult(input.logKey, pushResult);
}

async function notifyFollowed(followerId: string, followingId: string) {
  await notifyRelationship({
    actorId: followerId,
    recipientId: followingId,
    type: "follow",
    message: (actorName) => `${actorName} started following you on Indegenius.`,
    pushTitle: "You have a new follower",
    logKey: `follow:${followerId}:${followingId}`,
  });
}

// Subscribers reuse push_follows rather than introducing a preference of their
// own: it is the same "someone connected with your work" event, and it keeps the
// notification settings page unchanged.
async function notifyAuthorSubscribed(subscriberId: string, authorId: string) {
  await notifyRelationship({
    actorId: subscriberId,
    recipientId: authorId,
    type: "author_subscribed",
    message: (actorName) => `${actorName} subscribed to your work on Indegenius.`,
    pushTitle: "You have a new subscriber",
    logKey: `author_subscribed:${subscriberId}:${authorId}`,
  });
}
