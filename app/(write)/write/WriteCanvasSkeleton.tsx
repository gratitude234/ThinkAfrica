/** A quiet preview of the current composer, rather than the retired editor. */
export default function WriteCanvasSkeleton() {
  return (
    <div className="min-h-dvh bg-canvas text-ink md:min-h-[calc(100dvh-var(--app-nav-height))] md:bg-[#F1EEE7] md:px-6 md:py-14">
      <section
        role="status"
        aria-label="Opening your writing space"
        aria-live="polite"
        className="mx-auto min-h-dvh w-full bg-canvas md:min-h-0 md:max-w-[560px] md:rounded-[14px] md:border md:border-card-border md:shadow-[0_8px_30px_rgba(0,0,0,0.07)]"
      >
        <div aria-hidden="true" className="flex h-[60px] items-center gap-3 border-b border-divider px-5">
          <div className="h-8 w-8 rounded-full bg-surface" />
          <div className="h-2 w-16 rounded-full bg-card-border/70" />
          <div className="ml-auto h-8 w-16 rounded-lg bg-emerald-brand/10" />
        </div>
        <div className="px-5 pb-6 pt-6 sm:px-6">
          <div aria-hidden="true" className="motion-safe:animate-pulse">
            <div className="mb-7 flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-card-border/60" />
              <div className="h-2 w-24 rounded-full bg-card-border/70" />
            </div>
            <div className="h-2.5 w-4/5 rounded-full bg-card-border/60" />
            <div className="mt-3.5 h-2.5 w-3/5 rounded-full bg-card-border/40" />
          </div>
          <div className="flex min-h-44 flex-col items-center justify-center gap-3 py-8">
            <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-green-wash">
              <span className="h-5 w-5 rounded-full border-2 border-emerald-brand/20 border-t-emerald-brand motion-safe:animate-spin" />
            </span>
            <p className="text-sm font-medium text-ink-muted">Opening your writing space…</p>
          </div>
          <div aria-hidden="true" className="flex items-center justify-between border-t border-divider pt-4">
            <div className="h-8 w-8 rounded-lg bg-surface" />
            <div className="h-2 w-28 rounded-full bg-card-border/50" />
          </div>
        </div>
      </section>
    </div>
  );
}
