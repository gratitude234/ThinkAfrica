export async function markNotificationRead(notificationId: string) {
  const response = await fetch(
    `/api/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }
  );
  if (!response.ok) {
    throw new Error("Unable to mark notification as read");
  }
}
