export default function WriteCanvasSkeleton() {
  return (
    <div
      className="mx-auto min-h-screen max-w-[1240px] animate-pulse px-5 pb-24 sm:px-8 lg:px-8 xl:px-10"
      role="status"
      aria-label="Loading the writing canvas"
    >
      <div
        className="flex items-center justify-between py-3.5"
        style={{ paddingTop: "max(0.875rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gray-200/70" />
          <div className="hidden space-y-1.5 lg:block">
            <div className="h-3.5 w-28 rounded bg-gray-200/70" />
            <div className="h-3 w-48 rounded bg-gray-200/50" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gray-200/60" />
          <div className="h-3 w-11 rounded bg-gray-200/70" />
          <div className="h-8 w-[72px] rounded-lg bg-gray-200/70" />
        </div>
      </div>

      <div className="grid items-start gap-10 pt-3 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12 xl:grid-cols-[780px_300px] xl:justify-center">
        <div className="min-w-0">
          <div className="mb-8 hidden h-[52px] items-center gap-2 rounded-xl border border-gray-200 bg-white/70 px-3 lg:flex">
            {[0, 1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="h-9 w-9 rounded-lg bg-gray-200/60" />
            ))}
            <div className="ml-auto h-3 w-28 rounded bg-gray-200/60" />
          </div>

          <div className="h-10 w-2/5 min-w-32 rounded-md bg-gray-200/70 lg:h-14 lg:w-3/4" />
          <div className="mt-5 space-y-3">
            <div className="h-5 w-full rounded bg-gray-200/50" />
            <div className="h-5 w-3/4 rounded bg-gray-200/50" />
          </div>

          <div className="h-[210px] lg:h-[310px]" />

          <div className="h-12 rounded-xl border border-gray-200 bg-white/70 lg:hidden" />
        </div>

        <div className="hidden rounded-xl border border-gray-200 bg-white/70 p-4 lg:block">
          <div className="h-4 w-24 rounded bg-gray-200/70" />
          <div className="mt-5 h-3 w-full rounded bg-gray-200/50" />
          <div className="mt-2 h-3 w-2/3 rounded bg-gray-200/50" />
          <div className="mt-5 h-14 rounded-lg border border-dashed border-gray-200" />
        </div>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto max-w-[1080px] px-5 sm:px-8 lg:px-10">
          <div className="flex items-center gap-2 py-2.5 lg:w-[calc(100%-340px)]">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-9 w-9 rounded-lg bg-gray-200/60" />
            ))}
          </div>
        </div>
      </div>

      <span className="sr-only">Loading the writing canvas…</span>
    </div>
  );
}
