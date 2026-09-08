import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { viewerStateRepository } from "@/lib/db/readAdapter";

/**
 * Whether one member may message another.
 *
 * Split out of `lib/messaging.ts` because this half reads the database through
 * the adapter and is therefore `server-only`, while `findOrCreateConversation`
 * is still called from two client components. Leaving them together pulled the
 * whole server repository graph into the browser bundle, which the build
 * refused. Worth keeping apart on its own merits: one asks a question about two
 * people, the other starts a conversation between them.
 */
export async function getMessageEligibility(
  supabase: SupabaseClient,
  currentUserId: string,
  targetUserId: string
): Promise<{ eligible: boolean; reason: string | null }> {
  if (currentUserId === targetUserId) {
    return { eligible: false, reason: null };
  }

  const blocked = await viewerStateRepository(supabase).isBlockedPair(
    currentUserId,
    targetUserId
  );

  if (blocked) {
    // Deliberately no reason: blocking is never disclosed to the blocked side.
    return { eligible: false, reason: null };
  }

  return { eligible: true, reason: null };
}
