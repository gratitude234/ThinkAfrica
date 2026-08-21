/**
 * /discover is a permanent redirect into /explore. It resolves instantly,
 * but without a loading file the router falls back to the nearest ancestor
 * boundary and flashes the home skeleton first. Mirror the Explore shell so
 * the redirect reads as one continuous navigation.
 */
export default function Loading() {
  return (
    <div
      className="mx-auto min-w-0 max-w-full animate-pulse overflow-x-clip motion-reduce:animate-none lg:max-w-6xl"
      role="status"
      aria-label="Loading Explore"
    >
      <div className="h-7 w-72 max-w-full rounded bg-divider" />
      <div className="mt-2 h-4 w-96 max-w-full rounded bg-divider/60" />
      <div className="mt-4 h-12 w-full max-w-3xl rounded-xl bg-divider/60 sm:mt-5 sm:h-[52px]" />

      <div className="mt-4 flex gap-1 border-b border-card-border pb-3 pt-1">
        {[64, 72, 60, 62, 62].map((width, index) => (
          <div
            key={index}
            className="h-5 rounded bg-divider/60"
            style={{ width }}
          />
        ))}
      </div>

      <span className="sr-only">Loading Explore</span>
    </div>
  );
}
