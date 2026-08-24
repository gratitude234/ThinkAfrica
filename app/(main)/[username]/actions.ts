"use server";

import { revalidatePath } from "next/cache";
import { FEATURE_FLAGS, RESEARCH_TYPE_QUERY_EXCLUSION } from "@/lib/featureFlags";
import { createClient } from "@/lib/supabase/server";

export async function loadMyFeaturedWorkOptions() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { options: [], error: "You must be signed in to manage featured work." };
  }

  const optionSelect = "id, author_id, title, slug, type, published_at, created_at";
  let ownedQuery = supabase
    .from("posts")
    .select(optionSelect)
    .eq("author_id", user.id)
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (!FEATURE_FLAGS.research) {
    ownedQuery = ownedQuery.neq("type", RESEARCH_TYPE_QUERY_EXCLUSION);
  }

  const [ownedResult, coauthoredResult] = await Promise.all([
    ownedQuery,
    supabase
      .from("post_authors")
      .select(
        `posts!post_authors_post_id_fkey(${optionSelect}, status)`
      )
      .eq("user_id", user.id)
      .not("accepted_at", "is", null),
  ]);

  if (ownedResult.error) return { options: [], error: ownedResult.error.message };
  if (coauthoredResult.error) {
    return { options: [], error: coauthoredResult.error.message };
  }

  type Option = {
    id: string;
    author_id: string;
    title: string | null;
    slug: string;
    type: string;
    published_at: string | null;
    created_at: string;
    status?: string;
    isCoAuthor?: boolean;
  };
  type CoauthoredRow = { posts: Option | Option[] | null };

  const owned = (ownedResult.data ?? []) as unknown as Option[];
  const coauthored = ((coauthoredResult.data ?? []) as unknown as CoauthoredRow[])
    .flatMap((row) => {
      const post = Array.isArray(row.posts) ? row.posts[0] : row.posts;
      if (
        !post ||
        post.status !== "published" ||
        post.author_id === user.id ||
        (!FEATURE_FLAGS.research && post.type === "research")
      ) {
        return [];
      }
      return [{ ...post, isCoAuthor: true }];
    });

  const byId = new Map<string, Option>();
  for (const post of [...owned, ...coauthored]) byId.set(post.id, post);
  const options = [...byId.values()].sort((left, right) => {
    const leftTime = Date.parse(left.published_at ?? left.created_at);
    const rightTime = Date.parse(right.published_at ?? right.created_at);
    return rightTime - leftTime;
  });

  return { options, error: null };
}

export async function updateProfileFeaturedPosts(postIds: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to manage featured work." };
  }

  const normalizedPostIds = postIds.map((postId) => postId.trim()).filter(Boolean);

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  if (!profile?.username) {
    return { error: "Complete your profile before featuring work." };
  }

  const { error } = await supabase.rpc("replace_my_featured_posts", {
    p_post_ids: normalizedPostIds,
  });

  if (error) return { error: error.message };

  revalidatePath(`/${profile.username}`);
  revalidatePath(`/${profile.username}/record`);
  return {};
}
