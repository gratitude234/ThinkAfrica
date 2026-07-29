export default function Loading() {
  return (
    <div
      className="flex flex-1 flex-col animate-pulse motion-reduce:animate-none"
      role="status"
      aria-label="Loading the composer"
    >
      {/* Header: back button, title, publish action */}
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <div className="h-11 w-11 shrink-0 rounded-full bg-gray-200/70" />
        <div className="h-5 w-40 flex-1 rounded bg-gray-200/70" />
        <div className="h-10 w-[72px] rounded-lg bg-gray-200/70" />
      </div>

      {/* Body canvas */}
      <div className="flex flex-1 flex-col bg-canvas">
        <div className="flex min-h-[280px] flex-1 flex-col gap-3 px-5 pt-5 sm:px-6">
          <div className="h-5 w-full rounded bg-gray-200/50" />
          <div className="h-5 w-11/12 rounded bg-gray-200/50" />
          <div className="h-5 w-2/3 rounded bg-gray-200/50" />
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-black/[0.06] px-5 py-3 sm:px-6">
          <div className="h-8 w-8 rounded-lg bg-gray-200/60" />
          <div className="h-3 w-16 rounded bg-gray-200/60" />
        </div>
      </div>

      {/* Longer-form escape hatches */}
      <div className="px-5 py-5 sm:px-6">
        <div className="h-4 w-3/4 rounded bg-gray-200/50" />
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <div className="h-9 w-36 rounded-full bg-gold-tint/60" />
          <div className="h-9 w-40 rounded-full bg-purple-tint/60" />
        </div>
      </div>

      <span className="sr-only">Loading the composer…</span>
    </div>
  );
}
