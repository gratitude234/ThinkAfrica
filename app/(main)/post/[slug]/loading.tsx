/**
 * Mirrors the editorial post template in page.tsx: a single 680px column, the
 * cover *after* the header, and the discussion under the body. The route can't
 * know the content kind before the post is fetched, so this tracks the common
 * shape rather than inventing a third one. The old skeleton drew a max-w-6xl
 * four-column grid that neither template renders, so every navigation into a
 * post played one layout and then snapped to another.
 */
export default function Loading() {
  return (
    <div
      className="animate-pulse motion-reduce:animate-none"
      role="status"
      aria-label="Loading this post"
    >
      {/* Header: back link, badge row, title, author row */}
      <div className="mx-auto max-w-[680px] pb-2 pt-1 sm:pt-3">
        <div className="h-11 w-28 rounded bg-gray-100" />

        <div className="mt-1 flex items-center gap-2.5">
          <div className="h-6 w-24 rounded-full bg-gray-200" />
          <div className="h-4 w-20 rounded bg-gray-100" />
        </div>

        <div className="mt-4 space-y-2.5">
          <div className="h-9 w-full rounded bg-gray-200 sm:h-11" />
          <div className="h-9 w-3/5 rounded bg-gray-200 sm:h-11" />
        </div>

        <div className="mt-5 flex items-start gap-3">
          <div className="h-12 w-12 shrink-0 rounded-full bg-gray-200" />
          <div className="mt-1 flex-1 space-y-2">
            <div className="h-4 w-44 rounded bg-gray-200" />
            <div className="h-3 w-28 rounded bg-gray-100" />
          </div>
          <div className="h-9 w-20 rounded-lg bg-gray-100" />
        </div>
      </div>

      {/* Cover sits below the header, not above it */}
      <div className="mx-auto mt-6 max-w-[680px]">
        <div className="aspect-[16/9] w-full rounded-[10px] bg-gray-200" />
      </div>

      <div className="mx-auto max-w-[680px] pb-20 pt-8 sm:pt-10">
        {/* Body */}
        <div className="space-y-3.5">
          {[100, 96, 100, 88, 100, 72, 100, 94, 100, 66].map((width, index) => (
            <div
              key={index}
              className="h-4 rounded bg-gray-100"
              style={{ width: `${width}%` }}
            />
          ))}
        </div>

        {/* Actions row */}
        <div className="mt-10 flex items-center gap-8 border-y border-card-border py-3">
          <div className="h-6 w-14 rounded bg-gray-100" />
          <div className="h-6 w-16 rounded bg-gray-100" />
          <div className="h-6 w-14 rounded bg-gray-100" />
          <div className="h-6 w-14 rounded bg-gray-100" />
        </div>

        {/* Composer */}
        <div className="mt-4 h-24 rounded-xl border border-card-border bg-gray-50" />

        {/* Discussion */}
        <div className="mt-8 space-y-5">
          <div className="h-6 w-36 rounded bg-gray-200" />
          {[...Array(3)].map((_, index) => (
            <div key={index} className="flex gap-2.5">
              <div className="h-8 w-8 shrink-0 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-32 rounded bg-gray-200" />
                <div className="h-3.5 w-full rounded bg-gray-100" />
                <div className="h-3.5 w-4/5 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Loading this post…</span>
    </div>
  );
}
