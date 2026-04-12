export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse">
      <div className="mb-6 h-7 w-24 rounded bg-gray-200" />
      <div className="mb-8 h-12 w-full rounded-2xl bg-gray-200" />
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-gray-200 bg-white p-4"
          >
            <div className="h-5 w-20 rounded-full bg-gray-100" />
            <div className="mt-3 h-4 w-3/4 rounded bg-gray-200" />
            <div className="mt-2 h-3 w-1/2 rounded bg-gray-100" />
            <div className="mt-4 h-3 w-full rounded bg-gray-100" />
            <div className="mt-2 h-3 w-2/3 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
