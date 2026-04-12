export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse">
      <div className="mb-8 space-y-2">
        <div className="h-8 w-56 rounded bg-gray-200" />
        <div className="h-4 w-80 rounded bg-gray-100" />
      </div>

      <div className="space-y-3">
        {[...Array(6)].map((_, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5"
          >
            <div className="space-y-2">
              <div className="h-4 w-44 rounded bg-gray-200" />
              <div className="h-3 w-56 rounded bg-gray-100" />
            </div>
            <div className="h-8 w-24 rounded-lg bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
