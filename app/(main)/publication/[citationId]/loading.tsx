export default function Loading() {
  return (
    <div
      className="mx-auto max-w-4xl space-y-8 animate-pulse motion-reduce:animate-none"
      role="status"
      aria-label="Loading publication"
    >
      {/* Citation banner */}
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
        <div className="h-3 w-28 rounded bg-sky-200" />
        <div className="mt-3 h-8 w-4/5 rounded bg-sky-200/70" />
        <div className="mt-3 flex flex-wrap gap-2">
          {[80, 64, 96].map((w, i) => (
            <div key={i} className="h-4 rounded bg-sky-200/50" style={{ width: w }} />
          ))}
        </div>
        <div className="mt-3 h-4 w-2/3 rounded bg-sky-200/50" />
        <div className="mt-3 h-4 w-32 rounded bg-sky-200/60" />
      </div>

      {/* Authors */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="h-5 w-24 rounded bg-gray-200" />
        <div className="mt-3 flex flex-wrap gap-2">
          {[96, 112, 88].map((w, i) => (
            <div key={i} className="h-7 rounded-full bg-gray-100" style={{ width: w }} />
          ))}
        </div>
      </section>

      {/* Abstract */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="h-5 w-44 rounded bg-gray-200" />
        <div className="mt-3 space-y-2">
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="h-4 w-3/4 rounded bg-gray-100" />
        </div>
      </section>

      {/* Manuscript block */}
      <section className="rounded-xl border border-purple-100 bg-purple-50 p-5">
        <div className="h-3 w-24 rounded bg-purple-200" />
        <div className="mt-3 h-14 rounded-lg bg-purple-100/60" />
      </section>

      <span className="sr-only">Loading publication…</span>
    </div>
  );
}
