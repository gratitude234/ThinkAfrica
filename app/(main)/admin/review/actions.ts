"use server";

import { createClient } from "@/lib/supabase/server";

export async function approvePost(postId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("posts")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", postId);

  if (error) {
    return { error: error.message };
  }

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("author_id, slug, title")
    .eq("id", postId)
    .single();

  if (postError) {
    return { error: postError.message };
  }

  const { error: notificationError } = await supabase.from("notifications").insert({
    user_id: post.author_id,
    type: "post_approved",
    message: `Your post "${post.title}" has been approved and is now live.`,
    link: `/post/${post.slug}`,
    read: false,
  });

  return { error: notificationError?.message ?? null };
}

export async function rejectPost(postId: string, reason?: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("posts")
    .update({ status: "rejected" })
    .eq("id", postId);

  if (error) {
    return { error: error.message };
  }

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("author_id, title")
    .eq("id", postId)
    .single();

  if (postError) {
    return { error: postError.message };
  }

  const rejectionReason = reason?.trim();
  const { error: notificationError } = await supabase.from("notifications").insert({
    user_id: post.author_id,
    type: "post_rejected",
    message: rejectionReason
      ? `Your post "${post.title}" was not approved: ${rejectionReason}`
      : `Your post "${post.title}" was not approved. Visit your dashboard for details.`,
    link: "/dashboard",
    read: false,
  });

  return { error: notificationError?.message ?? null };
}
