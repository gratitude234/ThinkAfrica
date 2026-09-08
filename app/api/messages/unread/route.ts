import { NextResponse } from "next/server";

import { messagingRepository } from "@/lib/db/readAdapter";
import { getCurrentUser } from "@/lib/serverAuth";
import { createClient } from "@/lib/supabase/server";

/**
 * The unread conversations badge.
 *
 * A route handler rather than a server action because this is polled: the
 * badge sits in the app shell on every authenticated page and refreshes on a
 * timer. HTTP is the honest boundary for something that behaves like a
 * resource.
 *
 * The viewer comes from the session. The component used to pass its own
 * `userId` prop into the query, which RLS then had to disagree with if it was
 * ever wrong.
 *
 * `count: null` on failure, never `0`. A badge that clears itself during an
 * outage tells a member they have no messages, which is worse than a stale
 * number and is the exact bug pattern this migration keeps finding.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const supabase = await createClient();
    const count = await messagingRepository(supabase).unreadConversationCount(
      user.id
    );
    return NextResponse.json({ count });
  } catch (error) {
    console.error("[api/messages/unread] failed", error);
    return NextResponse.json({ count: null }, { status: 503 });
  }
}
