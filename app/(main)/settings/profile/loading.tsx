/**
 * Mirrors Edit profile: the header, then its three section cards.
 */
export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-[720px] animate-pulse motion-reduce:animate-none"
      role="status"
      aria-label="Loading Edit profile"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded bg-gray-200" />
          <div className="h-4 w-72 max-w-full rounded bg-gray-100" />
        </div>
        <div className="h-11 w-28 rounded-lg bg-gray-100" />
      </div>

      <div className="mt-6 space-y-6">
        {[0, 1, 2].map((section) => (
          <div
            key={section}
            className="space-y-4 rounded-xl border border-card-border bg-card p-5 sm:p-6"
          >
            <div className="h-5 w-32 rounded bg-gray-200" />
            <div className="h-4 w-64 max-w-full rounded bg-gray-100" />
            {[0, 1].map((field) => (
              <div key={field} className="space-y-1.5">
                <div className="h-3 w-24 rounded bg-gray-100" />
                <div className="h-11 w-full rounded-lg bg-gray-100" />
              </div>
            ))}
            <div className="h-11 w-24 rounded-lg bg-gray-200" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading Edit profile...</span>
    </div>
  );
}
