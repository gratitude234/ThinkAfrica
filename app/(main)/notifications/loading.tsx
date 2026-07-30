/**
 * Skeleton for /notifications.
 *
 * Mirrors the real page's chrome so the swap does not move anything. It was
 * max-w-2xl against the page's max-w-3xl — so the whole column jumped wider on
 * paint — and it skeletoned neither the header's second line, nor the filter chip
 * row, nor the section heading, so everything below them shifted down as well.
 *
 * Block heights below are the rendered heights of what they stand in for:
 * text-2xl is 32px, text-sm 20px, text-xs 16px, and a chip is 16px of text plus
 * py-1.5 and a 1px border either side.
 *
 * The "Needs attention" hero is deliberately not skeletoned. It only renders when
 * there is an unread notification that asks something of the reader, which is the
 * exception rather than the rule, so reserving space for it would introduce the
 * very jump this is meant to remove for everyone who does not have one.
 */
const CHIP_WIDTHS = ["w-12", "w-20", "w-24", "w-16", "w-28", "w-20"];

export default function Loading() {
  return (
    <div
      className="mx-auto max-w-3xl animate-pulse motion-reduce:animate-none"
      role="status"
      aria-label="Loading notifications"
    >
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          {/* "Action inbox" */}
          <div className="h-8 w-44 rounded bg-gray-200" />
          {/* "N new notifications" */}
          <div className="mt-2 h-5 w-36 rounded bg-gray-100" />
        </div>
        {/* "Mark all read" */}
        <div className="h-4 w-20 rounded bg-gray-100" />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {CHIP_WIDTHS.map((width) => (
          <div key={width} className={`h-[30px] ${width} rounded-full bg-gray-100`} />
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {/* "Today" */}
        <div className="border-b border-gray-100 bg-canvas px-4 py-2">
          <div className="h-4 w-16 rounded bg-gray-200" />
        </div>
        {[...Array(5)].map((_, index) => (
          <div
            key={index}
            className="flex items-start gap-3 border-b border-gray-100 px-4 py-4 last:border-0"
          >
            <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gray-200" />
            <div className="min-w-0 flex-1">
              {/* label / message / timestamp / cta */}
              <div className="h-4 w-24 rounded bg-gray-200" />
              <div className="mt-0.5 h-5 w-4/5 rounded bg-gray-200" />
              <div className="mt-1 h-4 w-16 rounded bg-gray-100" />
              <div className="mt-2 h-4 w-20 rounded bg-gray-100" />
            </div>
            {/* unread dot over dismiss control */}
            <div className="flex shrink-0 flex-col items-center gap-2 pt-1">
              <div className="h-2 w-2 rounded-full bg-gray-200" />
              <div className="h-[22px] w-[22px] rounded-md bg-gray-100" />
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only">Loading notifications…</span>
    </div>
  );
}
