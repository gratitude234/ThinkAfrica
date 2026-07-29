export default function Loading() {
  return (
    <div
      className="animate-pulse motion-reduce:animate-none"
      role="status"
      aria-label="Loading the operations hub"
    >
      <div className="mb-6">
        <div className="h-7 w-48 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-72 rounded bg-gray-100" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="h-3 w-24 rounded bg-gray-100" />
            <div className="mt-3 h-8 w-16 rounded bg-gray-200" />
            <div className="mt-2 h-3.5 w-32 rounded bg-gray-100" />
          </div>
        ))}
      </div>

      {/* Recent activity list */}
      <div className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="h-4 w-36 rounded bg-gray-200" />
        </div>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-4 last:border-0"
          >
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/3 rounded bg-gray-200" />
              <div className="h-3 w-32 rounded bg-gray-100" />
            </div>
            <div className="h-6 w-20 shrink-0 rounded-full bg-gray-100" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading the operations hub…</span>
    </div>
  );
}
