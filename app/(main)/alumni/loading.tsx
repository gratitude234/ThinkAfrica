export default function Loading() {
  return (
    <div
      className="mx-auto max-w-3xl animate-pulse motion-reduce:animate-none"
      role="status"
      aria-label="Loading alumni"
    >
      <div className="mb-6">
        <div className="h-7 w-28 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
      </div>

      <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <div className="h-11 w-11 shrink-0 rounded-full bg-gray-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-40 rounded bg-gray-200" />
              <div className="h-3 w-56 rounded bg-gray-100" />
            </div>
            <div className="h-6 w-20 shrink-0 rounded-full bg-emerald-50" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading alumni…</span>
    </div>
  );
}
