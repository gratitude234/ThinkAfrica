export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-md pb-16 animate-pulse motion-reduce:animate-none sm:max-w-lg"
      role="status"
      aria-label="Loading the research submission form"
    >
      {/* Step header: close, count, segmented progress */}
      <div className="pt-1">
        <div className="flex items-center gap-6">
          <div className="h-8 w-8 rounded-lg bg-gray-200/70" />
          <div className="h-6 w-32 rounded bg-gray-200/70" />
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2.5">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="h-[3px] rounded-full bg-gray-200" />
          ))}
        </div>
      </div>

      {/* Step body fields */}
      <div className="mt-8 space-y-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3.5 w-32 rounded bg-gray-200" />
            <div className="h-11 w-full rounded-lg bg-gray-100" />
          </div>
        ))}
        <div className="space-y-2">
          <div className="h-3.5 w-40 rounded bg-gray-200" />
          <div className="h-28 w-full rounded-lg bg-gray-100" />
        </div>
      </div>

      {/* Advance action */}
      <div className="mt-8 h-12 w-full rounded-lg bg-gray-200/70" />

      <span className="sr-only">Loading the research submission form…</span>
    </div>
  );
}
