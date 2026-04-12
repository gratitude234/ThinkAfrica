export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse">
      <div className="mb-6 space-y-2">
        <div className="h-4 w-32 rounded bg-gray-100" />
        <div className="h-8 w-64 rounded bg-gray-200" />
        <div className="h-4 w-24 rounded bg-gray-100" />
      </div>

      <div className="space-y-3">
        {[...Array(6)].map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4"
          >
            <div className="h-10 w-10 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 rounded bg-gray-200" />
              <div className="h-3 w-32 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
