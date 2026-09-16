import { PROFILE_SHELL } from "@/lib/profileLayout";

/**
 * Mirrors the real page so nothing reshuffles when it resolves: the header
 * (photo, name, username, actions, one line, the counts), the tab row, then
 * list rows.
 */
export default function Loading() {
  return (
    <div
      className={`${PROFILE_SHELL} animate-pulse motion-reduce:animate-none`}
      role="status"
      aria-label="Loading this profile"
    >
      <div className="pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 shrink-0 rounded-full bg-gray-200" />
            <div className="space-y-2">
              <div className="h-8 w-52 max-w-full rounded bg-gray-200" />
              <div className="h-4 w-28 rounded bg-gray-100" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-11 w-28 rounded-lg bg-gray-200" />
            <div className="h-11 w-11 rounded-lg bg-gray-100" />
          </div>
        </div>
        <div className="mt-4 h-4 w-3/4 rounded bg-gray-100" />
        <div className="mt-3 h-4 w-40 rounded bg-gray-100" />
      </div>

      <div className="flex gap-6 border-b border-card-border pb-3">
        {[0, 1, 2].map((tab) => (
          <div key={tab} className="h-5 w-16 rounded bg-gray-100" />
        ))}
      </div>

      <div className="mt-6 divide-y divide-card-border">
        {[0, 1, 2].map((row) => (
          <div key={row} className="space-y-2 py-5">
            <div className="h-6 w-3/4 rounded bg-gray-200" />
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-3 w-24 rounded bg-gray-100" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading this profile...</span>
    </div>
  );
}
