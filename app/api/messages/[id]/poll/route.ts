import { NextRequest, NextResponse } from "next/server";

import { messagingRepository } from "@/lib/db/readAdapter";
import { getCurrentUser } from "@/lib/serverAuth";
import { createClient } from "@/lib/supabase/server";

/**
 * New messages in one conversation, and the other participant's read cursor.
 *
 * A route handler because the thread polls this every twelve seconds. The
 * polling shape is unchanged; only the transport moved.
 *
 * ## Membership is checked here, and it is the whole of the access control
 *
 * The browser query filtered on a `conversationId` from the URL and nothing
 * else. `is_conversation_participant()` was doing the rest, and it will not be
 * doing it after the migration: it reads `auth.uid()`, which is null on a
 * direct connection.
 *
 * So the repository takes the viewer and every statement carries the
 * membership predicate. A viewer who is not a participant gets 403 and no
 * rows, rather than an empty page that looks like a quiet conversation. The
 * browser names the conversation; the server decides who is asking.
 */

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { id: conversationId } = await params;
  const search = request.nextUrl.searchParams;
  const since = search.get("since") ?? new Date(0).toISOString();
  const otherUserId = search.get("otherUserId");

  // A malformed cursor must not become "everything since the epoch" silently:
  // the thread would append the entire history to what it already shows.
  if (Number.isNaN(Date.parse(since))) {
    return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const repository = messagingRepository(supabase);

    const messages = await repository.threadMessages({
      conversationId,
      viewerId: user.id,
      since,
    });

    // Null means not a participant. Distinct from an empty array, which is the
    // normal answer when nothing new has been said.
    if (messages === null) {
      return NextResponse.json({ error: "Not in this conversation." }, { status: 403 });
    }

    const otherLastReadAt = otherUserId
      ? await repository.otherLastReadAt({
          conversationId,
          viewerId: user.id,
          otherUserId,
        })
      : null;

    return NextResponse.json({ messages, otherLastReadAt });
  } catch (error) {
    console.error("[api/messages/poll] failed", error);
    return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  }
}
