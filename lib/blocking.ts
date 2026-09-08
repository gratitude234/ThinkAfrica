import "server-only";

import { viewerStateRepository } from "@/lib/db/readAdapter";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The repository, over the admin client on the un-migrated path.
 *
 * These reads have always used the service role: callers often hold one
 * already, and the result feeds service-role queries that bypass RLS anyway.
 * That is why no policy is reproduced on the PostgreSQL side.
 */
function repository() {
  return viewerStateRepository(createAdminClient() as never);
}

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
    return await repository().blockedUserIds(userId);
  } catch (error) {
    console.error("[blocking] failed to load blocked user ids", error);
    if (options.strict) {
      throw new Error("Unable to apply blocked-user exclusions.");
    }
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
    return await repository().blockRelatedUserIds(userId);
  } catch (error) {
    console.error("[blocking] failed to load feed block exclusions", error);
    if (options.strict) {
      throw new Error("Unable to apply feed block exclusions.");
    }
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
    return await repository().postIdsWithAuthors(postIds, excludedAuthorIds);
  } catch (error) {
    console.error("[blocking] failed to load excluded co-authored posts", error);
    if (options.strict) {
      throw new Error("Unable to apply co-author exclusions.");
    }
    return [];
  }
}

/** True when either user has blocked the other. */
export async function isBlockedPair(userA: string, userB: string): Promise<boolean> {
  if (!userA || !userB) return false;

  try {
    return await repository().isBlockedPair(userA, userB);
  } catch (error) {
    console.error("[blocking] failed to check blocked pair", error);
    return false;
  }
}
