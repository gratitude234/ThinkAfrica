export default function LoadingProfileRecord() {
  return (
    <div className="mx-auto max-w-[820px] animate-pulse space-y-6 motion-reduce:animate-none" role="status" aria-label="Loading Intellectual Record">
      <div className="rounded-xl border border-card-border bg-card p-6">
        <div className="h-4 w-28 rounded bg-gray-200" />
        <div className="mt-5 flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-gray-200" />
          <div className="space-y-2">
            <div className="h-6 w-64 rounded bg-gray-200" />
            <div className="h-3 w-40 rounded bg-gray-100" />
          </div>
        </div>
      </div>
      <div className="h-11 rounded bg-gray-100" />
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded-xl border border-card-border bg-card p-5">
          <div className="h-4 w-20 rounded bg-gray-100" />
          <div className="mt-3 h-6 w-3/4 rounded bg-gray-200" />
          <div className="mt-3 h-3 w-full rounded bg-gray-100" />
          <div className="mt-2 h-3 w-2/3 rounded bg-gray-100" />
        </div>
      ))}
      <span className="sr-only">Loading Intellectual Record…</span>
    </div>
  );
}
