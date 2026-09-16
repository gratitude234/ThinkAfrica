import { NextRequest, NextResponse } from "next/server";

import {
  fetchNotificationRows,
  fetchUnreadCount,
} from "@/lib/notificationData";
import { mutedNotificationTypes } from "@/lib/notificationPreferences";
import { getCurrentUser } from "@/lib/serverAuth";
import { createClient } from "@/lib/supabase/server";

/**
 * The notification bell's inbox and badge, on the server.
 *
 * The bell used to query the database from the browser, against the anon key,
 * and RLS kept one member out of another's notifications. That arrangement has
 * no successor: after the migration there is no key a browser could hold,
 * because a connection string is not a public credential. Same move search and
 * bookmarks made, for the same reason.
 *
 * Two things follow from it, and both are improvements rather than costs:
 *
 * - The viewer comes from the session. The bell used to pass its own `userId`
 *   prop into the query, which RLS then had to disagree with if it was wrong.
 *   Here it is resolved once, on the server, and cannot be chosen by a caller.
 * - The mute list is read here too. The bell fetched it separately through
 *   `get_my_profile_private()`, which derives the reader from `auth.uid()` and
 *   so returns nothing over a direct connection. Reading the preference on the
 *   server is what lets that call stop being on the browser's path at all.
 */

export const dynamic = "force-dynamic";

/** The bell's dropdown. The badge is counted separately, because the list is
 *  capped and the unread total is not. */
const DEFAULT_LIMIT = 10;

/** The /notifications page reads more of the same list. Bounded, so the limit
 *  is a request parameter rather than something a caller can set to anything. */
const MAX_LIMIT = 50;

function resolveLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const supabase = await createClient();

  // On failure this falls back to muting nothing: an unreadable preference
  // should under-filter rather than silently hide a reader's notifications.
  let mutedTypes: string[] = [];
  try {
    const { data } = await supabase.rpc("get_my_profile_private");
    const privateProfile = data as { notification_prefs?: unknown } | null;
    mutedTypes = mutedNotificationTypes(
      privateProfile?.notification_prefs as never
    );
  } catch {
    mutedTypes = [];
  }

  // Both apply the same mute list, or the badge counts notifications the
  // dropdown will not show.
  const [rows, count] = await Promise.all([
    fetchNotificationRows(
      supabase,
      user.id,
      resolveLimit(request.nextUrl.searchParams.get("limit")),
      mutedTypes
    ),
    fetchUnreadCount(supabase, user.id, mutedTypes),
  ]);

  if (rows.error) {
    console.error("[api/notifications] list failed", rows.error);
  }

  return NextResponse.json({
    notifications: rows.error ? null : rows.rows,
    // null rather than zero when the count could not be taken, so the bell
    // leaves a stale badge alone instead of clearing it.
    unreadCount: count.count,
  });
}
