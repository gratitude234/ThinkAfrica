/**
 * /me resolves the signed-in user's username server-side (auth + profile
 * lookup) before redirecting to /[username]. That's two round trips with
 * nothing painted, so show the profile header shape rather than a blank
 * screen — it lines up with the profile page this redirects into.
 */
export default function Loading() {
  return (
    <div
      className="mx-auto max-w-4xl animate-pulse motion-reduce:animate-none"
      role="status"
      aria-label="Opening your profile"
    >
      <div className="flex items-start gap-4">
        <div className="h-20 w-20 shrink-0 rounded-full bg-gray-200" />
        <div className="flex-1 space-y-2.5 pt-2">
          <div className="h-6 w-48 rounded bg-gray-200" />
          <div className="h-3.5 w-32 rounded bg-gray-100" />
          <div className="h-3.5 w-64 max-w-full rounded bg-gray-100" />
        </div>
      </div>

      <span className="sr-only">Opening your profile…</span>
    </div>
  );
}
