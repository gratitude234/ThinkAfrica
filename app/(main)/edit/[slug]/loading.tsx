export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse">
      <div className="mb-8 space-y-2">
        <div className="h-8 w-40 rounded bg-gray-200" />
        <div className="h-4 w-72 rounded bg-gray-100" />
      </div>

      <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6">
        <div className="space-y-2">
          <div className="h-4 w-24 rounded bg-gray-200" />
          <div className="h-11 w-full rounded-lg bg-gray-100" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-gray-200" />
          <div className="h-24 w-full rounded-lg bg-gray-100" />
        </div>
        <div className="h-64 w-full rounded-2xl bg-gray-100" />
        <div className="flex gap-3">
          <div className="h-10 w-32 rounded-lg bg-gray-200" />
          <div className="h-10 w-24 rounded-lg bg-gray-100" />
        </div>
      </div>
    </div>
  );
}
