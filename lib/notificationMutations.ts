/**
 * Shared read/dismiss mutations for the notification inbox.
 *
 * Both notification surfaces (the bell dropdown and /notifications) need the same
 * writes, and previously each surface inlined its own Supabase call -- which is how
 * the bell ended up with an optimistic "mark all read" that silently ignored
 * failures while the page handled the error. Centralising them keeps the two in
 * step and makes the behaviour testable without a browser.
 */

export interface NotificationMutationClient {
  from: (table: string) => any;
}

export interface NotificationMutationResult {
  error: string | null;
}

/** Postgres unique-violation. See the conflict note on restoreUnread(). */
const UNIQUE_VIOLATION = "23505";

function toResult(error: { message?: string } | null): NotificationMutationResult {
  return { error: error?.message ?? null };
}

/**
 * Mark specific notifications read. Scoped to `userId` as well as the ids so a
 * stale id from another account can never be written, independent of RLS.
 */
export async function markNotificationsRead(
  client: NotificationMutationClient,
  userId: string,
  notificationIds: string[]
): Promise<NotificationMutationResult> {
  if (notificationIds.length === 0) return { error: null };

  const { error } = await client
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .in("id", notificationIds)
    .eq("read", false);

  return toResult(error);
}

/**
 * Mark every unread notification read, returning the ids that were actually
 * changed so the caller can offer an undo. Rows already read are left alone and
 * excluded from the returned set -- undoing must not mark something unread that
 * the user had read before they pressed the button.
 */
export async function markAllNotificationsRead(
  client: NotificationMutationClient,
  userId: string
): Promise<NotificationMutationResult & { affectedIds: string[] }> {
  const { data, error } = await client
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false)
    .is("dismissed_at", null)
    .select("id");

  const affectedIds = ((data ?? []) as Array<{ id: string }>).map((row) => row.id);

  return { ...toResult(error), affectedIds };
}

/**
 * Undo a mark-all-read by restoring a specific set of rows to unread.
 *
 * This can legitimately fail: uniq_unread_like_notification allows only one unread
 * like per (user, actor, post), so if the same person re-liked the same post after
 * the bulk mark-read, restoring the older row collides with the newer unread one.
 * That surfaces as a unique violation rather than silent data loss, and the caller
 * is expected to tell the user and refetch rather than leave the UI lying.
 */
export async function restoreUnread(
  client: NotificationMutationClient,
  userId: string,
  notificationIds: string[]
): Promise<NotificationMutationResult & { conflict: boolean }> {
  if (notificationIds.length === 0) return { error: null, conflict: false };

  const { error } = await client
    .from("notifications")
    .update({ read: false })
    .eq("user_id", userId)
    .in("id", notificationIds);

  const conflict =
    (error as { code?: string } | null)?.code === UNIQUE_VIOLATION;

  return { ...toResult(error), conflict };
}

/**
 * Dismiss a notification: hide it from the inbox without deleting it.
 *
 * Also sets read = true -- you cannot dismiss something you have not seen, and
 * leaving a dismissed row unread would keep it counted in the bell badge, which is
 * the exact confusion dismissal exists to remove.
 */
export async function dismissNotification(
  client: NotificationMutationClient,
  userId: string,
  notificationId: string
): Promise<NotificationMutationResult> {
  const { error } = await client
    .from("notifications")
    .update({ dismissed_at: new Date().toISOString(), read: true })
    .eq("user_id", userId)
    .eq("id", notificationId);

  return toResult(error);
}

/** Undo a dismissal. Leaves `read` alone: restoring visibility is not unreading. */
export async function undismissNotification(
  client: NotificationMutationClient,
  userId: string,
  notificationId: string
): Promise<NotificationMutationResult> {
  const { error } = await client
    .from("notifications")
    .update({ dismissed_at: null })
    .eq("user_id", userId)
    .eq("id", notificationId);

  return toResult(error);
}
