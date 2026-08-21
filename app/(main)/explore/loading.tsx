/**
 * Mirrors the real Explore layout: same max width, same two-column template,
 * same order of blocks. The previous skeleton used max-w-5xl and a
 * three-column grid against a max-w-6xl page with a fixed 312px rail, and
 * showed post cards where the page renders a header and filter bar, so
 * content jumped sideways and downward as soon as it hydrated.
 */
export default function Loading() {
  return (
    <div
      className="mx-auto min-w-0 max-w-full animate-pulse overflow-x-clip motion-reduce:animate-none lg:max-w-6xl"
      role="status"
      aria-label="Loading Explore"
    >
      <div className="mb-4 sm:mb-5">
        <div className="h-7 w-72 max-w-full rounded bg-divider" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-divider/60" />
        <div className="mt-4 h-12 w-full max-w-3xl rounded-xl bg-divider/60 sm:mt-5 sm:h-[52px]" />
      </div>

      {/* Tab strip: underlined text, five items. */}
      <div className="mb-4 flex gap-1 border-b border-card-border pb-3 pt-1">
        {[64, 72, 60, 62, 62].map((width, index) => (
          <div
            key={index}
            className="h-5 rounded bg-divider/60"
            style={{ width }}
          />
        ))}
      </div>

      <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_312px] lg:gap-8">
        <div className="min-w-0">
          {/* Filter chips */}
          <div className="mb-4 flex gap-2">
            {[52, 68, 74, 78].map((width, index) => (
              <div
                key={index}
                className="h-11 rounded-full bg-divider/60"
                style={{ width }}
              />
            ))}
          </div>

          {/* Section heading */}
          <div className="mb-4">
            <div className="h-4 w-40 rounded bg-divider" />
            <div className="mt-1.5 h-3 w-64 max-w-full rounded bg-divider/60" />
          </div>

          {[...Array(5)].map((_, index) => (
            <div
              key={index}
              className="mb-3 space-y-3 rounded-xl border border-card-border bg-card p-5"
            >
              <div className="h-3 w-40 rounded bg-divider/60" />
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 shrink-0 rounded-full bg-divider" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 rounded bg-divider" />
                  <div className="h-2.5 w-24 rounded bg-divider/60" />
                </div>
              </div>
              <div className="h-5 w-4/5 rounded bg-divider" />
              <div className="h-4 w-full rounded bg-divider/60" />
              <div className="h-4 w-3/5 rounded bg-divider/60" />
            </div>
          ))}
        </div>

        <div className="hidden space-y-4 lg:block">
          {[168, 148, 196, 176].map((height, index) => (
            <div
              key={index}
              className="rounded-xl border border-card-border bg-card p-4"
              style={{ height }}
            >
              <div className="h-3 w-28 rounded bg-divider" />
              <div className="mt-3 h-3 w-full rounded bg-divider/60" />
              <div className="mt-2 h-3 w-2/3 rounded bg-divider/60" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Loading Explore</span>
    </div>
  );
}
