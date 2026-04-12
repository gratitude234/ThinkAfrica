export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse">
      <div className="mb-8 space-y-2">
        <div className="h-8 w-56 rounded bg-gray-200" />
        <div className="h-4 w-48 rounded bg-gray-100" />
      </div>

      <div className="space-y-4">
        {[...Array(5)].map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-gray-200 bg-white p-6"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gray-200" />
                <div className="space-y-2">
                  <div className="h-4 w-40 rounded bg-gray-200" />
                  <div className="h-3 w-48 rounded bg-gray-100" />
                </div>
              </div>
              <div className="h-8 w-28 rounded-full bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
