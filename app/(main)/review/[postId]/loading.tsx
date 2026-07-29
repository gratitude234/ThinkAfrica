export default function Loading() {
  return (
    <div
      className="mx-auto grid max-w-6xl gap-8 animate-pulse motion-reduce:animate-none lg:grid-cols-[minmax(0,1fr)_360px]"
      role="status"
      aria-label="Loading the manuscript under review"
    >
      {/* Manuscript column */}
      <div className="min-w-0">
        <div className="h-3 w-32 rounded bg-gray-100" />
        <div className="mt-3 h-9 w-4/5 rounded bg-gray-200" />

        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
          <div className="h-3.5 w-24 rounded bg-gray-100" />
          <div className="mt-3 space-y-2">
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-3/4 rounded bg-gray-100" />
          </div>
        </div>

        {/* Body */}
        <div className="mt-8 space-y-3">
          {[100, 96, 100, 88, 100, 72, 100, 92, 64].map((w, i) => (
            <div key={i} className="h-4 rounded bg-gray-100" style={{ width: `${w}%` }} />
          ))}
        </div>

        {/* References */}
        <div className="mt-8">
          <div className="h-5 w-32 rounded bg-gray-200" />
          <div className="mt-3 space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-3.5 w-11/12 rounded bg-gray-100" />
            ))}
          </div>
        </div>
      </div>

      {/* Review form rail */}
      <aside className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="h-5 w-36 rounded bg-gray-200" />
          <div className="mt-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 w-full rounded-lg bg-gray-100" />
            ))}
            <div className="h-32 w-full rounded-lg bg-gray-100" />
            <div className="h-11 w-full rounded-lg bg-gray-200/70" />
          </div>
        </div>
      </aside>

      <span className="sr-only">Loading the manuscript under review…</span>
    </div>
  );
}
