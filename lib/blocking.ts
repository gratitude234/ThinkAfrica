import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * IDs the given user has blocked (blocker's view only). Uses the admin
 * client because callers often hold a service-role reader already and the
 * result feeds service-role queries that bypass RLS.
 */
export async function getBlockedUserIds(
  userId: string | null,
  options: { strict?: boolean } = {}
): Promise<string[]> {
  if (!userId) return [];

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_blocks")
      .select("blocked_id")
      .eq("blocker_id", userId);

    if (error) {
      console.error("[blocking] failed to load blocked user ids", error);
      if (options.strict) {
        throw new Error("Unable to apply blocked-user exclusions.");
      }
      return [];
    }

    return (data ?? []).map((row) => row.blocked_id as string);
  } catch (error) {
    if (options.strict) throw error;
    return [];
  }
}

/** IDs in either direction of a block, for public-content eligibility. */
export async function getFeedExcludedUserIds(
  userId: string | null,
  options: { strict?: boolean } = {}
): Promise<string[]> {
  if (!userId) return [];

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_blocks")
      .select("blocker_id, blocked_id")
      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

    if (error) {
      console.error("[blocking] failed to load feed block exclusions", error);
      if (options.strict) {
        throw new Error("Unable to apply feed block exclusions.");
      }
      return [];
    }

    return Array.from(
      new Set(
        (data ?? [])
          .map((row) =>
            row.blocker_id === userId ? row.blocked_id : row.blocker_id
          )
          .filter((id): id is string => Boolean(id && id !== userId))
      )
    );
  } catch (error) {
    if (options.strict) throw error;
    return [];
  }
}

/**
 * Post IDs that credit any excluded user as an accepted author. This closes
 * the gap where filtering only posts.author_id could re-surface a blocked
 * person through a co-authored publication.
 */
export async function getPostIdsWithExcludedAuthors(
  postIds: string[],
  excludedAuthorIds: string[],
  options: { strict?: boolean } = {}
): Promise<string[]> {
  if (postIds.length === 0 || excludedAuthorIds.length === 0) return [];

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("post_authors")
      .select("post_id")
      .in("post_id", postIds)
      .in("user_id", excludedAuthorIds)
      .not("accepted_at", "is", null);

    if (error) {
      console.error("[blocking] failed to load excluded co-authored posts", error);
      if (options.strict) {
        throw new Error("Unable to apply co-author exclusions.");
      }
      return [];
    }

    return Array.from(
      new Set((data ?? []).map((row) => row.post_id as string))
    );
  } catch (error) {
    if (options.strict) throw error;
    return [];
  }
}

/** True when either user has blocked the other. */
export async function isBlockedPair(userA: string, userB: string): Promise<boolean> {
  if (!userA || !userB) return false;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_blocks")
      .select("blocker_id")
      .or(
        `and(blocker_id.eq.${userA},blocked_id.eq.${userB}),and(blocker_id.eq.${userB},blocked_id.eq.${userA})`
      )
      .limit(1);

    if (error) {
      console.error("[blocking] failed to check blocked pair", error);
      return false;
    }

    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}
