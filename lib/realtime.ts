export function shouldUseRealtime() {
  if (process.env.NEXT_PUBLIC_ENABLE_REALTIME !== "1") return false;

  if (typeof document !== "undefined" && document.cookie.includes("ta_lite=1")) {
    return false;
  }

  return true;
}
