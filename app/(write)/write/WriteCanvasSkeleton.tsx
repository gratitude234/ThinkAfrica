export default function WriteCanvasSkeleton() {
  return (
    <div className="min-h-dvh animate-pulse bg-surface motion-reduce:animate-none" role="status" aria-label="Loading the writing canvas">
      <div className="border-b border-divider">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4 sm:px-6">
          <div className="h-11 w-11 rounded-full bg-canvas" />
          <div className="h-3 w-36 rounded bg-canvas" />
          <div className="ml-auto h-11 w-24 rounded-full bg-card-border" />
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-5 pt-10 sm:px-8">
        <div className="h-11 w-24 rounded-lg bg-canvas" />
        <div className="mt-7 h-6 w-full rounded bg-canvas" />
        <div className="mt-3 h-6 w-4/5 rounded bg-canvas" />
        <div className="mt-3 h-6 w-3/5 rounded bg-canvas" />
      </div>
      <span className="sr-only">Loading the writing canvas…</span>
    </div>
  );
}
