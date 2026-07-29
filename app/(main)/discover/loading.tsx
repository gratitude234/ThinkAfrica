/**
 * /discover is a permanent redirect into /explore. It resolves instantly,
 * but without a loading file the router falls back to the nearest ancestor
 * boundary and flashes the home skeleton first. Mirror the Explore shell so
 * the redirect reads as one continuous navigation.
 */
export default function Loading() {
  return (
    <div
      className="mx-auto max-w-5xl animate-pulse motion-reduce:animate-none"
      role="status"
      aria-label="Loading Explore"
    >
      <div className="h-8 w-44 rounded bg-gray-200" />
      <div className="mt-2 h-4 w-96 max-w-full rounded bg-gray-100" />

      <div className="mt-6 flex gap-2 border-b border-gray-200 pb-3">
        {[64, 80, 72, 88].map((w, i) => (
          <div key={i} className="h-8 rounded-full bg-gray-100" style={{ width: w }} />
        ))}
      </div>

      <span className="sr-only">Loading Explore…</span>
    </div>
  );
}
