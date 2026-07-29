export default function Loading() {
  return (
    <div
      className="mx-auto max-w-3xl animate-pulse motion-reduce:animate-none"
      role="status"
      aria-label="Loading your review assignments"
    >
      <div className="mb-8">
        <div className="h-7 w-52 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-80 rounded bg-gray-100" />
      </div>

      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-3 w-16 rounded bg-purple-100" />
                <div className="h-5 w-3/4 rounded bg-gray-200" />
                <div className="h-3.5 w-full rounded bg-gray-100" />
                <div className="h-3.5 w-2/3 rounded bg-gray-100" />
              </div>
              <div className="h-3 w-24 shrink-0 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only">Loading your review assignments…</span>
    </div>
  );
}
