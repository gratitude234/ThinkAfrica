"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateProfileFeaturedPosts(postIds: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to manage featured work." };
  }

  const normalizedPostIds = postIds.map((postId) => postId.trim()).filter(Boolean);
  const uniquePostIds = Array.from(new Set(normalizedPostIds));

  if (normalizedPostIds.length !== uniquePostIds.length) {
    return { error: "Choose each featured post only once." };
  }

  if (uniquePostIds.length > 3) {
    return { error: "You can feature up to three posts." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  if (!profile?.username) {
    return { error: "Complete your profile before featuring work." };
  }

  if (uniquePostIds.length > 0) {
    const [{ data: posts }, { data: coAuthorRows }] = await Promise.all([
      supabase
        .from("posts")
        .select("id, author_id, status")
        .in("id", uniquePostIds),
      supabase
        .from("post_authors")
        .select("post_id")
        .eq("user_id", user.id)
        .not("accepted_at", "is", null)
        .in("post_id", uniquePostIds),
    ]);

    const acceptedCoAuthoredPostIds = new Set(
      (coAuthorRows ?? []).map((row) => row.post_id)
    );
    const eligiblePostIds = new Set(
      (posts ?? [])
        .filter(
          (post) =>
            post.status === "published" &&
            (post.author_id === user.id || acceptedCoAuthoredPostIds.has(post.id))
        )
        .map((post) => post.id)
    );

    if (eligiblePostIds.size !== uniquePostIds.length) {
      return {
        error:
          "Featured work must be published and belong to you as an author or accepted co-author.",
      };
    }
  }

  const { error: deleteError } = await supabase
    .from("profile_featured_posts")
    .delete()
    .eq("user_id", user.id);

  if (deleteError) {
    return { error: deleteError.message };
  }

  if (uniquePostIds.length > 0) {
    const { error: insertError } = await supabase
      .from("profile_featured_posts")
      .insert(
        uniquePostIds.map((postId, index) => ({
          user_id: user.id,
          post_id: postId,
          position: index + 1,
        }))
      );

    if (insertError) {
      return { error: insertError.message };
    }
  }

  revalidatePath(`/${profile.username}`);
  return {};
}
