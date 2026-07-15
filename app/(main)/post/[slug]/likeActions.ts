"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEmailResult, sendUserEmail } from "@/lib/email";
import { ENGAGEMENT_PUSH_COOLDOWN_MS, logPushResult, sendPushNotification } from "@/lib/push";

type TogglePostLikeInput = {
  postId: string;
  nextLiked: boolean;
};

type ProfileSummary = {
  username: string | null;
  full_name: string | null;
};

function displayName(profile: ProfileSummary | null) {
  return profile?.full_name?.trim() || profile?.username?.trim() || "An Indegenius reader";
}

function isDuplicateKeyError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  return error.code === "23505" || message.includes("duplicate key");
}

type ToggleLikeResult = {
  error: string | null;
  liked: boolean;
  count: number;
};

async function getLikeCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("post_like_counts")
    .select("like_count")
    .eq("post_id", postId)
    .maybeSingle();

  if (!error) return data?.like_count ?? 0;

  // A transient failure reading the maintained counter shouldn't report "0 likes"
  // right after a successful toggle — fall back to an exact count of the source
  // of truth instead of trusting an unreachable/errored aggregate.
  const { count } = await supabase
    .from("likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", postId);

  return count ?? 0;
}

function finish(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slug: string,
  postId: string,
  liked: boolean
) {
  revalidatePath(`/post/${slug}`);
  updateTag("feed");
  return getLikeCount(supabase, postId).then((count) => ({
    error: null,
    liked,
    count,
  }));
}

export async function togglePostLike(
  input: TogglePostLikeInput
): Promise<ToggleLikeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "You must be signed in to like posts.",
      liked: false,
      count: 0,
    };
  }

  const [{ data: post, error: postError }, { data: actorProfile }] =
    await Promise.all([
      supabase
        .from("posts")
        .select("author_id, title, slug")
        .eq("id", input.postId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("username, full_name")
        .eq("id", user.id)
        .maybeSingle<ProfileSummary>(),
    ]);

  if (postError) return { error: postError.message, liked: false, count: 0 };
  if (!post) return { error: "Post not found.", liked: false, count: 0 };

  if (!input.nextLiked) {
    const { error } = await supabase
      .from("likes")
      .delete()
      .eq("user_id", user.id)
      .eq("post_id", input.postId);

    if (error) {
      const count = await getLikeCount(supabase, input.postId);
      return { error: error.message, liked: true, count };
    }

    return finish(supabase, post.slug, input.postId, false);
  }

  const { data: existingLike, error: existingError } = await supabase
    .from("likes")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("post_id", input.postId)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message, liked: false, count: 0 };
  }

  if (existingLike) {
    return finish(supabase, post.slug, input.postId, true);
  }

  const { error: likeError } = await supabase.from("likes").insert({
    user_id: user.id,
    post_id: input.postId,
  });

  if (likeError) {
    if (isDuplicateKeyError(likeError)) {
      return finish(supabase, post.slug, input.postId, true);
    }

    const count = await getLikeCount(supabase, input.postId);
    return { error: likeError.message, liked: false, count };
  }

  if (post.author_id !== user.id) {
    const actorName = displayName(actorProfile);
    const ctaPath = `/post/${post.slug}`;

    // uniq_unread_like_notification (partial unique index on notifications) collapses
    // repeated unlike/relike toggles into one pending notification atomically — a
    // pre-check-then-insert here can't work because the SELECT runs as the liker and
    // notifications SELECT RLS only permits reading rows where auth.uid() = user_id
    // (the recipient), and it would be racy under concurrent toggles regardless.
    const { error: notificationError } = await supabase.from("notifications").insert({
      user_id: post.author_id,
      type: "like",
      message: `${actorName} liked your post: ${post.title}`,
      link: ctaPath,
      actor_id: user.id,
      post_id: input.postId,
      read: false,
    });

    if (notificationError) {
      if (!isDuplicateKeyError(notificationError)) {
        console.error(`Failed to create like notification: ${notificationError.message}`);
      }
      // Duplicate = the author already has an unread like notification from this
      // actor for this post; they've already been told, so skip push/email too.
    } else {
      const pushResult = await sendPushNotification({
        recipientId: post.author_id,
        title: "New like on your post",
        body: `${actorName} liked "${post.title}"`,
        path: ctaPath,
        preferenceKey: "push_likes",
        cooldownMs: ENGAGEMENT_PUSH_COOLDOWN_MS,
      });
      logPushResult(`like:${user.id}:${input.postId}`, pushResult);

      const emailResult = await sendUserEmail({
        recipientId: post.author_id,
        subject: `${actorName} liked your Indegenius post`,
        preview: `${actorName} liked "${post.title}".`,
        title: "New like on your post",
        intro: `${actorName} liked "${post.title}".`,
        ctaLabel: "View your post",
        ctaPath,
        idempotencyKey: `like:${input.postId}:${post.author_id}:${user.id}`,
        preferenceKey: "email_likes",
        cooldownMs: ENGAGEMENT_PUSH_COOLDOWN_MS,
      });
      logEmailResult(`like:${input.postId}:${post.author_id}`, emailResult);
    }
  }

  return finish(supabase, post.slug, input.postId, true);
}
