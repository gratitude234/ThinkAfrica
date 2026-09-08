"use server";

import {
  dismissNotification as dismissNotificationRow,
  markAllNotificationsRead as markAllNotificationsReadRows,
  markNotificationsRead as markNotificationsReadRows,
  restoreUnread as restoreUnreadRows,
  undismissNotification as undismissNotificationRow,
  type NotificationMutationResult,
} from "@/lib/notificationMutations";
import { getCurrentUser } from "@/lib/serverAuth";
import { createClient } from "@/lib/supabase/server";

/**
 * The notification inbox's writes, on the server.
 *
 * `lib/notificationMutations.ts` held five mutations and took the acting user
 * as an argument. Two client components called them with the browser's own
 * Supabase client, so these were browser writes against a member id the
 * browser supplied. RLS refused a wrong id and a direct connection would not.
 *
 * They were also invisible to `lib/browserWriteBoundary.test.ts`, which scans
 * files carrying a "use client" directive: the mutations live in a helper that
 * carries none, so the writes were in the browser while the guard reported
 * zero. That gap is closed by the structural test added with this change.
 *
 * The mutation bodies are unchanged and still take a client and a user id.
 * They are worth keeping that way: they encode the scoping rule (every
 * statement filters on the user as well as the ids, independent of RLS) and
 * the unique-violation handling, and both are tested directly. What changes is
 * who supplies the user, and from where.
 */

/**
 * Resolves the viewer, then runs the mutation with it.
 *
 * The result types are preserved exactly: two of these return more than an
 * error, and the callers use those extra fields for the undo affordance. A
 * wrapper that flattened them to `{ error }` would silently remove "undo"
 * from the inbox.
 */
async function withViewer<T extends { error: string | null }>(
  run: (
    client: Awaited<ReturnType<typeof createClient>>,
    viewerId: string
  ) => Promise<T>,
  whenSignedOut: T
): Promise<T> {
  const user = await getCurrentUser();
  if (!user) return whenSignedOut;

  const supabase = await createClient();
  return run(supabase, user.id);
}

const NOT_SIGNED_IN = "Not signed in." as const;

export async function markNotificationsReadAction(
  notificationIds: string[]
): Promise<NotificationMutationResult> {
  return withViewer(
    (client, viewerId) =>
      markNotificationsReadRows(client as never, viewerId, notificationIds),
    { error: NOT_SIGNED_IN }
  );
}

export async function markAllNotificationsReadAction(): Promise<
  NotificationMutationResult & { affectedIds: string[] }
> {
  return withViewer(
    (client, viewerId) => markAllNotificationsReadRows(client as never, viewerId),
    { error: NOT_SIGNED_IN, affectedIds: [] }
  );
}

export async function restoreUnreadAction(
  notificationIds: string[]
): Promise<NotificationMutationResult & { conflict: boolean }> {
  return withViewer(
    (client, viewerId) =>
      restoreUnreadRows(client as never, viewerId, notificationIds),
    { error: NOT_SIGNED_IN, conflict: false }
  );
}

export async function dismissNotificationAction(
  notificationId: string
): Promise<NotificationMutationResult> {
  return withViewer(
    (client, viewerId) =>
      dismissNotificationRow(client as never, viewerId, notificationId),
    { error: NOT_SIGNED_IN }
  );
}

export async function undismissNotificationAction(
  notificationId: string
): Promise<NotificationMutationResult> {
  return withViewer(
    (client, viewerId) =>
      undismissNotificationRow(client as never, viewerId, notificationId),
    { error: NOT_SIGNED_IN }
  );
}
