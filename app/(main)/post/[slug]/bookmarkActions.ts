"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ToggleBookmarkInput = {
  postId: string;
  nextBookmarked: boolean;
};

type ToggleBookmarkResult = {
  error: string | null;
  bookmarked: boolean;
};

function isDuplicateBookmarkError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  return error.code === "23505" || message.includes("duplicate key");
}

export async function toggleBookmark(
  input: ToggleBookmarkInput
): Promise<ToggleBookmarkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to bookmark posts.", bookmarked: false };
  }

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("slug")
    .eq("id", input.postId)
    .maybeSingle();

  if (postError) return { error: postError.message, bookmarked: false };
  if (!post) return { error: "Post not found.", bookmarked: false };

  if (!input.nextBookmarked) {
    const { error } = await supabase
      .from("bookmarks")
      .delete()
      .eq("user_id", user.id)
      .eq("post_id", input.postId);

    if (error) return { error: error.message, bookmarked: true };

    revalidatePath(`/post/${post.slug}`);
    return { error: null, bookmarked: false };
  }

  const { error: bookmarkError } = await supabase.from("bookmarks").insert({
    user_id: user.id,
    post_id: input.postId,
  });

  if (bookmarkError) {
    if (isDuplicateBookmarkError(bookmarkError)) {
      revalidatePath(`/post/${post.slug}`);
      return { error: null, bookmarked: true };
    }

    return { error: bookmarkError.message, bookmarked: false };
  }

  revalidatePath(`/post/${post.slug}`);
  return { error: null, bookmarked: true };
}
