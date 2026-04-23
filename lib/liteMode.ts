export const LITE_MODE_COOKIE = "ta_lite";

/** Read the lite mode cookie in a Server Component context */
export function isLiteModeServer(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;

  return cookieHeader
    .split(";")
    .some((cookie) => cookie.trim().startsWith(`${LITE_MODE_COOKIE}=1`));
}
