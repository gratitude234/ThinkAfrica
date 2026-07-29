export default function Loading() {
  return (
    <div
      className="mx-auto max-w-5xl animate-pulse motion-reduce:animate-none"
      role="status"
      aria-label="Loading Explore"
    >
      {/* Heading */}
      <div className="mb-6">
        <div className="h-8 w-44 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-gray-100" />
      </div>

      {/* Tab strip */}
      <div className="mb-6 flex gap-2 border-b border-gray-200 pb-3">
        {[64, 80, 72, 88].map((w, i) => (
          <div key={i} className="h-8 rounded-full bg-gray-100" style={{ width: w }} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Result cards */}
        <div className="space-y-4 lg:col-span-2">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-xl border border-gray-200 bg-white p-5"
            >
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 shrink-0 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 rounded bg-gray-200" />
                  <div className="h-2.5 w-24 rounded bg-gray-100" />
                </div>
              </div>
              <div className="h-5 w-4/5 rounded bg-gray-200" />
              <div className="h-4 w-full rounded bg-gray-100" />
              <div className="h-4 w-3/5 rounded bg-gray-100" />
            </div>
          ))}
        </div>

        {/* People / topics rail */}
        <div className="hidden space-y-6 lg:block">
          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
            <div className="h-4 w-32 rounded bg-gray-200" />
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 shrink-0 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-24 rounded bg-gray-200" />
                  <div className="h-2.5 w-16 rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="mt-3 flex flex-wrap gap-2">
              {[56, 72, 48, 64, 80].map((w, i) => (
                <div key={i} className="h-7 rounded-full bg-gray-100" style={{ width: w }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <span className="sr-only">Loading Explore…</span>
    </div>
  );
}
