"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logEmailResult, sendUserEmail } from "@/lib/email";

type TogglePostLikeInput = {
  postId: string;
  nextLiked: boolean;
};

type ProfileSummary = {
  username: string | null;
  full_name: string | null;
};

function displayName(profile: ProfileSummary | null) {
  return profile?.full_name?.trim() || profile?.username?.trim() || "A ThinkAfrica reader";
}

function isDuplicateLikeError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  return error.code === "23505" || message.includes("duplicate key");
}

export async function togglePostLike(input: TogglePostLikeInput): Promise<{
  error: string | null;
  liked: boolean;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to like posts.", liked: false };
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

  if (postError) return { error: postError.message, liked: false };
  if (!post) return { error: "Post not found.", liked: false };

  if (!input.nextLiked) {
    const { error } = await supabase
      .from("likes")
      .delete()
      .eq("user_id", user.id)
      .eq("post_id", input.postId);

    if (error) return { error: error.message, liked: true };

    revalidatePath(`/post/${post.slug}`);
    return { error: null, liked: false };
  }

  const { data: existingLike, error: existingError } = await supabase
    .from("likes")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("post_id", input.postId)
    .maybeSingle();

  if (existingError) return { error: existingError.message, liked: false };

  if (existingLike) {
    revalidatePath(`/post/${post.slug}`);
    return { error: null, liked: true };
  }

  const { error: likeError } = await supabase.from("likes").insert({
    user_id: user.id,
    post_id: input.postId,
  });

  if (likeError) {
    if (isDuplicateLikeError(likeError)) {
      revalidatePath(`/post/${post.slug}`);
      return { error: null, liked: true };
    }

    return { error: likeError.message, liked: false };
  }

  if (post.author_id !== user.id) {
    const actorName = displayName(actorProfile);
    const ctaPath = `/post/${post.slug}`;
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
      console.error(`Failed to create like notification: ${notificationError.message}`);
    } else {
      const emailResult = await sendUserEmail({
        recipientId: post.author_id,
        subject: `${actorName} liked your ThinkAfrica post`,
        preview: `${actorName} liked your post.`,
        title: "New like on your post",
        intro: `${actorName} liked "${post.title}".`,
        ctaLabel: "View post",
        ctaPath,
        idempotencyKey: `like:${user.id}:${input.postId}`,
        preferenceKey: "email_likes",
      });
      logEmailResult(`like:${user.id}:${input.postId}`, emailResult);
    }
  }

  revalidatePath(`/post/${post.slug}`);
  return { error: null, liked: true };
}
