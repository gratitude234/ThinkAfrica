export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse">
      <div className="mb-8 space-y-2">
        <div className="h-8 w-40 rounded bg-gray-200" />
        <div className="h-4 w-36 rounded bg-gray-100" />
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-gray-200 bg-white p-5 space-y-2"
          >
            <div className="h-4 w-20 rounded bg-gray-100" />
            <div className="h-8 w-24 rounded bg-gray-200" />
            <div className="h-3 w-28 rounded bg-gray-100" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {[...Array(4)].map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-gray-200 bg-white p-5 space-y-4"
          >
            <div className="h-5 w-40 rounded bg-gray-200" />
            <div className="h-64 w-full rounded-xl bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
