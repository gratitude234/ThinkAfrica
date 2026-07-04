import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const SUSPENDED_ERROR =
  "Your account is currently suspended. You can browse but cannot post, comment, or message.";

export async function getSuspension(userId: string): Promise<{
  suspendedAt: string | null;
  reason: string | null;
}> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("suspended_at, suspended_reason")
      .eq("id", userId)
      .maybeSingle();

    return {
      suspendedAt: (data?.suspended_at as string | null) ?? null,
      reason: (data?.suspended_reason as string | null) ?? null,
    };
  } catch {
    return { suspendedAt: null, reason: null };
  }
}

/** Returns an error message when the user is suspended, otherwise null. */
export async function requireNotSuspended(userId: string): Promise<string | null> {
  const { suspendedAt } = await getSuspension(userId);
  return suspendedAt ? SUSPENDED_ERROR : null;
}
