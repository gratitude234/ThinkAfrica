const CHIP_WIDTHS = ["w-12", "w-24"];

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse motion-reduce:animate-none" role="status" aria-label="Loading notifications">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <div className="h-8 w-40 rounded bg-gray-200" />
          <div className="mt-2 h-5 w-36 rounded bg-gray-100" />
        </div>
        <div className="h-4 w-20 rounded bg-gray-100" />
      </div>
      <div className="mb-4 flex gap-2">
        {CHIP_WIDTHS.map((width) => <div key={width} className={`h-9 ${width} rounded-full bg-gray-100`} />)}
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {[...Array(5)].map((_, index) => (
          <div key={index} className="flex items-start gap-3 border-b border-gray-100 px-4 py-4 last:border-0">
            <div className="h-8 w-8 shrink-0 rounded-full bg-gray-200" />
            <div className="min-w-0 flex-1">
              <div className="h-5 w-4/5 rounded bg-gray-200" />
              <div className="mt-1 h-4 w-16 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading notifications…</span>
    </div>
  );
}