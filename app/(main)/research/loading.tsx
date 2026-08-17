export default function ResearchLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-8" aria-label="Loading research workspace">
      <div className="h-72 rounded-2xl bg-gray-200" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-56 rounded-xl bg-gray-100" />
        <div className="h-56 rounded-xl bg-gray-100" />
      </div>
      <span className="sr-only">Loading research workspace…</span>
    </div>
  );
}
