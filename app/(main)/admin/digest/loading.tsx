export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-56 rounded bg-gray-200" />
          <div className="h-4 w-64 rounded bg-gray-100" />
        </div>
        <div className="h-10 w-28 rounded-lg bg-gray-200" />
      </div>

      <div className="space-y-6">
        {[...Array(5)].map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-gray-200 bg-white p-6 space-y-4"
          >
            <div className="h-5 w-44 rounded bg-gray-200" />
            {[...Array(3)].map((__, itemIndex) => (
              <div key={itemIndex} className="flex items-center justify-between gap-3">
                <div className="space-y-2">
                  <div className="h-4 w-48 rounded bg-gray-200" />
                  <div className="h-3 w-32 rounded bg-gray-100" />
                </div>
                <div className="h-3 w-20 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
