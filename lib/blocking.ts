import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * IDs the given user has blocked (blocker's view only). Uses the admin
 * client because callers often hold a service-role reader already and the
 * result feeds service-role queries that bypass RLS.
 */
export async function getBlockedUserIds(userId: string | null): Promise<string[]> {
  if (!userId) return [];

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_blocks")
      .select("blocked_id")
      .eq("blocker_id", userId);

    if (error) {
      console.error("[blocking] failed to load blocked user ids", error);
      return [];
    }

    return (data ?? []).map((row) => row.blocked_id as string);
  } catch {
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
