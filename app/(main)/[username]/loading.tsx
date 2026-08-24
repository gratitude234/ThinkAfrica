export default function Loading() {
  return (
    <div
      className="mx-auto max-w-[900px] animate-pulse space-y-6 motion-reduce:animate-none"
      role="status"
      aria-label="Loading this profile"
    >
      <section className="overflow-hidden rounded-xl border border-card-border bg-card">
        <div className="h-20 bg-gray-100 sm:h-24" />
        <div className="space-y-5 p-5 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row">
            <div className="-mt-12 h-[88px] w-[88px] shrink-0 rounded-full border-4 border-card bg-gray-200" />
            <div className="flex-1 space-y-3">
              <div className="h-8 w-48 rounded bg-gray-200" />
              <div className="h-4 w-28 rounded bg-gray-100" />
              <div className="h-4 w-64 max-w-full rounded bg-gray-100" />
              <div className="h-4 w-52 max-w-full rounded bg-gray-100" />
            </div>
            <div className="h-11 w-32 rounded-lg bg-gray-200" />
          </div>
          <div className="space-y-2 border-t border-card-border pt-5">
            <div className="h-4 w-16 rounded bg-gray-100" />
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-4/5 rounded bg-gray-100" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 border-t border-card-border bg-canvas/70 px-5 py-4">
          {[0, 1, 2].map((item) => (
            <div key={item} className="space-y-2">
              <div className="h-3 w-20 max-w-full rounded bg-gray-100" />
              <div className="h-8 w-12 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="h-7 w-64 rounded bg-gray-200" />
        {[0, 1, 2].map((item) => (
          <div key={item} className="space-y-3 rounded-xl border border-card-border bg-card p-5">
            <div className="h-3 w-24 rounded bg-gray-100" />
            <div className="h-6 w-3/4 rounded bg-gray-200" />
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-2/3 rounded bg-gray-100" />
          </div>
        ))}
      </section>

      <span className="sr-only">Loading this profile...</span>
    </div>
  );
}
